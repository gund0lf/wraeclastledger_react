import type { SafeDetail } from '../../../shared/safeStrategy'
import type { AuthorPreferences } from '../../../shared/authorRecognition'
import type { StrategyTarget } from '../../../shared/strategyTarget'
import { atlasAllocationHash, fingerprintSetupSnapshot, compareSetupSnapshots, setupSnapshotFromDiscordImport,
  authoredRollupFromDiscordImport, buildEvidenceRunIdentityV1, type EvidenceSetupSnapshot } from './evidenceIdentity'
import { parseDiscordExport } from './parseDiscordExport'
import { isLeagueEnded } from './league'
import { invalidateAuthorEpoch } from '../../../shared/authorRecognition'
import { useSessionStore } from '../store/useSessionStore'

export async function refreshSafeAuthorState(): Promise<void> {
  const result = await window.api.authorHandoff({ action: 'state' })
  if (!result.ok) throw new Error(result.error)
  const store = useSessionStore.getState()
  store.setAuthorPreferences(invalidateAuthorEpoch(store.authorPreferences, result.value.epoch))
  if (!result.value.author_actions_available) throw new Error('Author controls are temporarily unavailable.')
}

import { covensSetupIdentity } from '../../../shared/covensImport'
import type { CovensWire } from '../../../shared/covensWireValidator.mjs'
export function safeContinuationSnapshot(d: SafeDetail): EvidenceSetupSnapshot {
  if (d.scope !== 'current' || d.continuation_setup.status !== 'available') throw new Error('This strategy has no available continuation seed.')
  const { seed: s, identity_version: version } = d.continuation_setup
  if (!s.delirium || s.delirium.count_per_map === null || !s.league_key ||
    (version === 2 && (typeof s.multiplying_modifiers?.allocated !== 'boolean' || s.multiplying_modifiers.fragment_count === null)) ||
    (version === 1 && s.multiplying_modifiers !== null)) throw new Error('The original run setup is incomplete.')
  const device = d.reusable_setup.status === 'available' && d.reusable_setup.value.covens
  const base = { ...(device ? {covens: covensSetupIdentity(device)} : {}), schemaVersion: 1 as const, leagueKey: s.league_key, mapType: s.map_type, partySize: s.party_size,
    chiselType: s.chisel, scarabs: s.scarabs, delirium: { type: s.delirium.type, countPerMap: s.delirium.count_per_map },
    astrolabeType: s.astrolabe, atlasAllocationHash: atlasAllocationHash(s.atlas_tree_url), multiplierMilli: s.multiplier_milli,
    gameDataRevision: s.game_data.revision, gameDataPatchVersion: s.game_data.patch_version }
  return version === 1 ? base : { ...base, schemaVersion: 2, multiplyingModifiers: {
    allocated: s.multiplying_modifiers!.allocated!, fragmentCount: s.multiplying_modifiers!.fragment_count! } }
}
export function confirmedStrategyAuthor(d: Pick<SafeDetail, 'attribution'>, prefs: AuthorPreferences) {
  const a = d.attribution
  return a?.status === 'active' ? prefs.registrations.find(r => r.confirmed && r.registrationId === a.registration_id && r.name === a.display_name) : undefined
}
export async function bindSafeTarget(d: SafeDetail, operation: 'replace' | 'evidence', prefs: AuthorPreferences,
  legacy?: StrategyTarget): Promise<Exclude<StrategyTarget, { state: 'legacy_review' }>> {
  if (d.scope !== 'current') throw new Error('Frozen strategies can be loaded but cannot be continued.')
  if (!d.league || isLeagueEnded(d.league)) throw new Error('Continuation is unavailable for this league.')
  const author = confirmedStrategyAuthor(d, prefs)
  if (!author) throw new Error('Confirm the assigned public name before continuing this strategy.')
  const snapshot = safeContinuationSnapshot(d)
  const fingerprint = await fingerprintSetupSnapshot(snapshot)
  if (legacy?.state === 'legacy_review') {
    const candidate = operation === 'replace' ? legacy.replace : legacy.evidence
    if (!candidate || candidate.id !== d.id) throw new Error('The selected target changed.')
    if (operation === 'evidence' && (legacy.evidence!.revision !== d.revision || legacy.evidence!.fingerprint !== fingerprint))
      throw new Error('The saved evidence pin cannot be verified against this revision. Keep this work, or explicitly clear the target and review another operation.')
  }
  return { version: 1, state: 'ready', operation, id: d.id, title: d.title ?? '', revision: d.revision,
    registrationId: author.registrationId, scope: 'current', generation: crypto.randomUUID(),
    seed: operation === 'evidence' ? { version: snapshot.schemaVersion, fingerprint } : null }
}

/** Rechecks the current safe record without rebasing the saved intent. */
export async function prepareSafeContinuation(target: StrategyTarget, d: SafeDetail, prefs: AuthorPreferences,
  raw: string, mapParsedAt: Array<number | undefined>, covens?: CovensWire): Promise<{ operation: unknown[]; author: { name: string; registration_id: string }; revision: number }> {
  if (target.state !== 'ready') throw new Error('Review the saved target before preparing another submission.')
  if (d.scope !== 'current' || d.id !== target.id || d.revision !== target.revision) throw new Error('The published revision changed. Review the current strategy; the saved target and run are retained.')
  const author = confirmedStrategyAuthor(d, prefs)
  if (!author || author.registrationId !== target.registrationId) throw new Error('The assigned public name changed or needs confirmation.')
  if (!d.league || isLeagueEnded(d.league)) throw new Error('Continuation is unavailable for this league.')
  const snapshot = safeContinuationSnapshot(d)
  const local = parseDiscordExport(raw)
  if (!local || local.operationError) throw new Error('The local run could not be reconstructed.')
  if (covens) local.covens = covens
  const localSnapshot = setupSnapshotFromDiscordImport(local)
  if (localSnapshot.leagueKey !== snapshot.leagueKey) throw new Error('The run belongs to another league. Keep it in its original league.')
  const attribution = { name: author.name, registration_id: author.registrationId }
  if (target.operation === 'replace') return { operation: [1, target.id], author: attribution, revision: target.revision }
  if (!target.seed || target.seed.version !== snapshot.schemaVersion || target.seed.fingerprint !== await fingerprintSetupSnapshot(snapshot))
    throw new Error('The original evidence seed changed. The saved pin has been retained.')
  const mismatches = compareSetupSnapshots(snapshot, localSnapshot)
  if (mismatches.length) throw new Error('This run differs from the published setup: ' + mismatches.map(m => m.field).join(', '))
  if (local.mapCount < 1 || mapParsedAt.length !== local.mapCount || mapParsedAt.some(t => !Number.isFinite(t) || Math.abs(t!) > 8640000000000000))
    throw new Error('Every evidence map needs its original capture timestamp.')
  const runStartedAt = new Date(Math.min(...mapParsedAt as number[])).toISOString()
  const runEndedAt = new Date(Math.max(...mapParsedAt as number[])).toISOString()
  const fingerprint = await fingerprintSetupSnapshot(localSnapshot)
  const identity = await buildEvidenceRunIdentityV1({ runStartedAt, runEndedAt, setupSnapshot: localSnapshot, authoredRollup: authoredRollupFromDiscordImport(local) })
  return { operation: [2, target.id, target.revision, identity.runKey, runStartedAt, runEndedAt, fingerprint], author: attribution, revision: target.revision }
}
