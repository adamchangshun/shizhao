// pnpm eval:compare — experiment 2: group A (model writes the whole page, two inputs) vs group B
// (shizhao pipeline from gold facts, and end to end from raw material), N runs per sample.
import { writeRunConfig } from '../lib/config'
import { GROUPS } from '../lib/aggregate'
import { runComparePart } from '../lib/experiments'
import { main } from '../lib/cli'

void main('eval:compare', async (ctx) => {
  writeRunConfig(ctx.config)
  for (const sample of ctx.samples) {
    for (const group of GROUPS) {
      for (let n = 1; n <= ctx.config.n; n++) {
        try {
          await runComparePart(ctx, sample, group, n)
        } catch (err) {
          ctx.fail(`${sample.id}/${group}/${n}`, err)
        }
      }
    }
  }
})
