import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import path from 'node:path'
import { isUtf8 } from 'node:buffer'
import ts from 'typescript'

function optionalLines(file: string): Set<string> {
  try {
    return new Set(
      readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#')),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set()
    throw error
  }
}

// Named constant entries use file:const:NAME, so moving the fixture does not
// invalidate its exemption. Only the generic hex/base64 rule is exempted;
// explicit API keys, Bearer tokens and private-key headers still get checked.
function constantRanges(file: string, text: string, ignored: Set<string>): [number, number][] {
  const prefix = `${file}:const:`
  const names = new Set(
    [...ignored]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length)),
  )
  if (!names.size) return []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const ranges: [number, number][] = []
  for (const statement of source.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !(statement.declarationList.flags & ts.NodeFlags.Const)
    )
      continue
    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        names.has(declaration.name.text) &&
        declaration.initializer
      ) {
        ranges.push([declaration.initializer.getStart(source), declaration.initializer.end])
      }
    }
  }
  return ranges
}

function main(): void {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
  const ignored = optionalLines(path.join(root, '.secretsignore'))
  let scanned = 0
  let findings = 0
  let failed = false
  for (const file of files) {
    if (file === 'pnpm-lock.yaml' || ignored.has(file)) continue
    const absolute = path.join(root, file)
    let bytes: Buffer
    try {
      const stat = lstatSync(absolute)
      // Read a tracked symlink's text, never dereference it outside the repository.
      if (stat.isSymbolicLink()) {
        bytes = Buffer.from(readlinkSync(absolute), 'utf8')
      } else if (stat.isFile()) {
        bytes = readFileSync(absolute)
      } else {
        console.error(`${file}: cannot scan non-file entry`)
        failed = true
        continue
      }
    } catch {
      console.error(`${file}: cannot read tracked file`)
      failed = true
      continue
    }
    if (bytes.includes(0) || !isUtf8(bytes)) continue
    scanned++
    const text = bytes.toString('utf8')
    const ranges = constantRanges(file, text, ignored)
    let offset = 0
    for (const [index, rawLine] of text.split('\n').entries()) {
      const lineStart = offset
      offset += rawLine.length + 1
      const line = rawLine.replace(/\r$/, '')
      const location = `${file}:${index + 1}`
      if (ignored.has(location)) continue
      const matches: { kind: string; token: string }[] = []
      for (const match of line.matchAll(/sk-[A-Za-z0-9_-]{17,}/g))
        matches.push({ kind: 'API key', token: match[0] })
      // "Long" means at least 20 token characters; dots cover JWTs.
      for (const match of line.matchAll(/Bearer[ \t]+([A-Za-z0-9._~+/-]{20,}=*)/gi))
        matches.push({ kind: 'Bearer token', token: match[1]! })
      for (const match of line.matchAll(/-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g))
        matches.push({ kind: 'private key', token: match[0] })
      // Only the generic rule excludes hash fields; explicit keys are still caught.
      const hashField =
        /\b(?:sha(?:1|224|256|384|512)|integrity|checksum|hash)\b["']?\s*[:=]/i.test(line)
      if (!hashField) {
        const urls = [...line.matchAll(/https?:\/\/[^\s<>"']+/gi)].map((match) => [
          match.index!,
          match.index! + match[0].length,
        ])
        for (const match of line.matchAll(
          /(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9+/=])/g,
        )) {
          const start = match.index!
          const end = start + match[0].length
          // CSP/SRI digests have a hash algorithm prefix rather than a field assignment.
          if (/sha(?:1|224|256|384|512)-$/i.test(line.slice(0, start))) continue
          // Slash-delimited paths are not generic base64 candidates. URL exclusion
          // also handles long query fragments. Explicit secret rules above still apply.
          if (match[0].includes('/') || urls.some(([a, b]) => start >= a! && end <= b!)) continue
          if (ranges.some(([a, b]) => lineStart + start >= a && lineStart + end <= b)) continue
          if (!matches.some((m) => m.token.includes(match[0])))
            matches.push({ kind: 'hex/base64', token: match[0] })
        }
      }
      for (const { kind, token } of matches) {
        console.error(`${location}: ${kind} ${token.slice(0, 4)}***`)
        findings++
      }
    }
  }
  console.log(`Secret scan: ${scanned} tracked text files; ${findings} finding(s).`)
  if (findings || failed) process.exitCode = 1
}

try {
  main()
} catch {
  console.error('Secret scan failed: unable to enumerate or read repository files.')
  process.exitCode = 1
}
