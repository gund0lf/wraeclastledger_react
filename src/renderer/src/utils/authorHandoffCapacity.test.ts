import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { AuthorHandoffVault, ProtectedShareStorageError } from '../../../main/authorHandoffVault'
import { shareDraft, type DurableShareRecord } from '../../../main/durableShareRecord'
import { buildAuthorSubmission } from '../../../shared/authorSubmission'

const budget = 8 * 1024 * 1024
const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
function record(padding = 0): DurableShareRecord {
  const id = randomUUID(), epoch = randomUUID(), core = [4, 0, ...Array(10).fill(null)]
  core[9] = 'x'.repeat(padding)
  const draft = shareDraft(id, 1, JSON.stringify(core), { author: { name: 'Synthetic Author', registration_id: null },
    expected_revision: null, confirmation_request_id: null })
  return { id, readerSecret: randomBytes(32).toString('base64url'), sessionIdentity: randomUUID(), sessionId: 'synthetic-session', epoch,
    operation: { kind: 'publication', strategy_id: null, revision: null }, targetGeneration: null,
    draft, proposed: null, noticed: false, result: { id, epoch, draft_revision: 1, kind: 'publication', state: 'ready', outcome: null } }
}
function input(s: DurableShareRecord) {
  const draft = s.draft ?? s.proposed!
  return { sessionIdentity: s.sessionIdentity, sessionId: s.sessionId, targetGeneration: s.targetGeneration,
    operation: s.operation, epoch: s.epoch, core: draft.core, metadata: draft.metadata }
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wl-share-capacity-'))
  directories.push(directory)
  const key = randomBytes(32), now = Date.now(), file = join(directory, 'author-handoffs.enc')
  const secure = {
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
  const store = async (data: unknown) => writeFile(file, secure.encryptString(JSON.stringify(data)))
  const inspect = async () => JSON.parse(secure.decryptString(await readFile(file)))
  const reopen = () => new AuthorHandoffVault(directory, secure, () => now)
  return { file, now, store, inspect, reopen, vault: reopen() }
}
function exactLimit(proposal = false) {
  // Valid bounded drafts, charged at exactly the old admission limit. No
  // unknown padding fields or invalid records are used to manufacture fullness.
  const shares = Array.from({ length: 64 }, () => record(120000))
  if (proposal) { shares[0].proposed = shares[0].draft; shares[0].draft = null; shares[0].result = null }
  const data = { version: 1, installationId: randomUUID(), pending: [], shares }
  let remaining = budget - Buffer.byteLength(JSON.stringify(data))
  for (const s of shares) {
    const draft = s.draft ?? s.proposed!, core = JSON.parse(draft.core)
    const extra = Math.min(remaining, 128 * 1024 - Buffer.byteLength(buildAuthorSubmission(draft.core, draft.metadata)))
    core[9] += 'x'.repeat(extra)
    const grown = shareDraft(s.id, 1, JSON.stringify(core), draft.metadata)
    if (s.draft) s.draft = grown; else s.proposed = grown
    remaining -= extra
    if (!remaining) break
  }
  expect(remaining).toBe(0)
  expect(Buffer.byteLength(JSON.stringify(data))).toBe(budget)
  return data
}
it('an admitted exact-limit share saves acceptance, completion and copy metadata across restart before compacting', async () => {
  const f = await fixture(), data = exactLimit(), first = data.shares[0]
  await f.store(data)
  expect((await f.vault.durableShares()).length).toBe(64)
  await f.vault.copiedDurable({ sessionIdentity: first.sessionIdentity, shareId: first.id, draftRevision: 1 }, () => true)
  await f.vault.observeDurable(first.id, async () => ({ ...first.result!, state: 'accepted' }))
  expect(Buffer.byteLength(JSON.stringify(await f.inspect()))).toBeGreaterThan(budget)
  const restarted = f.reopen()
  expect(await restarted.durableForSession(first.sessionIdentity, null)).toMatchObject({ accepted: true, status: 'processing' })
  const completed = { ...first.result!, state: 'complete', outcome: { strategy_id: randomUUID(), revision: 2147483647 } }
  expect(await restarted.observeDurable(first.id, async () => completed)).toMatchObject({ status: 'complete', outcome: completed.outcome })
  const again = f.reopen()
  expect(await again.durableForSession(first.sessionIdentity, null)).toMatchObject({ status: 'complete', noticed: false })
  await again.noticeDurable(first.id)
  expect((await f.inspect()).shares).toHaveLength(63)
  expect((await f.inspect()).completed).toHaveLength(1)
  expect(await again.durableForSession(first.sessionIdentity, null)).toMatchObject({ archived: true, status: 'complete' })
})
it('an already admitted proposal can receive its first result and retry unchanged without a second admission', async () => {
  const f = await fixture(), data = exactLimit(true), first = data.shares[0], prepared = input(first)
  await f.store(data)
  const exchange = vi.fn(async () => { throw new Error('Unchanged preparation must not call the server') })
  const response = vi.fn(async (raw: unknown) => {
    const body = raw as { id: string; epoch: string; draft_revision: number }
    return { id: body.id, epoch: body.epoch, draft_revision: body.draft_revision, kind: 'publication', state: 'ready', outcome: null }
  })
  const result = await f.vault.prepareDurable(prepared, response)
  expect(result.view.id).toBe(first.id)
  expect(Buffer.byteLength(JSON.stringify(await f.inspect()))).toBeGreaterThan(budget)
  expect((await f.reopen().prepareDurable(prepared, exchange)).view.id).toBe(first.id)
  expect(exchange).not.toHaveBeenCalled()
  expect(response).toHaveBeenCalledTimes(1)
})
it('name verification can be created, rebound, consumed and forgotten while an exact-limit share finishes', async () => {
  const f = await fixture(), data = exactLimit(), first = data.shares[0]
  await f.store(data)
  const name = await f.vault.prepare(first.sessionId, 'initial', { shareId: first.id, draftRevision: 1 })
  const requestId = randomUUID(), expiry = new Date(f.now + 10 * 60000).toISOString()
  await f.vault.bind(name.client_request_id, requestId, expiry)
  await f.vault.observeDurable(first.id, async () => ({ ...first.result!, state: 'complete',
    outcome: { strategy_id: randomUUID(), revision: 1 } }))
  await f.vault.noticeDurable(first.id)
  expect((await f.inspect()).shares).toHaveLength(64)
  const restarted = f.reopen()
  expect(await restarted.resumeName({ shareId: first.id, draftRevision: 1 }, first.sessionId, 'reopened', () => true))
    .toMatchObject({ request_id: requestId })
  expect(await restarted.consume(requestId, first.sessionId, 'reopened', async () => 'verified', () => true)).toBe('verified')
  await restarted.forget(requestId)
  expect((await f.inspect()).pending).toEqual([])
  expect((await f.inspect()).shares).toHaveLength(63)
  expect((await f.inspect()).completed).toHaveLength(1)
})
it('the allowance cannot admit a new or changed payload above the original eight MB limit', async () => {
  const f = await fixture(), data = exactLimit(), first = data.shares[0], exchange = vi.fn(async () => undefined)
  await f.store(data)
  const bytes = await readFile(f.file)
  await expect(f.vault.prepareDurable(input(record()), exchange)).rejects.toEqual(new ProtectedShareStorageError('full'))
  const changed = input(first), core = JSON.parse(changed.core)
  core[9] = core[9].slice(0, -1) + 'y'
  changed.core = JSON.stringify(core)
  await expect(f.vault.prepareDurable(changed, exchange)).rejects.toEqual(new ProtectedShareStorageError('full'))
  expect(exchange).not.toHaveBeenCalled()
  expect((await readFile(f.file)).equals(bytes)).toBe(true)
  expect((await f.vault.prepareDurable(input(first), exchange)).view.id).toBe(first.id)
  expect(exchange).not.toHaveBeenCalled()
})
it.each(['root', 'reader'] as const)('unknown %s fields stay charged instead of gaining a metadata exemption', async location => {
  const f = await fixture(), data = exactLimit()
  const unknown = 'x'.repeat(20000)
  const stored = location === 'root' ? { ...data, unknown } : { ...data, pending: [{
    clientRequestId: randomUUID(), consumptionId: randomUUID(), sessionId: 'session', operationGeneration: 'generation',
    readerSecret: randomBytes(32).toString('base64url'), createdAt: f.now, requestId: null, unknown }] }
  await f.store(stored)
  const bytes = await readFile(f.file)
  await expect(f.vault.durableShares()).rejects.toEqual(new ProtectedShareStorageError('full'))
  expect((await readFile(f.file)).equals(bytes)).toBe(true)
})
it('unknown result fields are rejected by validation rather than omitted from the byte charge', async () => {
  const f = await fixture(), data = exactLimit()
  const stored = { ...data, shares: data.shares.map((s, i) => i ? s : { ...s, result: { ...s.result, unknown: 'x'.repeat(20000) } }) }
  await f.store(stored)
  const bytes = await readFile(f.file)
  await expect(f.vault.durableShares()).rejects.toEqual(new ProtectedShareStorageError('damaged'))
  expect((await readFile(f.file)).equals(bytes)).toBe(true)
})
