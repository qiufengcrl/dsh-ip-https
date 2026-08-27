const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'trailers',
  'transfer-encoding',
  'upgrade',
])

const DROP = new Set([
  'host',
  'origin',
  'referer',
  'referrer',
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
  'x-real-ip',
])

function connectionTokens(headers) {
  const tokens = new Set(['proxy-connection'])
  const connection = headers?.connection
  const values = Array.isArray(connection) ? connection : [connection]
  for (const value of values) {
    for (const token of String(value ?? '').split(',')) {
      const normalized = token.trim().toLowerCase()
      if (normalized !== '') tokens.add(normalized)
    }
  }
  return tokens
}

export function loopbackAuthority(port) {
  return `127.0.0.1:${Number(port)}`
}

/**
 * Rewrite Host/Origin on the live IncomingMessage so nginx → dsh still
 * passes the loopback trust fence. Mutates in place.
 */
export function pinIncomingHeaders(req, backendPort) {
  if (!req?.headers || typeof req.headers !== 'object') return
  const authority = loopbackAuthority(backendPort)
  req.headers.host = authority
  req.headers.origin = `http://${authority}`
  req.headers['sec-fetch-site'] = 'same-origin'
  delete req.headers.forwarded
  delete req.headers['x-forwarded-for']
  delete req.headers['x-forwarded-host']
  delete req.headers['x-forwarded-port']
  delete req.headers['x-forwarded-proto']
  delete req.headers['x-real-ip']
}

/**
 * Always 127.0.0.1, never the public IP or listen address.
 */
export function forwardHeaders(reqHeaders, backendPort, extras = {}) {
  const headers = {}
  const nominated = connectionTokens(reqHeaders)
  for (const [key, value] of Object.entries(reqHeaders ?? {})) {
    const lower = key.toLowerCase()
    if (value === undefined || value === null) continue
    if (nominated.has(lower) || HOP_BY_HOP.has(lower) || DROP.has(lower)) continue
    headers[lower] = value
  }
  const authority = loopbackAuthority(backendPort)
  headers.host = authority
  headers.origin = `http://${authority}`
  headers['sec-fetch-site'] = 'same-origin'
  if (extras.forwardedFor) headers['x-forwarded-for'] = extras.forwardedFor
  if (extras.forwardedProto) headers['x-forwarded-proto'] = extras.forwardedProto
  return headers
}

export function sanitizeResponseHeaders(headers) {
  const out = {}
  const nominated = connectionTokens(headers)
  for (const [key, value] of Object.entries(headers ?? {})) {
    const lower = key.toLowerCase()
    if (value === undefined || value === null || lower === 'set-cookie') continue
    if (nominated.has(lower) || HOP_BY_HOP.has(lower)) continue
    out[key] = value
  }
  return out
}

export function sanitizeUpgradeResponseHeaders(headers) {
  const out = sanitizeResponseHeaders(headers)
  if (headers?.connection !== undefined) out.connection = headers.connection
  if (headers?.upgrade !== undefined) out.upgrade = headers.upgrade
  return out
}
