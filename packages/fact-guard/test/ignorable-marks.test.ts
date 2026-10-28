import { describe, expect, it } from 'vitest'
import { checkSentence } from '../src/index'

describe('default-ignorable marks cannot split lexical claims', () => {
  it.each(['\u034f', '\ufe00', '\ufe0f', '\u{e0100}'])(
    'removes a run of %j and maps the hit to the complete original claim',
    (mark) => {
      const claim = `零${mark.repeat(4)}糖`
      expect(checkSentence(claim, { facts: [] })).toEqual([
        expect.objectContaining({
          reason: 'unsupported_claim',
          evidence: claim,
          start: 0,
          end: claim.length,
        }),
      ])
    },
  )
})
