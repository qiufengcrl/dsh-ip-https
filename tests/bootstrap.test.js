import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { injectBootstrap, PAGE_BOOTSTRAP_SOURCE, DATA_PLUGIN, TRUST_FLAG, CONNECTION_CLIENT_ID } from '../lib/bootstrap.js'

describe('injectBootstrap', () => {
  it('inserts the script once before </head>', () => {
    const html = injectBootstrap('<html><head><title>x</title></head><body></body></html>')
    assert.equal(html.includes(`data-plugin="${DATA_PLUGIN}"`), true)
    assert.equal(html.includes(PAGE_BOOTSTRAP_SOURCE.slice(0, 20)), true)
    assert.equal(injectBootstrap(html), html)
  })
})

describe('page bootstrap', () => {
  it('pins connection.isLoopback after the connection module apply()', () => {
    const connection = { isLoopback: false }
    const ctx = { get(name) { return name === 'connection' ? connection : undefined } }
    const loader = {
      load(handle) { return handle.factory() },
    }
    globalThis.__ModuleLoader__ = loader
    eval(PAGE_BOOTSTRAP_SOURCE)
    assert.equal(globalThis[TRUST_FLAG], 1)
    loader.load({
      id: CONNECTION_CLIENT_ID,
      factory() { return { apply(c) { void c } } },
    }).apply(ctx)
    assert.equal(connection.isLoopback, true)
    delete globalThis.__ModuleLoader__
    delete globalThis[TRUST_FLAG]
  })
})
