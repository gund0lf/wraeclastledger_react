import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { AuthorHandoffVault, ProtectedShareStorageError } from '../../../main/authorHandoffVault'

const fault = vi.hoisted(() => ({ phase: '' as string, events: [] as string[] }))
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  const fail = (phase: string) => {
    if (fault.phase === phase) throw Object.assign(new Error('Synthetic private path and payload'), { code: 'EIO' })
  }
  return { ...fs,
    readFile: async (...args: Parameters<typeof fs.readFile>) => { fail('read'); return fs.readFile(...args) },
    open: async (...args: Parameters<typeof fs.open>) => {
      fault.events.push(`open:${args[1]}:${args[2]}`)
      fail('open')
      const handle = await fs.open(...args)
      return {
        writeFile: async (bytes: Buffer) => {
          fault.events.push('write')
          // Even a partial encrypted candidate is kept on failure.
          if (fault.phase === 'write') await handle.writeFile(bytes.subarray(0, 10))
          fail('write'); await handle.writeFile(bytes)
        },
        sync: async () => { fault.events.push('sync'); fail('sync'); await handle.sync() },
        close: async () => { fault.events.push('close'); await handle.close(); fail('close') }
      }
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      fault.events.push('rename'); fail('rename'); return fs.rename(...args)
    }
  }
})
const directories: string[] = []
beforeEach(() => { fault.phase = ''; fault.events = [] })
afterEach(async () => {
  fault.phase = ''
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
function protection() {
  const key = randomBytes(32)
  return {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
      const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), bytes])
    },
    decryptString(bytes: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    }
  }
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wl-storage-fault-'))
  directories.push(directory)
  const secure = protection(), file = join(directory, 'author-handoffs.enc')
  const vault = new AuthorHandoffVault(directory, secure)
  return { directory, secure, file, vault }
}
function preparedInput() {
  return { sessionIdentity: randomUUID(), sessionId: 'synthetic-session', targetGeneration: null,
    operation: { kind: 'publication' as const, strategy_id: null, revision: null }, epoch: randomUUID(),
    core: JSON.stringify([4, 0, ...Array(10).fill(null)]), metadata: {
      author: { name: 'Synthetic Author', registration_id: null }, expected_revision: null, confirmation_request_id: null } }
}
it.each(['missing', 'empty'])('%s sharing directory does not open the keyring or create files during startup observation', async state => {
  const f = await fixture(), directory = state === 'missing' ? join(f.directory, 'private') : f.directory
  const secure = { isEncryptionAvailable: vi.fn(() => { throw new Error('Keyring must stay closed') }),
    encryptString: vi.fn(f.secure.encryptString), decryptString: vi.fn(f.secure.decryptString) }
  const vault = new AuthorHandoffVault(directory, secure), cancel = vi.fn(async () => undefined)
  await vault.discardInterrupted(cancel)
  expect(await vault.durableTrackingShares()).toEqual([])
  expect(await vault.readableDurableDraft('session')).toBeNull()
  expect(cancel).not.toHaveBeenCalled()
  expect(secure.isEncryptionAvailable).not.toHaveBeenCalled()
  expect(secure.encryptString).not.toHaveBeenCalled()
  expect(secure.decryptString).not.toHaveBeenCalled()
  expect(fault.events).toEqual([])
  expect(await readdir(f.directory)).toEqual([])
  if (state === 'missing') await expect(readdir(directory)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('a file-read error stays an I/O refusal without opening the keyring', async () => {
  const f = await fixture()
  await f.vault.prepare('session', 'generation')
  const bytes = await readFile(f.file)
  const secure = { isEncryptionAvailable: vi.fn(() => { throw new Error('Keyring must stay closed') }),
    encryptString: vi.fn(f.secure.encryptString), decryptString: vi.fn(f.secure.decryptString) }
  const vault = new AuthorHandoffVault(f.directory, secure)
  fault.phase = 'read'
  await expect(vault.discardInterrupted(vi.fn())).rejects.toEqual(new ProtectedShareStorageError('io'))
  expect(secure.isEncryptionAvailable).not.toHaveBeenCalled()
  expect(secure.decryptString).not.toHaveBeenCalled()
  expect(secure.encryptString).not.toHaveBeenCalled()
  fault.phase = ''
  expect(await readFile(f.file)).toEqual(bytes)
})
it.each(['unavailable', 'OS-error', 'encrypt-error'])('first save with %s protection creates no plaintext or remote preparation', async failure => {
  const f = await fixture()
  const secure = { isEncryptionAvailable: vi.fn(() => {
    if (failure === 'OS-error') throw new Error('Synthetic operating system error')
    return failure !== 'unavailable'
  }), encryptString: vi.fn(() => { throw new Error('Synthetic encryption error') }),
  decryptString: vi.fn(f.secure.decryptString) }
  const vault = new AuthorHandoffVault(f.directory, secure), exchange = vi.fn(async () => undefined)
  await expect(vault.prepareDurable(preparedInput(), exchange))
    .rejects.toEqual(new ProtectedShareStorageError('encryption_unavailable'))
  expect(exchange).not.toHaveBeenCalled()
  expect(secure.isEncryptionAvailable).toHaveBeenCalledTimes(1)
  expect(secure.encryptString).toHaveBeenCalledTimes(failure === 'encrypt-error' ? 1 : 0)
  expect(secure.decryptString).not.toHaveBeenCalled()
  expect(fault.events).toEqual([])
  expect(await readdir(f.directory)).toEqual([])
})
it('flushes and closes the exclusive encrypted candidate before replacing the current store', async () => {
  const f = await fixture()
  const prepared = await f.vault.prepare('session', 'generation')
  expect(fault.events).toEqual(['open:wx:384', 'write', 'sync', 'close', 'rename'])
  expect(await readdir(f.directory)).toEqual(['author-handoffs.enc'])
  const bytes = await readFile(f.file)
  expect(bytes.includes(Buffer.from(prepared.client_request_id))).toBe(false)
  expect(JSON.parse(f.secure.decryptString(bytes)).installationId).toBe(prepared.installation_id)
})
it.each(['write', 'sync', 'close', 'rename'])('%s failure preserves current and candidate bytes and never sends an unacknowledged proposal', async phase => {
  const f = await fixture()
  const first = await f.vault.prepare('session', 'generation'), bytes = await readFile(f.file)
  fault.events = []; fault.phase = phase
  const exchange = vi.fn(async () => undefined)
  await expect(f.vault.prepareDurable(preparedInput(), exchange)).rejects.toEqual(new ProtectedShareStorageError('io'))
  expect(exchange).not.toHaveBeenCalled()
  expect(fault.events).toContain('close')
  expect(fault.events.includes('rename')).toBe(phase === 'rename')
  fault.phase = ''
  expect(await readFile(f.file)).toEqual(bytes)
  const candidates = (await readdir(f.directory)).filter(name => name.endsWith('.pending'))
  expect(candidates).toHaveLength(1)
  const candidate = await readFile(join(f.directory, candidates[0]))
  expect(candidate.length).toBeGreaterThan(0)
  const restarted = new AuthorHandoffVault(f.directory, f.secure)
  expect(await restarted.durableShares()).toEqual([])
  expect(await readFile(f.file)).toEqual(bytes)
  expect(await readFile(join(f.directory, candidates[0]))).toEqual(candidate)
  // A valid current record stays authoritative; the later candidate is not promoted.
  expect(await restarted.prepare('session', 'generation')).toEqual(first)
  expect(await readFile(join(f.directory, candidates[0]))).toEqual(candidate)
})
it.each(['open', 'read'])('%s failure is a secret-free disk error, not missing history or unavailable encryption', async phase => {
  const f = await fixture()
  await f.vault.prepare('session', 'generation')
  const bytes = await readFile(f.file)
  fault.phase = phase
  await expect(f.vault.prepare('session', 'next')).rejects.toEqual(new ProtectedShareStorageError('io'))
  fault.phase = ''
  expect(await readFile(f.file)).toEqual(bytes)
})
it.each(['truncated', 'wrong-key', 'invalid-json', 'null', 'invalid-shape'])('%s history is preserved and cannot become a fresh installation', async variant => {
  const f = await fixture()
  await f.vault.prepare('session', 'generation')
  const original = await readFile(f.file)
  const bytes = variant === 'truncated' ? original.subarray(0, 15) : variant === 'wrong-key' ? original :
    f.secure.encryptString(variant === 'invalid-json' ? '{' : variant === 'null' ? 'null' : '{"version":1,"pending":[null]}')
  await writeFile(f.file, bytes)
  const vault = new AuthorHandoffVault(f.directory, variant === 'wrong-key' ? protection() : f.secure)
  for (const read of [() => vault.durableShares(), () => vault.readableDurableDraft('session'), () => vault.prepare('session', 'next')])
    await expect(read()).rejects.toEqual(new ProtectedShareStorageError('damaged'))
  expect(await readFile(f.file)).toEqual(bytes)
  expect(await readdir(f.directory)).toEqual(['author-handoffs.enc'])
})
it('holds a missing current store with an interrupted candidate without inspecting or promoting its contents', async () => {
  const f = await fixture(), pending = join(f.directory, `author-handoffs.${randomUUID()}.pending`)
  const bytes = f.secure.encryptString(JSON.stringify({ version: 1, installationId: randomUUID(), pending: [] }))
  await writeFile(pending, bytes)
  const secure = { isEncryptionAvailable: vi.fn(() => { throw new Error('Keyring must stay closed') }),
    encryptString: vi.fn(f.secure.encryptString), decryptString: vi.fn(f.secure.decryptString) }
  const vault = new AuthorHandoffVault(f.directory, secure), cancel = vi.fn(async () => undefined)
  for (const read of [() => vault.discardInterrupted(cancel), () => vault.durableShares(),
    () => vault.readableDurableDraft('session'), () => vault.prepare('session', 'next')])
    await expect(read()).rejects.toEqual(new ProtectedShareStorageError('recovery_required'))
  expect(cancel).not.toHaveBeenCalled()
  expect(secure.isEncryptionAvailable).not.toHaveBeenCalled()
  expect(secure.encryptString).not.toHaveBeenCalled()
  expect(secure.decryptString).not.toHaveBeenCalled()
  expect(await readFile(pending)).toEqual(bytes)
  expect(await readdir(f.directory)).toEqual([pending.split(/[\\/]/).at(-1)])
})
it('does not mistake unrelated files for a vault or create storage while inspecting a new profile', async () => {
  const f = await fixture()
  await writeFile(join(f.directory, 'unrelated.pending'), 'fixture')
  expect(await f.vault.readableDurableDraft('session')).toBeNull()
  expect(await f.vault.durableShares()).toEqual([])
  expect(await readdir(f.directory)).toEqual(['unrelated.pending'])
})
it.each(['unavailable', 'OS-error'])('%s encryption never falls back to plaintext or changes saved work', async failure => {
  const f = await fixture()
  await f.vault.prepare('session', 'generation')
  const bytes = await readFile(f.file)
  const secure = { isEncryptionAvailable: vi.fn(() => {
    if (failure === 'OS-error') throw new Error('Private operating system error')
    return false
  }), encryptString: vi.fn(f.secure.encryptString), decryptString: vi.fn(f.secure.decryptString) }
  const vault = new AuthorHandoffVault(f.directory, secure), cancel = vi.fn(async () => undefined)
  for (const read of [() => vault.discardInterrupted(cancel), () => vault.durableTrackingShares(),
    () => vault.prepare('session', 'next')])
    await expect(read()).rejects.toEqual(new ProtectedShareStorageError('encryption_unavailable'))
  expect(secure.isEncryptionAvailable).toHaveBeenCalledTimes(3)
  expect(cancel).not.toHaveBeenCalled()
  expect(secure.decryptString).not.toHaveBeenCalled()
  expect(secure.encryptString).not.toHaveBeenCalled()
  expect(await readFile(f.file)).toEqual(bytes)
})
