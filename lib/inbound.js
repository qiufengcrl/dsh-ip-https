import { pinIncomingHeaders } from './headers.js'

export function resolveHttpServer(webServer) {
  if (!webServer || typeof webServer !== 'object') return undefined
  const direct = webServer.server
  if (direct && typeof direct.on === 'function' && typeof direct.listeners === 'function') return direct
  for (const value of Object.values(webServer)) {
    if (value && typeof value.on === 'function' && typeof value.listeners === 'function' && typeof value.address === 'function') {
      return value
    }
  }
  return undefined
}

export function patchWebServerHeaders(webServer, backendPort) {
  const server = resolveHttpServer(webServer)
  if (!server) return undefined

  const portOf = () => Number(typeof backendPort === 'function' ? backendPort() : backendPort)
  const requestListeners = server.listeners('request').slice()
  const upgradeListeners = server.listeners('upgrade').slice()
  server.removeAllListeners('request')
  server.removeAllListeners('upgrade')

  function onRequest(req, res) {
    pinIncomingHeaders(req, portOf())
    for (const listener of requestListeners) listener.call(server, req, res)
  }

  function onUpgrade(req, socket, head) {
    pinIncomingHeaders(req, portOf())
    for (const listener of upgradeListeners) listener.call(server, req, socket, head)
  }

  server.on('request', onRequest)
  server.on('upgrade', onUpgrade)

  return () => {
    server.removeListener('request', onRequest)
    server.removeListener('upgrade', onUpgrade)
    for (const listener of requestListeners) server.on('request', listener)
    for (const listener of upgradeListeners) server.on('upgrade', listener)
  }
}
