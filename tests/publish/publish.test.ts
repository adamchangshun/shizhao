import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { newId } from '@/lib/core/ids'
import { getDb, runMigrations } from '@/lib/db/client'
import { insertProject, findActiveProject } from '@/lib/db/repo/projects'
import { projects, versions } from '@/lib/db/schema'
import { getEnv } from '@/lib/env'
import { versionDir, versionHtmlPath } from '@/lib/jobs/files'
import {
  getPublishedHtmlPath,
  publishVersion,
  publishVersionTx,
  unpublishProject,
} from '@/lib/publish'
import { seedVersion } from './fixtures'

beforeAll(runMigrations)

function liveHtml(slug: string) {
  const result = getPublishedHtmlPath(slug)
  if (result.status !== 'ok') throw new Error(result.status)
  return fs.readFileSync(result.htmlPath, 'utf8')
}

describe('immutable version publication', () => {
  it('switches v1 → v2 at one stable URL without modifying version directories or slug', () => {
    const p = insertProject({ type: 'single', title: '测试小店' })
    const v1 = seedVersion(p.id, '<h1>版本一</h1>')
    const v2 = seedVersion(p.id, '<h1>版本二</h1>')
    const first = publishVersion(p.id, v1)
    expect(liveHtml(p.slug)).toBe('<h1>版本一</h1>')
    expect(publishVersion(p.id, v2)).toEqual(first)
    expect(publishVersion(p.id, v2)).toEqual(first) // Already live: idempotent success.
    expect(first).toEqual({
      url: `http://localhost:6688/p/${p.slug}/`,
      qrPngUrl: `/api/projects/${p.id}/qr?format=png`,
      qrSvgUrl: `/api/projects/${p.id}/qr?format=svg`,
    })
    expect(liveHtml(p.slug)).toBe('<h1>版本二</h1>')
    expect(findActiveProject(p.id)).toMatchObject({
      slug: p.slug,
      publishedVersionId: v2,
      unpublishedAt: null,
    })
    expect(fs.readdirSync(path.dirname(versionDir(p.id, v1))).sort()).toEqual([v1, v2].sort())
    expect(fs.readFileSync(path.join(versionDir(p.id, v1), 'index.html'), 'utf8')).toBe(
      '<h1>版本一</h1>',
    )
    expect(
      fs.readFileSync(path.join(versionDir(p.id, v2), 'media/fixture-display.webp'), 'utf8'),
    ).toBe('fixed media bytes')
  })

  it('distinguishes missing/deleted, never published and unpublished; republishing restores access', () => {
    const p = insertProject({ type: 'single', title: '状态测试' })
    expect(getPublishedHtmlPath('invalid')).toEqual({ status: 'not_found' })
    expect(getPublishedHtmlPath(p.slug)).toEqual({ status: 'never_published' })
    const v = seedVersion(p.id, '<h1>仍然保留</h1>')
    publishVersion(p.id, v)
    unpublishProject(p.id)
    expect(getPublishedHtmlPath(p.slug)).toEqual({ status: 'unpublished' })
    expect(findActiveProject(p.id)?.publishedVersionId).toBe(v)
    const timestamp = findActiveProject(p.id)?.unpublishedAt
    unpublishProject(p.id)
    expect(findActiveProject(p.id)?.unpublishedAt).toBe(timestamp)
    expect(fs.readFileSync(path.join(versionDir(p.id, v), 'index.html'), 'utf8')).toBe(
      '<h1>仍然保留</h1>',
    )
    publishVersion(p.id, v)
    expect(liveHtml(p.slug)).toBe('<h1>仍然保留</h1>')
    getDb()
      .update(projects)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(projects.id, p.id))
      .run()
    expect(getPublishedHtmlPath(p.slug)).toEqual({ status: 'not_found' })
    expect(() => publishVersion(p.id, v)).toThrow(expect.objectContaining({ status: 404 }))
    expect(() => unpublishProject(p.id)).toThrow(expect.objectContaining({ status: 404 }))
  })

  it('rejects missing or foreign versions without losing the published page', () => {
    const a = insertProject({ type: 'single', title: '店一' })
    const b = insertProject({ type: 'single', title: '店二' })
    const v1 = seedVersion(a.id, 'old')
    const other = seedVersion(b.id, 'foreign')
    publishVersion(a.id, v1)
    for (const id of [newId(), other]) {
      expect(() => publishVersion(a.id, id)).toThrow(expect.objectContaining({ status: 404 }))
    }
    expect(liveHtml(a.slug)).toBe('old')
  })

  it('keeps the old version visible to a second connection before commit and after rollback', () => {
    const p = insertProject({ type: 'single', title: '回滚' })
    const old = seedVersion(p.id, 'old')
    const next = seedVersion(p.id, 'next')
    publishVersion(p.id, old)
    const reader = new Database(path.join(getEnv().DATA_DIR, 'db.sqlite'), { readonly: true })
    const read = () =>
      reader.prepare('SELECT published_version_id FROM projects WHERE id=?').get(p.id)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      expect(() =>
        getDb().transaction(
          (tx) => {
            publishVersionTx(tx, p.id, next)
            expect(read()).toEqual({ published_version_id: old })
            tx.update(projects)
              .set({ title: 'should roll back too' })
              .where(eq(projects.id, p.id))
              .run()
            throw new Error('injected before commit')
          },
          { behavior: 'immediate' },
        ),
      ).toThrow('injected before commit')
      expect(read()).toEqual({ published_version_id: old })
      expect(liveHtml(p.slug)).toBe('old')
      expect(findActiveProject(p.id)?.title).toBe('回滚')
      expect(log).not.toHaveBeenCalled()
      getDb().transaction((tx) => publishVersionTx(tx, p.id, next), { behavior: 'immediate' })
      expect(read()).toEqual({ published_version_id: next })
    } finally {
      reader.close()
      log.mockRestore()
    }
  })

  it('detects a conditional update that affects no rows instead of reporting success', () => {
    const p = insertProject({ type: 'single', title: '条件更新' })
    const old = seedVersion(p.id, 'old')
    const next = seedVersion(p.id, 'next')
    publishVersion(p.id, old)
    getDb().run(
      sql.raw(
        `CREATE TEMP TRIGGER reject_publish BEFORE UPDATE OF published_version_id ON projects BEGIN SELECT RAISE(IGNORE); END`,
      ),
    )
    try {
      expect(() => publishVersion(p.id, next)).toThrow(expect.objectContaining({ status: 409 }))
      expect(liveHtml(p.slug)).toBe('old')
    } finally {
      getDb().run(sql.raw('DROP TRIGGER reject_publish'))
    }
  })

  it('rejects missing HTML, foreign htmlPath and symlinks while leaving the old pointer intact', () => {
    const p = insertProject({ type: 'single', title: '路径检查' })
    const old = seedVersion(p.id, 'old')
    const next = seedVersion(p.id, 'next')
    publishVersion(p.id, old)
    const file = path.join(versionDir(p.id, next), 'index.html')
    fs.unlinkSync(file)
    expect(() => publishVersion(p.id, next)).toThrow(expect.objectContaining({ status: 404 }))
    fs.symlinkSync(path.join(versionDir(p.id, old), 'index.html'), file)
    expect(() => publishVersion(p.id, next)).toThrow(expect.objectContaining({ status: 404 }))
    fs.unlinkSync(file)
    fs.writeFileSync(file, 'next')
    getDb()
      .update(versions)
      .set({ htmlPath: versionHtmlPath(p.id, old) })
      .where(eq(versions.id, next))
      .run()
    expect(() => publishVersion(p.id, next)).toThrow(expect.objectContaining({ status: 404 }))
    expect(liveHtml(p.slug)).toBe('old')
  })
  it('publishes a caller-created uncommitted version atomically with its row', () => {
    const p = insertProject({ type: 'single', title: '纠错事务' })
    const old = seedVersion(p.id, 'old')
    const next = seedVersion(p.id, 'next')
    const row = getDb().select().from(versions).where(eq(versions.id, next)).get()!
    getDb().delete(versions).where(eq(versions.id, next)).run()
    publishVersion(p.id, old)
    unpublishProject(p.id)
    const previous = findActiveProject(p.id)!
    expect(() =>
      getDb().transaction(
        (tx) => {
          tx.insert(versions).values(row).run()
          publishVersionTx(tx, p.id, next)
          throw new Error('correction failed')
        },
        { behavior: 'immediate' },
      ),
    ).toThrow('correction failed')
    expect(getDb().select().from(versions).where(eq(versions.id, next)).get()).toBeUndefined()
    expect(findActiveProject(p.id)).toEqual(previous)
    getDb().transaction(
      (tx) => {
        tx.insert(versions).values(row).run()
        publishVersionTx(tx, p.id, next)
      },
      { behavior: 'immediate' },
    )
    expect(liveHtml(p.slug)).toBe('next')
  })

  it('rolls back a real deferred-constraint COMMIT failure and leaves the connection usable', () => {
    const p = insertProject({ type: 'single', title: '提交失败' })
    const old = seedVersion(p.id, 'old')
    const next = seedVersion(p.id, 'next')
    publishVersion(p.id, old)
    // The callback's UPDATE succeeds; the FK is checked only at COMMIT.
    getDb().run(
      sql.raw(
        'CREATE TABLE commit_failure_probe (project_id TEXT REFERENCES projects(id) DEFERRABLE INITIALLY DEFERRED)',
      ),
    )
    getDb().run(
      sql.raw(
        "CREATE TEMP TRIGGER fail_at_commit AFTER UPDATE OF published_version_id ON projects BEGIN INSERT INTO commit_failure_probe VALUES ('missing-project'); END",
      ),
    )
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      expect(() => publishVersion(p.id, next)).toThrow(/FOREIGN KEY/)
      expect(liveHtml(p.slug)).toBe('old')
      expect(log).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
      getDb().run(sql.raw('DROP TRIGGER fail_at_commit'))
      getDb().run(sql.raw('DROP TABLE commit_failure_probe'))
    }
    publishVersion(p.id, next) // A new outer transaction succeeds after the failed COMMIT.
    expect(liveHtml(p.slug)).toBe('next')
  })

  it('logs only committed state and does not report a committed write as failed if logging throws', () => {
    const p = insertProject({ type: 'single', title: '日志失败' })
    const v = seedVersion(p.id, 'live')
    const reader = new Database(path.join(getEnv().DATA_DIR, 'db.sqlite'), { readonly: true })
    const seen: unknown[] = []
    const log = vi.spyOn(console, 'info').mockImplementation((_label, event) => {
      seen.push({
        event,
        row: reader
          .prepare('SELECT published_version_id, unpublished_at FROM projects WHERE id=?')
          .get(p.id),
      })
      throw new Error('log sink unavailable')
    })
    try {
      expect(() => publishVersion(p.id, v)).not.toThrow()
      expect(liveHtml(p.slug)).toBe('live')
      expect(() => unpublishProject(p.id)).not.toThrow()
      expect(seen).toEqual([
        {
          event: { action: 'publish', projectId: p.id, versionId: v, at: expect.any(String) },
          row: { published_version_id: v, unpublished_at: null },
        },
        {
          event: { action: 'unpublish', projectId: p.id, versionId: v, at: expect.any(String) },
          row: { published_version_id: v, unpublished_at: expect.any(String) },
        },
      ])
    } finally {
      reader.close()
      log.mockRestore()
    }
  })
})
