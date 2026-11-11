import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { FileSessionRepository } from '../../../main/sessionRepository'
import { LEGACY_STORE_STORAGE_KEY, LEGACY_LAYOUT_STORAGE_KEY, LEGACY_CHANGELOG_STORAGE_KEY } from '../../../shared/sessionMigration'
import { migrateSessionEnvelope } from '../repository/legacySessionMigration'

const profiles: string[] = []
const repositories: FileSessionRepository[] = []
const OLD = '2026-07-01T00:28:22.000Z'
const NEW = '2026-11-11T13:00:00.000Z'

afterEach(async () => {
  for (const repository of repositories.splice(0)) await repository.releaseLock()
  for (const profile of profiles.splice(0)) await rm(profile, { recursive: true, force: true })
})

async function setup(createdAt = OLD) {
  const profile = await mkdtemp(join(tmpdir(), 'wl-share-recovery-session-'))
  profiles.push(profile)
  const envelope = JSON.parse(await readFile(new URL('./__fixtures__/wp14/active-named-dirty-envelope.json', import.meta.url), 'utf8'))
  const selected = envelope.state.savedSessions[envelope.state.activeSessionId]
  selected.createdAt = createdAt
  let beforeCommit: (() => Promise<void>) | undefined
  let clock = new Date(NEW)
  const repository = new FileSessionRepository({ userDataPath: profile, openPath: async () => '',
    now: () => clock, onSessionCommit: async () => { await beforeCommit?.() } })
  repositories.push(repository)
  const migrationPlan = migrateSessionEnvelope({
    store: { key: LEGACY_STORE_STORAGE_KEY, rawValue: JSON.stringify(envelope) },
    layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: '{}' },
    changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: '1.0.79' },
  }, { repositoryId: 'share-recovery-age', operationId: 'share-recovery-age-migration', now: new Date(NEW) })
  const bootstrap = await repository.bootstrap({ operation: 'bootstrap', migrationPlan: await migrationPlan })
  const target = bootstrap.workflow.viewedTarget
  const viewed = await repository.load({ operation: 'load', target, mode: 'inspect' })
  const context = (target.kind === 'working' ? 'working' : target.sessionId) + ':1'
  return { repository, target, viewed, context,
    holdCommit: (callback: () => Promise<void>) => { beforeCommit = callback },
    setClock: (value: string) => { clock = new Date(value) } }
}

it('reads creation time from the selected durable session for old and newly created sessions', async () => {
  const f = await setup()
  expect(await f.repository.readShareSessionCreatedAt(f.context, f.viewed.sessionIdentity!)).toBe(Date.parse(OLD))
  const created = await f.repository.save({ operation: 'save', target: { kind: 'new', name: 'New run' },
    expectedGeneration: null, payload: { maps: [] } })
  if (created.target.kind !== 'session') throw Error('Expected named test session')
  expect(await f.repository.readShareSessionCreatedAt(created.target.sessionId + ':2', created.sessionIdentity!))
    .toBe(Date.parse(NEW))
  const loaded = await f.repository.load({ operation: 'load', target: f.target, mode: 'view' })
  expect(await f.repository.readShareSessionCreatedAt(f.context, loaded.sessionIdentity!)).toBe(Date.parse(OLD))
})

it('refuses a different selected session or identity rather than supplying an age for it', async () => {
  const f = await setup()
  await expect(f.repository.readShareSessionCreatedAt('different:1', f.viewed.sessionIdentity!))
    .rejects.toThrow('selected session changed')
  await expect(f.repository.readShareSessionCreatedAt(f.context, 'different-session'))
    .rejects.toThrow('selected session changed')
})

it('does not treat a normalized invalid calendar date as proof of a new session', async () => {
  const f = await setup('2026-02-30T00:00:00.000Z')
  expect(await f.repository.readShareSessionCreatedAt(f.context, f.viewed.sessionIdentity!)).toBeNull()
})

it('accepts exact UTC timestamps with or without fractional seconds', async () => {
  const f = await setup('2026-07-01T00:28:22Z')
  expect(await f.repository.readShareSessionCreatedAt(f.context, f.viewed.sessionIdentity!)).toBe(Date.parse(OLD))
})

it('a renamed pre-recovery session keeps its original age', async () => {
  const f = await setup()
  if (f.target.kind !== 'session') throw Error('Expected named test session')
  await f.repository.rename({ operation: 'rename', sessionId: f.target.sessionId,
    expectedGeneration: f.viewed.generation, name: 'Renamed after recovery' })
  expect(await f.repository.readShareSessionCreatedAt(f.context, f.viewed.sessionIdentity!)).toBe(Date.parse(OLD))
})

it('naming the same pre-recovery working run does not make it a new post-recovery session', async () => {
  const f = await setup(), working = { kind: 'working' } as const
  const payload = { maps: ['synthetic existing run'] }
  f.setClock(OLD)
  await f.repository.save({ operation: 'save', target: working, expectedGeneration: null, payload })
  await f.repository.load({ operation: 'load', target: working, mode: 'resume' })
  f.setClock(NEW)
  const named = await f.repository.save({ operation: 'save', target: { kind: 'new', name: 'Named existing run' },
    expectedGeneration: null, payload, inheritShareIntentFrom: working })
  if (named.target.kind !== 'session') throw Error('Expected named test session')
  expect(await f.repository.readShareSessionCreatedAt(named.target.sessionId + ':2', named.sessionIdentity!))
    .toBe(Date.parse(OLD))
  const created = await f.repository.save({ operation: 'save', target: { kind: 'new', name: 'Independent new run' },
    expectedGeneration: null, payload })
  if (created.target.kind !== 'session') throw Error('Expected named test session')
  expect(await f.repository.readShareSessionCreatedAt(created.target.sessionId + ':3', created.sessionIdentity!))
    .toBe(Date.parse(NEW))
})

it('rejects an old-view age lookup queued behind a selection-changing save', async () => {
  const f = await setup()
  let arrived!: () => void, release!: () => void
  const entered = new Promise<void>(resolve => { arrived = resolve })
  const held = new Promise<void>(resolve => { release = resolve })
  f.holdCommit(async () => { arrived(); await held })
  const creating = f.repository.save({ operation: 'save', target: { kind: 'new', name: 'Queued new session' },
    expectedGeneration: null, payload: { maps: [] } })
  await entered
  const stale = f.repository.readShareSessionCreatedAt(f.context, f.viewed.sessionIdentity!)
  const refusal = expect(stale).rejects.toThrow('selected session changed')
  release()
  await creating
  await refusal
})
