import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { AuthorHandoffVault } from '../../../main/authorHandoffVault'
import { AuthorHandoffService } from '../../../main/authorHandoffService'
import { DurableShareTracker } from '../../../main/durableShareTracker'
import { shareDraft, type DurableShareRecord, type CompletedShareRecord } from '../../../main/durableShareRecord'
import { shareCopyPresentation, shareStatusText } from '../../../shared/durableShare'

const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'wl-share-history-'))
  directories.push(directory)
  const key = randomBytes(32)
  const protection = {
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
  const file = join(directory, 'author-handoffs.enc')
  const reopen = (now?: () => number) => new AuthorHandoffVault(directory, protection, now)
  const store = async (shares: DurableShareRecord[], completed: CompletedShareRecord[] = []) => {
    await writeFile(file, protection.encryptString(JSON.stringify({ version: 1, installationId: randomUUID(), pending: [], shares, completed })))
  }
  const inspect = async () => JSON.parse(protection.decryptString(await readFile(file)))
  return { directory, file, protection, reopen, store, inspect, vault: reopen() }
}
function record(kind: 'publication' | 'evidence' | 'replace' = 'publication'): DurableShareRecord {
  const id = randomUUID(), epoch = randomUUID(), target = kind === 'publication' ? null : randomUUID()
  const operation = { kind, strategy_id: target, revision: target ? 3 : null }
  const core = JSON.stringify([4, kind === 'publication' ? 0 : kind === 'replace' ? [1, target] : [2, target, 3], ...Array(10).fill(null)])
  const draft = shareDraft(id, 1, core, { author: { name: 'Synthetic private name', registration_id: target ? randomUUID() : null },
    expected_revision: operation.revision, confirmation_request_id: null })
  return { id, readerSecret: randomBytes(32).toString('base64url'), sessionIdentity: randomUUID(), sessionId: 'local-session', epoch,
    operation, targetGeneration: target ? randomUUID() : null, draft, proposed: null, noticed: false,
    result: { id, epoch, draft_revision: 1, kind, state: 'complete', outcome: { strategy_id: target ?? randomUUID(), revision: kind === 'replace' ? 4 : target ? 3 : 1 } } }
}
function input(s: DurableShareRecord) {
  return { sessionIdentity: s.sessionIdentity, sessionId: s.sessionId, epoch: s.epoch,
    targetGeneration: s.targetGeneration, operation: s.operation, core: s.draft!.core, metadata: s.draft!.metadata }
}
function marker(s = record()): CompletedShareRecord {
  return { id: s.id, sessionIdentity: s.sessionIdentity, targetGeneration: s.targetGeneration, draftRevision: s.draft!.revision,
    operation: s.operation, outcome: s.result!.outcome! }
}
it.each(['publication', 'evidence', 'replace'] as const)('%s: noticed completions become encrypted replay markers and never a new share', async kind => {
  const f = await fixture(), s = record(kind)
  await f.store([s])
  await f.vault.noticeDurable(s.id)
  const saved = await f.inspect()
  expect(saved.shares).toEqual([])
  expect(saved.completed).toEqual([marker(s)])
  expect(JSON.stringify(saved.completed)).not.toContain(s.readerSecret)
  expect(JSON.stringify(saved.completed)).not.toContain('Synthetic private name')
  const bytes = await readFile(f.file)
  expect(bytes.includes(Buffer.from(s.id))).toBe(false)
  expect(bytes.includes(Buffer.from(s.sessionIdentity))).toBe(false)
  const restarted = f.reopen(), view = await restarted.durableForSession(s.sessionIdentity, s.targetGeneration)
  expect(view).toMatchObject({ archived: true, id: s.id, core: null, author: null, status: 'complete', accepted: true, noticed: true, outcome: s.result!.outcome })
  expect(shareStatusText(view!)).toBe(kind === 'publication' ? 'Shared' : kind === 'evidence' ? 'Run added' : 'Replaced')
  expect(shareCopyPresentation(view, s.draft!.core, 'Anything')).toEqual({ label: 'Close', pasteHint: false })
  const exchange = vi.fn(async () => { throw new Error('Must not request or create anything') })
  expect(await restarted.observeDurable(s.id, exchange)).toEqual(view)
  expect(await restarted.markDurableUnavailable(s.id)).toEqual(view)
  await expect(restarted.prepareDurable(input(s), exchange)).rejects.toThrow('already processing or shared')
  expect(exchange).not.toHaveBeenCalled()
  expect(await f.inspect()).toEqual(saved)
})
it('migrates already-noticed completed history without pruning uncertain, accepted, or unnoticed work', async () => {
  const f = await fixture(), done = { ...record(), noticed: true }
  const pending = ['ready', 'accepted', 'committed', 'restore_review'].map(state => {
    const s = record(); s.noticed = true
    s.result = { ...s.result!, state: state as 'ready', outcome: null }
    return s
  })
  const unnoticed = record()
  await f.store([done, unnoticed, ...pending])
  const views = await f.vault.durableShares()
  expect(views.map(v => v.id)).toEqual([unnoticed, ...pending].map(s => s.id))
  const saved = await f.inspect()
  expect(saved.shares).toEqual([unnoticed, ...pending])
  expect(saved.completed).toEqual([marker(done)])
})
it('keeps a completed share intact until its one-time name verification is resolved', async () => {
  const f = await fixture(), s = record()
  await f.store([s])
  const request = await f.vault.prepare(s.sessionId, 'name-generation', { shareId: s.id, draftRevision: 1 })
  const requestId = randomUUID(), expiry = new Date(Date.now() + 600000).toISOString()
  await f.vault.bind(request.client_request_id, requestId, expiry)
  await f.vault.noticeDurable(s.id)
  expect((await f.inspect()).shares[0]).toMatchObject({ id: s.id, noticed: true, draft: s.draft })
  expect(await f.reopen().resumeName({ shareId: s.id, draftRevision: 1 }, s.sessionId, 'next-generation', () => true))
    .toEqual({ request_id: requestId, client_request_id: request.client_request_id, expires_at: expiry })
  await f.vault.forget(requestId)
  expect((await f.inspect()).completed).toEqual([marker(s)])
})
it('closing and restarting preserves a live name reader; its later expiry never loses the completed share', async () => {
  const f = await fixture(), s = record()
  let now = Date.now()
  const vault = f.reopen(() => now), binding = { shareId: s.id, draftRevision: 1 }
  await f.store([s])
  const request = await vault.prepare(s.sessionId, 'initial-name', binding), requestId = randomUUID()
  const expiresAt = new Date(now + 10 * 60_000).toISOString()
  await vault.bind(request.client_request_id, requestId, expiresAt)
  await vault.noticeDurable(s.id)
  const exchange = vi.fn(async () => { throw new Error('No new request or publication is allowed') })
  const open = async () => {
    const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.reopen(() => now),
      readClipboard: () => '', readShareCore: async () => ({ core: s.draft!.core }), exchange })
    const context = { sessionId: s.sessionId, generation: randomUUID() }
    expect((await service.handle({ action: 'activate', context })).ok).toBe(true)
    return { service, context }
  }
  for (let restart = 0; restart < 2; restart++) {
    const { service, context } = await open()
    try {
      expect(await service.handle({ action: 'resume-name', context, sessionIdentity: s.sessionIdentity })).toEqual({ ok: true,
        value: { request_id: requestId, client_request_id: request.client_request_id, expires_at: expiresAt } })
      expect(await f.reopen(() => now).durableForSession(s.sessionIdentity, null)).toMatchObject({
        id: s.id, status: 'complete', noticed: true, core: s.draft!.core, author: s.draft!.metadata.author })
      expect((await service.handle({ action: 'activate', context: null })).ok).toBe(true)
    } finally { service.stopOperationTracking() }
  }
  now += 10 * 60_000 + 1
  expect(await vault.resumeName(binding, s.sessionId, 'too-late', () => true)).toBeNull()
  // The existing encrypted pending-reader TTL is fifteen minutes. Its expiry
  // removes only that name reader; late name verification requires Recover.
  now += 5 * 60_000
  const { service, context } = await open()
  try {
    expect(await service.handle({ action: 'resume-name', context, sessionIdentity: s.sessionIdentity })).toEqual({ ok: true, value: null })
    const result = await service.handle({ action: 'share-result', context, sessionIdentity: s.sessionIdentity, targetGeneration: null })
    expect(result).toMatchObject({ ok: true, value: { id: s.id, archived: true, status: 'complete', noticed: true, outcome: s.result!.outcome } })
    expect(shareStatusText((await vault.durableForSession(s.sessionIdentity, null))!)).toBe('Shared')
    await expect(vault.prepareDurable(input(s), exchange)).rejects.toThrow('already processing or shared')
    expect(exchange).not.toHaveBeenCalled()
    expect((await f.inspect()).completed).toEqual([marker(s)])
    expect((await f.inspect()).pending).toEqual([])
  } finally { service.stopOperationTracking() }
})
it('more than 512 compact records do not block a new share or require another storage file', async () => {
  const f = await fixture(), completed = Array.from({ length: 600 }, () => marker())
  await f.store([], completed)
  const s = record()
  const result = await f.vault.prepareDurable(input(s), async raw => {
    const body = raw as { id: string; epoch: string; draft_revision: number }
    return { id: body.id, epoch: body.epoch, draft_revision: body.draft_revision, kind: 'publication', state: 'ready', outcome: null }
  })
  expect(result.view.status).toBe('ready')
  expect((await f.inspect()).completed).toEqual(completed)
  expect((await f.inspect()).shares).toHaveLength(1)
})
it('compact history larger than eight MB does not spend the unfinished-payload budget', async () => {
  const f = await fixture(), template = marker()
  const completed = Array.from({ length: 24000 }, (_, i) => ({ ...template, id: randomUUID(), sessionIdentity: String(i).padEnd(128, 'x') }))
  await f.store([], completed)
  expect((await readFile(f.file)).length).toBeGreaterThan(8 * 1024 * 1024)
  const s = record()
  const result = await f.vault.prepareDurable(input(s), async raw => {
    const body = raw as { id: string; epoch: string; draft_revision: number }
    return { id: body.id, epoch: body.epoch, draft_revision: body.draft_revision, kind: 'publication', state: 'ready', outcome: null }
  })
  expect(result.view.status).toBe('ready')
  expect((await f.inspect()).completed).toHaveLength(completed.length)
})
it('unfinished work still has the unchanged count bound and is never evicted to make room', async () => {
  const f = await fixture(), shares = Array.from({ length: 512 }, () => {
    const s = record(); s.result = { ...s.result!, state: 'accepted', outcome: null }; return s
  })
  await f.store(shares)
  const bytes = await readFile(f.file), exchange = vi.fn(async () => undefined)
  await expect(f.vault.prepareDurable(input(record()), exchange)).rejects.toThrow('unfinished share storage is full')
  expect(exchange).not.toHaveBeenCalled()
  expect(await readFile(f.file)).toEqual(bytes)
})
it('compaction failure preserves the full encrypted record and a retry keeps the same completed identity', async () => {
  const f = await fixture(), s = record()
  await f.store([s])
  const bytes = await readFile(f.file)
  const blocked = new AuthorHandoffVault(f.directory, { ...f.protection, encryptString() { throw new Error('Synthetic secure-store write failure') } })
  await expect(blocked.noticeDurable(s.id)).rejects.toThrow('Synthetic secure-store write failure')
  expect(await readFile(f.file)).toEqual(bytes)
  await f.vault.noticeDurable(s.id)
  expect((await f.inspect()).completed).toEqual([marker(s)])
})
it('unfinished payloads retain the eight MB bound without evicting any saved work', async () => {
  const f = await fixture(), shares = Array.from({ length: 85 }, () => {
    const s = record(), core = JSON.parse(s.draft!.core)
    core[9] = 'x'.repeat(100000)
    s.draft = shareDraft(s.id, 1, JSON.stringify(core), s.draft!.metadata)
    s.result = { ...s.result!, state: 'accepted', outcome: null }
    return s
  })
  await f.store(shares)
  const bytes = await readFile(f.file)
  await expect(f.vault.durableShares()).rejects.toThrow('unfinished sharing storage is too large')
  expect((await readFile(f.file)).equals(bytes)).toBe(true)
})
it('noticed completion leaves the background queue and cannot repeat its notification', async () => {
  const f = await fixture(), s = record()
  await f.store([s])
  const tracker = new DurableShareTracker(f.vault, async () => { throw new Error('No remote read of a completion') })
  await tracker.wake()
  expect(tracker.views()).toHaveLength(1)
  await f.vault.noticeDurable(s.id)
  await tracker.wake(s.id)
  expect(tracker.views()).toEqual([])
  expect(await f.vault.durableForSession(s.sessionIdentity, null)).toMatchObject({ status: 'complete', archived: true })
})
it('corrupt or conflicting compact markers are refused without replacing saved bytes', async () => {
  const f = await fixture(), s = record(), done = marker(s)
  for (const completed of [[{ ...done, outcome: null }], [done, done]]) {
    await f.store([], completed as CompletedShareRecord[])
    const bytes = await readFile(f.file)
    await expect(f.vault.durableShares()).rejects.toThrow()
    expect(await readFile(f.file)).toEqual(bytes)
  }
  await f.store([s], [done])
  await expect(f.vault.durableShares()).rejects.toThrow('identities conflict')
})

it.each(['publication', 'evidence', 'replace'] as const)('%s: close/reopen keeps only an exact display snapshot after compaction; restart has only the marker', async kind => {
  const f = await fixture(), s = record(kind)
  await f.store([s])
  const exchange = vi.fn(async () => { throw new Error('A completed share needs no remote request') })
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.vault,
    readClipboard: () => '', readShareCore: async () => ({ core: 'different current session fields' }), exchange })
  let context = { sessionId: s.sessionId, generation: randomUUID() }
  const query = () => service.handle({ action: 'share-result', context, sessionIdentity: s.sessionIdentity,
    targetGeneration: s.targetGeneration })
  try {
    expect((await service.handle({ action: 'activate', context })).ok).toBe(true)
    expect(await query()).toMatchObject({ ok: true, value: { status: 'complete', core: s.draft!.core } })
    expect(await service.handle({ action: 'share-noticed', shareId: s.id })).toEqual({ ok: true, value: null })
    const disk = await f.inspect()
    expect(disk.shares).toEqual([])
    expect(disk.completed).toEqual([marker(s)])
    expect(JSON.stringify(disk)).not.toContain(s.draft!.metadata.author.name)
    expect((await service.handle({ action: 'activate', context: null })).ok).toBe(true)
    context = { sessionId: s.sessionId, generation: randomUUID() }
    expect((await service.handle({ action: 'activate', context })).ok).toBe(true)
    const reopened = await query()
    expect(reopened).toMatchObject({ ok: true, value: { archived: true, status: 'complete', id: s.id,
      core: null, author: null, outcome: s.result!.outcome,
      displaySnapshot: { core: s.draft!.core, author: s.draft!.metadata.author } } })
    await service.handle({ action: 'share-refresh' })
    expect(await query()).toEqual(reopened)
    const fresh = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.reopen(),
      readClipboard: () => '', readShareCore: async () => ({ core: 'different current session fields' }), exchange })
    try {
      await fresh.handle({ action: 'activate', context })
      const result = await fresh.handle({ action: 'share-result', context, sessionIdentity: s.sessionIdentity,
        targetGeneration: s.targetGeneration })
      expect(result).toEqual({ ok: true, value: { archived: true, id: s.id, draftRevision: 1, copiedRevision: null,
        core: null, author: null, operation: s.operation, targetGeneration: s.targetGeneration,
        status: 'complete', accepted: true, noticed: true, outcome: s.result!.outcome } })
      await expect(f.vault.prepareDurable(input(s), exchange)).rejects.toThrow('already processing or shared')
      expect(exchange).not.toHaveBeenCalled()
      expect(await f.inspect()).toEqual(disk)
    } finally { fresh.stopOperationTracking() }
  } finally { service.stopOperationTracking() }
})

it('name receipt retry survives apply and reopen; expiry compacts authoritatively in the same running service', async () => {
  const f = await fixture(), s = record()
  let now = Date.now()
  const vault = f.reopen(() => now), binding = { shareId: s.id, draftRevision: 1 }
  await f.store([s])
  const request = await vault.prepare(s.sessionId, randomUUID(), binding), requestId = randomUUID()
  const expiresAt = new Date(now + 10 * 60_000).toISOString(), token = randomBytes(32).toString('base64url')
  await vault.bind(request.client_request_id, requestId, expiresAt)
  await vault.noticeDurable(s.id)
  const registration = { registration_id: randomUUID(), name: s.draft!.metadata.author.name, status: 'active' }
  const consumptions: string[] = []
  const exchange = vi.fn(async (url: string, init: RequestInit) => {
    expect(url.endsWith('/' + requestId + '/consume')).toBe(true)
    const body = JSON.parse(init.body as string)
    expect(body.completion_token).toBe(token)
    consumptions.push(body.consumption_id)
    return { schema_version: 1, request_id: requestId, client_request_id: request.client_request_id,
      epoch: s.epoch, outcome: { status: 'published', ...s.result!.outcome }, registrations: [registration] }
  })
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault,
    readClipboard: () => token, readShareCore: async () => ({ core: s.draft!.core }), exchange })
  let context = { sessionId: s.sessionId, generation: randomUUID() }
  const query = () => service.handle({ action: 'share-result', context, sessionIdentity: s.sessionIdentity, targetGeneration: null })
  try {
    for (let opening = 0; opening < 2; opening++) {
      await service.handle({ action: 'activate', context })
      expect(await query()).toMatchObject({ ok: true, value: { core: s.draft!.core, status: 'complete' } })
      expect(await service.handle({ action: 'resume-name', context, sessionIdentity: s.sessionIdentity }))
        .toMatchObject({ ok: true, value: { request_id: requestId } })
      expect((await service.handle({ action: 'paste', context, requestId })).ok).toBe(true)
      expect((await service.handle({ action: 'accept', context, requestId })).ok).toBe(true)
      expect((await f.inspect()).pending).toHaveLength(1)
      expect((await f.inspect()).shares[0].draft.core).toBe(s.draft!.core)
      await service.handle({ action: 'activate', context: null })
      context = { sessionId: s.sessionId, generation: randomUUID() }
    }
    expect(consumptions).toHaveLength(4)
    expect(new Set(consumptions).size).toBe(1)
    await service.handle({ action: 'activate', context })
    now += 15 * 60_000 + 1
    const first = await query()
    expect(first).toMatchObject({ ok: true, value: { archived: true, core: null, author: null,
      status: 'complete', noticed: true, displaySnapshot: { core: s.draft!.core, author: s.draft!.metadata.author } } })
    expect(await service.handle({ action: 'share-results' })).toEqual({ ok: true, value: [] })
    expect(await query()).toEqual(first)
    expect((await f.inspect()).pending).toEqual([])
    expect((await f.inspect()).completed).toEqual([marker(s)])
    expect((await f.reopen().durableForSession(s.sessionIdentity, null))?.archived).toBe(true)
    expect(await f.reopen().durableForSession(s.sessionIdentity, null)).not.toHaveProperty('displaySnapshot')
    expect(exchange).toHaveBeenCalledTimes(4)
  } finally { service.stopOperationTracking() }
})

it('display-cache count eviction loses only old presentation, never the stored result or replay identity', async () => {
  const f = await fixture(), shares = Array.from({ length: 513 }, () => ({ ...record(), noticed: true }))
  await f.store(shares)
  expect(await f.vault.durableShares()).toEqual([])
  const oldest = shares[0], newest = shares.at(-1)!
  const oldView = await f.vault.durableForSession(oldest.sessionIdentity, null)
  expect(oldView).toMatchObject({ archived: true, id: oldest.id, core: null, author: null,
    status: 'complete', outcome: oldest.result!.outcome })
  expect(oldView).not.toHaveProperty('displaySnapshot')
  const freshView = await f.vault.durableForSession(newest.sessionIdentity, null)
  expect(freshView).toHaveProperty('displaySnapshot.core', newest.draft!.core)
  if (freshView?.archived && freshView.displaySnapshot) freshView.displaySnapshot.author.name = 'Changed renderer copy'
  expect(await f.vault.durableForSession(newest.sessionIdentity, null))
    .toHaveProperty('displaySnapshot.author.name', newest.draft!.metadata.author.name)
  const exchange = vi.fn(async () => undefined)
  await expect(f.vault.prepareDurable(input(oldest), exchange)).rejects.toThrow('already processing or shared')
  expect(exchange).not.toHaveBeenCalled()
  expect((await f.inspect()).completed).toHaveLength(shares.length)
})

it('display-cache byte eviction cannot replace an old snapshot with current session values', async () => {
  const f = await fixture(), shares = Array.from({ length: 85 }, () => {
    const s = record(), core = JSON.parse(s.draft!.core)
    core[9] = 'x'.repeat(100000)
    s.draft = shareDraft(s.id, 1, JSON.stringify(core), s.draft!.metadata)
    return { ...s, noticed: true }
  })
  await f.store(shares)
  await f.vault.durableShares()
  expect(await f.vault.durableForSession(shares[0].sessionIdentity, null)).not.toHaveProperty('displaySnapshot')
  expect(await f.vault.durableForSession(shares.at(-1)!.sessionIdentity, null))
    .toHaveProperty('displaySnapshot.core', shares.at(-1)!.draft!.core)
  expect((await f.inspect()).completed).toHaveLength(shares.length)
})

it('an in-memory display never overrides a different validated completion with the same ID', async () => {
  const f = await fixture(), s = record()
  await f.store([s])
  await f.vault.noticeDurable(s.id)
  const changed = { ...marker(s), outcome: { strategy_id: randomUUID(), revision: 2 } }
  await f.store([], [changed])
  const view = await f.vault.durableForSession(s.sessionIdentity, null)
  expect(view).toMatchObject({ archived: true, status: 'complete', outcome: changed.outcome })
  expect(view).not.toHaveProperty('displaySnapshot')
})

it('a retained full completion wins over an earlier background tracker state', async () => {
  const f = await fixture(), s = record()
  await f.store([s])
  const saved = await f.vault.durableForSession(s.sessionIdentity, null)
  expect(saved?.archived).not.toBe(true)
  const stale = vi.spyOn(DurableShareTracker.prototype, 'view').mockReturnValue({ ...saved!,
    archived: false, core: s.draft!.core, author: s.draft!.metadata.author, status: 'processing', outcome: null })
  const exchange = vi.fn(async () => { throw new Error('A known completion must not be queried again') })
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.vault,
    readClipboard: () => '', readShareCore: async () => ({ core: 'current session differs' }), exchange })
  const context = { sessionId: s.sessionId, generation: randomUUID() }
  try {
    await service.handle({ action: 'activate', context })
    expect(await service.handle({ action: 'share-result', context, sessionIdentity: s.sessionIdentity, targetGeneration: null }))
      .toEqual({ ok: true, value: saved })
    expect(exchange).not.toHaveBeenCalled()
  } finally { stale.mockRestore(); service.stopOperationTracking() }
})
