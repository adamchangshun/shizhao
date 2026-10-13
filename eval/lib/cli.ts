// Shared entry-point plumbing for the eval scripts.
import { closeDb } from '../../lib/db/client'
import { readRunConfig, runDir, runSettingsKey, setupRuntime, type RunConfig } from './config'
import type { PartContext } from './experiments'
import { evalProvider } from './pipeline'
import { loadSamples, type Sample } from './samples'
import { SAMPLES_DIR } from './config'

export const log = (line: string): void => console.log(line)

export interface ScriptContext extends PartContext {
  config: RunConfig
  samples: Sample[]
  /** Records a part failure; the script exits non-zero at the end and the part reruns next time. */
  fail: (label: string, err: unknown) => void
}

export async function main(
  name: string,
  body: (ctx: ScriptContext) => Promise<void>,
): Promise<void> {
  let failures = 0
  try {
    const config = readRunConfig()
    setupRuntime(config)
    const samples = loadSamples(SAMPLES_DIR)
    log(
      `[eval] ${name}: run ${config.runId}, provider ${config.provider}, ${samples.length} samples, N=${config.n}`,
    )
    await body({
      config,
      samples,
      runDir: runDir(config),
      provider: evalProvider(),
      temperature: config.temperature,
      settingsKey: runSettingsKey(config),
      log,
      fail: (label, err) => {
        failures++
        log(`[eval] error  ${label}: ${err instanceof Error ? err.message : String(err)}`)
      },
    })
  } catch (err) {
    failures++
    console.error(`[eval] ${name} aborted:`, err)
  } finally {
    closeDb()
  }
  if (failures > 0) log(`[eval] ${name}: ${failures} part(s) failed; rerun to retry them`)
  // Upload processing may leave idle child-process handles; the work is done either way.
  process.exit(failures > 0 ? 1 : 0)
}
