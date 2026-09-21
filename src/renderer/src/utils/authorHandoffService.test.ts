import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { brotliDecompressSync } from 'node:zlib'
import { AuthorHandoffVault } from '../../../main/authorHandoffVault'
import { AuthorHandoffService, AuthorExchangeError, authorReviewOrigin, authorJsonFetch } from '../../../main/authorHandoffService'
import { canonicalAuthorJson } from '../../../shared/authorSubmission'
import { parseAuthorPreferences, emptyAuthorPreferences } from '../../../shared/authorRecognition'
import { validateAuthorManagement } from '../../../shared/authorHandoff'
const directories: string[] = []
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }) })
const context = () => ({ sessionId: 'working:1', generation: randomUUID() })
const origin = 'http://127.0.0.1:43181'
it('the gated public reader cannot address private routes or external hosts and never initializes the vault', async () => {
  const exchange = vi.fn(async () => ({ schema_version: 2 }))
  const { service, vault, clipboard } = await setup(exchange)
  const storage = vi.spyOn(vault, 'discardInterrupted')
  for (const path of ['/strategies', '/desktop/v1/author-handoffs', 'https://evil.invalid/web/v2/strategies', '/web/v2/strategies/../private'])
    expect((await service.handle({ action: 'read', path })).ok).toBe(false)
  expect((await service.handle({ action: 'read', path: '/web/v2/strategies?limit=20' })).ok).toBe(true)
  expect(exchange).toHaveBeenCalledTimes(1)
  expect(exchange.mock.calls[0][1]).toEqual({ method: 'GET' })
  expect(storage).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled()
})
it.each([403, 410, 429, 503])('keeps a failed public read (%s) on its exact endpoint and masks the error body', async status => {
  const path = '/web/v2/retrospectives/11111111-1111-4111-8111-111111111111/strategies?limit=20'
  const payload = { schema_version: 2, scope: 'frozen' }
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('{"error":"private-upstream-detail"}', { status }))
    .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
  const { service, vault, clipboard } = await setup((url, init) => authorJsonFetch(url, init, fetcher))
  const storage = vi.spyOn(vault, 'discardInterrupted')
  expect(await service.handle({ action: 'read', path })).toEqual({ ok: false, error: 'Could not load the public strategy data. Refresh and retry.' })
  // A failed read cannot disable the safe reader and send the renderer to legacy routes.
  expect(await service.handle({ action: 'available' })).toEqual({ ok: true, value: true })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(await service.handle({ action: 'read', path })).toEqual({ ok: true, value: payload })
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([origin + path, origin + path])
  for (const [, init] of fetcher.mock.calls) {
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' })
    expect(init.headers).toBeUndefined(); expect(init.body).toBeUndefined()
  }
  expect(storage).not.toHaveBeenCalled(); expect(clipboard).not.toHaveBeenCalled()
})
it('masks malformed public responses and network errors without retrying another endpoint', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response('private HTML, not JSON', { status: 503 }))
    .mockRejectedValueOnce(new Error('private connection details'))
    .mockResolvedValueOnce(new Response('"' + 'x'.repeat(16385) + '"'))
  const { service } = await setup((url, init) => authorJsonFetch(url, init, fetcher))
  for (let i = 0; i < 3; i++) {
    expect(await service.handle({ action: 'read', path: '/web/v2/strategies?limit=20' }))
      .toEqual({ ok: false, error: 'Could not load the public strategy data. Refresh and retry.' })
    expect(fetcher).toHaveBeenCalledTimes(i + 1)
  }
})
const epoch = randomUUID(), registration = randomUUID()
async function setup(exchange?: (url: string, init: RequestInit) => Promise<unknown>) {
  const directory = await mkdtemp(join(tmpdir(), 'wl-author-exchange-'))
  directories.push(directory)
  const requests: { url: string; init: RequestInit }[] = []
  const requestId = randomUUID()
  let clientId = '', secret = '', consumption = ''
  const clipboard = vi.fn(() => randomBytes(32).toString('base64url'))
  const vault = new AuthorHandoffVault(directory, { isEncryptionAvailable: () => true,
    encryptString: (v) => Buffer.from(v), decryptString: (v) => v.toString() })
  const service = new AuthorHandoffService({ origin, vault, readClipboard: clipboard,
    exchange: async (url, init) => {
      requests.push({ url, init })
      if (exchange) return exchange(url, init)
      const body = init.body ? JSON.parse(init.body as string) : null
      if (url.endsWith('/state')) return { schema_version: 1, epoch, author_actions_available: true }
      if (url.endsWith('/')) { clientId = body.client_request_id; return { request_id: requestId, expires_at: new Date(Date.now() + 600000).toISOString() } }
      if (init.method === 'DELETE') return { request_id: requestId, status: 'cancelled' }
      if (url.endsWith('/status')) return { request_id: requestId, epoch, status: 'confirmed', expires_at: new Date().toISOString(), outcome: { status: 'recovered' } }
      secret = (init.headers as Record<string, string>).Authorization
      consumption = body.consumption_id
      return { schema_version: 1, request_id: requestId, client_request_id: clientId, epoch,
        outcome: { status: 'recovered' }, registrations: [{ registration_id: registration, name: 'Example', status: 'active' }] }
    } })
  return { service, vault, requests, clipboard, requestId, secrets: () => ({ secret, consumption }) }
}
it('cannot activate review endpoints in packaged builds or for a non-loopback destination', () => {
  expect(authorReviewOrigin(true, origin)).toBe(origin)
  for (const u of ['https://api.wraeclastledger.com', 'http://localhost:43181', 'http://127.0.0.1:43181/path', 'http://x@127.0.0.1:43181', origin + '?x=1'])
    expect(authorReviewOrigin(true, u)).toBeNull()
  expect(authorReviewOrigin(false, origin)).toBeNull()
})
it('exchanges private confirmation only in main, validates correlation, and reuses consumption ID', async () => {
  const f = await setup(), c = context()
  await f.service.handle({ action: 'activate', context: c })
  const prepared = await f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  expect(prepared.ok).toBe(true)
  expect(f.clipboard).not.toHaveBeenCalled()
  const status = await f.service.handle({ action: 'status', context: c, requestId: f.requestId })
  expect(JSON.stringify(status)).not.toContain('registrations')
  const receipt = await f.service.handle({ action: 'paste', context: c, requestId: f.requestId })
  expect(receipt.ok).toBe(true)
  expect(JSON.stringify(receipt)).toContain('Example')
  const secrets = f.secrets()
  expect(JSON.stringify(receipt)).not.toContain(secrets.secret)
  expect(JSON.stringify(receipt)).not.toContain(secrets.consumption)
  const clipboardReads = f.clipboard.mock.calls.length
  expect((await f.service.handle({ action: 'accept', context: c, requestId: f.requestId })).ok).toBe(true)
  expect(f.clipboard).toHaveBeenCalledTimes(clipboardReads)
  expect(f.secrets()).toEqual(secrets)
  await f.service.handle({ action: 'paste', context: c, requestId: f.requestId })
  expect(f.secrets()).toEqual(secrets)
  const created = JSON.parse(f.requests[0].init.body as string)
  expect(created.reader_secret_hash).toBe(createHash('sha256').update('WL-AUTHOR-READER/1\0').update(Buffer.from(secrets.secret.slice(8), 'base64url')).digest('hex'))
})
it('rejects unknown receipt fields and masks even secret-bearing upstream exceptions', async () => {
  let clientId = ''
  const requestId = randomUUID()
  const f = await setup(async (url, init) => {
    if (url.endsWith('/')) { clientId = JSON.parse(init.body as string).client_request_id; return { request_id: requestId, expires_at: new Date().toISOString() } }
    return { schema_version: 1, request_id: requestId, client_request_id: clientId, epoch,
      outcome: { status: 'recovered' }, registrations: [], reader_secret: 'must-not-escape' }
  }), c = context()
  await f.service.handle({ action: 'activate', context: c })
  await f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  const r = await f.service.handle({ action: 'paste', context: c, requestId })
  expect(r.ok).toBe(false)
  expect(JSON.stringify(r)).not.toContain('must-not-escape')
  const bad = await setup(async () => { throw new Error('Handoff very-private-secret') })
  const failed = await bad.service.handle({ action: 'state' })
  expect(JSON.stringify(failed)).not.toContain('very-private-secret')
})
it('does not read the clipboard or deliver a receipt after an operation change', async () => {
  const f = await setup(), c = context()
  await f.service.handle({ action: 'activate', context: c })
  await f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  await f.service.handle({ action: 'activate', context: context() })
  expect((await f.service.handle({ action: 'paste', context: c, requestId: f.requestId })).ok).toBe(false)
  expect(f.clipboard).not.toHaveBeenCalled()
  expect(f.requests.some((r) => r.init.method === 'DELETE')).toBe(true)
})
it('rejects a delayed successful exchange after activation changed', async () => {
  let release!: (v: unknown) => void, clientId = ''
  const requestId = randomUUID()
  const f = await setup(async (url, init) => {
    if (url.endsWith('/')) { clientId = JSON.parse(init.body as string).client_request_id; return { request_id: requestId, expires_at: new Date().toISOString() } }
    if (init.method === 'DELETE') return { request_id: requestId, status: 'cancelled' }
    return new Promise((resolve) => { release = resolve })
  }), c = context()
  await f.service.handle({ action: 'activate', context: c })
  await f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  const pending = f.service.handle({ action: 'paste', context: c, requestId })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const activated = f.service.handle({ action: 'activate', context: context() })
  release({ schema_version: 1, request_id: requestId, client_request_id: clientId, epoch,
    outcome: { status: 'recovered' }, registrations: [{ registration_id: registration, name: 'Example', status: 'active' }] })
  expect((await pending).ok).toBe(false)
  expect((await activated).ok).toBe(true)
})
it('retries an ambiguous create with the same correlation, and frees unbound local slots on change', async () => {
  const f = await setup(async () => { throw new Error('offline') }), c = context()
  await f.service.handle({ action: 'activate', context: c })
  const prepare = () => f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  await prepare(); await prepare()
  expect(f.requests[0].init.body).toBe(f.requests[1].init.body)
  for (let i = 0; i < 4; i++) {
    const next = context()
    await f.service.handle({ action: 'activate', context: next })
    await f.service.handle({ action: 'prepare', context: next, operation: { kind: 'recovery', intent: null } })
  }
  expect(f.requests).toHaveLength(6)
})
it('emits an offline v5 share without a callback, and hashes the exact online envelope', async () => {
  const f = await setup(), c = context()
  const core = JSON.stringify([4, 0, null, null, null, null, null, null, null, null, null, null])
  const metadata = { author: { name: 'Example', registration_id: null }, expected_revision: null, confirmation_request_id: null }
  await f.service.handle({ action: 'activate', context: c })
  const offline = await f.service.handle({ action: 'publication', context: c, core, metadata, confirmation: false })
  expect(offline.ok).toBe(true)
  expect(f.requests).toHaveLength(0)
  if (!offline.ok) throw new Error('No token')
  const value = offline.value as { token: string; request: null }
  expect(value.request).toBeNull()
  const decoded = JSON.parse(brotliDecompressSync(Buffer.from(value.token.slice(4), 'base64url')).toString())
  expect(decoded).toEqual([5, JSON.parse(core), metadata])
  await f.service.handle({ action: 'publication', context: c, core, metadata, confirmation: true })
  expect(JSON.parse(f.requests[0].init.body as string).payload_sha256).toBe(createHash('sha256').update('WL-AUTHOR-HANDOFF/1\0').update(canonicalAuthorJson(decoded)).digest('hex'))
  const changed = await f.service.handle({ action: 'publication', context: c, core,
    metadata: { ...metadata, author: { name: 'Different', registration_id: null } }, confirmation: true })
  expect(changed.ok).toBe(false)
})
it('bounds streaming responses and rejects redirects without leaking upstream errors', async () => {
  const f = vi.fn(async (_url, init) => {
    expect(init.redirect).toBe('error')
    expect(init.credentials).toBe('omit')
    return new Response('"' + 'x'.repeat(16385) + '"')
  })
  await expect(authorJsonFetch(origin, {}, f as typeof fetch)).rejects.toThrow('Oversized')
  await expect(authorJsonFetch(origin, {}, vi.fn(async () => new Response('{"error":"private-secret"}', { status: 500 })) as typeof fetch))
    .rejects.toThrow('could not be completed')
})
it('keeps presentation preferences closed and selected management scope canonical', () => {
  expect(parseAuthorPreferences(undefined)).toEqual(emptyAuthorPreferences())
  expect(() => parseAuthorPreferences({ ...emptyAuthorPreferences(), readerSecret: 'no' })).toThrow()
  const prefs = { schemaVersion: 1, registrations: [{ registrationId: registration, name: 'Example', epoch, confirmed: true }], defaultRegistrationId: registration }
  expect(parseAuthorPreferences(JSON.parse(JSON.stringify(prefs)))).toEqual(prefs)
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  expect(validateAuthorManagement({ kind: 'reassignment', intent: { registration_id: registration, scope: { kind: 'selected', strategy_ids: [b, a] } } }))
    .toEqual({ kind: 'reassignment', intent: { registration_id: registration, scope: { kind: 'selected', strategy_ids: [a, b] } } })
  expect(() => validateAuthorManagement({ kind: 'reassignment', intent: { registration_id: registration, scope: { kind: 'selected', strategy_ids: [a, a] } } })).toThrow()
})

it('reconciles interrupted confirmations across service restarts without rotating installation identity', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wl-author-restart-'))
  directories.push(directory)
  const protection = { isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() }
  const ids: string[] = [], installs: string[] = [], cancelled: string[] = []
  const exchange = async (url: string, init: RequestInit) => {
    if (init.method === 'DELETE') {
      const requestId = url.split('/').at(-1)!
      expect((init.headers as Record<string, string>).Authorization).toMatch(/^Handoff /)
      cancelled.push(requestId)
      return { request_id: requestId, status: 'cancelled' }
    }
    const body = JSON.parse(init.body as string), requestId = randomUUID()
    installs.push(body.installation_id); ids.push(requestId)
    return { request_id: requestId, expires_at: new Date(Date.now() + 600000).toISOString() }
  }
  for (let launch = 0; launch < 4; launch++) {
    const service = new AuthorHandoffService({ origin,
      vault: new AuthorHandoffVault(directory, protection), readClipboard: () => '', exchange })
    const c = context()
    expect((await service.handle({ action: 'activate', context: c })).ok).toBe(true)
    expect((await service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })).ok).toBe(true)
  }
  expect(new Set(installs).size).toBe(1)
  expect(cancelled).toEqual(ids.slice(0, -1))
})

it.each(['expired', 'offline'])('dismisses a %s request and prepares a fresh correlation', async (failure) => {
  const created: string[] = []
  let requestId = randomUUID()
  const f = await setup(async (url, init) => {
    if (init.method === 'DELETE') {
      if (failure === 'expired') throw new AuthorExchangeError('Expired', true)
      throw new Error('network unavailable')
    }
    if (url.endsWith('/')) {
      created.push(JSON.parse(init.body as string).client_request_id)
      return { request_id: requestId, expires_at: new Date().toISOString() }
    }
    throw new Error('Old request must not be polled')
  }), c = context()
  await f.service.handle({ action: 'activate', context: c })
  await f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  const closed = await f.service.handle({ action: 'cancel', context: c, requestId })
  expect(closed.ok).toBe(failure === 'expired')
  if (!closed.ok) expect(closed.error).toContain('Closed locally')
  expect((await f.service.handle({ action: 'status', context: c, requestId })).ok).toBe(false)
  requestId = randomUUID()
  const next = context()
  await f.service.handle({ action: 'activate', context: next })
  expect((await f.service.handle({ action: 'prepare', context: next, operation: { kind: 'recovery', intent: null } })).ok).toBe(true)
  expect(created).toHaveLength(2)
  expect(created[1]).not.toBe(created[0])
})

it('marks actual HTTP expiry as terminal while leaving transient failures retryable', async () => {
  for (const [status, code, terminal] of [[410, 'handoff_expired', true], [404, 'handoff_unavailable', true], [503, 'author_service_unavailable', false]] as const) {
    const response = async () => new Response(JSON.stringify({ error: code }), { status })
    await expect(authorJsonFetch(origin, {}, response as typeof fetch)).rejects.toMatchObject({ terminal })
  }
})

it('closing invalidates a receipt already in flight even when remote cancellation fails', async () => {
  let release!: (value: unknown) => void, clientId = ''
  const requestId = randomUUID()
  const f = await setup(async (url, init) => {
    if (url.endsWith('/')) {
      clientId = JSON.parse(init.body as string).client_request_id
      return { request_id: requestId, expires_at: new Date().toISOString() }
    }
    if (init.method === 'DELETE') throw new Error('offline')
    return new Promise((resolve) => { release = resolve })
  }), c = context()
  await f.service.handle({ action: 'activate', context: c })
  await f.service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  const receipt = f.service.handle({ action: 'paste', context: c, requestId })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const closed = f.service.handle({ action: 'cancel', context: c, requestId })
  await Promise.resolve()
  release({ schema_version: 1, request_id: requestId, client_request_id: clientId, epoch,
    outcome: { status: 'recovered' }, registrations: [{ registration_id: registration, name: 'Example', status: 'active' }] })
  expect((await receipt).ok).toBe(false)
  expect((await closed).ok).toBe(false)
  expect((await f.service.handle({ action: 'accept', context: c, requestId })).ok).toBe(false)
})

it('startup discards two unbound interrupted requests and tolerates unavailable remote cancellation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wl-author-unbound-restart-'))
  directories.push(directory)
  const protection = { isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() }
  const old = new AuthorHandoffVault(directory, protection)
  const first = await old.prepare('old', randomUUID())
  await old.prepare('old', randomUUID())
  await old.bind(first.client_request_id, randomUUID())
  const calls: string[] = []
  const service = new AuthorHandoffService({ origin, vault: new AuthorHandoffVault(directory, protection),
    readClipboard: () => '', exchange: async (_url, init) => {
      calls.push(init.method!)
      if (init.method === 'DELETE') throw new AuthorExchangeError('Expired', true)
      const body = JSON.parse(init.body as string)
      expect(body.installation_id).toBe(first.installation_id)
      expect(body.client_request_id).not.toBe(first.client_request_id)
      return { request_id: randomUUID(), expires_at: new Date().toISOString() }
    } })
  const c = context()
  await service.handle({ action: 'activate', context: c })
  expect((await service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })).ok).toBe(true)
  expect(calls).toEqual(['DELETE', 'POST'])
})

it.each(['unavailable', 'corrupt'])('allows shares without confirmation with %s protected storage', async (failure) => {
  const directory = await mkdtemp(join(tmpdir(), 'wl-author-storage-'))
  directories.push(directory)
  const file = join(directory, 'author-handoffs.enc')
  const corrupt = Buffer.from('unreadable protected storage')
  if (failure === 'corrupt') await writeFile(file, corrupt)
  const protection = { isEncryptionAvailable: vi.fn(() => failure !== 'unavailable'),
    encryptString: vi.fn((v: string) => Buffer.from(v)), decryptString: vi.fn((v: Buffer) => v.toString()) }
  const exchange = vi.fn(async () => { throw new Error('Must not contact server') })
  const service = new AuthorHandoffService({ origin, vault: new AuthorHandoffVault(directory, protection),
    readClipboard: () => '', exchange })
  let c = context()
  const publication = (confirmation: boolean) => service.handle({ action: 'publication', context: c, confirmation,
    core: JSON.stringify([4, 0, null, null, null, null, null, null, null, null, null, null]),
    metadata: { author: { name: 'Example', registration_id: null }, expected_revision: null, confirmation_request_id: null } })
  expect((await service.handle({ action: 'activate', context: c })).ok).toBe(true)
  const offline = await publication(false)
  expect(offline.ok).toBe(true)
  if (!offline.ok) throw new Error('No share')
  const value = offline.value as { token: string; request: null }
  expect(value.request).toBeNull()
  const decoded = JSON.parse(brotliDecompressSync(Buffer.from(value.token.slice(4), 'base64url')).toString())
  expect(decoded[2].confirmation_request_id).toBeNull()
  expect(protection.isEncryptionAvailable).not.toHaveBeenCalled()
  expect((await publication(true)).ok).toBe(false)
  expect((await service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })).ok).toBe(false)
  const old = c
  c = context()
  expect((await service.handle({ action: 'activate', context: c })).ok).toBe(true)
  expect((await publication(false)).ok).toBe(true)
  expect((await service.handle({ action: 'prepare', context: old, operation: { kind: 'recovery', intent: null } })).ok).toBe(false)
  expect((await service.handle({ action: 'activate', context: null })).ok).toBe(true)
  expect((await publication(false)).ok).toBe(false)
  expect(exchange).not.toHaveBeenCalled()
  expect(protection.encryptString).not.toHaveBeenCalled()
  if (failure === 'corrupt') expect(await readFile(file)).toEqual(corrupt)
})

it('does not block offline sharing or revive an old operation while startup cleanup is pending', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wl-author-delayed-storage-'))
  directories.push(directory)
  const protection = { isEncryptionAvailable: () => true,
    encryptString: (v: string) => Buffer.from(v), decryptString: (v: Buffer) => v.toString() }
  const vault = new AuthorHandoffVault(directory, protection)
  const old = await vault.prepare('prior process', randomUUID()), requestId = randomUUID()
  await vault.bind(old.client_request_id, requestId)
  let release!: (value: unknown) => void
  const exchange = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.method === 'DELETE') return new Promise((resolve) => { release = resolve })
    throw new Error('Stale operation must not create a request')
  })
  const service = new AuthorHandoffService({ origin, vault, exchange, readClipboard: () => '' })
  const c = context()
  await service.handle({ action: 'activate', context: c })
  const pending = service.handle({ action: 'prepare', context: c, operation: { kind: 'recovery', intent: null } })
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const next = context()
  expect((await service.handle({ action: 'activate', context: next })).ok).toBe(true)
  expect((await service.handle({ action: 'publication', context: next, confirmation: false,
    core: JSON.stringify([4, 0, null, null, null, null, null, null, null, null, null, null]),
    metadata: { author: { name: 'Example', registration_id: null }, expected_revision: null, confirmation_request_id: null } })).ok).toBe(true)
  release({ request_id: requestId, status: 'cancelled' })
  expect((await pending).ok).toBe(false)
  expect(exchange).toHaveBeenCalledTimes(1)
})
