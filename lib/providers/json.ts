import { ProviderError } from './errors'

/** Extract the first balanced object, ignoring braces in quoted/escaped strings. */
export function extractJSON(content: string): unknown {
  try {
    return JSON.parse(content) as unknown
  } catch {
    /* Try fenced/prose replies. */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content)
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]) as unknown
    } catch {
      /* Try the first object. */
    }
  }
  const start = content.indexOf('{')
  if (start !== -1) {
    let depth = 0,
      quoted = false,
      escaped = false
    for (let i = start; i < content.length; i++) {
      const ch = content[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') quoted = false
      } else if (ch === '"') quoted = true
      else if (ch === '{') depth++
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(content.slice(start, i + 1)) as unknown
        } catch {
          break
        }
      }
    }
  }
  throw new ProviderError('bad_response')
}
