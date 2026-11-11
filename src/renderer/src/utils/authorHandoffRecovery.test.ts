import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { AuthorHandoffVault, ProtectedShareStorageError, ShareRecoveryConfirmationError } from '../../../main/authorHandoffVault'
import { shareDraft, type DurableShareRecord } from '../../../main/durableShareRecord'

const fault = vi.hoisted(() => ({ renameAt: 0, renames: 0, sync: false, symbolic: '', events: [] as string[] }))
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return { ...fs,
    lstat: async (...args: Parameters<typeof fs.lstat>) => {
      const value = await fs.lstat(...args)
      if (fault.symbolic && String(args[0]).endsWith(fault.symbolic)) value.isSymbolicLink = () => true
      return value
    },
    open: async (...args: Parameters<typeof fs.open>) => {
      fault.events.push(`open:${args[1]}:${args[2]}`)
      const handle = await fs.open(...args)
      return {
        writeFile: async (bytes: Buffer) => { fault.events.push('write'); await handle.writeFile(bytes) },
        sync: async () => {
          fault.events.push('sync')
          if (fault.sync) throw Object.assign(new Error('Synthetic flush failure'), { code: 'EIO' })
          await handle.sync()
        },
        close: async () => { fault.events.push('close'); await handle.close() }
      }
    },
    rename: async (...args: Parameters<typeof fs.rename>) => {
      fault.events.push('rename'); fault.renames++
      if (fault.renameAt === fault.renames) throw Object.assign(new Error('Synthetic move failure'), { code: 'EIO' })
      return fs.rename(...args)
    }
  }
})
const directories: string[] = []
beforeEach(() => { fault.renameAt = 0; fault.renames = 0; fault.sync = false; fault.symbolic = ''; fault.events = [] })
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
function protection() {
  const key = randomBytes(32)
  return {
    isEncryptionAvailable: () => true,
    encryptString(value: string) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
      const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
    },
    decryptString(bytes: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    }
  }
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wl-share-recovery-'))
  directories.push(directory)
  const secure = protection(), file = join(directory, 'author-handoffs.enc'), now = Date.now()
  const reopen = () => new AuthorHandoffVault(directory, secure, () => now)
  const seed = async (shares: DurableShareRecord[] = [], extra: Record<string, unknown> = {}) => {
    await writeFile(file, secure.encryptString(JSON.stringify({ version: 1, installationId: randomUUID(), pending: [], shares, ...extra })))
  }
  const inspect = async () => JSON.parse(secure.decryptString(await readFile(file)))
  return { directory, secure, file, now, seed, inspect, reopen, vault: reopen() }
}
function record(kind: 'publication' | 'evidence' | 'replace' = 'publication'): DurableShareRecord {
  const id = randomUUID(), epoch = randomUUID(), target = kind === 'publication' ? null : randomUUID()
  const operation = { kind, strategy_id: target, revision: target ? 3 : null }
  const core = JSON.stringify([4, target ? kind === 'replace' ? [1, target] : [2, target, 3] : 0, ...Array(10).fill(null)])
  const draft = shareDraft(id, 1, core, { author: { name: 'Synthetic Author', registration_id: target ? randomUUID() : null },
    expected_revision: operation.revision, confirmation_request_id: null })
  return { id, readerSecret: randomBytes(32).toString('base64url'), sessionIdentity: randomUUID(), sessionId: 'synthetic-session',
    epoch, operation, targetGeneration: target ? randomUUID() : null, draft, proposed: null, noticed: false,
    result: { id, epoch, draft_revision: 1, kind, state: 'ready', outcome: null } }
}
function input(s = record()) {
  return { sessionIdentity: s.sessionIdentity, sessionId: s.sessionId, targetGeneration: s.targetGeneration,
    operation: s.operation, epoch: s.epoch, core: s.draft!.core, metadata: s.draft!.metadata }
}
const ready = async (raw: unknown) => {
  const body = raw as { id: string; epoch: string; draft_revision: number; kind: string }
  return { id: body.id, epoch: body.epoch, draft_revision: body.draft_revision, kind: body.kind, state: 'ready', outcome: null }
}
async function damaged(f: Awaited<ReturnType<typeof fixture>>) {
  const originals: Record<string, Buffer> = { 'author-handoffs.enc': randomBytes(39),
    [`author-handoffs.${randomUUID()}.pending`]: randomBytes(22),
    [`author-handoffs.${randomUUID()}.pending`]: f.secure.encryptString(JSON.stringify({ version: 1, installationId: randomUUID(), pending: [] })) }
  for (const [name, bytes] of Object.entries(originals)) await writeFile(join(f.directory, name), bytes)
  return originals
}
async function originalsAfter(f: Awaited<ReturnType<typeof fixture>>, originals: Record<string, Buffer>) {
  const found: Record<string, Buffer> = {}
  // Only the exact disposable fixture and its immediate preservation folders.
  for (const entry of await readdir(f.directory, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith('author-handoffs-preserved.')) {
      for (const name of await readdir(join(f.directory, entry.name))) {
        if (Object.hasOwn(originals, name)) found[name] = await readFile(join(f.directory, entry.name, name))
      }
    } else if (Object.hasOwn(originals, entry.name)) {
      const bytes = await readFile(join(f.directory, entry.name))
      if (bytes.equals(originals[entry.name])) found[entry.name] = bytes
    }
  }
  return found
}
it('requires deliberate recovery, preserves every original byte, and persists the cutoff across restart', async () => {
  const f = await fixture(), originals = await damaged(f)
  const preview = await f.vault.previewRecovery()
  expect(Object.keys(preview)).toEqual(['recoveryId'])
  expect(fault.events).toEqual([])
  expect(await originalsAfter(f, originals)).toEqual(originals)
  expect(await f.vault.confirmRecovery(preview.recoveryId, () => true)).toEqual({ recoveredAt: f.now })
  expect(fault.events).toEqual(['open:wx:384', 'write', 'sync', 'close', 'rename', 'rename', 'rename', 'rename'])
  expect(await originalsAfter(f, originals)).toEqual(originals)
  expect(await f.inspect()).toMatchObject({ version: 1, recoveredAt: f.now, pending: [] })
  expect(await f.reopen().durableShares()).toEqual([])
  expect(await f.reopen().recoveryRequiredForSession(f.now - 1)).toBe(true)
  expect(await f.reopen().recoveryRequiredForSession(f.now)).toBe(true)
  expect(await f.reopen().recoveryRequiredForSession(null)).toBe(true)
  expect(await f.reopen().recoveryRequiredForSession(f.now + 1)).toBe(false)
  await expect(f.vault.confirmRecovery(preview.recoveryId, () => true)).rejects.toThrow('Review sharing recovery')
})
it('does not automatically recover or adopt even a single readable interrupted first-save candidate', async () => {
  const f = await fixture(), name = `author-handoffs.${randomUUID()}.pending`, oldInstallation = randomUUID()
  const bytes = f.secure.encryptString(JSON.stringify({ version: 1, installationId: oldInstallation, pending: [] }))
  await writeFile(join(f.directory, name), bytes)
  await expect(f.vault.durableShares()).rejects.toEqual(new ProtectedShareStorageError('recovery_required'))
  await expect(f.vault.confirmRecovery(randomUUID(), () => true)).rejects.toThrow('Review sharing recovery')
  expect(await readdir(f.directory)).toEqual([name])
  const preview = await f.vault.previewRecovery()
  await f.vault.confirmRecovery(preview.recoveryId, () => true)
  expect((await f.inspect()).installationId).not.toBe(oldInstallation)
  expect(await originalsAfter(f, { [name]: bytes })).toEqual({ [name]: bytes })
})
it.each(['bytes', 'added', 'current', 'context'] as const)('refuses a stale %s preview before writing anything', async variant => {
  const f = await fixture()
  await damaged(f)
  const preview = await f.vault.previewRecovery()
  if (variant === 'bytes') await writeFile(f.file, randomBytes(39))
  if (variant === 'added') await writeFile(join(f.directory, `author-handoffs.${randomUUID()}.pending`), randomBytes(5))
  if (variant === 'current') await f.seed()
  const entries = await readdir(f.directory), current = await readFile(f.file)
  await expect(f.vault.confirmRecovery(preview.recoveryId, () => variant !== 'context')).rejects.toThrow()
  expect(fault.events).toEqual([])
  expect(await readdir(f.directory)).toEqual(entries)
  expect(await readFile(f.file)).toEqual(current)
})
it('a newer preview invalidates the old token, and a token does not survive a restart', async () => {
  const f = await fixture()
  await damaged(f)
  const first = await f.vault.previewRecovery(), second = await f.vault.previewRecovery()
  await expect(f.vault.confirmRecovery(first.recoveryId, () => true)).rejects.toThrow('Review sharing recovery')
  await expect(f.reopen().confirmRecovery(second.recoveryId, () => true)).rejects.toThrow('Review sharing recovery')
  expect(fault.events).toEqual([])
})
it('refuses healthy, full and encryption-unavailable stores without changing them', async () => {
  const f = await fixture()
  await f.seed()
  let bytes = await readFile(f.file)
  await expect(f.vault.previewRecovery()).rejects.toThrow('Recovery is not needed')
  expect(await readFile(f.file)).toEqual(bytes)
  await f.seed(Array.from({ length: 513 }, () => record()))
  bytes = await readFile(f.file)
  await expect(f.vault.previewRecovery()).rejects.toEqual(new ProtectedShareStorageError('full'))
  expect(await readFile(f.file)).toEqual(bytes)
  const unavailable = new AuthorHandoffVault(f.directory, { ...f.secure, isEncryptionAvailable: () => false })
  await expect(unavailable.previewRecovery()).rejects.toEqual(new ProtectedShareStorageError('encryption_unavailable'))
  expect(await readFile(f.file)).toEqual(bytes)
  expect(fault.events).toEqual([])
})
it('a recovery preview never compacts a healthy store as a side effect', async () => {
  const f = await fixture(), s = record()
  s.noticed = true; s.result = { ...s.result!, state: 'complete', outcome: { strategy_id: randomUUID(), revision: 1 } }
  await f.seed([s])
  const bytes = await readFile(f.file)
  await expect(f.vault.previewRecovery()).rejects.toThrow('Recovery is not needed')
  expect(await readFile(f.file)).toEqual(bytes)
  expect(fault.events).toEqual([])
})
it.each(['directory', 'symbolic'] as const)('refuses a matching %s instead of reading or moving through it', async variant => {
  const f = await fixture(), name = `author-handoffs.${randomUUID()}.pending`
  await writeFile(f.file, randomBytes(30))
  if (variant === 'directory') await mkdir(join(f.directory, name))
  else { await writeFile(join(f.directory, name), randomBytes(20)); fault.symbolic = name }
  await expect(f.vault.previewRecovery()).rejects.toEqual(new ProtectedShareStorageError('io'))
  expect(fault.events).toEqual([])
})
it.each([1, 2, 4])('interruption at move %i preserves every old file and never promotes a candidate on restart', async failAt => {
  const f = await fixture(), originals = await damaged(f), preview = await f.vault.previewRecovery()
  fault.renameAt = failAt
  await expect(f.vault.confirmRecovery(preview.recoveryId, () => true)).rejects.toEqual(new ProtectedShareStorageError('io'))
  expect(await originalsAfter(f, originals)).toEqual(originals)
  const remaining = await readdir(f.directory)
  expect(remaining.some(name => name.endsWith('.pending'))).toBe(true)
  await expect(f.reopen().durableShares()).rejects.toMatchObject({ code: remaining.includes('author-handoffs.enc') ? 'damaged' : 'recovery_required' })
  fault.renameAt = 0
  const again = f.reopen(), next = await again.previewRecovery()
  await again.confirmRecovery(next.recoveryId, () => true)
  expect(await originalsAfter(f, originals)).toEqual(originals)
  expect(await again.durableShares()).toEqual([])
})
it('a failed candidate flush moves no originals and does not create a usable new identity', async () => {
  const f = await fixture(), originals = await damaged(f), preview = await f.vault.previewRecovery()
  fault.sync = true
  await expect(f.vault.confirmRecovery(preview.recoveryId, () => true)).rejects.toEqual(new ProtectedShareStorageError('io'))
  expect(fault.renames).toBe(0)
  expect(await originalsAfter(f, originals)).toEqual(originals)
  await expect(f.reopen().durableShares()).rejects.toEqual(new ProtectedShareStorageError('damaged'))
})
it('requires explicit override for an older or unknown session, then preserves its identity through lost-answer retries', async () => {
  const f = await fixture()
  await damaged(f)
  await f.vault.confirmRecovery((await f.vault.previewRecovery()).recoveryId, () => true)
  const prepared = input(), bytes = await readFile(f.file), exchange = vi.fn(ready)
  await expect(f.vault.prepareDurable({ ...prepared, sessionCreatedAt: f.now - 1 }, exchange)).rejects.toBeInstanceOf(ShareRecoveryConfirmationError)
  await expect(f.vault.prepareDurable(prepared, exchange)).rejects.toBeInstanceOf(ShareRecoveryConfirmationError)
  expect(exchange).not.toHaveBeenCalled()
  expect(await readFile(f.file)).toEqual(bytes)
  const lost = vi.fn(async () => { throw new Error('Synthetic lost response') })
  await expect(f.vault.prepareDurable({ ...prepared, recoveryConfirmed: true }, lost)).rejects.toThrow('Synthetic lost response')
  const storedId = (await f.inspect()).shares[0].id
  const result = await f.reopen().prepareDurable(prepared, exchange)
  expect(result.view.id).toBe(storedId)
  expect(exchange).toHaveBeenCalledTimes(1)
  expect((await f.inspect()).shares).toHaveLength(1)
})
it.each(['publication', 'evidence', 'replace'] as const)('allows %s without override for a new session or an explicit continuation', async kind => {
  const f = await fixture()
  await f.seed([], { recoveredAt: f.now })
  const result = await f.vault.prepareDurable({ ...input(record(kind)), sessionCreatedAt: kind === 'publication' ? f.now + 1 : f.now - 1 }, ready)
  expect(result.view.status).toBe('ready')
})
it.each([-1, 0.5, null, 'yesterday'])('rejects an invalid saved recovery cutoff %s without freshening the store', async recoveredAt => {
  const f = await fixture()
  await f.seed([], { recoveredAt })
  const bytes = await readFile(f.file)
  await expect(f.vault.durableShares()).rejects.toEqual(new ProtectedShareStorageError('damaged'))
  expect(await readFile(f.file)).toEqual(bytes)
})
it('at 512 unfinished shares, existing work can finish and compact before a new preparation', async () => {
  const f = await fixture(), records = Array.from({ length: 512 }, () => record())
  await f.seed(records)
  await expect(f.vault.prepareDurable(input(), ready)).rejects.toEqual(new ProtectedShareStorageError('full'))
  const first = records[0]
  const result = await f.vault.observeDurable(first.id, async () => ({ ...first.result!, state: 'complete',
    outcome: { strategy_id: randomUUID(), revision: 1 } }))
  expect(result?.status).toBe('complete')
  await f.vault.noticeDurable(first.id)
  expect((await f.inspect()).completed).toHaveLength(1)
  expect((await f.vault.prepareDurable(input(), ready)).view.status).toBe('ready')
  expect((await f.inspect()).shares).toHaveLength(512)
})
