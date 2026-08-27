import { createServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { request as httpRequest } from 'node:http'
import { forwardHeaders, sanitizeResponseHeaders, sanitizeUpgradeResponseHeaders, loopbackAuthority } from './headers.js'

const ACME_PREFIX = '/.well-known/acme-challenge/'

function pathnameOf(url) {
  try {
    return new URL(url ?? '/', 'http://x').pathname
  } catch {
    return '/'
  }
}

function send(res, status, headers, body) {
  res.writeHead(status, headers)
  res.end(body)
}

export function createGateway(spec) {
  const challenges = new Map()
  let closed = false
  let httpsServer
  let httpServer
  const status = {
    https: undefined,
    http: undefined,
    fallback: undefined,
    tls: false,
    error: undefined,
  }

  const backendPort = () => {
    try {
      const port = Number(spec.backendPort())
      if (Number.isFinite(port) && port > 0) return port
    } catch {
      // Cordis "inactive context" if the plugin was disabled mid-request.
    }
    return undefined
  }

  function handleAcme(req, res) {
    const path = pathnameOf(req.url)
    if (!path.startsWith(ACME_PREFIX) || req.method !== 'GET') return false
    const challengeToken = path.slice(ACME_PREFIX.length)
    const keyAuth = challenges.get(challengeToken)
    if (!keyAuth) {
      send(res, 404, { 'content-type': 'text/plain' }, 'not found')
      return true
    }
    send(res, 200, { 'content-type': 'text/plain' }, keyAuth)
    return true
  }

  function proxyHttp(req, res, tls) {
    if (closed) {
      send(res, 503, { 'content-type': 'text/plain' }, 'gateway stopped')
      return
    }
    if (handleAcme(req, res)) return
    const port = backendPort()
    if (!port) {
      send(res, 502, { 'content-type': 'text/plain' }, 'upstream unavailable')
      return
    }
    const headers = forwardHeaders(req.headers, port)
    const upstream = httpRequest({
      host: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      headers,
    }, (up) => {
      res.writeHead(up.statusCode ?? 502, sanitizeResponseHeaders(up.headers))
      up.pipe(res)
    })
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 502, { 'content-type': 'text/plain' }, 'upstream unavailable')
      else res.destroy()
    })
    req.pipe(upstream)
  }

  function proxyUpgrade(req, socket, head) {
    if (closed) {
      socket.destroy()
      return
    }
    const port = backendPort()
    if (!port) {
      socket.destroy()
      return
    }
    const headers = forwardHeaders(req.headers, port)
    headers.connection = req.headers.connection ?? 'Upgrade'
    headers.upgrade = req.headers.upgrade ?? 'websocket'
    const upstream = httpRequest({
      host: '127.0.0.1',
      port,
      path: req.url,
      method: req.method,
      headers,
    })
    upstream.on('upgrade', (upRes, upSocket, upHead) => {
      const extra = sanitizeUpgradeResponseHeaders(upRes.headers)
      const lines = [`HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage || ''}`.trim()]
      for (const [key, value] of Object.entries(extra)) {
        const values = Array.isArray(value) ? value : [value]
        for (const item of values) lines.push(`${key}: ${item}`)
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`)
      if (upHead?.length) socket.write(upHead)
      if (head?.length) upSocket.write(head)
      socket.pipe(upSocket)
      upSocket.pipe(socket)
    })
    upstream.on('error', () => socket.destroy())
    upstream.end()
  }

  function attach(server, tls) {
    server.on('request', (req, res) => proxyHttp(req, res, tls))
    server.on('upgrade', proxyUpgrade)
  }

  async function listen(server, host, port) {
    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err)
      server.once('error', onError)
      server.listen(port, host, () => {
        server.off('error', onError)
        resolve()
      })
    })
    const addr = server.address()
    return { host: addr.address, port: addr.port }
  }

  async function listenHttpRedirect(host, port) {
    const server = createServer((req, res) => {
      if (handleAcme(req, res)) return
      const locationHost = req.headers.host?.split(':')[0] || spec.publicHost()
      send(res, 301, { location: `https://${locationHost}${req.url ?? '/'}` }, '')
    })
    httpServer = server
    status.http = await listen(server, host, port)
  }

  async function startHttp() {
    const host = spec.listenHost
    const httpPort = spec.httpPort
    try {
      await listenHttpRedirect(host, httpPort)
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        const msg = `port ${httpPort} in use (often nginx); ACME and ${httpPort}→HTTPS disabled`
        status.error = [status.error, msg].filter(Boolean).join('; ')
        spec.log?.(msg)
      } else {
        throw err
      }
    }
    return status
  }

  async function startHttps() {
    const host = spec.listenHost
    const httpsPort = spec.httpsPort
    const fallbackPort = spec.fallbackPort
    const tls = spec.tlsContext()

    try {
      if (tls) {
        httpsServer = createHttpsServer(tls)
        attach(httpsServer, true)
        status.https = await listen(httpsServer, host, httpsPort)
        status.tls = true
      } else {
        status.error = [status.error, `no TLS cert, listening HTTP on ${fallbackPort}`].filter(Boolean).join('; ')
        spec.log?.(status.error)
        httpsServer = createServer()
        attach(httpsServer, false)
        status.fallback = await listen(httpsServer, host, fallbackPort)
        status.tls = false
      }
    } catch (err) {
      if (err && err.code === 'EADDRINUSE') {
        status.error = [status.error, `port ${httpsPort} in use, falling back to ${fallbackPort}`].filter(Boolean).join('; ')
        spec.log?.(status.error)
        httpsServer = tls ? createHttpsServer(tls) : createServer()
        attach(httpsServer, Boolean(tls))
        status.fallback = await listen(httpsServer, host, fallbackPort)
        status.tls = Boolean(tls)
      } else {
        throw err
      }
    }
    return status
  }

  async function close() {
    closed = true
    await Promise.all([
      httpsServer ? new Promise((r) => httpsServer.close(() => r())) : undefined,
      httpServer ? new Promise((r) => httpServer.close(() => r())) : undefined,
    ])
  }

  function setTlsContext(ctx) {
    if (httpsServer && typeof httpsServer.setSecureContext === 'function' && ctx) {
      httpsServer.setSecureContext(ctx)
      status.tls = true
    }
  }

  return {
    startHttp,
    startHttps,
    close,
    status: () => status,
    setChallenge(challengeToken, keyAuth) { challenges.set(challengeToken, keyAuth) },
    clearChallenge(challengeToken) { challenges.delete(challengeToken) },
    setTlsContext,
    loopbackAuthority: () => loopbackAuthority(backendPort()),
  }
}
