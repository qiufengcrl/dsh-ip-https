import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { forwardHeaders, loopbackAuthority, pinIncomingHeaders } from '../lib/headers.js'

describe('forwardHeaders', () => {
  it('rewrites Host and Origin to loopback and drops spoofable forwarding', () => {
    const headers = forwardHeaders({
      host: '203.0.113.10',
      origin: 'https://203.0.113.10',
      'x-forwarded-host': 'evil.example',
      'sec-fetch-site': 'cross-site',
      accept: 'application/json',
    }, 3080)

    assert.equal(loopbackAuthority(3080), '127.0.0.1:3080')
    assert.equal(headers.host, '127.0.0.1:3080')
    assert.equal(headers.origin, 'http://127.0.0.1:3080')
    assert.equal(headers['sec-fetch-site'], 'same-origin')
    assert.equal(headers['x-forwarded-host'], undefined)
    assert.equal(headers.accept, 'application/json')
  })
})

describe('pinIncomingHeaders', () => {
  it('rewrites Host on the live request so nginx IP access looks like loopback', () => {
    const req = {
      headers: {
        host: '203.0.113.10',
        origin: 'http://203.0.113.10',
        'x-forwarded-host': '203.0.113.10',
      },
    }
    pinIncomingHeaders(req, 3080)
    assert.equal(req.headers.host, '127.0.0.1:3080')
    assert.equal(req.headers.origin, 'http://127.0.0.1:3080')
    assert.equal(req.headers['x-forwarded-host'], undefined)
  })
})
