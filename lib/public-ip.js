import { networkInterfaces } from 'node:os'

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/

export function isPublicIPv4(value) {
  if (typeof value !== 'string' || !IPV4.test(value.trim())) return false
  const parts = value.trim().split('.').map(Number)
  if (parts.some((n) => n > 255)) return false
  const [a, b] = parts
  if (a === 10 || a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 192 && b === 168) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 0 || a >= 224) return false
  return true
}

export function firstNonInternalIPv4() {
  for (const addrs of Object.values(networkInterfaces() ?? {})) {
    for (const addr of addrs ?? []) {
      const ipv4 = addr.family === 'IPv4' || addr.family === 4
      if (ipv4 && !addr.internal) return addr.address
    }
  }
  return undefined
}

export async function detectPublicIPv4({ fetchImpl = fetch, timeoutMs = 5000 } = {}) {
  const urls = [
    'https://api.ipify.org',
    'https://ifconfig.me/ip',
    'https://ipv4.icanhazip.com',
  ]
  for (const url of urls) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, { signal: ac.signal, headers: { accept: 'text/plain' } })
      if (!res.ok) continue
      const ip = (await res.text()).trim()
      if (isPublicIPv4(ip)) return ip
    } catch {
      // try next
    } finally {
      clearTimeout(timer)
    }
  }
  const local = firstNonInternalIPv4()
  return isPublicIPv4(local) ? local : undefined
}
