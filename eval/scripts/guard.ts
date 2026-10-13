// pnpm eval:guard — experiment 3: block rate and false-positive rate on cases.zh.json, rule layer
// only and rule layer + model judge layer.
import { guardRates } from '../lib/aggregate'
import { GUARD_LAYERS, runGuardPart } from '../lib/experiments'
import { log, main } from '../lib/cli'

void main('eval:guard', async (ctx) => {
  for (const layer of GUARD_LAYERS) {
    try {
      const part = await runGuardPart(ctx, layer)
      const r = guardRates(part.outcomes)
      log(
        `         ${layer}: blocked ${r.detected}/${r.blockCases}, false positives ${r.falsePositives}/${r.passCases}`,
      )
    } catch (err) {
      ctx.fail(`_guard/${layer}/1`, err)
    }
  }
})
