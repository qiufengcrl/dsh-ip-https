import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createGateway } from '../lib/gateway.js'

describe('gateway proxy', () => {
  let backend
  let backendPort
  let seenHost
  let gateway

  before(async () => {
    backend = createServer((req, res) => {
      seenHost = req.headers.host
      res.writeHead(200, {
        'content-type': 'text/plain',
        'set-cookie': 'dsh-auth-x=abc; Path=/; HttpOnly',
      })
      res.end('ok')
    })
    await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve))
    backendPort = backend.address().port
  })

  after(async () => {
    await gateway?.close()
    await new Promise((resolve) => backend.close(resolve))
  })

  it('rewrites Host to loopback when forwarding', async () => {
    gateway = createGateway({
      listenHost: '127.0.0.1',
      httpsPort: 443,
      httpPort: 0,
      fallbackPort: 0,
      backendPort: () => backendPort,
      publicHost: () => '127.0.0.1',
      tlsContext: () => undefined,
      tlsActive: () => false,
    })
    const httpStatus = await gateway.startHttp()
    const httpsStatus = await gateway.startHttps()
    const port = httpsStatus.fallback.port
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { host: '203.0.113.10', origin: 'http://203.0.113.10' },
    })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok')
    assert.equal(seenHost, `127.0.0.1:${backendPort}`)
    assert.equal(httpStatus.http?.port > 0 || httpStatus.error, true)
  })

  it('forwards Set-Cookie from upstream', async () => {
    const port = gateway.status().fallback.port
    const res = await fetch(`http://127.0.0.1:${port}/cookie`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.getSetCookie().some((value) => value.startsWith('dsh-auth-x=abc')), true)
  })

  it('redirects / to loginUrl when the browser has no token and no auth cookie', async () => {
    await gateway?.close()
    gateway = createGateway({
      listenHost: '127.0.0.1',
      httpsPort: 443,
      httpPort: 0,
      fallbackPort: 0,
      backendPort: () => backendPort,
      publicHost: () => '127.0.0.1',
      tlsContext: () => undefined,
      tlsActive: () => false,
      loginUrl: () => 'https://203.0.113.10/?token=test-token',
    })
    const httpsStatus = await gateway.startHttps()
    const port = httpsStatus.fallback.port
    const res = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('location'), 'https://203.0.113.10/?token=test-token')
  })

  it('proxies / when the request already has a token or an auth cookie', async () => {
    await gateway?.close()
    gateway = createGateway({
      listenHost: '127.0.0.1',
      httpsPort: 443,
      httpPort: 0,
      fallbackPort: 0,
      backendPort: () => backendPort,
      publicHost: () => '127.0.0.1',
      tlsContext: () => undefined,
      tlsActive: () => false,
      loginUrl: () => 'https://203.0.113.10/?token=must-not-use',
    })
    const httpsStatus = await gateway.startHttps()
    const port = httpsStatus.fallback.port
    const withToken = await fetch(`http://127.0.0.1:${port}/?token=already`, { redirect: 'manual' })
    assert.equal(withToken.status, 200)
    const withCookie = await fetch(`http://127.0.0.1:${port}/`, {
      redirect: 'manual',
      headers: { cookie: 'dsh-auth-x=abc' },
    })
    assert.equal(withCookie.status, 200)
  })

  it('returns 502 instead of crashing when backendPort throws', async () => {
    await gateway?.close()
    gateway = createGateway({
      listenHost: '127.0.0.1',
      httpsPort: 443,
      httpPort: 0,
      fallbackPort: 0,
      backendPort: () => {
        throw new Error('cannot get required service "webServer" in inactive context')
      },
      publicHost: () => '127.0.0.1',
      tlsContext: () => undefined,
      tlsActive: () => false,
    })
    const httpsStatus = await gateway.startHttps()
    const port = httpsStatus.fallback.port
    const res = await fetch(`http://127.0.0.1:${port}/`)
    assert.equal(res.status, 502)
    assert.equal(await res.text(), 'upstream unavailable')
  })
})
