import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export function dataDir(dshHome = process.env.DSH_HOME) {
  const root = dshHome && dshHome.trim() !== '' ? dshHome : join(process.env.HOME || process.env.USERPROFILE || '.', '.dsh')
  return join(root, 'dsh-ip-https')
}

export async function loadState(dir) {
  const file = join(dir, 'state.json')
  try {
    const raw = JSON.parse(await readFile(file, 'utf8'))
    if (raw && typeof raw === 'object') return { file, ...raw }
  } catch {
    // missing or corrupt
  }
  return { file, publicIp: undefined }
}

export async function saveState(dir, state) {
  await mkdir(dir, { recursive: true })
  const file = join(dir, 'state.json')
  const body = {
    publicIp: state.publicIp,
    updatedAt: new Date().toISOString(),
  }
  await writeFile(file, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return file
}
