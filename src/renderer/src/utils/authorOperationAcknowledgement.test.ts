import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { brotliDecompressSync } from 'node:zlib'
import { AuthorHandoffService, AuthorExchangeError } from '../../../main/authorHandoffService'
import { AuthorHandoffVault } from '../../../main/authorHandoffVault'
import type { AuthorContext, AuthorRequest, AuthorResults } from '../../../shared/authorHandoff'
import { shareStatusText, type DurableShareResult } from '../../../shared/durableShare'

const directories: string[] = [], services: AuthorHandoffService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) service.stopOperationTracking()
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})
const epoch = randomUUID(), strategy = randomUUID(), registration = randomUUID()
const identity = 'persisted-session-identity'
const context = (): AuthorContext => ({ sessionId: 'working:' + randomUUID(), generation: randomUUID() })
const key = randomBytes(32)
const protection = {
  isEncryptionAvailable: () => true,
  encryptString(value: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv)
    const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), bytes])
  },
  decryptString(value: Buffer) {
    const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12))
    cipher.setAuthTag(value.subarray(12, 28))
    return Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8')
  }
}
async function value<T extends AuthorRequest>(service: AuthorHandoffService, request: T): Promise<AuthorResults[T['action']]> {
  const result = await service.handle(request)
  if (!result.ok) throw new Error(result.error)
  return result.value as AuthorResults[T['action']]
}
const decode = (token: string) => JSON.parse(brotliDecompressSync(Buffer.from(token.slice(4), 'base64url')).toString())
async function fixture(kind: 'publication' | 'replace' | 'evidence' = 'publication') {
  const directory = await mkdtemp(join(tmpdir(), 'wl-operation-result-')); directories.push(directory)
  const requestId = randomUUID(), targetGeneration = kind === 'publication' ? null : randomUUID()
  const core = JSON.stringify([4, kind === 'publication' ? 0 : kind === 'replace' ? [1, strategy] : [2, strategy, 4, 'run', 1, 2, 'fingerprint'],
    null, null, null, null, null, null, null, null, null, null])
  const metadata = { author: { name: 'Example', registration_id: registration }, expected_revision: kind === 'publication' ? null : 4, confirmation_request_id: null }
  let selectedIdentity = identity, payloadHash: string | undefined, authorization: string | undefined
  let receipt: DurableShareResult | undefined
  const outcome = { strategy_id: strategy, revision: kind === 'publication' ? 1 : kind === 'replace' ? 5 : 4 }
  const calls: { url: string; init: RequestInit }[] = []
  const exchange = vi.fn(async (url: string, init: RequestInit): Promise<unknown> => {
    calls.push({ url, init })
    if (url.endsWith('/state') && init.method === 'GET') return { schema_version: 1, epoch, author_actions_available: true }
    if (url.endsWith('/shares') && init.method === 'PUT') {
      const body = JSON.parse(init.body as string)
      const auth = (init.headers as Record<string, string>).Authorization
      expect(createHash('sha256').update('WL-SHARE-READER/1\0').update(Buffer.from(auth.slice(8), 'base64url')).digest('hex')).toBe(body.reader_secret_hash)
      if (receipt) {
        expect(body.id).toBe(receipt.id); expect(auth).toBe(authorization)
        if (receipt.state !== 'ready' && body.payload_sha256 !== payloadHash)
          throw new AuthorExchangeError('Already accepted', false, 409, 'share_already_accepted')
      }
      receipt = { id: body.id, epoch, draft_revision: body.draft_revision, kind,
        state: receipt?.state ?? 'ready', outcome: receipt?.outcome ?? null }
      payloadHash = body.payload_sha256; authorization = auth
      return structuredClone(receipt)
    }
    if (receipt && url.endsWith('/shares/' + receipt.id) && init.method === 'GET') {
      expect((init.headers as Record<string, string>).Authorization).toBe(authorization)
      return structuredClone(receipt)
    }
    if (url.endsWith('/author-handoffs') && init.method === 'POST')
      return { request_id: requestId, expires_at: new Date(Date.now() + 600000).toISOString() }
    throw new Error('Unexpected fixture route or mutation')
  })
  const clipboard = vi.fn(() => '')
  const vault = (protectedStorage = protection) => new AuthorHandoffVault(directory, protectedStorage)
  const create = (protectedStorage = protection, storage = vault(protectedStorage)) => {
    const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: storage,
      readClipboard: clipboard, exchange,
      readShareCore: async (_sessionId, supplied) => {
        if (supplied !== selectedIdentity) throw new Error('Selected session changed')
        return null
      }, shareIntent: async () => { throw new Error('No legacy intent fallback') } })
    services.push(service); return service
  }
  const publication = (c: AuthorContext): Extract<AuthorRequest, { action: 'publication' }> => ({ action: 'publication', context: c,
    core, metadata, confirmation: false, newIntent: false, sessionIdentity: identity, targetGeneration })
  const result = (c: AuthorContext): Extract<AuthorRequest, { action: 'share-result' }> => ({ action: 'share-result', context: c,
    sessionIdentity: identity, targetGeneration })
  return { directory, create, vault, exchange, clipboard, calls, publication, result, requestId, targetGeneration, outcome,
    receipt: () => receipt!, complete: () => { receipt!.state = 'complete'; receipt!.outcome = outcome },
    select: (next: string) => { selectedIdentity = next } }
}
async function prepared(kind: 'publication' | 'replace' | 'evidence' = 'publication') {
  const f = await fixture(kind), service = f.create(), c = context()
  await value(service, { action: 'activate', context: c })
  const first = await value(service, f.publication(c))
  return { ...f, service, c, first }
}
async function tracked(service: AuthorHandoffService, status: string) {
  await service.startOperationTracking()
  await vi.waitFor(async () => expect((await value(service, { action: 'share-results' }))[0]?.status).toBe(status))
  service.stopOperationTracking()
}

it.each(['publication','replace','evidence'] as const)('%s uses a private durable result, never a code or consume request', async kind => {
  const f = await prepared(kind)
  expect(f.first).toMatchObject({ acknowledgement: 'operation', request: null, share: { status: 'ready', accepted: false } })
  const wire = decode(f.first.token)
  expect(wire[0]).toBe(7); expect(wire[2].confirmation_request_id).toBeNull()
  expect(wire[2].share_intent_id).toBe(f.receipt().id)
  f.complete(); await tracked(f.service, 'complete')
  expect(await value(f.service, f.result(f.c))).toMatchObject({ status: 'complete', outcome: f.outcome })
  expect(f.calls.every(call => call.init.method === 'GET' || call.init.method === 'PUT')).toBe(true)
  expect(f.clipboard).not.toHaveBeenCalled()
  expect((await f.service.handle({ action: 'paste', context: f.c, requestId: f.receipt().id })).ok).toBe(false)
  expect(f.clipboard).not.toHaveBeenCalled()
  const count = f.calls.length
  expect((await value(f.service, f.result(f.c)))?.outcome).toEqual(f.outcome)
  expect(f.calls).toHaveLength(count)
})

it.each(['publication','replace','evidence'] as const)('%s retains identical Copy bytes across close and process restart', async kind => {
  const f = await prepared(kind)
  await value(f.service, { action: 'activate', context: null })
  const restarted = f.create(), next = context()
  await value(restarted, { action: 'activate', context: next })
  expect(await value(restarted, f.result(next))).toEqual(f.first.share)
  expect(await value(restarted, f.publication(next))).toEqual(f.first)
  expect(f.calls.filter(call => call.init.method === 'PUT')).toHaveLength(1)
  expect(f.calls.some(call => call.init.method === 'DELETE')).toBe(false)
  const bytes = await readFile(join(f.directory, 'author-handoffs.enc'))
  const auth = (f.calls.find(call => call.init.method === 'PUT')!.init.headers as Record<string, string>).Authorization.slice(8)
  for (const secret of [auth, identity, f.receipt().id]) expect(bytes.includes(Buffer.from(secret))).toBe(false)
})

it.each(['publication','replace','evidence'] as const)('%s completes after the former deadline with Share closed and survives a later restart', async kind => {
  const f = await prepared(kind)
  await value(f.service, { action: 'activate', context: null })
  // Advancing wall time (not timers) proves the old ten-minute expiry is irrelevant.
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 86400000)
  f.complete(); await tracked(f.service, 'complete')
  const restarted = f.create(), next = context(), count = f.calls.length
  await value(restarted, { action: 'activate', context: next })
  await tracked(restarted, 'complete')
  expect(await value(restarted, f.result(next))).toMatchObject({ status: 'complete', outcome: f.outcome })
  expect(f.calls).toHaveLength(count)
  expect(f.clipboard).not.toHaveBeenCalled()
})

it('resumes main-process observation after restart without a Share window', async () => {
  const f = await prepared('evidence')
  f.complete()
  const restarted = f.create()
  await tracked(restarted, 'complete')
  expect((await f.vault().durableForSession(identity, f.targetGeneration))?.outcome).toEqual(f.outcome)
  expect(f.calls.filter(call => call.init.method === 'PUT')).toHaveLength(1)
})

it('never returns another selected session or accepts renderer-supplied authority', async () => {
  const f = await prepared('replace'), count = f.calls.length
  f.select('other')
  expect((await f.service.handle(f.result(f.c))).ok).toBe(false)
  f.select(identity)
  for (const extra of [{ readerSecret: 'not permitted' }, { registration_id: registration }, { outcome: f.outcome }])
    expect((await f.service.handle({ ...f.result(f.c), ...extra })).ok).toBe(false)
  expect(await value(f.service, { ...f.result(f.c), targetGeneration: randomUUID() })).toBeNull()
  expect(f.calls).toHaveLength(count)
})

it.each(['id','draft','kind','target','revision','epoch','extra','unfinished','missing'] as const)(
  'rejects a %s-mismatched result without persisting success', async fault => {
    const f = await prepared('replace')
    const bad: Record<string, unknown> = { ...f.receipt(), state: 'complete', outcome: f.outcome }
    if (fault === 'id') bad.id = randomUUID()
    if (fault === 'draft') bad.draft_revision = 9
    if (fault === 'kind') bad.kind = 'publication'
    if (fault === 'target') bad.outcome = { ...f.outcome, strategy_id: randomUUID() }
    if (fault === 'revision') bad.outcome = { ...f.outcome, revision: 4 }
    if (fault === 'epoch') bad.epoch = randomUUID()
    if (fault === 'extra') bad.registrations = []
    if (fault === 'unfinished') bad.state = 'accepted'
    if (fault === 'missing') bad.outcome = null
    f.exchange.mockResolvedValueOnce(bad)
    await tracked(f.service, 'checking')
    expect(await f.vault().durableForSession(identity, f.targetGeneration)).toMatchObject({ status: 'ready', outcome: null })
    expect(shareStatusText((await value(f.service, f.result(f.c)))!)).toBe('Checking share status…')
  })

it('context regeneration cannot turn an accepted share into edited content or a second publication', async () => {
  const f = await prepared(), next = context()
  f.receipt().state = 'accepted'; await tracked(f.service, 'processing')
  await value(f.service, { action: 'activate', context: next })
  const changed = JSON.parse(f.publication(next).core); changed[9] = 'changed'
  expect((await f.service.handle({ ...f.publication(next), core: JSON.stringify(changed) })).ok).toBe(false)
  expect((await f.service.handle({ ...f.publication(next), newIntent: true })).ok).toBe(false)
  expect(f.calls.filter(call => call.init.method === 'PUT')).toHaveLength(1)
  expect((await value(f.service, f.result(next)))?.id).toBe(f.receipt().id)
})

it.each(['publication','replace','evidence'] as const)('%s edits supersede the draft without rotating its durable identity', async kind => {
  const f = await prepared(kind), changed = JSON.parse(f.publication(f.c).core)
  changed[9] = 'Edited title'
  const second = await value(f.service, { ...f.publication(f.c), core: JSON.stringify(changed) })
  expect(second.share).toMatchObject({ id: f.receipt().id, draftRevision: 2, status: 'ready' })
  expect(decode(second.token)[2].share_intent_id).toBe(decode(f.first.token)[2].share_intent_id)
  expect(second.token).not.toBe(f.first.token)
})

it.each(['network','unavailable','refused','malformed'] as const)('%s preparation never produces an untracked Copy token', async failure => {
  const f = await fixture(), service = f.create(), c = context()
  await value(service, { action: 'activate', context: c })
  const normal = f.exchange.getMockImplementation()!
  f.exchange.mockImplementation(async (url, init) => {
    if (init.method !== 'PUT') return normal(url, init)
    if (failure === 'malformed') return { request_id: randomUUID() }
    if (failure === 'network') throw new TypeError('synthetic network')
    throw new AuthorExchangeError('Synthetic refusal', false, failure === 'unavailable' ? 503 : 403)
  })
  const result = await service.handle(f.publication(c))
  expect(result.ok).toBe(false); expect(result).not.toHaveProperty('value.token')
  const saved = JSON.parse(protection.decryptString(await readFile(join(f.directory, 'author-handoffs.enc'))))
  expect(saved.shares).toHaveLength(1); expect(saved.shares[0].proposed).not.toBeNull()
  expect(saved.shares[0].result).toBeNull(); expect(saved.pending).toEqual([])
})

it.each(['replace','evidence'] as const)('%s never falls back without its private result binding', async kind => {
  const f = await fixture(kind), service = f.create(), c = context()
  await value(service, { action: 'activate', context: c })
  f.exchange.mockRejectedValueOnce(new AuthorExchangeError('Unavailable', false, 503))
  expect((await service.handle(f.publication(c))).ok).toBe(false)
  expect(f.calls).toHaveLength(0)
})

it('lost preparation response retries the exact persisted proposal, including after legacy cancellation', async () => {
  const f = await fixture('evidence'), service = f.create(), c = context()
  await value(service, { action: 'activate', context: c })
  const normal = f.exchange.getMockImplementation()!, proposals: unknown[] = []
  let lose = true
  f.exchange.mockImplementation(async (url, init) => {
    if (init.method === 'PUT') {
      const saved = JSON.parse(protection.decryptString(await readFile(join(f.directory, 'author-handoffs.enc'))))
      expect(saved.shares[0].proposed).not.toBeNull()
      proposals.push(JSON.parse(init.body as string))
      const result = await normal(url, init)
      if (lose) { lose = false; throw new TypeError('synthetic lost answer') }
      return result
    }
    return normal(url, init)
  })
  expect((await service.handle(f.publication(c))).ok).toBe(false)
  await value(service, { action: 'cancel-publication', context: c, sessionIdentity: identity })
  const restarted = f.create(), next = context()
  await value(restarted, { action: 'activate', context: next })
  const retry = await value(restarted, f.publication(next))
  expect(proposals).toHaveLength(2); expect(proposals[1]).toEqual(proposals[0])
  expect(retry.share?.id).toBe(f.receipt().id)
  expect(f.calls.some(call => call.init.method === 'DELETE')).toBe(false)
})

it('unavailable encryption cannot erase or replace a prepared draft and restoration recovers it', async () => {
  const f = await prepared(), before = await readFile(join(f.directory, 'author-handoffs.enc'))
  const locked = f.create({ ...protection, isEncryptionAvailable: () => false }), next = context()
  await value(locked, { action: 'activate', context: next })
  for (const request of [f.result(next), f.publication(next),
    { action: 'share-draft' as const, sessionId: next.sessionId, sessionIdentity: identity }])
    expect((await locked.handle(request)).ok).toBe(false)
  expect(await readFile(join(f.directory, 'author-handoffs.enc'))).toEqual(before)
  const restored = f.create()
  await value(restored, { action: 'activate', context: next })
  expect(await value(restored, f.result(next))).toEqual(f.first.share)
  expect(await value(restored, f.publication(next))).toEqual(f.first)
})

it('initial name verification alone retains a code request; it cannot be consumed as an operation result', async () => {
  const f = await fixture(), service = f.create(), c = context()
  await value(service, { action: 'activate', context: c })
  const prepared = await value(service, { ...f.publication(c), confirmation: true })
  expect(prepared).toMatchObject({ acknowledgement: 'name', request: { request_id: f.requestId } })
  expect(decode(prepared.token)[2].confirmation_request_id).toBe(f.requestId)
  const creation = f.calls.find(call => call.init.method === 'POST')!
  expect(JSON.parse(creation.init.body as string).intent).toBeNull()
  const count = f.calls.length
  expect((await service.handle({ action: 'acknowledge-operation', context: c, requestId: f.requestId })).ok).toBe(false)
  expect(f.calls).toHaveLength(count)
})

it('an outage preserves the share and later success replaces checking without any consume or cancellation', async () => {
  const f = await prepared()
  f.exchange.mockRejectedValueOnce(new TypeError('synthetic outage'))
  await tracked(f.service, 'checking')
  f.complete()
  const restarted = f.create()
  await tracked(restarted, 'complete')
  expect((await value(restarted, { action: 'share-results' }))[0].outcome).toEqual(f.outcome)
  expect(f.calls.every(call => ['GET','PUT'].includes(call.init.method!))).toBe(true)
})

it('accepted and committed results never invite another paste and completion waits for the card', async () => {
  const f = await prepared()
  for (const state of ['accepted','committed'] as const) {
    f.receipt().state = state
    const observer = f.create(); await tracked(observer, 'processing')
    const view = (await value(observer, { action: 'share-results' }))[0]
    expect(view.accepted).toBe(true); expect(view.outcome).toBeNull()
    expect(shareStatusText(view)).toBe('Posted, updating Discord…')
  }
  f.complete(); await tracked(f.create(), 'complete')
})

it('a late background result stays on its original session after the UI closes or changes selection', async () => {
  const f = await prepared('replace')
  let release!: (result: unknown) => void
  f.exchange.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  await f.service.startOperationTracking()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  await value(f.service, { action: 'activate', context: null })
  f.select('other'); f.complete(); release(structuredClone(f.receipt()))
  await vi.waitFor(async () => expect((await f.vault().durableForSession(identity, f.targetGeneration))?.status).toBe('complete'))
  const next = context(); await value(f.service, { action: 'activate', context: next })
  expect((await f.service.handle(f.result(next))).ok).toBe(false)
  f.select(identity)
  expect(await value(f.service, f.result(next))).toMatchObject({ status: 'complete', outcome: f.outcome })
})

it('concurrent UI readers share the background observation without new requests or consuming the result', async () => {
  const f = await prepared('evidence')
  let release!: (result: unknown) => void
  f.exchange.mockImplementationOnce((url, init) => {
    f.calls.push({ url, init }); return new Promise(resolve => { release = resolve })
  })
  await f.service.startOperationTracking()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const readers = Array.from({ length: 3 }, () => value(f.service, f.result(f.c)))
  f.complete(); release(structuredClone(f.receipt()))
  await Promise.all(readers)
  await vi.waitFor(async () => expect((await value(f.service, f.result(f.c)))?.status).toBe('complete'))
  expect(f.calls.filter(call => /\/shares\//.test(call.url))).toHaveLength(1)
  expect(f.calls.some(call => call.url.endsWith('/consume'))).toBe(false)
})

it('legacy cancellation cannot detach or discard an in-flight durable result', async () => {
  const f = await prepared()
  let release!: (result: unknown) => void
  f.exchange.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  await f.service.startOperationTracking()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const cancellation = value(f.service, { action: 'cancel-publication', context: f.c, sessionIdentity: identity })
  f.complete(); release(structuredClone(f.receipt()))
  await cancellation
  await vi.waitFor(async () => expect((await value(f.service, f.result(f.c)))?.status).toBe('complete'))
  expect(f.calls.some(call => call.init.method === 'DELETE')).toBe(false)
  expect((await f.vault().durableForSession(identity, null))?.outcome).toEqual(f.outcome)
})

it.each(['share-result','share-draft'] as const)('%s rejects a late local read after repository selection changes, preserving its original draft', async action => {
  const f = await prepared(), storage = f.vault(), service = f.create(protection, storage), next = context()
  await value(service, { action: 'activate', context: next })
  let arrived!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { arrived = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  if (action === 'share-result') {
    const read = storage.durableForSession.bind(storage)
    vi.spyOn(storage, 'durableForSession').mockImplementationOnce(async (...args) => {
      const result = await read(...args); arrived(); await held; return result
    })
  } else {
    const read = storage.readableDurableDraft.bind(storage)
    vi.spyOn(storage, 'readableDurableDraft').mockImplementationOnce(async (...args) => {
      const result = await read(...args); arrived(); await held; return result
    })
  }
  const request = action === 'share-result' ? f.result(next)
    : { action, sessionId: next.sessionId, sessionIdentity: identity }
  const pending = service.handle(request)
  await entered; f.select('another-session'); release()
  expect((await pending).ok).toBe(false)
  expect(await f.vault().durableForSession(identity, null)).toEqual(f.first.share)
})

it('a late preparation response is saved for its original session but cannot return Copy to a newly selected session', async () => {
  const f = await fixture(), service = f.create(), c = context()
  await value(service, { action: 'activate', context: c })
  const normal = f.exchange.getMockImplementation()!
  let arrived!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { arrived = resolve }), held = new Promise<void>(resolve => { release = resolve })
  f.exchange.mockImplementation(async (url, init) => {
    const response = await normal(url, init)
    if (init.method === 'PUT') { arrived(); await held }
    return response
  })
  const pending = service.handle(f.publication(c))
  await entered; f.select('another-session'); release()
  expect((await pending).ok).toBe(false)
  expect(await f.vault().durableForSession(identity, null)).toMatchObject({ id: f.receipt().id, status: 'ready' })
  expect(f.calls.filter(call => call.init.method === 'PUT')).toHaveLength(1)
})
