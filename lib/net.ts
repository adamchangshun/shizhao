export const HTTPS_REQUIRED_MESSAGE =
  '公网地址必须使用 https；http 只允许 localhost、局域网 IP 或 .local 域名'

/** Hosts where plain http is acceptable: loopback, RFC 1918 LAN addresses, mDNS names. */
export function isLocalHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true
  if (h === '[::1]' || h === '::1') return true
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
}
