import { createGuardHandler } from '@/lib/guard-api/handler'

export const runtime = 'nodejs'
const state = globalThis as unknown as { guardApiHandler?: ReturnType<typeof createGuardHandler> }
// Persist limits through development hot reloads; production has one long-lived process.
export const POST = (state.guardApiHandler ??= createGuardHandler())
