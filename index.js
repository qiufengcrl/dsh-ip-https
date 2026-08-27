import { injectBootstrap } from './lib/bootstrap.js'
import { createGateway } from './lib/gateway.js'
import { detectPublicIPv4, isPublicIPv4 } from './lib/public-ip.js'
import { dataDir, loadState, saveState } from './lib/state.js'
import { issueIpCertificate, loadTlsContext, certNotAfter, shouldRenew } from './lib/acme-ip.js'
import { publicUrl, listenHints } from './lib/announce.js'

export const name = 'dsh-ip-https'
export const inject = ['webServer']

export function apply(ctx, config = {}) {
  const cfg = {
    listenHost: config.listenHost ?? '0.0.0.0',
    httpsPort: Number(config.httpsPort ?? 443),
    httpPort: Number(config.httpPort ?? 80),
    fallbackPort: Number(config.fallbackPort ?? 3443),
    autoTls: config.autoTls !== false,
    publicIp: String(config.publicIp ?? '').trim(),
    acmeEmail: String(config.acmeEmail ?? '').trim(),
    acmeStaging: config.acmeStaging === true,
  }

  ctx.effect(() => {
    let closed = false
    let gateway
    let renewTimer
    const unsubIndex = typeof ctx.webServer.tapIndex === 'function'
      ? ctx.webServer.tapIndex(injectBootstrap)
      : undefined

    const run = (async () => {
      const dir = dataDir()
      const state = await loadState(dir)

      let publicIp = cfg.publicIp || state.publicIp
      if (!isPublicIPv4(publicIp)) publicIp = await detectPublicIPv4()
      if (isPublicIPv4(publicIp)) state.publicIp = publicIp
      await saveState(dir, state)

      if (state.publicIp) ctx.logger.info(`dsh-ip-https public IP: ${state.publicIp}`)

      let tlsContext = await loadTlsContext(dir)
      const backendPort = () => Number(ctx.webServer.port)

      gateway = createGateway({
        listenHost: cfg.listenHost,
        httpsPort: cfg.httpsPort,
        httpPort: cfg.httpPort,
        fallbackPort: cfg.fallbackPort,
        backendPort,
        publicHost: () => state.publicIp || '127.0.0.1',
        tlsContext: () => tlsContext,
        tlsActive: () => Boolean(tlsContext),
        log: (msg) => ctx.logger.warn(`dsh-ip-https: ${msg}`),
      })

      await gateway.startHttp()

      const needIssue = async () => {
        if (!cfg.autoTls || !isPublicIPv4(state.publicIp)) return false
        if (!gateway.status().http) return false
        if (!tlsContext) return true
        return shouldRenew(certNotAfter(tlsContext.cert))
      }

      const issue = async () => {
        tlsContext = await issueIpCertificate({
          dir,
          ip: state.publicIp,
          email: cfg.acmeEmail || undefined,
          staging: cfg.acmeStaging,
          setChallenge: (challengeToken, keyAuth) => gateway.setChallenge(challengeToken, keyAuth),
          clearChallenge: (challengeToken) => gateway.clearChallenge(challengeToken),
          log: (msg) => ctx.logger.info(`dsh-ip-https: ${msg}`),
        })
      }

      if (await needIssue()) {
        try {
          await issue()
        } catch (err) {
          ctx.logger.warn(`dsh-ip-https certificate failed: ${err instanceof Error ? err.message : err}`)
        }
      }

      await gateway.startHttps()
      if (tlsContext) gateway.setTlsContext(tlsContext)

      const st = gateway.status()
      ctx.logger.info(`dsh-ip-https listening ${JSON.stringify(st)}`)
      for (const hint of listenHints(st, { httpPort: cfg.httpPort, httpsPort: cfg.httpsPort })) {
        ctx.logger.warn(`dsh-ip-https: ${hint}`)
      }
      const url = publicUrl(st, state.publicIp)
      if (url) ctx.logger.info(`dsh-ip-https URL: ${url}`)

      renewTimer = setInterval(() => {
        if (closed) return
        void needIssue().then(async (yes) => {
          if (!yes) return
          await issue()
          if (tlsContext) gateway.setTlsContext(tlsContext)
        }).catch((err) => {
          ctx.logger.warn(`dsh-ip-https renew failed: ${err instanceof Error ? err.message : err}`)
        })
      }, 6 * 3600 * 1000)
      renewTimer.unref?.()
    })()

    run.catch((err) => {
      ctx.logger.warn(`dsh-ip-https failed to start: ${err instanceof Error ? err.message : err}`)
    })

    return () => {
      closed = true
      if (renewTimer) clearInterval(renewTimer)
      unsubIndex?.()
      void gateway?.close()
    }
  }, 'dsh-ip-https')
}
