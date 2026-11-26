import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/safe-strategy-v2.json'
import listContract from './__fixtures__/safe-strategy-list-v2.json'
import { parseSafeDetail, parseSafeList, parseSafeRow, parseSafeRun, sameSafeIdentity } from '../../../shared/safeStrategy'
import { normalizePublicAuthorName } from '../../../shared/authorNames'
import { SafeBrowserRequests, SafeStrategyReader } from './safeStrategyReader'
import { bindSafeTarget, prepareSafeContinuation, safeContinuationSnapshot } from './safeStrategyTarget'
import { fingerprintSetupSnapshot, buildSetupSnapshot } from './evidenceIdentity'
import { emptyAuthorPreferences } from '../../../shared/authorRecognition'
import { migrateStrategyTarget } from '../../../shared/strategyTarget'
import { buildDiscordExport } from './discordExport'
import { DEFAULT_SETTINGS } from '../store/useSessionStore'
import { buildDiscordSharePayload, decodeDiscordSharePayload } from './discordShareWire'
import { parseDiscordExport } from './parseDiscordExport'
import { buildAuthorSubmission } from '../../../shared/authorSubmission'
import { safeNumber, safePooledCostComponents, safeCostEvidenceMessage } from './safeStrategyPresentation'
const prefs = { ...emptyAuthorPreferences(), registrations: [{ registrationId: fixture.row.id, name: 'Fixture Author', confirmed: true, epoch: fixture.snapshot }] }
const page = () => ({ schema_version: 2, scope: 'current', snapshot_key: null, read_version: fixture.row.read_version,
  total: 1, limit: 20, sort: 'activity', order: 'desc', strategies: [structuredClone(fixture.row)], next_cursor: null })
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const attributionReaders = (attribution: unknown) => [
  () => parseSafeList({ ...page(), strategies: [{ ...fixture.row, attribution }] }).strategies[0].attribution,
  () => parseSafeList({ ...page(), scope: 'frozen', snapshot_key: fixture.snapshot,
    strategies: [{ ...fixture.row, scope: 'frozen', snapshot_key: fixture.snapshot, snapshot_schema_version: 1, attribution }] }).strategies[0].attribution,
  () => parseSafeDetail({ ...fixture.detail, attribution }).attribution,
  () => parseSafeDetail({ ...fixture.frozen, attribution }).attribution
]
describe('shared safe strategy reader contract', () => {
  it.each([6, 7, 11, 12])('checks %i distinct Delirium levels in strategy and run responses', count => {
    const summary = { sample_size: count, rewards: [], levels: Array.from({ length: count },
      (_, i) => ({ percentage: 32 + i, count: 1 })) };
    const readers = [
      ...[fixture.detail, fixture.frozen].map(detail => () => parseSafeDetail({
        ...detail, ancillary: { ...detail.ancillary, observed_delirium: summary },
      }).ancillary.observed_delirium),
      () => parseSafeRun({ ...fixture.run, observed_delirium: summary }).observed_delirium,
    ];
    for (const read of readers) {
      if (count > 11) expect(read).toThrow();
      else expect(read()).toEqual(summary);
    }
  });
  it('accepts the shared server/website list contract without reconstructing recorded values', () => {
    for (const { expected } of listContract.cases) {
      const { snapshot_schema_version: _snapshotVersion, ...display } = expected
      expect(parseSafeRow(expected)).toEqual(display)
    }
  })
  it('keeps the extended list closed and rejects missing, private or invalid fields', () => {
    const row = listContract.cases[0].expected
    for (const invalid of [
      { ...row, party_size: 0 }, { ...row, party_size: 7 }, { ...row, group_play: 'true' },
      { ...row, discord_username: 'PRIVATE' }, { ...row, raw_export: 'PRIVATE' },
      { ...row, results: { ...row.results, historical_net_divines: 1e16 } },
      { ...row, results: { ...row.results, historical_invest_divines: -1 } }
    ]) expect(() => parseSafeRow(invalid)).toThrow()
    for (const key of ['group_play', 'party_size']) {
      const missing: Record<string, unknown> = { ...row }; delete missing[key]
      expect(() => parseSafeRow(missing)).toThrow()
    }
  })
  it('distinguishes pending, failed, retrying and incomplete historical costs', () => {
    expect(safeCostEvidenceMessage(null, null)).toContain('Loading')
    expect(safeCostEvidenceMessage(null, 'offline')).toContain('unavailable')
    expect(safeCostEvidenceMessage(null, '')).not.toContain('Loading')
    // Starting Retry clears the error, allowing a genuine loading state again.
    expect(safeCostEvidenceMessage(null, null)).toContain('Loading')
    expect(safeCostEvidenceMessage([], null)).toContain('Incomplete')
  })
  it('preserves canonical public names using registration bounds, not code-unit display limits', () => {
    for (const name of ['Example', '\u0915\u093f\u0902'.repeat(27), '\u0915\u093f\u0902'.repeat(32), 'A' + '\u0338'.repeat(254) + 'B']) {
      expect(normalizePublicAuthorName(name).name).toBe(name)
      const attribution = { registration_id: fixture.row.id, display_name: name, status: 'active' }
      for (const read of attributionReaders(attribution)) expect(read()).toEqual(attribution)
    }
  })
  it('rejects invalid and noncanonical public names without normalizing or truncating responses', () => {
    for (const name of ['', 'A', 'A'.repeat(33), 'A' + '\u0338'.repeat(255) + 'B',
      'Admin', '..', ' Example', 'Example ', 'Example  Name', '\uff25xample', 'e\u0301e\u0301',
      'Example\nName', 'Example\u200b', 'Example\ud83d\ude00', 123, {}, []]) {
      for (const read of attributionReaders({ registration_id: fixture.row.id, display_name: name, status: 'active' }))
        expect(read).toThrow('The strategy service returned an unsupported response.')
    }
  })
  it('retains null author redaction and the closed attribution identity/status contract', () => {
    for (const status of ['active', 'suspended', 'retired', 'removed', 'quarantined']) {
      const attribution = { registration_id: fixture.row.id, display_name: null, status }
      for (const read of attributionReaders(attribution)) expect(read()).toEqual(attribution)
    }
    for (const read of attributionReaders(null)) expect(read()).toBeNull()
    const attribution = { registration_id: fixture.row.id, display_name: 'Example', status: 'active' }
    for (const extra of [{ registration_id: 'invalid' }, { status: 'unknown' }, { owner_id: 'private' }, { display_name: undefined }]) {
      for (const read of attributionReaders({ ...attribution, ...extra })) expect(read).toThrow()
    }
  })
  it('retains actual nullable server ancillary projections separately from explicit zero', () => {
    const d = parseSafeDetail(fixture.partialDetail), empty = parseSafeDetail(fixture.allNullDetail)
    expect(d.ancillary.excluded_drops).toEqual({ declared_count: null, total_chaos: null, entries: [{ name: 'Unpriced exclusion', chaos: null }], complete: false })
    expect(d.ancillary.gem_leveling).toEqual({ count: null, buy_chaos: null, sell_chaos: 0, net_chaos: -5 })
    expect(empty.ancillary.gem_leveling).toEqual({ count: null, buy_chaos: null, sell_chaos: null, net_chaos: null })
    expect(safeNumber(d.ancillary.gem_leveling!.count)).toBe('Unrecorded')
    expect(safeNumber(d.ancillary.gem_leveling!.sell_chaos, 'c')).toBe('0c')
    for (const bad of [{ count: 1.5 }, { count: 1000001 }, { buy_chaos: -1 }, { sell_chaos: '0' }, { net_chaos: Infinity }, { net_chaos: 1e16 }, { private: true }]) {
      expect(() => parseSafeDetail({ ...d, ancillary: { ...d.ancillary, gem_leveling: { ...d.ancillary.gem_leveling, ...bad } } })).toThrow()
    }
  })
  it('retains display setup when title or regex prevents import', () => {
    for (const source of fixture.displayOnlyDetails) {
      const d = parseSafeDetail(source)
      expect(d.reusable_setup.status).toBe('unavailable')
      expect(d.setup.delirium).toEqual({ type: 'Fine', count_per_map: 1 })
      expect(d.setup.astrolabe).toBe('Templar Astrolabe')
      expect(d.setup.multiplying_modifiers).toEqual({ allocated: true, fragment_count: 5 })
    }
  })
  it('accepts the actual server projections, retaining loss, zero, duplicate slots and missing prices', () => {
    expect(parseSafeRow(fixture.row).results.net_profit_chaos).toBe(-2)
    const d = parseSafeDetail(fixture.detail)
    expect(d.economics.total_invest_chaos).toBe(0)
    expect(d.reusable_setup.status).toBe('available')
    expect(parseSafeRun(fixture.run).setup.scarabs).toHaveLength(3)
    expect(sameSafeIdentity(d, parseSafeDetail(fixture.frozen))).toBe(false)
  })
  it('rejects unknown private fields recursively and unsafe Atlas URLs', () => {
    expect(() => parseSafeDetail({ ...fixture.detail, raw_export: 'private' })).toThrow()
    expect(() => parseSafeDetail({ ...fixture.detail, setup: { ...fixture.detail.setup, owner_id: 'private' } })).toThrow()
    expect(() => parseSafeDetail({ ...fixture.detail, setup: { ...fixture.detail.setup, atlas: { ...fixture.detail.setup.atlas, url: 'https://evil.invalid/' } } })).toThrow()
  })
  it('accepts populated server loot projections and preserves manual identity and correction disclosures', () => {
    const loot = parseSafeDetail(fixture.richDetail).loot!
    expect(loot.rows[0].identity).toMatchObject({ kind: 'quality-base', memory_strands: 40 })
    expect(loot.csv_net_chaos).toBe(100)
    expect(loot.reported_return_chaos).toBe(220)
    expect(loot.omitted_manual_rows).toBe(0)
  })
  it('proves the server first-run projection reconstructs the canonical identity exactly', async () => {
    const snapshot = safeContinuationSnapshot(parseSafeDetail(fixture.detail))
    expect(snapshot).toEqual(buildSetupSnapshot(fixture.input))
    expect(await fingerprintSetupSnapshot(snapshot)).toBe(await fingerprintSetupSnapshot(buildSetupSnapshot(fixture.input)))
  })
  describe('continuation while the fixture league was open', () => {
    beforeEach(() => { vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 1)) })
    afterEach(() => { vi.restoreAllMocks() })
    it('requires confirmed registration identity and rejects frozen continuations', async () => {
      await expect(bindSafeTarget(parseSafeDetail(fixture.frozen), 'replace', prefs)).rejects.toThrow('Frozen')
      await expect(bindSafeTarget(parseSafeDetail(fixture.detail), 'replace', emptyAuthorPreferences())).rejects.toThrow('Confirm')
      expect(await bindSafeTarget(parseSafeDetail(fixture.detail), 'evidence', prefs)).toMatchObject({ operation: 'evidence', revision: 2, seed: { version: 2 } })
    })
    it('cannot rebase an old evidence pin, while replacement binds only after explicit review', async () => {
      const d = parseSafeDetail(fixture.detail)
      const legacy = migrateStrategyTarget({ evidenceTargetStrategyId: d.id, evidenceTargetExpectedRevision: 1,
        evidenceTargetSetupFingerprint: 'sha256-v1:' + 'a'.repeat(64) })!
      await expect(bindSafeTarget(d, 'evidence', prefs, legacy)).rejects.toThrow('pin')
      const replacement = migrateStrategyTarget({ updateTargetStrategyId: d.id })!
      expect((await bindSafeTarget(d, 'replace', prefs, replacement)).revision).toBe(2)
    })
    it('rejects changed revision before using the local run and keeps the intent untouched', async () => {
      const d = parseSafeDetail(fixture.detail), target = await bindSafeTarget(d, 'replace', prefs)
      await expect(prepareSafeContinuation(target, { ...d, revision: 3 }, prefs, '', [])).rejects.toThrow('revision changed')
      expect(target.revision).toBe(2)
    })
    it('prepares real replacement/evidence v5 submissions from the public seed and retains exact run identity', async () => {
      const d = parseSafeDetail(fixture.detail)
      const maps = Array.from({ length: 2 }, () => ({ quantity: 100, rarity: 60, packSize: 40, moreCurrency: 20, moreScarabs: 10, explicitModCount: 8 }))
      const raw = buildDiscordExport({ maps, settings: { ...DEFAULT_SETTINGS, divinePrice: 200, leagueName: 'Allflame', mapType: '8-mod', chiselType: '',
        scarabs: fixture.input.scarabs.map(s => ({ name: s.name, cost: 4 })), atlasTreeUrl: fixture.input.atlasTreeUrl,
        multiplyingModifiersAllocated: true, fragmentCountOverride: 3 }, lootItems: [], baselineTotal: 0, investmentNeutralization: 0,
        stratName: 'Synthetic Herd', shareTags: ['bestiary'], isGroupPlay: false, gameDataRevision: 4, gameDataPatchVersion: '3.29' })
      for (const operation of ['replace', 'evidence'] as const) {
        const target = await bindSafeTarget(d, operation, prefs)
        const proof = await prepareSafeContinuation(target, d, prefs, raw, [1000, 2000])
        const tuple = JSON.parse(buildDiscordSharePayload(parseDiscordExport(raw)!)); tuple[1] = proof.operation
        const wire = buildAuthorSubmission(JSON.stringify(tuple), { author: proof.author, expected_revision: proof.revision, confirmation_request_id: null })
        const decoded = decodeDiscordSharePayload(wire)
        expect(decoded?.operation).toBe(operation === 'replace' ? 'update' : 'evidence')
        if (operation === 'evidence') {
          expect(decoded?.evidenceExpectedRevision).toBe(2)
          await expect(prepareSafeContinuation(target, d, prefs, raw, [1000])).rejects.toThrow('timestamp')
        }
      }
    })
  })
  it('only pools complete prices, including explicit zero and duplicate scarab slots', () => {
    const run = parseSafeRun(fixture.run)
    expect(safePooledCostComponents([run])).toMatchObject({ Scarabs: 0 })
    expect(safePooledCostComponents([{ ...run, cost_breakdown: null }])).toBeNull()
    expect(safePooledCostComponents([{ ...run, cost_breakdown: { ...run.cost_breakdown!, scarabs: [] } }])).toBeNull()
    expect(safePooledCostComponents([{ ...run, setup: { ...run.setup, scarabs: ['Different scarab', ...run.setup.scarabs.slice(1)] } }])).toBeNull()
  })
  it('shares one exact-generation evidence request between consumers and rejects mismatched evidence', async () => {
    const read = vi.fn(async () => ({ schema_version: 2, strategy_id: fixture.row.id, revision: 2, read_version: fixture.row.read_version, runs: [fixture.run], next_cursor: null }))
    const reader = new SafeStrategyReader(read), d = parseSafeDetail(fixture.detail)
    const [a, b] = await Promise.all([reader.evidence(d), reader.evidence(d)])
    expect(a).toBe(b); expect(read).toHaveBeenCalledTimes(1)
    await expect(new SafeStrategyReader(async () => ({ ...await read(), revision: 3 })).evidence(d)).rejects.toThrow('changed')
    await expect(reader.evidence(parseSafeDetail(fixture.frozen))).rejects.toThrow('Frozen')
  })
  it('a frozen detail request cannot resolve to its current counterpart', async () => {
    const reader = new SafeStrategyReader(async () => fixture.detail)
    await expect(reader.detail(parseSafeDetail(fixture.frozen), true)).rejects.toThrow('changed')
  })
  it('rejects a response sorted differently from the selected control', async () => {
    await expect(new SafeStrategyReader(async () => page()).list('/web/v2/strategies?sort=maps&order=asc')).rejects.toThrow('identity changed')
  })
  it('does not let old list/detail successes or finally blocks replace another query', async () => {
    const old = deferred<unknown>(), detail = deferred<unknown>()
    const read = vi.fn((path: string) => path.includes('league=old') ? old.promise : path.endsWith(fixture.row.id) ? detail.promise : Promise.resolve(page()))
    const controller = new SafeBrowserRequests(new SafeStrategyReader(read))
    controller.activate('/web/v2/strategies?limit=20&league=old')
    controller.activate('/web/v2/strategies?limit=20')
    await flush(); old.resolve({ ...page(), strategies: [] }); await flush()
    expect(controller.getSnapshot().page?.strategies).toHaveLength(1)
    void controller.expand(fixture.row.id); controller.deactivate(); detail.resolve(fixture.detail); await flush()
    expect(controller.getSnapshot()).toMatchObject({ path: null, detail: null, loading: false })
  })
})
