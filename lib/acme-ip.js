import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { X509Certificate } from 'node:crypto'
import acme from 'acme-client'

const execFileAsync = promisify(execFile)

export function certPaths(dir) {
  return {
    key: join(dir, 'privkey.pem'),
    cert: join(dir, 'fullchain.pem'),
    account: join(dir, 'account.pem'),
    csr: join(dir, 'csr.pem'),
  }
}

export async function loadTlsContext(dir) {
  const paths = certPaths(dir)
  try {
    const [key, cert] = await Promise.all([
      readFile(paths.key, 'utf8'),
      readFile(paths.cert, 'utf8'),
    ])
    return { key, cert }
  } catch {
    return undefined
  }
}

export function firstCertificatePem(pem) {
  const begin = pem.indexOf('-----BEGIN CERTIFICATE-----')
  const end = pem.indexOf('-----END CERTIFICATE-----')
  if (begin < 0 || end < 0) return undefined
  return pem.slice(begin, end + '-----END CERTIFICATE-----'.length)
}

export function certNotAfter(pem) {
  const block = firstCertificatePem(pem)
  if (!block) return undefined
  return new Date(new X509Certificate(block).validTo)
}

export function shouldRenew(notAfter, now = new Date(), leadMs = 48 * 3600 * 1000) {
  return !(notAfter instanceof Date) || Number.isNaN(notAfter.getTime()) || (notAfter.getTime() - now.getTime()) < leadMs
}

async function opensslAvailable() {
  try {
    await execFileAsync('openssl', ['version'])
    return true
  } catch {
    return false
  }
}

export async function createIpCsr(ip, keyFile, csrFile) {
  if (!(await opensslAvailable())) {
    throw new Error('openssl is required to build an IP SAN CSR')
  }
  await execFileAsync('openssl', [
    'req', '-new', '-newkey', 'ec',
    '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-nodes',
    '-keyout', keyFile,
    '-out', csrFile,
    '-subj', '/',
    '-addext', `subjectAltName=IP:${ip}`,
  ])
}

export async function issueIpCertificate({
  dir,
  ip,
  email,
  staging = false,
  setChallenge,
  clearChallenge,
  log = () => {},
}) {
  await mkdir(dir, { recursive: true })
  const paths = certPaths(dir)
  let accountKey
  try {
    accountKey = await readFile(paths.account)
  } catch {
    accountKey = await acme.crypto.createPrivateEcdsaKey()
    await writeFile(paths.account, accountKey, { mode: 0o600 })
  }

  const client = new acme.Client({
    directoryUrl: staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production,
    accountKey,
  })

  await client.createAccount({
    termsOfServiceAgreed: true,
    ...(email ? { contact: [`mailto:${email}`] } : {}),
  })

  await createIpCsr(ip, paths.key, paths.csr)
  const csr = await readFile(paths.csr)

  const order = await client.createOrder({
    identifiers: [{ type: 'ip', value: ip }],
    profile: 'shortlived',
  })

  const authorizations = await client.getAuthorizations(order)
  for (const authz of authorizations) {
    const challenge = (authz.challenges ?? []).find((item) => item.type === 'http-01')
    if (!challenge) throw new Error('no http-01 challenge for IP certificate')
    const keyAuth = await client.getChallengeKeyAuthorization(challenge)
    setChallenge(challenge.token, keyAuth)
    try {
      await client.completeChallenge(challenge)
      await client.waitForValidStatus(challenge)
    } finally {
      clearChallenge(challenge.token)
    }
  }

  const finalized = await client.finalizeOrder(order, csr)
  const cert = await client.getCertificate(finalized)
  await writeFile(paths.cert, cert, { mode: 0o644 })
  log(`issued shortlived IP certificate for ${ip}`)
  return loadTlsContext(dir)
}
