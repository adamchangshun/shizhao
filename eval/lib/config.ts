// Run configuration and an isolated runtime: every run uses DATA_DIR=eval/runs/<runId>/data,
// never the development data/ directory.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { closeDb, runMigrations } from '../../lib/db/client'
import { getEnv, resetEnvCache } from '../../lib/env'

export const EVAL_DIR = path.resolve('eval')
export const SAMPLES_DIR = path.join(EVAL_DIR, 'samples')
export const RUNS_DIR = path.join(EVAL_DIR, 'runs')
export const REPORTS_DIR = path.join(EVAL_DIR, 'reports')

const RUN_ID = /^[A-Za-z0-9._-]{1,80}$/

export const RunConfig = z.object({
  runId: z.string(),
  provider: z.string(),
  textModel: z.string().nullable(),
  visionModel: z.string().nullable(),
  n: z.number().int().positive(),
  temperature: z.number().min(0).max(2),
})
export type RunConfig = z.infer<typeof RunConfig>

function slug(text: string): string {
  return (
    text
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'run'
  )
}

/** Reads EVAL_RUN_ID / EVAL_N / EVAL_TEMPERATURE and the provider settings. */
export function readRunConfig(source: NodeJS.ProcessEnv = process.env): RunConfig {
  const provider = source.PROVIDER?.trim() || 'mock'
  const textModel = source.LLM_MODEL_TEXT?.trim() || null
  const visionModel = source.LLM_MODEL_VISION?.trim() || null
  const runId =
    source.EVAL_RUN_ID?.trim() ||
    (provider === 'mock' ? 'mock' : slug(`${provider}-${textModel ?? 'model'}`))
  if (!RUN_ID.test(runId)) throw new Error('EVAL_RUN_ID 只能包含字母、数字、点、下划线和连字符')
  const n = Number(source.EVAL_N ?? 3)
  const temperature = Number(source.EVAL_TEMPERATURE ?? 0.6)
  return RunConfig.parse({ runId, provider, textModel, visionModel, n, temperature })
}

export function runDir(config: RunConfig): string {
  return path.join(RUNS_DIR, config.runId)
}

/**
 * Points the app at the run's own DATA_DIR (overriding any DATA_DIR from .env.local), fills in
 * the two required server variables with eval-only values when absent, and migrates the DB.
 */
export function setupRuntime(config: RunConfig): void {
  const dataDir = path.join(runDir(config), 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  closeDb()
  process.env.DATA_DIR = dataDir
  process.env.ADMIN_TOKEN ||= 'eval-only-admin-token'
  process.env.PUBLIC_BASE_URL ||= 'http://localhost:6688'
  resetEnvCache()
  if (getEnv().DATA_DIR !== dataDir) throw new Error('eval DATA_DIR not applied')
  runMigrations()
}

export function writeRunConfig(config: RunConfig): void {
  fs.mkdirSync(runDir(config), { recursive: true })
  fs.writeFileSync(path.join(runDir(config), 'config.json'), JSON.stringify(config, null, 2))
}

export function readStoredRunConfig(dir: string): RunConfig | null {
  try {
    return RunConfig.parse(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')))
  } catch {
    return null
  }
}

export function gitCommit(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
    return dirty ? `${sha}（工作区有未提交改动）` : sha
  } catch {
    return '未知'
  }
}

/** YYYY-MM-DD in local time. */
export function today(now: Date = new Date()): string {
  const pad = (v: number): string => String(v).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
