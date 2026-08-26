import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isPublicIPv4 } from '../lib/public-ip.js'
import { shouldRenew } from '../lib/acme-ip.js'

describe('isPublicIPv4', () => {
  it('accepts public addresses and rejects RFC1918 / loopback', () => {
    assert.equal(isPublicIPv4('203.0.113.10'), true)
    assert.equal(isPublicIPv4('127.0.0.1'), false)
    assert.equal(isPublicIPv4('10.0.0.1'), false)
    assert.equal(isPublicIPv4('192.168.1.1'), false)
    assert.equal(isPublicIPv4('172.16.0.1'), false)
    assert.equal(isPublicIPv4('not-an-ip'), false)
  })
})

describe('shouldRenew', () => {
  it('renews when expiry is within 48 hours', () => {
    const now = new Date('2026-08-26T00:00:00Z')
    assert.equal(shouldRenew(new Date('2026-08-27T00:00:00Z'), now), true)
    assert.equal(shouldRenew(new Date('2026-09-01T00:00:00Z'), now), false)
    assert.equal(shouldRenew(undefined, now), true)
  })
})
