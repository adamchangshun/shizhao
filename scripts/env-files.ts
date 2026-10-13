import fs from 'node:fs'

/** Value of `KEY=value` in dotenv text; undefined when missing or empty. */
export function readEnvValue(content: string, key: string): string | undefined {
  const line = content.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim()
  const value = line?.replace(/^(['"])(.*)\1$/, '$2')
  return value ? value : undefined
}

/** Loads .env.local, then .env, into process.env. Existing variables win, as with Next.js. */
export function loadEnvFiles(): void {
  for (const file of ['.env.local', '.env']) if (fs.existsSync(file)) process.loadEnvFile(file)
}

/** Whether dotenv text assigns `key` at all, even to an empty value. */
export function hasEnvKey(content: string, key: string): boolean {
  return new RegExp(`^${key}=`, 'm').test(content)
}
