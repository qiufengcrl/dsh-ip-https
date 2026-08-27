export function publicUrl(status, publicIp) {
  const bound = status.https || status.fallback
  if (!bound || !publicIp) return undefined
  const scheme = status.tls ? 'https' : 'http'
  const dropPort = (scheme === 'https' && bound.port === 443) || (scheme === 'http' && bound.port === 80)
  return `${scheme}://${publicIp}${dropPort ? '' : `:${bound.port}`}/`
}

export function listenHints(status, { httpPort = 80, httpsPort = 443 } = {}) {
  const hints = []
  if (!status.http) {
    hints.push(`${httpPort} 已被占用（常见是 nginx 用 IP 反代）。继续用原来的外网地址即可，不必改 nginx。远程设置和特权 RPC 已在 dsh 内部处理。`)
    hints.push(`本插件无法再申请 https://<公网IP>/ 证书（Let’s Encrypt 需要空闲的 ${httpPort}）。`)
  }
  if (status.fallback && !status.https) {
    hints.push(`${httpsPort} 已被占用。可忽略本插件在 ${status.fallback.port} 上的额外入口，继续走原来的 nginx 地址。`)
  }
  return hints
}
