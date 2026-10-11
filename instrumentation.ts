// Runs once when the Next.js server starts. The Node-only module is imported behind the
// NEXT_RUNTIME check so the edge compilation never bundles better-sqlite3.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node')
  }
}
