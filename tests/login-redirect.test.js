import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hasDshAuthCookie, requestNeedsLoginRedirect } from '../lib/login-redirect.js'

describe('hasDshAuthCookie', () => {
  it('accepts the dsh 0.1.2 cookie family', () => {
    assert.equal(hasDshAuthCookie('dsh-auth-x=abc'), true)
    assert.equal(hasDshAuthCookie('other=1; dsh-auth=abc'), true)
    assert.equal(hasDshAuthCookie('session=1'), false)
    assert.equal(hasDshAuthCookie(undefined), false)
  })
})

describe('requestNeedsLoginRedirect', () => {
  it('only redirects a bare GET / without token or auth cookie', () => {
    assert.equal(requestNeedsLoginRedirect({ method: 'GET', url: '/', headers: {} }), true)
    assert.equal(requestNeedsLoginRedirect({ method: 'HEAD', url: '/', headers: {} }), true)
    assert.equal(requestNeedsLoginRedirect({ method: 'GET', url: '/?token=abc', headers: {} }), false)
    assert.equal(requestNeedsLoginRedirect({ method: 'GET', url: '/', headers: { cookie: 'dsh-auth-x=abc' } }), false)
    assert.equal(requestNeedsLoginRedirect({ method: 'GET', url: '/api', headers: {} }), false)
    assert.equal(requestNeedsLoginRedirect({ method: 'POST', url: '/', headers: {} }), false)
  })
})
