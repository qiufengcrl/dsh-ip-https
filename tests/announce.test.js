import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { publicUrl, listenHints } from '../lib/announce.js'

describe('publicUrl', () => {
  it('omits default https/http ports', () => {
    assert.equal(publicUrl({ https: { port: 443 }, tls: true }, '203.0.113.10'), 'https://203.0.113.10/')
    assert.equal(publicUrl({ fallback: { port: 80 }, tls: false }, '203.0.113.10'), 'http://203.0.113.10/')
  })

  it('keeps non-default ports', () => {
    assert.equal(publicUrl({ fallback: { port: 3443 }, tls: true }, '203.0.113.10'), 'https://203.0.113.10:3443/')
  })
})

describe('listenHints', () => {
  it('explains occupied 80/443 without requiring the user to know nginx', () => {
    const hints = listenHints({
      http: undefined,
      https: undefined,
      fallback: { port: 3443 },
    })
    assert.equal(hints.some((line) => line.includes('已被占用')), true)
    assert.equal(hints.some((line) => line.includes('原来的外网地址')), true)
    assert.equal(hints.some((line) => line.includes('3443')), true)
  })

  it('is silent when 80 and 443 bound as intended', () => {
    assert.deepEqual(listenHints({
      http: { port: 80 },
      https: { port: 443 },
    }), [])
  })
})
