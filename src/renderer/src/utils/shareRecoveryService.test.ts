import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { AuthorHandoffVault, ProtectedShareStorageError } from '../../../main/authorHandoffVault'
import { AuthorHandoffService } from '../../../main/authorHandoffService'
import { DurableShareTracker } from '../../../main/durableShareTracker'
import type { ActiveDurableShareView } from '../../../shared/durableShare'

const dirs: string[] = [], services: AuthorHandoffService[] = []
afterEach(async () => {
  services.splice(0).forEach(service => service.stopOperationTracking())
  vi.restoreAllMocks()
  vi.useRealTimers()
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true })
})
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'wl-share-recovery-ipc-')); dirs.push(dir)
  const old = Buffer.from('synthetic unreadable history')
  await writeFile(join(dir, 'author-handoffs.enc'), old)
  const now = Date.now(), epoch = randomUUID(), identity = randomUUID()
  const protection = { isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value), decryptString: (value: Buffer) => value.toString() }
  const vault = new AuthorHandoffVault(dir, protection, () => now)
  let createdAt: number | null = now - 1000
  const readAge = vi.fn(async () => createdAt)
  const core = JSON.stringify([4, 0, ...Array(10).fill(null)])
  const exchange = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/state')) return { schema_version: 1, epoch, author_actions_available: true }
    if (url.endsWith('/shares') && init.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      return { id: body.id, epoch: body.epoch, draft_revision: body.draft_revision,
        kind: body.kind, state: 'ready', outcome: null }
    }
    throw new Error('Unexpected synthetic exchange')
  })
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181', vault, exchange,
    readClipboard: () => '', readShareCore: async () => ({ core }), readSessionCreatedAt: readAge })
  services.push(service)
  const context = { sessionId: 'working:1', generation: randomUUID() }
  await service.handle({ action: 'activate', context })
  const request = { action: 'publication', context, core, confirmation: false, newIntent: false,
    sessionIdentity: identity, metadata: { author: { name: 'Synthetic name', registration_id: null },
      expected_revision: null, confirmation_request_id: null } }
  const preview = async () => {
    const result = await service.handle({ action: 'storage-recovery-preview', context })
    expect(result.ok).toBe(true)
    return (result as { ok: true; value: { recoveryId: string } }).value.recoveryId
  }
  const recover = async () => service.handle({ action: 'storage-recovery-confirm', context,
    recoveryId: await preview(), confirmed: true })
  return { dir, old, vault, service, context, exchange, now, request, readAge, preview, recover,
    setAge: (value: number | null) => { createdAt = value } }
}

it('opening, observing and retrying a damaged store never recovers it or contacts a provider', async () => {
  const f = await setup()
  for (let count = 0; count < 2; count++) {
    expect(await f.service.handle(f.request)).toMatchObject({ ok: false, storageCode: 'damaged' })
    expect(await f.service.handle({ action: 'share-result', context: f.context,
      sessionIdentity: f.request.sessionIdentity, targetGeneration: null })).toMatchObject({ ok: false, storageCode: 'damaged' })
  }
  await expect(f.service.startOperationTracking()).rejects.toMatchObject({ code: 'damaged' })
  await f.preview()
  expect(await readFile(join(f.dir, 'author-handoffs.enc'))).toEqual(f.old)
  expect(await readdir(f.dir)).toEqual(['author-handoffs.enc'])
  expect(f.exchange).not.toHaveBeenCalled()
})

it('local recovery requires exact confirmation bound to the reviewed active context', async () => {
  const f = await setup(), recoveryId = await f.preview()
  const confirm = { action: 'storage-recovery-confirm', context: f.context, recoveryId }
  for (const request of [confirm, { ...confirm, confirmed: false }, { ...confirm, confirmed: true, extra: true },
    { ...confirm, confirmed: true, recoveryId: randomUUID() }])
    expect((await f.service.handle(request)).ok).toBe(false)
  expect(await readFile(join(f.dir, 'author-handoffs.enc'))).toEqual(f.old)
  await f.service.handle({ action: 'activate', context: { ...f.context, generation: randomUUID() } })
  expect((await f.service.handle({ ...confirm, confirmed: true })).ok).toBe(false)
  await f.service.handle({ action: 'activate', context: f.context })
  expect((await f.service.handle({ ...confirm, confirmed: true })).ok).toBe(false)
  expect(await f.recover()).toEqual({ ok: true, value: { recoveredAt: f.now } })
  expect((await f.service.handle({ ...confirm, confirmed: true })).ok).toBe(false)
  expect(f.exchange).not.toHaveBeenCalled()
})

it('recovery clears an old observer fault and new sessions share without an override', async () => {
  const f = await setup()
  await expect(f.service.startOperationTracking()).rejects.toMatchObject({ code: 'damaged' })
  expect(await f.service.handle({ action: 'share-refresh' })).toMatchObject({ ok: false, storageCode: 'damaged' })
  expect(await f.recover()).toEqual({ ok: true, value: { recoveredAt: f.now } })
  expect(await f.service.handle({ action: 'share-results' })).toEqual({ ok: true, value: [] })
  f.setAge(f.now + 1)
  expect(await f.service.handle(f.request)).toMatchObject({ ok: true, value: { share: { status: 'ready' } } })
  expect(f.exchange.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'PUT'])
})

it.each([null, -1, 0])('older or unknown session age %s requires explicit override before network traffic', async age => {
  const f = await setup()
  await f.recover(); f.setAge(age)
  const refused = await f.service.handle(f.request)
  expect(refused).toMatchObject({ ok: false, recoveryConfirmationRequired: true,
    error: expect.stringContaining('Share as new anyway?') })
  expect(f.exchange).not.toHaveBeenCalled()
  // Neither a renderer-supplied creation date nor a false confirmation bypasses it.
  expect((await f.service.handle({ ...f.request, sessionCreatedAt: f.now + 1000 })).ok).toBe(false)
  expect((await f.service.handle({ ...f.request, recoveryConfirmed: false })).ok).toBe(false)
  expect(f.exchange).not.toHaveBeenCalled()
  const first = await f.service.handle({ ...f.request, recoveryConfirmed: true })
  expect(first).toMatchObject({ ok: true, value: { share: { draftRevision: 1 } } })
  const repeated = await f.service.handle(f.request)
  expect(repeated).toEqual(first)
  expect(f.exchange.mock.calls.filter(([, init]) => init.method === 'PUT')).toHaveLength(1)
})

it.each(['evidence', 'replace'] as const)('Browser %s remains available for older sessions', async kind => {
  const f = await setup(); await f.recover()
  const strategy = randomUUID(), registration = randomUUID()
  const tuple = JSON.parse(f.request.core); tuple[1] = kind === 'replace' ? [1, strategy] : [2, strategy, 1]
  expect(await f.service.handle({ ...f.request, core: JSON.stringify(tuple), targetGeneration: randomUUID(),
    metadata: { author: { name: 'Synthetic name', registration_id: registration },
      expected_revision: 1, confirmation_request_id: null } })).toMatchObject({ ok: true })
})

it('changing the selected context while recovery waits aborts before changing old files', async () => {
  const f = await setup(), recoveryId = await f.preview()
  let release!: () => void
  vi.spyOn(DurableShareTracker.prototype, 'pauseForRecovery').mockImplementationOnce(() =>
    new Promise<void>(resolve => { release = resolve }))
  const pending = f.service.handle({ action: 'storage-recovery-confirm', context: f.context, recoveryId, confirmed: true })
  expect(release).toBeTypeOf('function')
  expect(await f.service.handle({ action: 'share-refresh' })).toMatchObject({ ok: false,
    error: 'Sharing recovery is in progress. Wait for it to finish.' })
  await f.service.handle({ action: 'activate', context: null })
  release()
  expect((await pending).ok).toBe(false)
  expect(await readFile(join(f.dir, 'author-handoffs.enc'))).toEqual(f.old)
  expect(f.exchange).not.toHaveBeenCalled()
})

async function setupTrackingRecovery() {
  vi.useFakeTimers()
  const context = { sessionId: 'synthetic-session', generation: randomUUID() }
  const recoveryId = randomUUID()
  const view: ActiveDurableShareView = { id: randomUUID(), draftRevision: 1, copiedRevision: 1, core: '[]',
    author: { name: 'Synthetic name', registration_id: null },
    operation: { kind: 'publication', strategy_id: null, revision: null }, targetGeneration: null,
    status: 'ready', accepted: false, outcome: null, noticed: false }
  let releaseRead!: () => void
  const firstRead = new Promise<void>(resolve => { releaseRead = resolve })
  const exchange = vi.fn(async () => null).mockImplementationOnce(async () => { await firstRead; return null })
  const vault = {
    discardInterrupted: vi.fn(async () => undefined),
    durableTrackingShares: vi.fn(async () => [{ view: structuredClone(view), pollingActivityAt: Date.now() }]),
    observeDurable: vi.fn(async (_id: string, read: (authorization: string) => Promise<unknown>) => {
      await read('synthetic-reader')
      return structuredClone(view)
    }),
    previewRecovery: vi.fn(async () => ({ recoveryId })),
    confirmRecovery: vi.fn(async () => { throw new ProtectedShareStorageError('io') })
  }
  // Only persistence and transport are fakes. The service owns the real observer,
  // including its timer, in-flight drain and enabled/disabled lifecycle.
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181',
    vault: vault as unknown as AuthorHandoffVault, exchange, readClipboard: () => '' })
  services.push(service)
  await service.handle({ action: 'activate', context })
  await service.startOperationTracking()
  await vi.advanceTimersByTimeAsync(0)
  expect(exchange).toHaveBeenCalledTimes(1)
  expect(await service.handle({ action: 'storage-recovery-preview', context }))
    .toEqual({ ok: true, value: { recoveryId } })
  const confirm = () => service.handle({ action: 'storage-recovery-confirm', context, recoveryId, confirmed: true })
  return { service, vault, exchange, releaseRead, confirm }
}

it.each(['cancelled', 'failed'] as const)('the real observer resumes after %s recovery', async reason => {
  const f = await setupTrackingRecovery()
  const pending = f.confirm()
  expect(f.vault.confirmRecovery).not.toHaveBeenCalled()
  if (reason === 'cancelled') await f.service.handle({ action: 'activate', context: null })
  f.releaseRead()
  const result = await pending
  if (reason === 'cancelled') {
    expect(result).toMatchObject({ ok: false })
    expect(f.vault.confirmRecovery).not.toHaveBeenCalled()
  } else {
    expect(result).toEqual({ ok: false, storageCode: 'io', error: new ProtectedShareStorageError('io').message })
    expect(f.vault.confirmRecovery).toHaveBeenCalledTimes(1)
  }
  await vi.advanceTimersByTimeAsync(1000)
  expect(f.exchange).toHaveBeenCalledTimes(2)
  expect(await f.service.handle({ action: 'share-results' }))
    .toMatchObject({ ok: true, value: [{ status: 'ready' }] })
})

it.each(['cancelled', 'failed'] as const)('a lifecycle stop during %s recovery stays stopped', async reason => {
  const f = await setupTrackingRecovery()
  const pending = f.confirm()
  f.service.stopOperationTracking()
  if (reason === 'cancelled') await f.service.handle({ action: 'activate', context: null })
  f.releaseRead()
  expect((await pending).ok).toBe(false)
  // Waking a stopped observer must not undo the app lifecycle's decision either.
  expect(await f.service.handle({ action: 'share-refresh' })).toEqual({ ok: true, value: null })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(f.exchange).toHaveBeenCalledTimes(1)
})

it('a restart storage error never replaces the original recovery failure', async () => {
  const f = await setupTrackingRecovery()
  f.vault.durableTrackingShares.mockRejectedValueOnce(new ProtectedShareStorageError('damaged'))
  const pending = f.confirm()
  f.releaseRead()
  expect(await pending).toEqual({ ok: false, storageCode: 'io', error: new ProtectedShareStorageError('io').message })
  expect(await f.service.handle({ action: 'share-results' }))
    .toEqual({ ok: false, storageCode: 'damaged', error: new ProtectedShareStorageError('damaged').message })
  expect(f.exchange).toHaveBeenCalledTimes(1)
})
