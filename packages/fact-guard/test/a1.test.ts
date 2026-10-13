import { existsSync, readFileSync, writeSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkSentence, defaultRules, mergeRules, rulePacks } from '../src/index'

interface Case {
  id: string
  sentence: string
  facts: string[]
  expect: 'pass' | 'block'
  category: string
  disputed?: boolean
}
const fixture =
  process.env.FACT_GUARD_A1_PATH ?? fileURLToPath(new URL('./adversarial.zh.json', import.meta.url))
describe.skipIf(!existsSync(fixture))(
  'Claude A1 regression (development-visible, not held out)',
  () => {
    it('reports all categories, leaks and false positives without changing cases', () => {
      const bytes = readFileSync(fixture)
      const cases = JSON.parse(bytes.toString('utf8')) as Case[]
      const rules = mergeRules(defaultRules, rulePacks.food)
      const results = cases.map((c) => ({
        ...c,
        actual: checkSentence(c.sentence, { facts: c.facts }, rules).length > 0 ? 'block' : 'pass',
      }))
      for (const category of [...new Set(cases.map((c) => c.category))]) {
        const group = results.filter((c) => c.category === category),
          bad = group.filter((c) => c.expect === 'block'),
          good = group.filter((c) => c.expect === 'pass')
        writeSync(
          1,
          `A1 ${category}: ${bad.filter((c) => c.actual === 'block').length}/${bad.length} detected; ${good.filter((c) => c.actual === 'block').length}/${good.length} false positives\n`,
        )
      }
      const bad = results.filter((c) => c.expect === 'block' && !c.disputed),
        good = results.filter((c) => c.expect === 'pass')
      const allBad = results.filter((c) => c.expect === 'block')
      writeSync(
        1,
        `A1 overall: ${allBad.filter((c) => c.actual === 'block').length}/${allBad.length} blocked; ${good.filter((c) => c.actual === 'block').length}/${good.length} false positives\n`,
      )
      writeSync(
        1,
        `A1 missed: ${JSON.stringify(results.filter((c) => c.expect !== c.actual).map(({ id, sentence, disputed }) => ({ id, sentence, disputed })))}\n`,
      )
      writeSync(1, `A1 SHA256: ${createHash('sha256').update(bytes).digest('hex')}\n`)
      expect(bad.filter((c) => c.actual === 'block').length / bad.length).toBeGreaterThanOrEqual(
        0.8,
      )
      expect(good.filter((c) => c.actual === 'block')).toEqual([])
      expect(readFileSync(fixture)).toEqual(bytes)
    })
  },
)
