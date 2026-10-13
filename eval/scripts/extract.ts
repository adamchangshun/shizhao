// pnpm eval:extract — experiment 1: extractFacts on every sample's raw images and text.
import { compareExtraction } from '../lib/extract-compare'
import { runExtractPart } from '../lib/experiments'
import { log, main } from '../lib/cli'

void main('eval:extract', async (ctx) => {
  for (const sample of ctx.samples) {
    try {
      const part = await runExtractPart(ctx, sample)
      if (!part.ok || !part.factSheet) {
        log(`         ${sample.id}: extraction failed (${part.error ?? 'unknown'})`)
        continue
      }
      const { counts } = compareExtraction(sample.gold, part.factSheet)
      log(
        `         ${sample.id}: items ${counts.name.correct}/${counts.name.gold} matched, prices ${counts.price.correct}/${counts.price.gold} correct`,
      )
    } catch (err) {
      ctx.fail(`${sample.id}/extract/1`, err)
    }
  }
})
