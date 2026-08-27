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
    hints.push(`${httpPort} 已被占用（常见是 nginx / Caddy）。无法自动申请 IP 证书，也不会做 ${httpPort}→${httpsPort}。远程设置仍然生效。`)
    hints.push(`若要用 https://<公网IP>/，先停掉占用 ${httpPort}/${httpsPort} 的程序，再重启 dsh。`)
  }
  if (status.fallback && !status.https) {
    hints.push(`${httpsPort} 已被占用，网关改听 ${status.fallback.port}。请用日志里的 URL，不要继续走原来的 80/443 反代。`)
  }
  return hints
}
