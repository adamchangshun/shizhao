import { describe, expect, it } from 'vitest'
import { endpointLabel } from '@/eval/lib/config'

describe('endpointLabel', () => {
  it('keeps origin and path but drops credentials, query and fragment', () => {
    expect(endpointLabel('https://user:sk-secret@api.example.com/v1/?key=abc#x')).toBe(
      'https://api.example.com/v1',
    )
  })

  it('is null when no endpoint is configured', () => {
    expect(endpointLabel(undefined)).toBeNull()
    expect(endpointLabel('  ')).toBeNull()
  })
})
