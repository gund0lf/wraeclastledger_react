import { afterEach, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { brotliDecompressSync } from 'node:zlib'
import { defaultShareConfirmation, parseShareIntent, selectShareIntent } from '../../../shared/shareIntent'
import { FileSessionRepository } from '../../../main/sessionRepository'
import { AuthorHandoffService } from '../../../main/authorHandoffService'
import { AuthorHandoffVault } from '../../../main/authorHandoffVault'
import { deriveRepositoryPaths, deriveSessionDirectory } from '../../../main/sessionRepositoryCore'
import { LEGACY_STORE_STORAGE_KEY, LEGACY_LAYOUT_STORAGE_KEY, LEGACY_CHANGELOG_STORAGE_KEY } from '../../../shared/sessionMigration'
import { migrateSessionEnvelope } from '../repository/legacySessionMigration'
import { assertSessionRepositoryResponse, parseSessionRepositoryRequest } from '../../../shared/sessionRepositoryIpc'
import { assertSessionBodyV1 } from '../../../shared/sessionRecord'

const roots: string[] = []
const repositories: FileSessionRepository[] = []
afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.releaseLock()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const core = JSON.stringify([4, 0, null, null, null, null, null, null, null, null, null, null])
const metadata = { author: { name: 'Example', registration_id: null as string | null },
  expected_revision: null, confirmation_request_id: null }
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'wl-share-intent-'))
  roots.push(root)
  const repository = new FileSessionRepository({ userDataPath: root })
  repositories.push(repository)
  const plan = await migrateSessionEnvelope({ store: { key: LEGACY_STORE_STORAGE_KEY,
    rawValue: await readFile(new URL('./__fixtures__/wp14/active-named-dirty-envelope.json', import.meta.url), 'utf8') },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: '{"fixture":"layout"}' },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' } },
  { repositoryId: 'intent-test', operationId: 'intent-migration', now: new Date('2026-10-01T00:00:00Z') })
  const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan })
  const target = bootstrap.workflow.viewedTarget
  const viewed = await repository.load({ operation: 'load', target, mode: 'inspect' })
  assertSessionRepositoryResponse({ ok: true, operation: 'load', data: viewed })
  const context = { sessionId: (target.kind === 'working' ? 'working' : target.sessionId) + ':1', generation: randomUUID() }
  return { root, repository, context, target, sessionIdentity: viewed.sessionIdentity! }
}
it('keeps a canonical immutable snapshot; registration confirmation does not make a new intent', () => {
  const createId = vi.fn(randomUUID)
  const first = selectShareIntent(null, 'session', core, metadata, false, createId)
  expect(selectShareIntent(first, 'session', core, { ...metadata,
    author: { name: 'Example', registration_id: randomUUID() } }, false, createId)).toEqual(first)
  expect(createId).toHaveBeenCalledTimes(1)
  expect(() => selectShareIntent(first, 'session', core, { ...metadata,
    author: { name: 'Different', registration_id: null } }, false, createId)).toThrow('explicitly')
  const changed = JSON.stringify([4, 0, 'changed', null, null, null, null, null, null, null, null, null])
  expect(() => selectShareIntent(first, 'session', changed, metadata, false, createId)).toThrow('explicitly')
  const deliberate = selectShareIntent(first, 'session', core, metadata, true, createId)
  expect(deliberate.intentId).not.toBe(first.intentId)
  expect(deliberate.core).toBe(first.core)
  expect(() => parseShareIntent({ ...first, token: 'not-persistable' })).toThrow()
})
it.each([[false, false, true], [false, true, false], [true, false, true], [true, true, true]])(
  'defaults confirmation for continuation=%s saved=%s to %s', (continuation, saved, expected) => {
    expect(defaultShareConfirmation(continuation, saved)).toBe(expected)
  })
it('serializes concurrent preparations and keeps the durable intent after a repository restart', async () => {
  const f = await setup()
  const results = await Promise.all(Array.from({ length: 4 }, () =>
    f.repository.prepareShareIntent(f.context.sessionId, core, metadata, false)))
  expect(new Set(results.map(r => r.intentId)).size).toBe(1)
  await f.repository.releaseLock()
  const restarted = new FileSessionRepository({ userDataPath: f.root })
  repositories.push(restarted)
  await restarted.bootstrap({ operation: 'bootstrap' })
  const again = await restarted.prepareShareIntent(f.context.sessionId.replace(':1', ':2'), core, metadata, false)
  expect(again).toEqual(results[0])
  const deliberate = await restarted.prepareShareIntent(f.context.sessionId, core, metadata, true)
  expect(deliberate.intentId).not.toBe(again.intentId)
})
it('refuses another selected session and corrupt intent state without replacing it', async () => {
  const f = await setup()
  await expect(f.repository.prepareShareIntent('different:1', core, metadata, false)).rejects.toThrow('selected session')
  const first = await f.repository.prepareShareIntent(f.context.sessionId, core, metadata, false)
  const directory = f.target.kind === 'working' ? join(f.root, 'ledger-data', 'working')
    : deriveSessionDirectory(join(f.root, 'ledger-data'), first.sessionId)
  const file = join(directory, 'share-intent', 'current.wlrec')
  await writeFile(file, 'synthetic damaged record')
  await expect(f.repository.prepareShareIntent(f.context.sessionId, core, metadata, true)).rejects.toThrow()
  expect(await readFile(file, 'utf8')).toBe('synthetic damaged record')
})
it('production handoff persists before Copy; re-preparation and confirmation refresh retain the v6 intent', async () => {
  const f = await setup()
  const exchange = vi.fn(async (_url: string, init: RequestInit) => init.method === 'DELETE'
    ? { request_id: '11111111-1111-4111-8111-111111111111', status: 'cancelled' }
    : { request_id: randomUUID(), expires_at: new Date(Date.now() + 600000).toISOString() })
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181',
    vault: new AuthorHandoffVault(join(f.root, 'vault'), { isEncryptionAvailable: () => true,
      encryptString: v => Buffer.from(v), decryptString: v => v.toString() }),
    readClipboard: () => { throw Error('No implicit clipboard') }, exchange,
    shareIntent: (...args) => f.repository.prepareShareIntent(...args) })
  const prepare = async (confirmation: boolean, context = f.context) => {
    await service.handle({ action: 'activate', context })
    const result = await service.handle({ action: 'publication', context, core, metadata, confirmation, newIntent: false,
      sessionIdentity: f.sessionIdentity })
    expect(result.ok).toBe(true)
    if (!result.ok) throw Error(result.error)
    const wire = result.value as { token: string }
    return JSON.parse(brotliDecompressSync(Buffer.from(wire.token.slice(4), 'base64url')).toString())
  }
  await service.handle({ action: 'activate', context: f.context })
  for (const sessionIdentity of [undefined, '', 'stale-view', 'x'.repeat(129)]) {
    const refused = await service.handle({ action: 'publication', context: f.context, core, metadata,
      confirmation: true, newIntent: false, sessionIdentity })
    expect(refused.ok).toBe(false)
  }
  expect(exchange).not.toHaveBeenCalled()
  const first = await prepare(false)
  expect(first[0]).toBe(6)
  expect(await prepare(false)).toEqual(first)
  const confirmed = await prepare(true)
  expect(confirmed[2].share_intent_id).toBe(first[2].share_intent_id)
  expect(confirmed[2].confirmation_request_id).not.toBeNull()
  const refreshed = await prepare(true, { ...f.context, generation: randomUUID() })
  expect(refreshed[2].share_intent_id).toBe(first[2].share_intent_id)
  expect(refreshed[2].confirmation_request_id).not.toBe(confirmed[2].confirmation_request_id)
})
it('an uncertain confirmation preparation keeps its persisted identity for a retry', async () => {
  const f = await setup()
  const exchange = vi.fn().mockRejectedValueOnce(Error('synthetic offline'))
    .mockResolvedValue({ request_id: randomUUID(), expires_at: new Date(Date.now() + 600000).toISOString() })
  const service = new AuthorHandoffService({ origin: 'http://127.0.0.1:43181',
    vault: new AuthorHandoffVault(join(f.root, 'vault'), { isEncryptionAvailable: () => true,
      encryptString: v => Buffer.from(v), decryptString: v => v.toString() }),
    readClipboard: () => { throw Error('No clipboard') }, exchange,
    shareIntent: (...args) => f.repository.prepareShareIntent(...args) })
  await service.handle({ action: 'activate', context: f.context })
  const request = { action: 'publication', context: f.context, core, metadata, confirmation: true,
    sessionIdentity: f.sessionIdentity }
  expect((await service.handle({ ...request, newIntent: true })).ok).toBe(false)
  const persisted = await f.repository.prepareShareIntent(f.context.sessionId, core, metadata, false)
  const retry = await service.handle({ ...request, newIntent: false })
  expect(retry.ok).toBe(true)
  if (!retry.ok) throw Error(retry.error)
  const decoded = JSON.parse(brotliDecompressSync(Buffer.from((retry.value as { token: string }).token.slice(4), 'base64url')).toString())
  expect(decoded[2].share_intent_id).toBe(persisted.intentId)
})

it('keeps the same publication when an unnamed session is named or a saved session is duplicated', async () => {
  const f = await setup()
  const working = { kind: 'working' } as const
  await f.repository.save({ operation: 'save', target: working, expectedGeneration: null, payload: { maps: [] } })
  const loaded = await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  const first = await f.repository.prepareShareIntent('working:1', core, metadata, false)
  expect(first.sessionId).toMatch(/^working:/)
  const named = await f.repository.save(parseSessionRepositoryRequest({ operation: 'save',
    target: { kind: 'new', name: 'Synthetic named' }, expectedGeneration: null,
    payload: loaded.payload, inheritShareIntentFrom: working }) as Parameters<FileSessionRepository['save']>[0])
  if (named.target.kind !== 'session') throw Error('Expected named session')
  const second = await f.repository.prepareShareIntent(named.target.sessionId + ':2', core, metadata, false)
  expect(second.intentId).toBe(first.intentId)
  const duplicate = await f.repository.save({ operation: 'save', target: { kind: 'new', name: 'Synthetic duplicate' },
    expectedGeneration: null, payload: loaded.payload, inheritShareIntentFrom: named.target })
  if (duplicate.target.kind !== 'session') throw Error('Expected duplicate session')
  const third = await f.repository.prepareShareIntent(duplicate.target.sessionId + ':3', core, metadata, false)
  expect(third.intentId).toBe(first.intentId)
  const portable = (await f.repository.exportDocument({ operation: 'export', sessionIds: [duplicate.target.sessionId] })).document
  expect(portable).not.toContain(first.intentId)
  expect(portable).not.toContain('share_intent_id')
  await expect(f.repository.save({ operation: 'save', target: { kind: 'new', name: 'Stale copy' },
    expectedGeneration: null, payload: { maps: ['changed'] }, inheritShareIntentFrom: duplicate.target }))
    .rejects.toThrow('source session changed')
  expect(() => parseSessionRepositoryRequest({ operation: 'save', target: working,
    expectedGeneration: 1, payload: {}, inheritShareIntentFrom: working })).toThrow('named copy')
})

it('persists inherited intent before the new session commit and retries without minting another intent', async () => {
  const f = await setup()
  const original = await f.repository.prepareShareIntent(f.context.sessionId, core, metadata, false)
  const loaded = await f.repository.load({ operation: 'load', target: f.target, mode: 'inspect' })
  await f.repository.releaseLock()
  let failCommit = true
  const restarted = new FileSessionRepository({ userDataPath: f.root, onSessionCommit: async () => {
    if (failCommit) throw Error('synthetic interruption after intent')
  } })
  repositories.push(restarted)
  await restarted.bootstrap({ operation: 'bootstrap' })
  const request = { operation: 'save' as const, target: { kind: 'new' as const, name: 'Synthetic retry' },
    expectedGeneration: null, payload: loaded.payload, inheritShareIntentFrom: f.target }
  await expect(restarted.save(request)).rejects.toThrow('synthetic interruption')
  await restarted.releaseLock()
  const recovered = new FileSessionRepository({ userDataPath: f.root })
  repositories.push(recovered)
  const recovery = await recovered.bootstrap({ operation: 'bootstrap' })
  expect(recovery.sessions.filter(s => s.status === 'damaged')).toHaveLength(1)
  failCommit = false
  const saved = await recovered.save(request)
  if (saved.target.kind !== 'session') throw Error('Expected named copy')
  expect((await recovered.prepareShareIntent(saved.target.sessionId + ':2', core, metadata, false)).intentId)
    .toBe(original.intentId)
})

it('New Session does not reuse the previous unnamed publication after that run was named', async () => {
  const f = await setup(), working = { kind: 'working' } as const
  const firstSave = await f.repository.save({ operation: 'save', target: working, expectedGeneration: null,
    payload: { maps: ['synthetic run'] } })
  await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  const first = await f.repository.prepareShareIntent('working:1', core, metadata, false)
  const named = await f.repository.save({ operation: 'save', target: { kind: 'new', name: 'Synthetic preserved' },
    expectedGeneration: null, payload: { maps: ['synthetic run'] }, inheritShareIntentFrom: working })
  await f.repository.save({ operation: 'save', target: working, expectedGeneration: firstSave.generation,
    payload: { maps: [] }, replacement: true, freshEmptyWorking: true })
  await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  const next = await f.repository.prepareShareIntent('working:2', core, metadata, false)
  expect(next.intentId).not.toBe(first.intentId)
  if (named.target.kind !== 'session') throw Error('Expected named copy')
  await f.repository.load({ operation: 'load', target: named.target, mode: 'view' })
  expect((await f.repository.prepareShareIntent(named.target.sessionId + ':3', core, metadata, false)).intentId).toBe(first.intentId)
})

it('Recently Deleted restores a working share as a named session without losing its intent across save and restart', async () => {
  const f = await setup(), working = { kind: 'working' } as const
  const old = await f.repository.save({ operation: 'save', target: working, expectedGeneration: null,
    payload: { maps: ['synthetic recoverable run'] } })
  await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  const first = await f.repository.prepareShareIntent('working:1', core, metadata, false)
  await f.repository.save({ operation: 'save', target: working, expectedGeneration: old.generation,
    payload: { maps: [] }, replacement: true, freshEmptyWorking: true })
  const trash = await f.repository.trashList({ operation: 'trash-list' })
  expect(trash.entries).toHaveLength(1)
  const restored = await f.repository.trashRestore({ operation: 'trash-restore', recoveryId: trash.entries[0].recoveryId })
  const target = { kind: 'session', sessionId: restored.restoredSessionId } as const
  const loaded = await f.repository.load({ operation: 'load', target, mode: 'view' })
  const context = target.sessionId + ':2'
  expect((await f.repository.prepareShareIntent(context, core, metadata, false)).intentId).toBe(first.intentId)
  await f.repository.save({ operation: 'save', target, expectedGeneration: loaded.generation, payload: loaded.payload })
  await f.repository.releaseLock()
  const restarted = new FileSessionRepository({ userDataPath: f.root })
  repositories.push(restarted)
  await restarted.bootstrap({ operation: 'bootstrap' })
  expect((await restarted.prepareShareIntent(context, core, metadata, false)).intentId).toBe(first.intentId)
  const exported = (await restarted.exportDocument({ operation: 'export', sessionIds: [target.sessionId] })).document
  expect(exported).not.toContain('shareIntentScope')
  expect(exported).not.toContain(first.intentId)
})

it('validates the optional local intent scope without adding it to the portable payload', () => {
  const body = { kind: 'named', id: 'synthetic', name: 'Synthetic', createdAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z', generation: 1, semanticHash: 'a'.repeat(64), summary: {}, payload: {} }
  expect(() => assertSessionBodyV1(body)).not.toThrow()
  expect(() => assertSessionBodyV1({ ...body, shareIntentScope: 'working:synthetic' })).not.toThrow()
  for (const shareIntentScope of ['', 'a'.repeat(129), null, 1])
    expect(() => assertSessionBodyV1({ ...body, shareIntentScope })).toThrow('shareIntentScope')
})

it('does not attach an old-view share queued behind an in-flight working replacement', async () => {
  const f = await setup(), working = { kind: 'working' } as const
  const saved = await f.repository.save({ operation: 'save', target: working, expectedGeneration: null,
    payload: { maps: ['old visible run'] } })
  assertSessionRepositoryResponse({ ok: true, operation: 'save', data: saved })
  await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  await f.repository.releaseLock()
  let arrived!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { arrived = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  const repository = new FileSessionRepository({ userDataPath: f.root, onSessionCommit: async () => {
    arrived(); await held
  } })
  repositories.push(repository)
  await repository.bootstrap({ operation: 'bootstrap' })
  const replacement = repository.save({ operation: 'save', target: working, expectedGeneration: saved.generation,
    payload: { maps: [] }, replacement: true, freshEmptyWorking: true })
  await entered
  // The existing New Session UI can still show the old view while this commit waits.
  const stale = repository.prepareShareIntent('working:1', core, metadata, false, saved.sessionIdentity)
  const refusal = expect(stale).rejects.toThrow('selected session')
  release()
  await replacement
  await refusal
  const current = await repository.load({ operation: 'load', target: working, mode: 'inspect' })
  expect(current.sessionIdentity).not.toBe(saved.sessionIdentity)
  const differentCore = JSON.stringify([4, 0, 'new run', null, null, null, null, null, null, null, null, null])
  await expect(repository.prepareShareIntent('working:2', differentCore, metadata, false, current.sessionIdentity))
    .resolves.toMatchObject({ core: differentCore })
})

it('keeps replay identity when a Recently Deleted named session collides with an existing identity', async () => {
  const f = await setup()
  if (f.target.kind !== 'session') throw Error('Expected named fixture')
  await f.repository.save({ operation: 'save', target: { kind: 'working' }, expectedGeneration: null, payload: { maps: [] } })
  const first = await f.repository.prepareShareIntent(f.context.sessionId, core, metadata, false)
  const loaded = await f.repository.load({ operation: 'load', target: f.target, mode: 'inspect' })
  const deleted = await f.repository.delete({ operation: 'delete', sessionId: f.target.sessionId,
    expectedGeneration: loaded.generation })
  await f.repository.releaseLock()
  // Synthetic restored-backup collision, entirely inside this disposable profile.
  await cp(join(deriveRepositoryPaths(f.root).trash, deleted.recoveryId),
    deriveSessionDirectory(join(f.root, 'ledger-data'), f.target.sessionId), { recursive: true, errorOnExist: true })
  const repository = new FileSessionRepository({ userDataPath: f.root })
  repositories.push(repository)
  await repository.bootstrap({ operation: 'bootstrap' })
  const restored = await repository.trashRestore({ operation: 'trash-restore', recoveryId: deleted.recoveryId })
  expect(restored.restoredSessionId).not.toBe(f.target.sessionId)
  const target = { kind: 'session', sessionId: restored.restoredSessionId } as const
  const view = await repository.load({ operation: 'load', target, mode: 'view' })
  expect((await repository.prepareShareIntent(target.sessionId + ':2', core, metadata, false, view.sessionIdentity)).intentId)
    .toBe(first.intentId)
})

it('retries an interrupted working-to-named conversion after restart without losing its share identity', async () => {
  const f = await setup(), working = { kind: 'working' } as const
  const saved = await f.repository.save({ operation: 'save', target: working, expectedGeneration: null,
    payload: { maps: ['recoverable run'] } })
  await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  const first = await f.repository.prepareShareIntent('working:1', core, metadata, false)
  await f.repository.save({ operation: 'save', target: working, expectedGeneration: saved.generation,
    payload: { maps: [] }, replacement: true, freshEmptyWorking: true })
  const trash = await f.repository.trashList({ operation: 'trash-list' })
  await f.repository.releaseLock()
  const interrupted = new FileSessionRepository({ userDataPath: f.root, onTrashRestoreBoundary: () => {
    throw Error('synthetic interruption after identity conversion')
  } })
  repositories.push(interrupted)
  await interrupted.bootstrap({ operation: 'bootstrap' })
  await expect(interrupted.trashRestore({ operation: 'trash-restore', recoveryId: trash.entries[0].recoveryId }))
    .rejects.toThrow('synthetic interruption')
  await interrupted.releaseLock()
  const repository = new FileSessionRepository({ userDataPath: f.root })
  repositories.push(repository)
  await repository.bootstrap({ operation: 'bootstrap' })
  const restored = await repository.trashRestore({ operation: 'trash-restore', recoveryId: trash.entries[0].recoveryId })
  const target = { kind: 'session', sessionId: restored.restoredSessionId } as const
  const view = await repository.load({ operation: 'load', target, mode: 'view' })
  expect((await repository.prepareShareIntent(target.sessionId + ':2', core, metadata, false, view.sessionIdentity)).intentId)
    .toBe(first.intentId)
})
