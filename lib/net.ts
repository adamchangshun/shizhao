export const HTTPS_REQUIRED_MESSAGE =
  '公网地址必须使用 https；http 只允许 localhost、局域网 IP 或 .local 域名'

/** Converts a canonical bracketed IPv4-mapped IPv6 address to its IPv4 identity. */
export function mappedIpv4Address(address: string): string | null {
  const mapped = /^\[::ffff:([a-f0-9]+):([a-f0-9]+)\]$/.exec(address)
  if (!mapped) return null
  const hi = parseInt(mapped[1]!, 16)
  const lo = parseInt(mapped[2]!, 16)
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')
}

/** Rate-limit identity for IPv6 after removing an optional zone id; mapped and known translated IPv4 keep full identity. */
export function ipv6RateLimitKey(address: string): string {
  const addressWithoutZone = address.split('%', 1)[0] ?? ''
  const canonical = new URL(`http://[${addressWithoutZone}]/`).hostname
  // Classify mapped IPv4 before masking: /64 would put all mapped addresses in one bucket.
  if (mappedIpv4Address(canonical)) return canonical

  const [head, tail] = canonical.slice(1, -1).split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups =
    tail === undefined
      ? left
      : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
  // Match all 96 prefix bits, so neighboring native IPv6 ranges still share a /64.
  const prefix96 = groups.slice(0, 6).join(':')
  if (prefix96 === '64:ff9b:0:0:0:0' || prefix96 === '0:0:0:0:ffff:0') return canonical
  return `${groups.slice(0, 4).join(':')}::/64`
}

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
