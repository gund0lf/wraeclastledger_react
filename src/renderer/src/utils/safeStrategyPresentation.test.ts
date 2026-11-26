import { describe, expect, it } from 'vitest'
import type { SafeRow } from '../../../shared/safeStrategy'
import { safeAuthorLabel, safeAuthorStatus, safeContinuationMessage, safeCostEvidenceMessage, safeSetupUnavailableMessage, safeNumber, safeDate, recordedQuantityPrice, hasPublicAuthorName } from './safeStrategyPresentation'

const author = (status: NonNullable<SafeRow['attribution']>['status'], display_name: string | null = 'Example Author') =>
  ({ status, display_name, registration_id: '11111111-1111-4111-8111-111111111111' })

describe('safe strategy presentation', () => {
  it('preserves the approved public name exactly, including long Unicode names', () => {
    const name = '\u0915\u093f\u0902'.repeat(32)
    expect(safeAuthorLabel(author('active', name))).toBe(name)
    expect(safeAuthorStatus(author('active'))).toBe('')
  })
  it('uses Anonymous for hidden public names while preserving internal states', () => {
    expect(safeAuthorLabel(null)).toBe('Anonymous')
    for (const state of ['active', 'suspended', 'retired', 'removed', 'quarantined'] as const) {
      expect(safeAuthorLabel(author(state, null))).toBe('Anonymous')
      expect(hasPublicAuthorName(author(state, null))).toBe(false)
      if (state !== 'active') expect(safeAuthorStatus(author(state))).toMatch(/^Name /)
    }
    expect(safeAuthorStatus(author('retired'))).toBe('Name retired')
    expect(safeAuthorStatus(null)).toBe('')
    expect(hasPublicAuthorName(author('active', 'Anonymous'))).toBe(true)
    expect(safeAuthorLabel(author('retired', 'Do not display'))).toBe('Anonymous')
  })
  it('uses live numeric and date formats independent of the workstation region', () => {
    expect(safeNumber(1234.3, 'c')).toBe('1,234.3c')
    expect(safeNumber(0, 'c')).toBe('0c')
    expect(safeDate('2026-09-07T12:00:00Z')).toBe('07.09.2026')
    expect(safeDate(null)).toBe('unrecorded')
    expect(safeDate('invalid')).toBe('unrecorded')
  })
  it('describes missing quantity and unit prices without implying zero', () => {
    expect(recordedQuantityPrice(null, null)).toBe('Quantity and unit price unrecorded')
    expect(recordedQuantityPrice(0, null)).toBe('0× · Unit price unrecorded')
    expect(recordedQuantityPrice(null, 0)).toBe('Quantity unrecorded · 0c each')
    expect(recordedQuantityPrice(1, 1.3, true)).toBe('1×/map · 1.3c each')
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
    expect(safeContinuationMessage('inactive_registration', true)).toBe('Name this strategy to continue it.')
    expect(safeContinuationMessage('missing_membership', true)).toBe('Name this strategy to continue it.')
    expect(safeContinuationMessage('incomplete_seed', true)).toContain('lacks the setup')
    expect(safeContinuationMessage('frozen', true)).toContain('Frozen')
  })
  it('unknown reasons cannot inject service text into the interface', () => {
    for (const reason of ['__proto__', 'constructor', 'private server text']) {
      expect(safeSetupUnavailableMessage(reason)).toBe('The reusable setup is unavailable.')
      expect(safeContinuationMessage(reason)).toBe('Continuation is unavailable.')
    }
  })
})
