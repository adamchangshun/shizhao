import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ADMIN_COOKIE, verifySessionValue } from '@/lib/auth'

/** Server pages of the console: no valid session cookie → the login page, then back to `next`. */
export async function requireSession(next: string): Promise<void> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value
  if (value && verifySessionValue(value)) return
  redirect(`/login?next=${encodeURIComponent(next)}`)
}
