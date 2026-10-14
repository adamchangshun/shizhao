import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

type Dependency = {
  path?: string
  dependencies?: Record<string, Dependency>
  optionalDependencies?: Record<string, Dependency>
}
type Manifest = { name: string; version: string }
type LicenseInfo = { licenses?: string | string[] }

function pnpm(args: string[], cwd: string): string {
  return execFileSync('pnpm', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function main(): void {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const inventory = new Map<string, Manifest>()
  const absentOptional = new Set<string>()
  const visited = new Set<Dependency>()
  const trees = JSON.parse(
    pnpm(['list', '--recursive', '--prod', '--depth', 'Infinity', '--json'], root),
  ) as Dependency[]
  if (!Array.isArray(trees) || !trees.length)
    throw new Error('pnpm did not return a workspace inventory')

  function collect(node: Dependency): void {
    if (visited.has(node)) return
    visited.add(node)
    const parentManifest = node.path
      ? (JSON.parse(readFileSync(path.join(node.path, 'package.json'), 'utf8')) as {
          optionalDependencies?: Record<string, string>
        })
      : {}
    for (const field of ['dependencies', 'optionalDependencies'] as const) {
      for (const [name, dependency] of Object.entries(node[field] ?? {})) {
        const manifestPath = dependency.path && path.join(dependency.path, 'package.json')
        if (!manifestPath || !existsSync(manifestPath)) {
          if (
            field === 'optionalDependencies' ||
            Object.hasOwn(parentManifest.optionalDependencies ?? {}, name)
          ) {
            absentOptional.add(dependency.path ?? name)
            continue
          }
          throw new Error(`Missing installed production dependency: ${name}`)
        }
        const directory = realpathSync(dependency.path!)
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
        if (!manifest.name || !manifest.version)
          throw new Error(`Invalid package manifest: ${name}`)
        inventory.set(directory, manifest)
        collect(dependency)
      }
    }
  }
  for (const tree of trees) collect(tree)
  if (!inventory.size)
    throw new Error('No installed production dependencies found; run pnpm i --frozen-lockfile')

  let allowed: { pattern: string; license: string }[] = []
  try {
    // Each entry binds a package name/name@version (or trailing-* prefix)
    // to an exact license expression. License changes require renewed approval.
    allowed = readFileSync(path.join(root, '.licenseallow'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.split('#', 1)[0]!.trim())
      .filter(Boolean)
      .map((line) => {
        const entry = /^(\S+)\s+(.+)$/.exec(line)
        if (!entry || entry[1] === '*')
          throw new Error('Each .licenseallow entry requires a package pattern and license')
        return { pattern: entry[1]!, license: entry[2]!.trim() }
      })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const temporary = mkdtempSync(path.join(os.tmpdir(), 'shizhao-licenses-'))
  try {
    // The checker alone misses pnpm optional/transitive links and may include dev peers.
    // Expose every installed production package as a direct dependency in a disposable
    // inventory, then restrict its result back to that exact inventory.
    mkdirSync(path.join(temporary, 'node_modules'))
    const dependencies: Record<string, string> = {}
    let index = 0
    for (const directory of inventory.keys()) {
      const alias = `dep-${index++}`
      dependencies[alias] = '*'
      symlinkSync(directory, path.join(temporary, 'node_modules', alias), 'junction')
    }
    writeFileSync(
      path.join(temporary, 'package.json'),
      JSON.stringify({
        name: 'shizhao-license-inventory',
        version: '0.0.0',
        license: 'MIT',
        dependencies,
      }),
    )
    // Fixed top-level version, separate dlx cache: A3 forbids changing pnpm-lock.yaml.
    // First use needs registry access; transitive tool dependencies are not repo-locked.
    const result = JSON.parse(
      pnpm(
        [
          '--silent',
          'dlx',
          'license-checker-rseidelsohn@5.0.1',
          '--start',
          temporary,
          '--production',
          '--direct',
          '1',
          '--unknown',
          '--json',
        ],
        root,
      ),
    ) as Record<string, LicenseInfo>
    const packages = new Map(
      [...inventory.values()].map((pkg) => [`${pkg.name}@${pkg.version}`, pkg]),
    )
    const distribution = new Map<string, number>()
    const blocked: string[] = []
    const exempted: string[] = []
    for (const [id, pkg] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
      if (!Object.hasOwn(result, id))
        throw new Error(`License checker omitted production package: ${id}`)
      const value = result[id]?.licenses
      const license = (Array.isArray(value) ? value.join(' AND ') : value)?.trim() || 'UNKNOWN'
      distribution.set(license, (distribution.get(license) ?? 0) + 1)
      // Conservative policy: even an OR expression containing a blocked license
      // requires an explicit package-level decision, rather than picking for the user.
      const forbidden = /\b(?:A?GPL|LGPL|SSPL)(?:\b|[-\d])/i.test(license)
      const unknown = /UNKNOWN|UNLICENSED|UNDEFINED|SEE LICENSE|Custom:|https?:|\*/i.test(license)
      if (forbidden || unknown) {
        const entry = `${id}: ${license}`
        const explicitlyAllowed = allowed.some((rule) => {
          const nameMatches =
            rule.pattern === id ||
            rule.pattern === pkg.name ||
            (rule.pattern.endsWith('*') &&
              rule.pattern.length > 1 &&
              pkg.name.startsWith(rule.pattern.slice(0, -1)))
          return nameMatches && rule.license === license
        })
        if (explicitlyAllowed) exempted.push(entry)
        else blocked.push(entry)
      }
    }
    console.log(`Production license distribution (${packages.size} installed packages):`)
    for (const [license, count] of [...distribution].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`  ${license}: ${count}`)
    }
    console.log(`Optional packages absent on this platform: ${absentOptional.size} (not assessed).`)
    for (const entry of exempted) console.log(`ALLOW (.licenseallow): ${entry}`)
    for (const entry of blocked) console.error(`REVIEW REQUIRED: ${entry}`)
    console.log(`License check: ${blocked.length} blocked; ${exempted.length} explicitly allowed.`)
    if (blocked.length) process.exitCode = 1
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

try {
  main()
} catch (error) {
  // Do not echo child-process output: registry credentials may appear in tool errors.
  console.error('License check failed: unable to complete production dependency inventory/checker.')
  if (error instanceof Error && !('status' in error)) console.error(error.message)
  process.exitCode = 1
}
