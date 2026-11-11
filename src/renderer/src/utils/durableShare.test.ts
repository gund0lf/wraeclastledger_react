import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { AuthorHandoffVault, ProtectedShareStorageError } from '../../../main/authorHandoffVault'
import { DurableShareTracker } from '../../../main/durableShareTracker'
import { AuthorHandoffService } from '../../../main/authorHandoffService'
import { validDurableShare } from '../../../main/durableShareRecord'
import { parseDurableShareResult, shareCopyPresentation, shareStatusText, type DurableShareResult } from '../../../shared/durableShare'
import type { StrategyTarget } from '../../../shared/strategyTarget'

const dirs: string[] = [], trackers: DurableShareTracker[] = []
afterEach(async () => {
  for (const tracker of trackers.splice(0)) tracker.stop()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
async function setup(kind: 'publication' | 'evidence' | 'replace' = 'publication', now = Date.now) {
  const dir = await mkdtemp(join(tmpdir(), 'wl-durable-share-')); dirs.push(dir)
  const key = randomBytes(32)
  const protection = { isEncryptionAvailable: () => true,
    encryptString(text: string) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
      const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), bytes])
    },
    decryptString(bytes: Buffer) {
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
      decipher.setAuthTag(bytes.subarray(12, 28))
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
    } }
  const operation = { kind, strategy_id: kind === 'publication' ? null : randomUUID(), revision: kind === 'publication' ? null : 3 }
  const input = { sessionIdentity: randomUUID(), sessionId: 'selected-session', epoch: randomUUID(),
    targetGeneration: kind === 'publication' ? null : randomUUID(), operation,
    core: JSON.stringify([4, kind === 'publication' ? 0 : kind === 'replace' ? [1, operation.strategy_id] : [2, operation.strategy_id, 3], ...Array(10).fill(null)]),
    metadata: { author: { name: 'Synthetic Author', registration_id: kind === 'publication' ? null : randomUUID() },
      expected_revision: operation.revision, confirmation_request_id: null } }
  const saved: { value?: DurableShareResult; authorization?: string; hash?: string } = {}
  const exchange = vi.fn(async (raw: unknown, authorization: string) => {
    const p = raw as { id: string; epoch: string; draft_revision: number; payload_sha256: string }
    if (saved.value && saved.value.state !== 'ready' && p.payload_sha256 !== saved.hash) throw Object.assign(new Error('accepted'), { code: 'share_already_accepted' })
    saved.authorization = authorization; saved.hash = p.payload_sha256
    saved.value = { id: p.id, epoch: p.epoch, draft_revision: p.draft_revision, kind,
      state: saved.value?.state ?? 'ready', outcome: saved.value?.outcome ?? null }
    return structuredClone(saved.value)
  })
  const reopen = () => new AuthorHandoffVault(dir, protection, now)
  return { dir, input, saved, exchange, reopen, protection, vault: reopen() }
}

it('polling age survives restart; unchanged preparation keeps it and deliberate Copy or edits renew it', async () => {
  let now = 1_000_000
  const f = await setup('publication', () => now), first = await f.vault.prepareDurable(f.input, f.exchange)
  expect(await f.reopen().durableTrackingShares()).toEqual([{ view: first.view, pollingActivityAt: now }])
  now += 8 * 24 * 60 * 60_000
  await f.reopen().prepareDurable(f.input, f.exchange)
  expect((await f.reopen().durableTrackingShares())[0].pollingActivityAt).toBe(1_000_000)
  await f.reopen().copiedDurable({ sessionIdentity: f.input.sessionIdentity, shareId: first.view.id, draftRevision: 1 }, () => true)
  expect((await f.reopen().durableTrackingShares())[0].pollingActivityAt).toBe(now)
  expect(f.exchange).toHaveBeenCalledTimes(1)
  now += 1000
  const core = JSON.parse(f.input.core); core[9] = 'A changed title'
  const updated = await f.reopen().prepareDurable({ ...f.input, core: JSON.stringify(core) }, f.exchange)
  expect(updated.view).toMatchObject({ id: first.view.id, draftRevision: 2 })
  expect((await f.reopen().durableTrackingShares())[0].pollingActivityAt).toBe(now)
  expect(updated.view).not.toHaveProperty('pollingActivityAt')
  expect(f.exchange.mock.calls[1][0]).not.toHaveProperty('pollingActivityAt')
  const stored = JSON.parse(f.protection.decryptString(await readFile(join(f.dir, 'author-handoffs.enc')))).shares[0]
  expect(validDurableShare(stored)).toBe(true)
  const legacy = { ...stored }; delete legacy.pollingActivityAt
  expect(validDurableShare(legacy)).toBe(true)
  for (const invalid of [-1, 1.5, '1000', Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(validDurableShare({ ...stored, pollingActivityAt: invalid })).toBe(false)
})

it('Share refresh targets its one share while the Browser refresh remains global; malformed scope is refused', async () => {
  const f = await setup(), shareId = randomUUID()
  const wake = vi.spyOn(DurableShareTracker.prototype, 'wake').mockResolvedValue()
  try {
    const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.vault,
      readClipboard: () => '', exchange: async () => { throw new Error('Refresh must not call providers directly') } })
    expect(await service.handle({ action: 'share-refresh', shareId })).toEqual({ ok: true, value: null })
    expect(wake).toHaveBeenLastCalledWith(shareId)
    expect(await service.handle({ action: 'share-refresh' })).toEqual({ ok: true, value: null })
    expect(wake.mock.calls[1]).toEqual([])
    expect((await service.handle({ action: 'share-refresh', shareId: 'invalid' })).ok).toBe(false)
    expect((await service.handle({ action: 'share-refresh', shareId, unexpected: true })).ok).toBe(false)
    expect(wake).toHaveBeenCalledTimes(2)
  } finally { wake.mockRestore() }
})

it('a storage fault during background observation reaches an already-open Share as a typed message, never a result', async () => {
  const f = await setup(), first = await f.vault.prepareDurable(f.input, f.exchange)
  const error = new ProtectedShareStorageError('damaged')
  const observe = vi.spyOn(f.vault, 'observeDurable').mockRejectedValue(error)
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.vault,
    readClipboard: () => '', readShareCore: async () => ({ core: f.input.core }), exchange: async () => f.saved.value! })
  const context = { sessionId: f.input.sessionId, generation: randomUUID() }
  try {
    await service.handle({ action: 'activate', context })
    await service.startOperationTracking()
    await vi.waitFor(() => expect(observe).toHaveBeenCalled())
    expect(await service.handle({ action: 'share-results' })).toEqual({ ok: false, error: error.message, storageCode: 'damaged' })
    expect(await service.handle({ action: 'share-result', context, sessionIdentity: f.input.sessionIdentity,
      targetGeneration: null })).toEqual({ ok: false, error: error.message, storageCode: 'damaged' })
    observe.mockRestore()
    expect(await service.handle({ action: 'share-refresh', shareId: first.view.id })).toEqual({ ok: true, value: null })
    expect(await service.handle({ action: 'share-result', context, sessionIdentity: f.input.sessionIdentity,
      targetGeneration: null })).toMatchObject({ ok: true, value: { id: first.view.id, status: 'ready', accepted: false } })
  } finally { service.stopOperationTracking(); observe.mockRestore() }
})
function formCore(core: string): string {
  const form = JSON.parse(core); form[1] = 0
  return JSON.stringify(form)
}
function formTarget(input: Awaited<ReturnType<typeof setup>>['input']): StrategyTarget | null {
  const op = input.operation
  return op.kind === 'publication' ? null : { version: 1, state: 'ready', operation: op.kind,
    id: op.strategy_id!, title: 'Synthetic strategy', revision: op.revision!,
    registrationId: input.metadata.author.registration_id!, scope: 'current', generation: input.targetGeneration!,
    seed: op.kind === 'evidence' ? { version: 1, fingerprint: 'sha256-v1:' + 'a'.repeat(64) } : null }
}
it.each(['publication','evidence','replace'] as const)('%s: copied wording survives restart and edits distinguish an updated copy', async kind => {
  const f = await setup(kind), first = await f.vault.prepareDurable(f.input, f.exchange)
  const target = formTarget(f.input)
  const presentation = (view: typeof first.view, core = f.input.core) =>
    shareCopyPresentation(view, formCore(core), f.input.metadata.author.name, target)
  expect(presentation(first.view)).toEqual({ label: 'Copy to Discord', pasteHint: false })
  const copied = await f.vault.copiedDurable({ sessionIdentity: f.input.sessionIdentity, shareId: first.view.id, draftRevision: 1 }, () => true)
  const reopened = (await f.reopen().durableForSession(f.input.sessionIdentity, f.input.targetGeneration))!
  expect(reopened).toEqual(copied)
  expect(presentation(reopened)).toEqual({ label: 'Copy again', pasteHint: true })
  const changed = JSON.parse(f.input.core); changed[9] = 'Edited title'
  const core = JSON.stringify(changed)
  expect(presentation(reopened, core)).toEqual({ label: 'Copy updated share', pasteHint: false })
  const updated = await f.reopen().prepareDurable({ ...f.input, core }, f.exchange)
  expect(presentation(updated.view, core).label).toBe('Copy updated share')
  await expect(f.vault.copiedDurable({ sessionIdentity: f.input.sessionIdentity, shareId: first.view.id, draftRevision: 1 }, () => true)).rejects.toThrow('changed')
  await expect(f.vault.copiedDurable({ sessionIdentity: 'another session', shareId: first.view.id, draftRevision: 2 }, () => true)).rejects.toThrow('changed')
  await expect(f.vault.copiedDurable({ sessionIdentity: f.input.sessionIdentity, shareId: first.view.id, draftRevision: 2 }, () => false)).rejects.toThrow('changed')
  const next = await f.vault.copiedDurable({ sessionIdentity: f.input.sessionIdentity, shareId: first.view.id, draftRevision: 2 }, () => true)
  expect(presentation(next, core)).toEqual({ label: 'Copy again', pasteHint: true })
  f.saved.value!.state = 'accepted'
  const posted = await f.vault.observeDurable(next.id, async () => f.saved.value!)
  expect(presentation(posted!, core).pasteHint).toBe(false)
})
it.each(['evidence','replace'] as const)('%s: presentation still detects a changed target, author or form', async kind => {
  const f = await setup(kind), first = await f.vault.prepareDurable(f.input, f.exchange)
  const copied = await f.vault.copiedDurable({ sessionIdentity: f.input.sessionIdentity, shareId: first.view.id, draftRevision: 1 }, () => true)
  const target = formTarget(f.input) as Extract<StrategyTarget, { state: 'ready' | 'acknowledged' }>
  for (const changed of [null, { ...target, id: randomUUID() }, { ...target, revision: 4 },
    { ...target, generation: randomUUID() }, { ...target, registrationId: randomUUID() },
    { ...target, operation: kind === 'evidence' ? 'replace' as const : 'evidence' as const }]) {
    expect(shareCopyPresentation(copied, formCore(f.input.core), f.input.metadata.author.name, changed))
      .toEqual({ label: 'Copy updated share', pasteHint: false })
  }
  expect(shareCopyPresentation(copied, formCore(f.input.core), 'Different author', target).pasteHint).toBe(false)
  expect(shareCopyPresentation(copied, 'invalid core', f.input.metadata.author.name, target).pasteHint).toBe(false)
})
it.each(['evidence','replace'] as const)('%s: unchanged repeated preparation and restart never supersede or create a name request', async kind => {
  const f = await setup(kind)
  const remote = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/state')) return { schema_version: 1, epoch: f.input.epoch, author_actions_available: true }
    if (url.endsWith('/shares') && init.method === 'PUT')
      return f.exchange(JSON.parse(String(init.body)), String((init.headers as Record<string, string>).Authorization))
    throw new Error('Unchanged continuation must not create another request')
  })
  const makeService = () => new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.reopen(),
    readClipboard: () => '', readShareCore: async () => ({ core: f.input.core }), exchange: remote })
  let original: unknown
  for (const service of [makeService(), makeService()]) {
    const context = { sessionId: f.input.sessionId, generation: randomUUID() }
    await service.handle({ action: 'activate', context })
    for (let copy = 0; copy < 2; copy++) {
      const result = await service.handle({ action: 'publication', context, core: f.input.core, metadata: f.input.metadata,
        confirmation: false, newIntent: false, sessionIdentity: f.input.sessionIdentity, targetGeneration: f.input.targetGeneration })
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(result.error)
      original ??= result.value
      expect(result.value).toEqual(original)
    }
    service.stopOperationTracking()
  }
  expect(f.exchange).toHaveBeenCalledTimes(1)
  expect(remote.mock.calls.filter(([, init]) => init.method !== 'GET')).toHaveLength(1)
  const saved = await f.reopen().durableShares()
  expect(saved).toHaveLength(1)
  expect(saved[0].draftRevision).toBe(1)
})
it('initial name verification reattaches after close and restart without another request or code', async () => {
  const f = await setup(), first = await f.vault.prepareDurable(f.input, f.exchange)
  const binding = { shareId: first.view.id, draftRevision: first.view.draftRevision }
  const prepared = await f.vault.prepare(f.input.sessionId, randomUUID(), binding)
  const requestId = randomUUID(), expiresAt = new Date(Date.now() + 600_000).toISOString()
  await f.vault.bind(prepared.client_request_id, requestId, expiresAt)
  const remote = vi.fn(async () => { throw new Error('No request is needed to resume') })
  const makeService = () => new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: f.reopen(),
    readClipboard: () => '', readShareCore: async (sessionId, identity) => {
      if (sessionId !== f.input.sessionId || identity !== f.input.sessionIdentity) throw new Error('Wrong session')
      return { core: f.input.core }
    }, exchange: remote })
  for (const service of [makeService(), makeService()]) {
    const context = { sessionId: f.input.sessionId, generation: randomUUID() }
    expect((await service.handle({ action: 'activate', context })).ok).toBe(true)
    expect(await service.handle({ action: 'resume-name', context, sessionIdentity: f.input.sessionIdentity })).toEqual({ ok: true,
      value: { request_id: requestId, client_request_id: prepared.client_request_id, expires_at: expiresAt } })
    expect((await service.handle({ action: 'resume-name', context, sessionIdentity: randomUUID() })).ok).toBe(false)
    await service.handle({ action: 'activate', context: null })
    expect((await service.handle({ action: 'resume-name', context, sessionIdentity: f.input.sessionIdentity })).ok).toBe(false)
  }
  expect(remote).not.toHaveBeenCalled()
  const cancel = vi.fn()
  await f.reopen().discardInterrupted(cancel)
  expect(cancel).not.toHaveBeenCalled()
  expect(await f.reopen().resumeName({ ...binding, draftRevision: 2 }, f.input.sessionId, randomUUID(), () => true)).toBeNull()
  await expect(f.reopen().resumeName(binding, f.input.sessionId, randomUUID(), () => false)).rejects.toThrow('changed')
  expect((await f.reopen().durableForSession(f.input.sessionIdentity, null))?.status).toBe('ready')
})
it.each(['publication','evidence','replace'] as const)('%s: preserves private key and late result across close/restart without a ten-minute cutoff', async kind => {
  const f = await setup(kind), first = await f.vault.prepareDurable(f.input, f.exchange)
  const authorization = f.saved.authorization!
  expect(JSON.stringify(first)).not.toContain(authorization.slice(8))
  expect((await readFile(join(f.dir, 'author-handoffs.enc'))).includes(Buffer.from(authorization.slice(8)))).toBe(false)
  const late = { ...f.saved.value!, state: 'complete' as const, outcome: {
    strategy_id: f.input.operation.strategy_id ?? randomUUID(), revision: kind === 'replace' ? 4 : kind === 'evidence' ? 3 : 1 } }
  const restarted = f.reopen()
  const read = vi.fn(async (_id: string, auth: string) => { expect(auth).toBe(authorization); return late })
  const tracker = new DurableShareTracker(restarted, read, () => Date.now() + 3 * 24 * 3600_000)
  trackers.push(tracker); await tracker.start()
  await vi.waitFor(() => expect(tracker.view(first.view.id)?.status).toBe('complete'))
  tracker.stop()
  expect((await f.reopen().durableForSession(f.input.sessionIdentity, f.input.targetGeneration))?.outcome).toEqual(late.outcome)
  expect(shareStatusText(tracker.view(first.view.id)!)).toBe(kind === 'publication' ? 'Shared' : kind === 'evidence' ? 'Run added' : 'Replaced')
})
it('a lost preparation response retries the same key, identity and draft after restart, then supersedes safely', async () => {
  const f = await setup()
  const lost = async (body: unknown, auth: string) => { await f.exchange(body, auth); throw new Error('lost response') }
  await expect(f.vault.prepareDurable(f.input, lost)).rejects.toThrow('lost response')
  const original = f.exchange.mock.calls[0]
  const next = await f.reopen().prepareDurable(f.input, f.exchange)
  expect(f.exchange.mock.calls[1]).toEqual(original)
  expect(next.view.id).toBe(f.saved.value!.id)
  const core = JSON.parse(f.input.core); core[9] = 'Edited title'
  const changed = await f.reopen().prepareDurable({ ...f.input, core: JSON.stringify(core) }, f.exchange)
  expect(changed.view.id).toBe(next.view.id)
  expect(changed.view.draftRevision).toBe(2)
  expect(f.exchange.mock.calls[2][1]).toBe(original[1])
})
it('an accepted older copy fences a racing edit; its result stays readable and no new identity is created', async () => {
  const f = await setup(), first = await f.vault.prepareDurable(f.input, f.exchange)
  f.saved.value!.state = 'accepted'
  const core = JSON.parse(f.input.core); core[9] = 'Late edit'
  await expect(f.vault.prepareDurable({ ...f.input, core: JSON.stringify(core) }, f.exchange)).rejects.toThrow('accepted')
  const observed = await f.reopen().observeDurable(first.view.id, async () => f.saved.value!)
  expect(observed?.id).toBe(first.view.id)
  expect(observed?.core).toBe(f.input.core)
  expect(await f.reopen().durableShares()).toHaveLength(1)
  await expect(f.reopen().prepareDurable({ ...f.input, core: JSON.stringify(core) }, f.exchange)).rejects.toThrow('already processing')
})
it('outage reports Checking and retries automatically, with no failure/expiry guess', async () => {
  const f = await setup(), first = await f.vault.prepareDurable(f.input, f.exchange)
  let online = false
  const read = vi.fn(async () => { if (!online) throw new Error('offline'); return f.saved.value! })
  const tracker = new DurableShareTracker(f.vault, read); trackers.push(tracker)
  await tracker.start()
  await vi.waitFor(() => expect(tracker.view(first.view.id)?.status).toBe('checking'))
  expect(shareStatusText(tracker.view(first.view.id)!)).toBe('Checking share status…')
  online = true
  await vi.waitFor(() => expect(tracker.view(first.view.id)?.status).toBe('ready'), { timeout: 4000 })
  expect(shareStatusText(tracker.view(first.view.id)!)).toBe('Ready to post')
})
it('a missing formerly prepared record stays a recovery review; it never creates another share', async () => {
  const f = await setup(), first = await f.vault.prepareDurable(f.input, f.exchange)
  const tracker = new DurableShareTracker(f.vault, async () => { throw { code: 'share_result_unavailable' } })
  trackers.push(tracker); await tracker.start()
  await vi.waitFor(() => expect(tracker.view(first.view.id)?.status).toBe('restore_review'))
  expect(shareStatusText(tracker.view(first.view.id)!)).toContain('Strategy Browser')
  expect(f.exchange).toHaveBeenCalledTimes(1)
})
it('results cannot silently acknowledge another run, target or replacement revision', () => {
  const id = randomUUID(), strategy = randomUUID(), operation = { kind: 'replace' as const, strategy_id: strategy, revision: 3 }
  const value = { id, epoch: randomUUID(), draft_revision: 1, kind: 'replace', state: 'complete', outcome: { strategy_id: strategy, revision: 4 } }
  expect(parseDurableShareResult(value, id, 1, operation)).toEqual(value)
  expect(() => parseDurableShareResult({ ...value, outcome: { strategy_id: randomUUID(), revision: 4 } }, id, 1, operation)).toThrow()
  expect(() => parseDurableShareResult({ ...value, outcome: { strategy_id: strategy, revision: 5 } }, id, 1, operation)).toThrow()
  expect(() => parseDurableShareResult({ ...value, state: 'accepted' }, id, 1, operation)).toThrow()
})

it.each(['publication','evidence','replace'] as const)('%s: accepted and saved operations show processing until the exact card is complete', async kind => {
  const f = await setup(kind), first = await f.vault.prepareDurable(f.input, f.exchange)
  expect(first.view.accepted).toBe(false)
  expect(shareStatusText(first.view)).toBe('Ready to post')
  for (const state of ['accepted', 'committed'] as const) {
    f.saved.value!.state = state
    const view = await f.reopen().observeDurable(first.view.id, async () => f.saved.value!)
    expect(view).toMatchObject({ status: 'processing', accepted: true, outcome: null })
    expect(shareStatusText(view!)).toBe('Posted, updating Discord…')
    expect(await f.reopen().durableForSession(f.input.sessionIdentity, f.input.targetGeneration)).toEqual(view)
  }
  f.saved.value = { ...f.saved.value!, state: 'complete', outcome: {
    strategy_id: f.input.operation.strategy_id ?? randomUUID(), revision: kind === 'replace' ? 4 : kind === 'evidence' ? 3 : 1 } }
  const done = await f.reopen().observeDurable(first.view.id, async () => f.saved.value!)
  expect(done).toMatchObject({ status: 'complete', accepted: true, outcome: f.saved.value.outcome })
  expect(shareStatusText(done!)).toBe(kind === 'publication' ? 'Shared' : kind === 'evidence' ? 'Run added' : 'Replaced')
})

it('a status outage after acceptance never invites posting again or forgets that the share is processing', async () => {
  const f = await setup(), first = await f.vault.prepareDurable(f.input, f.exchange)
  f.saved.value!.state = 'accepted'
  await f.vault.observeDurable(first.view.id, async () => f.saved.value!)
  let online = false
  const tracker = new DurableShareTracker(f.reopen(), async () => {
    if (!online) throw new Error('offline')
    return f.saved.value!
  })
  trackers.push(tracker); await tracker.start()
  await vi.waitFor(() => expect(tracker.view(first.view.id)).toMatchObject({ status: 'checking', accepted: true }))
  expect(shareStatusText(tracker.view(first.view.id)!)).toBe('Checking share status…')
  online = true
  await vi.waitFor(() => expect(tracker.view(first.view.id)).toMatchObject({ status: 'processing', accepted: true }), { timeout: 4000 })
})
