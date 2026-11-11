import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AuthorHandoffService, AuthorExchangeError } from '../../../main/authorHandoffService'
import { AuthorHandoffVault } from '../../../main/authorHandoffVault'
import { FileSessionRepository } from '../../../main/sessionRepository'
import { acceptExactNameVerification, emptyAuthorPreferences, type AuthorPreferences } from '../../../shared/authorRecognition'
import { migrateSessionEnvelope } from '../repository/legacySessionMigration'
import { LEGACY_STORE_STORAGE_KEY, LEGACY_LAYOUT_STORAGE_KEY, LEGACY_CHANGELOG_STORAGE_KEY } from '../../../shared/sessionMigration'
import type { AuthorContext, AuthorRequest, AuthorResults, AuthorConfirmation } from '../../../shared/authorHandoff'
import type { DurableShareResult } from '../../../shared/durableShare'

const roots: string[] = [], services: AuthorHandoffService[] = []
afterEach(async () => {
  for (const service of services.splice(0)) service.stopOperationTracking()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const protection = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }
const context = (): AuthorContext => ({ sessionId: 'working:fixture', generation: randomUUID() })
async function value<T extends AuthorRequest>(s: AuthorHandoffService, r: T): Promise<AuthorResults[T['action']]> {
  const reply = await s.handle(r)
  if (!reply.ok) throw new Error(reply.error)
  return reply.value as AuthorResults[T['action']]
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'wl-name-lifecycle-')); roots.push(root)
  const epoch = randomUUID(), registration = randomUUID(), strategy = randomUUID()
  const requests = new Map<string, { id: string; body: Record<string, unknown>; state: 'pending' | 'consumed' | 'cancelled'; consumption?: string }>()
  const shares = new Map<string, DurableShareResult>()
  const calls: { path: string; method: string; body?: Record<string, unknown> }[] = []
  let preferences = emptyAuthorPreferences()
  let fault: 'create-lost' | 'cancel-lost' | 'consume-lost' | 'cancel-auth' | 'cancel-malformed' | null = null
  const vault = () => new AuthorHandoffVault(root, protection)
  const exchange = async (url: string, init: RequestInit): Promise<unknown> => {
    const path = url.split('/author-handoffs')[1], method = init.method!
    const body = init.body ? JSON.parse(init.body as string) : undefined
    calls.push({ path, method, body })
    if (path === '/state') return { schema_version: 1, epoch, author_actions_available: true }
    if (path === '/shares' && method === 'PUT') {
      const existing = shares.get(body.id)
      if (existing && existing.state !== 'ready' && body.draft_revision !== existing.draft_revision)
        throw new AuthorExchangeError('Already accepted', false, 409, 'share_already_accepted')
      const result: DurableShareResult = { id: body.id, epoch, draft_revision: body.draft_revision,
        kind: body.kind, state: existing?.state ?? 'ready', outcome: existing?.outcome ?? null }
      shares.set(body.id, result); return structuredClone(result)
    }
    if (path.startsWith('/shares/') && method === 'GET') return structuredClone(shares.get(path.slice(8)))
    if (path === '' && method === 'POST') {
      let request = requests.get(body.client_request_id)
      if (request) expect(body).toEqual(request.body)
      else {
        if ([...requests.values()].filter(r => r.state === 'pending').length >= 2)
          throw new AuthorExchangeError('Two pending requests', false, 429, 'author_pending_limit')
        request = { id: randomUUID(), body, state: 'pending' }; requests.set(body.client_request_id, request)
      }
      if (fault === 'create-lost') { fault = null; throw new Error('Synthetic lost creation response') }
      return { request_id: request.id, expires_at: new Date(Date.now() + 600000).toISOString() }
    }
    const request = [...requests.values()].find(r => path.startsWith('/' + r.id))
    if (!request) throw new Error('Unexpected fixture route')
    if (method === 'DELETE') {
      if (fault === 'cancel-auth') throw new AuthorExchangeError('Unavailable', true, 401, 'handoff_unavailable')
      if (fault === 'cancel-malformed') return { request_id: request.id, status: 'pending' }
      if (request.state === 'cancelled') throw new AuthorExchangeError('Expired', true, 410, 'handoff_expired')
      request.state = 'cancelled'
      if (fault === 'cancel-lost') { fault = null; throw new Error('Synthetic lost cancellation response') }
      return { request_id: request.id, status: 'cancelled' }
    }
    if (path.endsWith('/consume') && method === 'POST') {
      if (request.consumption) expect(body.consumption_id).toBe(request.consumption)
      request.consumption = body.consumption_id; request.state = 'consumed'
      if (fault === 'consume-lost') { fault = null; throw new Error('Synthetic lost receipt response') }
      return { schema_version: 1, request_id: request.id, client_request_id: request.body.client_request_id,
        epoch, outcome: { status: 'published', strategy_id: strategy, revision: 1 },
        registrations: [{ registration_id: registration, name: 'Example', status: 'active' }] }
    }
    throw new Error('Unexpected fixture method')
  }
  const create = (readAuthorPreferences = async () => structuredClone(preferences)) => {
    const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault: vault(), exchange,
      readClipboard: () => Buffer.alloc(32, 7).toString('base64url'), readShareCore: async () => null,
      readAuthorPreferences })
    services.push(service); return service
  }
  const publication = (c: AuthorContext, title = 'First', identity = 'session'): Extract<AuthorRequest, { action: 'publication' }> => ({
    action: 'publication', context: c, core: JSON.stringify([4, 0, title, null, null, null, null, null, null, null, null, null]),
    metadata: { author: { name: 'Example', registration_id: null }, expected_revision: null, confirmation_request_id: null },
    confirmation: true, newIntent: false, sessionIdentity: identity })
  return { root, vault, create, publication, requests, calls, shares,
    fault: (f: typeof fault) => { fault = f },
    save: (receipt: AuthorConfirmation) => { preferences = acceptExactNameVerification(preferences, receipt, 'Example')! },
    preferences: () => structuredClone(preferences),
    setPreferences: (value: AuthorPreferences) => { preferences = value },
    pending: async () => JSON.parse(await readFile(join(root, 'author-handoffs.enc'), 'utf8')).pending }
}
async function copy(f: Awaited<ReturnType<typeof fixture>>, s: AuthorHandoffService, title = 'First', identity = 'session') {
  const c = context(); await value(s, { action: 'activate', context: c })
  return { c, result: await value(s, f.publication(c, title, identity)) }
}

it('four edited copies release only superseded readers and never fill either two-request limit', async () => {
  const f = await fixture(), s = f.create()
  let last = await copy(f, s)
  for (const title of ['Second', 'Third', 'Fourth']) {
    last = await copy(f, s, title)
    expect([...f.requests.values()].filter(r => r.state === 'pending')).toHaveLength(1)
    expect(await f.pending()).toHaveLength(1)
  }
  expect(last.result.share.draftRevision).toBe(4)
  const requestId = last.result.request!.request_id
  await value(s, { action: 'paste', context: last.c, requestId })
  const receipt = await value(s, { action: 'accept', context: last.c, requestId })
  expect(await s.handle({ action: 'name-saved', context: last.c, requestId })).toMatchObject({ ok: false })
  expect(await f.pending()).toHaveLength(1)
  f.save(receipt)
  await value(s, { action: 'name-saved', context: last.c, requestId })
  await value(s, { action: 'name-saved', context: last.c, requestId })
  expect(await f.pending()).toHaveLength(0)
  for (const operation of [{ kind: 'recovery' as const, intent: null },
    { kind: 'unregister' as const, intent: { registration_id: receipt.registrations[0].registration_id } }]) {
    const c = context(); await value(s, { action: 'activate', context: c })
    expect(await value(s, { action: 'prepare', context: c, operation })).toHaveProperty('request_id')
  }
})

it('lost consume response remains retryable after restart until the authoritative preferences reader confirms the exact name', async () => {
  const f = await fixture(), s = f.create(), first = await copy(f, s)
  const requestId = first.result.request!.request_id
  f.fault('consume-lost')
  expect((await s.handle({ action: 'paste', context: first.c, requestId })).ok).toBe(false)
  expect(await f.pending()).toHaveLength(1)
  const restarted = f.create(), c = context()
  await value(restarted, { action: 'activate', context: c })
  expect(await value(restarted, { action: 'resume-name', context: c, sessionIdentity: 'session' })).toMatchObject({ request_id: requestId })
  await value(restarted, { action: 'paste', context: c, requestId })
  const receipt = await value(restarted, { action: 'accept', context: c, requestId })
  expect((await restarted.handle({ action: 'name-saved', context: c, requestId })).ok).toBe(false)
  f.save(receipt)
  await value(restarted, { action: 'activate', context: context() })
  await value(restarted, { action: 'name-saved', context: c, requestId })
  expect(await f.pending()).toHaveLength(0)
  expect(f.calls.filter(c => c.method === 'DELETE')).toHaveLength(0)
})

it.each(['name', 'epoch', 'confirmed'] as const)('a saved name with mismatching %s never releases the private receipt', async field => {
  const f = await fixture(), s = f.create(), first = await copy(f, s), requestId = first.result.request!.request_id
  await value(s, { action: 'paste', context: first.c, requestId })
  const receipt = await value(s, { action: 'accept', context: first.c, requestId })
  f.save(receipt)
  const wrong = f.preferences()
  if (field === 'name') wrong.registrations[0].name = 'Different'
  if (field === 'epoch') wrong.registrations[0].epoch = randomUUID()
  if (field === 'confirmed') wrong.registrations[0].confirmed = false
  f.setPreferences(wrong)
  expect((await s.handle({ action: 'name-saved', context: first.c, requestId })).ok).toBe(false)
  expect(await f.pending()).toHaveLength(1)
})

it('releases only after the real repository has saved verified preferences; failed saves retain the receipt', async () => {
  const f = await fixture(), repository = new FileSessionRepository({ userDataPath: join(f.root, 'profile') })
  const plan = await migrateSessionEnvelope({ store: { key: LEGACY_STORE_STORAGE_KEY,
    rawValue: await readFile(new URL('./__fixtures__/wp14/active-named-dirty-envelope.json', import.meta.url), 'utf8') },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: null }, changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: null } },
  { repositoryId: 'repository:name-lifecycle', operationId: 'migration:name-lifecycle', now: new Date('2026-11-11T12:00:00Z') })
  try {
    const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan })
    const s = f.create(() => repository.readAuthorPreferences()), first = await copy(f, s), requestId = first.result.request!.request_id
    await value(s, { action: 'paste', context: first.c, requestId })
    const receipt = await value(s, { action: 'accept', context: first.c, requestId })
    f.save(receipt)
    const save = { operation: 'save' as const, target: { kind: 'preferences' as const },
      expectedGeneration: bootstrap.preferencesGeneration, payload: { authorPreferences: JSON.parse(JSON.stringify(f.preferences())) } }
    await expect(repository.save({ ...save, expectedGeneration: bootstrap.preferencesGeneration + 1 })).rejects.toThrow()
    expect((await s.handle({ action: 'name-saved', context: first.c, requestId })).ok).toBe(false)
    expect(await f.pending()).toHaveLength(1)
    await repository.save(save)
    expect(await repository.readAuthorPreferences()).toEqual(f.preferences())
    await value(s, { action: 'activate', context: null })
    await value(s, { action: 'name-saved', context: first.c, requestId })
    expect(await f.pending()).toHaveLength(0)
  } finally { await repository.releaseLock() }
})

it('lost creation response is recovered with its original bytes before supersession cancellation', async () => {
  const f = await fixture(), s = f.create(), c = context()
  await value(s, { action: 'activate', context: c }); f.fault('create-lost')
  expect((await s.handle(f.publication(c))).ok).toBe(false)
  expect((await f.pending())[0].requestId).toBeNull()
  await copy(f, f.create(), 'Updated')
  const creations = f.calls.filter(c => c.path === '' && c.method === 'POST')
  expect(creations).toHaveLength(3)
  expect(creations[1].body).toEqual(creations[0].body)
  expect([...f.requests.values()].map(r => r.state)).toEqual(['cancelled', 'pending'])
  expect(await f.pending()).toHaveLength(1)
})

it.each(['cancel-lost', 'cancel-auth', 'cancel-malformed'] as const)('%s preserves the older reader and retries the same durable revision', async fault => {
  const f = await fixture(), s = f.create(); await copy(f, s)
  const c = context(); await value(s, { action: 'activate', context: c }); f.fault(fault)
  expect(await s.handle(f.publication(c, 'Updated'))).toMatchObject({ ok: false, error: expect.stringContaining('Retry Copy') })
  expect(await f.pending()).toHaveLength(1)
  expect(f.requests.size).toBe(1)
  f.fault(null)
  const result = await value(s, f.publication(c, 'Updated'))
  expect(result.share.draftRevision).toBe(2)
  expect(await f.pending()).toHaveLength(1)
  expect([...f.requests.values()].map(r => r.state)).toEqual(['cancelled', 'pending'])
})

it('keeps unrelated name readers, including their consumption identity, while editing another share', async () => {
  const f = await fixture(), s = f.create()
  const unrelated = await copy(f, s, 'Unrelated', 'other')
  const before = (await f.pending())[0]
  await copy(f, s)
  await copy(f, s, 'Updated')
  expect(await f.pending()).toHaveLength(2)
  expect((await f.pending()).find((p: { requestId: string }) => p.requestId === unrelated.result.request!.request_id)).toEqual(before)
  const c = context(); await value(s, { action: 'activate', context: c })
  expect(await s.handle(f.publication(c, 'Third', 'third'))).toMatchObject({ ok: false, error: expect.stringContaining('Two name requests are still open') })
  expect(await f.pending()).toHaveLength(2)
})

it('does not cancel a reader when the original share already won the acceptance race', async () => {
  const f = await fixture(), s = f.create(), first = await copy(f, s)
  f.shares.get(first.result.share.id)!.state = 'accepted'
  const c = context(); await value(s, { action: 'activate', context: c })
  expect((await s.handle(f.publication(c, 'Too late'))).ok).toBe(false)
  expect(f.calls.filter(c => c.method === 'DELETE')).toHaveLength(0)
  expect(await f.pending()).toHaveLength(1)
})
