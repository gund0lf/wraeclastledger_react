import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
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
it('discards development operation acknowledgements without using them as name or share results', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wl-vault-startup-'))
  directories.push(dir)
  const now = Date.now(), requestId = randomUUID()
  const file = join(dir, 'author-handoffs.enc')
  const legacy = { clientRequestId: randomUUID(), sessionId: 'old-session', operationGeneration: randomUUID(),
    readerSecret: randomBytes(32).toString('base64url'), createdAt: now, requestId, consumptionId: randomUUID(),
    operation: { sessionIdentity: 'saved-session', payloadSha256: 'a'.repeat(64),
      operation: { kind: 'publication', strategy_id: null, revision: null }, targetGeneration: null,
      expiresAt: new Date(now + 600000).toISOString(), receipt: { request_id: requestId, epoch: randomUUID(),
        status: 'consumed', expires_at: new Date(now + 600000).toISOString(),
        outcome: { status: 'published', strategy_id: randomUUID(), revision: 1 } } } }
  await writeFile(file, protection.encryptString(JSON.stringify({ version: 1, installationId: randomUUID(), pending: [legacy] })))
  const restarted = new AuthorHandoffVault(dir, protection), cancel = vi.fn(async () => undefined)
  await restarted.discardInterrupted(cancel)
  expect(cancel).not.toHaveBeenCalled()
  expect(await restarted.durableShares()).toEqual([])
  expect(await restarted.durableForSession('saved-session', null)).toBeNull()
  const exchange = vi.fn(async () => true)
  await expect(restarted.consume(requestId, legacy.sessionId, legacy.operationGeneration, exchange, () => true))
    .rejects.toThrow('another operation')
  expect(exchange).not.toHaveBeenCalled()
  const nameBinding = { shareId: randomUUID(), draftRevision: 1 }
  const name = await restarted.prepare('session', 'name', nameBinding), nameRequest = randomUUID()
  const expiresAt = new Date(now + 600000).toISOString()
  await restarted.bind(name.client_request_id, nameRequest, expiresAt)
  const stored = JSON.parse(protection.decryptString(await readFile(file)))
  expect(stored.pending).toHaveLength(1)
  expect(stored.pending[0]).not.toHaveProperty('operation')
  const next = new AuthorHandoffVault(dir, protection)
  await next.discardInterrupted(cancel)
  expect(cancel).not.toHaveBeenCalled()
  expect(await next.resumeName(nameBinding, 'session', 'new-generation', () => true)).toEqual({
    request_id: nameRequest, client_request_id: name.client_request_id, expires_at: expiresAt })
  const management = await next.prepare('other-session', 'management'), managementRequest = randomUUID()
  await next.bind(management.client_request_id, managementRequest)
  await next.discardInterrupted(cancel)
  expect(cancel).toHaveBeenCalledExactlyOnceWith(managementRequest, expect.stringMatching(/^Handoff /))
  expect(await next.resumeName(nameBinding, 'session', 'newer-generation', () => true)).not.toBeNull()
})

it('refuses a legacy entry that also claims to be a current name request', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'wl-vault-legacy-overlap-'))
  directories.push(dir)
  const vault = new AuthorHandoffVault(dir, protection), file = join(dir, 'author-handoffs.enc')
  await vault.prepare('session', 'name', { shareId: randomUUID(), draftRevision: 1 })
  const data = JSON.parse(protection.decryptString(await readFile(file)))
  data.pending[0].operation = {}
  const bytes = protection.encryptString(JSON.stringify(data))
  await writeFile(file, bytes)
  await expect(vault.durableShares()).rejects.toThrow('Author confirmation storage is invalid')
  expect(await readFile(file)).toEqual(bytes)
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
