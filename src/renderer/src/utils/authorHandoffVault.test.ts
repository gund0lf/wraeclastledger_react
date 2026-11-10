import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { AuthorHandoffVault } from '../../../main/authorHandoffVault'
const directories: string[] = []
afterEach(async () => {
  for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true })
})
const key = randomBytes(32)
const protection = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv)
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), bytes])
  },
  decryptString: (value: Buffer) => {
    const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12))
    decipher.setAuthTag(value.subarray(12, 28))
    return Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8')
  }
}
it('startup leaves operation-only vault bytes unchanged and removes only interrupted name requests', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wl-vault-startup-'))
  directories.push(dir)
  const vault = new AuthorHandoffVault(dir, protection)
  const binding = { sessionIdentity: 'saved-session', payloadSha256: 'a'.repeat(64),
    operation: { kind: 'publication' as const, strategy_id: null, revision: null }, targetGeneration: null }
  const prepared = await vault.prepare('session', 'operation', binding)
  const operationId = randomUUID(), expiresAt = new Date(Date.now() + 600000).toISOString()
  await vault.bind(prepared.client_request_id, operationId, expiresAt)
  const file = join(dir, 'author-handoffs.enc'), before = await readFile(file)
  const cancel = vi.fn(async () => undefined)
  const restarted = new AuthorHandoffVault(dir, protection)
  await restarted.discardInterrupted(cancel)
  expect(await readFile(file)).toEqual(before)
  expect(cancel).not.toHaveBeenCalled()
  const readers = await restarted.operationReaders()
  expect(readers).toEqual([{ requestId: operationId, expiresAt, binding, receipt: null }])
  const legacy = await restarted.prepare('other-session', 'name-verification')
  const legacyId = randomUUID()
  await restarted.bind(legacy.client_request_id, legacyId)
  await restarted.discardInterrupted(cancel)
  expect(cancel).toHaveBeenCalledExactlyOnceWith(legacyId, expect.stringMatching(/^Handoff /))
  expect(await restarted.operationReaders()).toEqual(readers)
  expect(await restarted.prepare('session', 'operation', binding)).toEqual(prepared)
})

it('keeps capabilities encrypted, stable across restart, and bound to one operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wl-vault-test-'))
  directories.push(dir)
  const vault = new AuthorHandoffVault(dir, protection)
  const prepared = await vault.prepare('session', 'operation')
  expect(await vault.prepare('session', 'operation')).toEqual(prepared)
  expect(Object.keys(prepared).sort()).toEqual([
    'client_request_id',
    'installation_id',
    'reader_secret_hash'
  ])
  const request = randomUUID()
  await vault.bind(prepared.client_request_id, request)
  const restarted = new AuthorHandoffVault(dir, protection)
  let secret = ''
  const consumption = await restarted.consume(
    request,
    'session',
    'operation',
    async (authorization, id) => {
      secret = authorization.slice(8)
      return id
    },
    () => true
  )
  expect((await readFile(join(dir, 'author-handoffs.enc'))).includes(Buffer.from(secret))).toBe(
    false
  )
  expect(
    await restarted.consume(
      request,
      'session',
      'operation',
      async (_authorization, id) => id,
      () => true
    )
  ).toBe(consumption)
  await expect(
    restarted.consume(
      request,
      'other session',
      'operation',
      async () => true,
      () => true
    )
  ).rejects.toThrow()
  let current = true
  await expect(
    restarted.consume(
      request,
      'session',
      'operation',
      async () => {
        current = false
        return true
      },
      () => current
    )
  ).rejects.toThrow('active operation changed')
  await restarted.forget(request)
  await expect(
    restarted.consume(
      request,
      'session',
      'operation',
      async () => true,
      () => true
    )
  ).rejects.toThrow()
})
it('fails visibly without protected storage and caps pending requests without evicting valid work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wl-vault-test-'))
  directories.push(dir)
  await expect(
    new AuthorHandoffVault(dir, { ...protection, isEncryptionAvailable: () => false }).prepare(
      'session',
      'one'
    )
  ).rejects.toThrow('Saved drafts and results have not been changed')
  const vault = new AuthorHandoffVault(dir, protection)
  const first = await vault.prepare('session', 'one')
  await vault.prepare('session', 'two')
  await expect(vault.prepare('session', 'three')).rejects.toThrow()
  expect(await vault.prepare('session', 'one')).toEqual(first)
})

it('cancels failed creation before binding, survives restart and rejects late binding', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wl-vault-test-'))
  directories.push(dir)
  const vault = new AuthorHandoffVault(dir, protection)
  const first = await vault.prepare('session', 'one')
  const second = await vault.prepare('session', 'two')
  await expect(vault.cancelPrepared(first.client_request_id, 'foreign', 'one')).rejects.toThrow()
  await expect(vault.prepare('session', 'three')).rejects.toThrow()
  await vault.cancelPrepared(first.client_request_id, 'session', 'one')
  const restarted = new AuthorHandoffVault(dir, protection)
  await expect(restarted.bind(first.client_request_id, randomUUID())).rejects.toThrow()
  expect(await restarted.prepare('session', 'two')).toEqual(second)
  expect((await restarted.prepare('session', 'one')).client_request_id).not.toBe(
    first.client_request_id
  )
  await restarted.cancelPrepared(first.client_request_id, 'session', 'one')
  await expect(restarted.prepare('session', 'three')).rejects.toThrow()
})
