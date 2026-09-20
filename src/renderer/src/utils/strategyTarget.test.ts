import { describe, expect, it } from 'vitest'
import { acknowledgeStrategyTarget, migrateStrategyTarget, withStrategyTarget, type StrategyTarget } from '../../../shared/strategyTarget'
import { decodeSessionPayload, encodeSessionPayload } from '../repository/sessionPayloadCodec'
import { DEFAULT_SETTINGS, useSessionStore } from '../store/useSessionStore'
import { portableFieldsFromSessionPayload, sessionPayloadFromPortableFields } from '../../../shared/sessionPayload'
import { isWorkingPayloadMeaningful } from './workingSession'
const id = '11111111-1111-4111-8111-111111111111'
const target: StrategyTarget = { version: 1, state: 'ready', operation: 'replace', id, title: 'Example', revision: 3,
  registrationId: id, generation: id, scope: 'current', seed: null }
describe('atomic saved strategy targets', () => {
  it('retains conflicting legacy candidates and pins for explicit review', () => {
    const migrated = migrateStrategyTarget({ updateTargetStrategyId: id, evidenceTargetStrategyId: id,
      evidenceTargetExpectedRevision: 2, evidenceTargetSetupFingerprint: 'sha256-v1:' + 'a'.repeat(64) })
    expect(migrated).toMatchObject({ state: 'legacy_review', replace: { id }, evidence: { id, revision: 2 } })
  })
  it('uses the exact repository payload for save/load without author recognition', () => {
    const source = useSessionStore.getState()
    const encoded = encodeSessionPayload({ ...source, settings: withStrategyTarget(source.settings, target) })
    expect(decodeSessionPayload(encoded, DEFAULT_SETTINGS).settings.strategyTarget).toEqual(target)
    expect(decodeSessionPayload(sessionPayloadFromPortableFields(portableFieldsFromSessionPayload(encoded)), DEFAULT_SETTINGS).settings.strategyTarget).toEqual(target)
    expect(encoded).not.toHaveProperty('authorPreferences')
  })
  it('treats a saved target as protected work, but a cleared target alone is empty', () => {
    const state = useSessionStore.getState()
    const source = { ...state, maps: [], lootItems: [], baselineItems: [], baselineTotal: 0, manualLootItems: [],
      sessionNotes: '', manualStatistics: {}, loadedStrategyInfo: null, investmentNeutralization: 0, investmentDismissed: false }
    expect(isWorkingPayloadMeaningful(encodeSessionPayload({ ...source, settings: { ...DEFAULT_SETTINGS, strategyTarget: target } }), DEFAULT_SETTINGS)).toBe(true)
    expect(isWorkingPayloadMeaningful(encodeSessionPayload({ ...source, settings: { ...DEFAULT_SETTINGS, strategyTarget: null } }), DEFAULT_SETTINGS)).toBe(false)
  })
  it('atomically replaces or clears all old target fields and preserves local work', () => {
    const source = { maps: [1], updateTargetStrategyId: id, evidenceTargetExpectedRevision: 2 }
    expect(withStrategyTarget(source, target)).toMatchObject({ maps: [1], strategyTarget: target,
      updateTargetStrategyId: null, evidenceTargetExpectedRevision: null })
    expect(withStrategyTarget(source, null).strategyTarget).toBeNull()
  })
  it('does not acknowledge another operation or revision, and retains the old pin after success', () => {
    expect(acknowledgeStrategyTarget(target, 'other', id, 4)).toBe(target)
    expect(acknowledgeStrategyTarget(target, id, id, 5)).toBe(target)
    expect(acknowledgeStrategyTarget(target, id, id, 4)).toEqual({ ...target, state: 'acknowledged' })
  })
  it('fails closed for malformed saved records instead of silently clearing intent', () => {
    expect(() => migrateStrategyTarget({ strategyTarget: { ...target, scope: 'frozen' } })).toThrow()
  })
})
