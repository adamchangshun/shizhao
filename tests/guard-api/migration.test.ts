import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { expect, it } from 'vitest'

it('preserves existing project usage while adding nullable public usage and daily quota', () => {
  const db = new Database(':memory:')
  try {
    db.pragma('foreign_keys=ON')
    const dir = path.resolve('lib/db/migrations')
    const journal = JSON.parse(fs.readFileSync(path.join(dir, 'meta/_journal.json'), 'utf8')) as {
      entries: Array<{ tag: string }>
    }
    const index = journal.entries.findIndex((e) => e.tag.endsWith('_guard_api_accounting'))
    expect(index).toBeGreaterThan(0)
    for (const entry of journal.entries.slice(0, index))
      db.exec(fs.readFileSync(path.join(dir, entry.tag + '.sql'), 'utf8'))
    db.prepare('INSERT INTO projects (id,slug,type,title,created_at) VALUES (?,?,?,?,?)').run(
      'old-project',
      'old-slug',
      'single',
      '迁移测试',
      '2026-10-13T00:00:00Z',
    )
    db.prepare(
      'INSERT INTO usage_records (id,project_id,provider,model,stage,input_tokens,output_tokens,cost_cny,latency_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run(
      'old-usage',
      'old-project',
      'mock',
      'fixture',
      'copy',
      12,
      8,
      0.2,
      10,
      '2026-10-13T00:00:00Z',
    )
    db.exec(fs.readFileSync(path.join(dir, journal.entries[index]!.tag + '.sql'), 'utf8'))
    expect(
      db
        .prepare(
          'SELECT project_id,input_tokens,output_tokens,cost_cny FROM usage_records WHERE id=?',
        )
        .get('old-usage'),
    ).toEqual({ project_id: 'old-project', input_tokens: 12, output_tokens: 8, cost_cny: 0.2 })
    db.prepare(
      'INSERT INTO usage_records (id,project_id,provider,model,stage,input_tokens,output_tokens,cost_cny,latency_ms,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    ).run('public-usage', null, 'mock', 'fixture', 'api-guard', 1, 1, 0, 1, '2026-10-13T00:00:00Z')
    expect(
      db.prepare('SELECT project_id FROM usage_records WHERE id=?').get('public-usage'),
    ).toEqual({ project_id: null })
    expect(db.pragma('foreign_key_check')).toEqual([])
  } finally {
    db.close()
  }
})
