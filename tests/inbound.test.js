import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { patchWebServerHeaders } from '../lib/inbound.js'

describe('patchWebServerHeaders', () => {
  it('rewrites Host before the existing request handler runs', async () => {
    let seenHost
    const server = createServer((req, res) => {
      seenHost = req.headers.host
      res.writeHead(200)
      res.end('ok')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    const port = server.address().port
    const undo = patchWebServerHeaders({ server }, port)
    await new Promise((resolve, reject) => {
      const req = httpRequest({
        host: '127.0.0.1',
        port,
        path: '/',
        headers: { host: '203.0.113.10', origin: 'http://203.0.113.10' },
      }, (res) => {
        res.resume()
        res.on('end', resolve)
      })
      req.on('error', reject)
      req.end()
    })
    assert.equal(seenHost, `127.0.0.1:${port}`)
    undo()
    await new Promise((resolve) => server.close(resolve))
  })
})
