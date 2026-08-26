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
      res.writeHead(200, { 'content-type': 'text/plain' })
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
})
