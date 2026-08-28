const AUTH_COOKIE_NAME = 'dsh-auth'

/**
 * dsh 0.1.2+ signs a host-bound HttpOnly cookie whose name starts with
 * `dsh-auth`. Any such cookie means this browser already exchanged a token.
 * @param {string | string[] | undefined} cookieHeader
 * @returns {boolean}
 */
export function hasDshAuthCookie(cookieHeader) {
  const raw = Array.isArray(cookieHeader) ? cookieHeader.join('; ') : String(cookieHeader ?? '')
  return raw.split(';').some((part) => {
    const name = part.trim().split('=')[0]
    return name === AUTH_COOKIE_NAME || name.startsWith(`${AUTH_COOKIE_NAME}-`)
  })
}

/**
 * True when the HTTPS gateway should 302 to the current process token URL
 * instead of proxying (phone / new browser opening `/` with no cookie).
 * @param {{ method?: string, url?: string, headers?: { cookie?: string | string[] } }} req
 * @returns {boolean}
 */
export function requestNeedsLoginRedirect(req) {
  const method = req?.method
  if (method !== 'GET' && method !== 'HEAD') return false
  let parsed
  try {
    parsed = new URL(req.url ?? '/', 'http://x')
  } catch {
    return false
  }
  if (parsed.pathname !== '/') return false
  if (parsed.searchParams.has('token')) return false
  if (hasDshAuthCookie(req.headers?.cookie)) return false
  return true
}
