import { describe, expect, it } from 'vitest'
import type { SafeRow } from '../../../shared/safeStrategy'
import { safeAuthorLabel, safeAuthorStatus, safeContinuationMessage, safeCostEvidenceMessage, safeSetupUnavailableMessage } from './safeStrategyPresentation'

const author = (status: NonNullable<SafeRow['attribution']>['status'], display_name: string | null = 'Example Author') =>
  ({ status, display_name, registration_id: '11111111-1111-4111-8111-111111111111' })

describe('safe strategy presentation', () => {
  it('preserves the approved public name exactly, including long Unicode names', () => {
    const name = '\u0915\u093f\u0902'.repeat(32)
    expect(safeAuthorLabel(author('active', name))).toBe(name)
    expect(safeAuthorStatus(author('active'))).toBe('')
  })
  it('does not call an unavailable or retired public name unnamed', () => {
    expect(safeAuthorLabel(null)).toBe('Public name not set')
    for (const state of ['active', 'suspended', 'retired', 'removed', 'quarantined'] as const) {
      expect(safeAuthorLabel(author(state, null))).toBe('Public name unavailable')
      if (state !== 'active') expect(safeAuthorStatus(author(state))).toMatch(/^Name /)
    }
    expect(safeAuthorStatus(author('retired'))).toBe('Name retired')
    expect(safeAuthorStatus(null)).toBe('')
  })
  it('never leaves frozen pooled costs loading when no run endpoint exists', () => {
    expect(safeCostEvidenceMessage(null, null, 'frozen')).toContain('not available')
    expect(safeCostEvidenceMessage(null, null, 'frozen')).not.toContain('Loading')
    expect(safeCostEvidenceMessage(null, null, 'current')).toContain('Loading')
  })
  it('explains all recorded setup rejection codes without displaying wire identifiers', () => {
    for (const reason of ['missing_setup', 'malformed_source', 'title_limit', 'regex_limit', 'invalid_atlas', 'conflicting_source', 'unsupported_setup']) {
      expect(safeSetupUnavailableMessage(reason)).not.toContain('_')
      expect(safeSetupUnavailableMessage(reason)).not.toBe('The reusable setup is unavailable.')
    }
    expect(safeSetupUnavailableMessage('title_limit')).toContain('still shown')
  })
  it('explains all continuation states without implying fresh prices or authority', () => {
    for (const reason of ['frozen', 'missing_membership', 'incomplete_seed', 'conflicting_seed', 'unsupported_identity', 'inactive_registration']) {
      expect(safeContinuationMessage(reason)).not.toContain('_')
      expect(safeContinuationMessage(reason)).not.toBe('Continuation is unavailable.')
    }
    expect(safeContinuationMessage('inactive_registration')).toContain('not active')
  })
  it('unknown reasons cannot inject service text into the interface', () => {
    for (const reason of ['__proto__', 'constructor', 'private server text']) {
      expect(safeSetupUnavailableMessage(reason)).toBe('The reusable setup is unavailable.')
      expect(safeContinuationMessage(reason)).toBe('Continuation is unavailable.')
    }
  })
})
