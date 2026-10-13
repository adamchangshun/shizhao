// pnpm eval:report — summarizes the three experiments of the current run into
// eval/reports/<YYYY-MM-DD>/{report.md, raw.json, review-sheet.csv}. Reads only completed parts.
import fs from 'node:fs'
import path from 'node:path'
import {
  gitCommit,
  readRunConfig,
  readStoredRunConfig,
  REPORTS_DIR,
  runDir,
  SAMPLES_DIR,
  today,
} from '../lib/config'
import { renderReport, renderReviewSheet } from '../lib/report'
import { computeResults } from '../lib/results'
import { loadSamples } from '../lib/samples'

function run(): void {
  const current = readRunConfig()
  const dir = runDir(current)
  if (!fs.existsSync(dir))
    throw new Error(
      `run ${current.runId} not found; run eval:extract / eval:compare / eval:guard first`,
    )
  // The N and temperature the comparison actually ran with.
  const stored = readStoredRunConfig(dir)
  // Settings of the run as stored, code as it is now: pages from older code are not counted.
  const config = stored ? { ...stored, codeHash: current.codeHash } : current
  const samples = loadSamples(SAMPLES_DIR)
  const date = today()
  const results = computeResults({ runDir: dir, config, samples, date, commit: gitCommit() })
  const out = path.join(REPORTS_DIR, date)
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'report.md'), renderReport(results, samples))
  fs.writeFileSync(path.join(out, 'raw.json'), JSON.stringify(results, null, 2) + '\n')
  fs.writeFileSync(path.join(out, 'review-sheet.csv'), renderReviewSheet(results.compare.pages))
  console.log(`[eval] report written to ${path.relative(process.cwd(), out)}/report.md`)
}

try {
  run()
} catch (err) {
  console.error('[eval] eval:report failed:', err)
  process.exitCode = 1
}
