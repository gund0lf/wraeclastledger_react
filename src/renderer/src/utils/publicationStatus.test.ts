import { describe, expect, it } from 'vitest'
import type { AuthorStatus, ResumedPublication } from '../../../shared/authorHandoff'
import type { StrategyTarget } from '../../../shared/strategyTarget'
import { acknowledgedPublicationTarget, publicationStatusText } from './publicationStatus'

const tracking: ResumedPublication = { mode: 'operation', request: { request_id: 'request', client_request_id: 'client', expires_at: '2026-01-01T00:10:00Z' },
  operation: { kind: 'replace', strategy_id: 'strategy', revision: 4 }, targetGeneration: 'generation', status: null }
const target: StrategyTarget = { version: 1, state: 'ready', operation: 'replace', id: 'strategy', title: 'Test', revision: 4,
  registrationId: 'registration', scope: 'current', generation: 'generation', seed: null }
const result: AuthorStatus = { request_id: 'request', epoch: 'epoch', status: 'consumed', expires_at: tracking.request.expires_at,
  outcome: { status: 'published', strategy_id: 'strategy', revision: 5 } }

describe('automatic publication acknowledgement', () => {
  it('remembers only the exact confirmed replacement revision without arming another mutation', () => {
    expect(acknowledgedPublicationTarget(target, tracking, result)).toEqual({ ...target, revision: 5, state: 'acknowledged' })
    expect(target.state).toBe('ready')
    expect(target.revision).toBe(4)
  })
  it('does not overwrite a newer target after a delayed receipt or restart', () => {
    const newer = { ...target, revision: 5, generation: 'new-generation' }
    expect(acknowledgedPublicationTarget(newer, tracking, result)).toBe(newer)
    expect(acknowledgedPublicationTarget(null, tracking, result)).toBeNull()
    const otherAction = { ...target, operation: 'evidence' as const }
    expect(acknowledgedPublicationTarget(otherAction, tracking, result)).toBe(otherAction)
  })
  it('refuses a different request, strategy, revision, or unconfirmed outcome', () => {
    for (const wrong of [
      { ...result, request_id: 'other' }, { ...result, status: 'pending' as const },
      { ...result, outcome: { status: 'published' as const, strategy_id: 'other', revision: 5 } },
      { ...result, outcome: { status: 'published' as const, strategy_id: 'strategy', revision: 6 } }
    ]) expect(() => acknowledgedPublicationTarget(target, tracking, wrong)).toThrow()
  })
  it('acknowledges append on the same revision and ordinary publication never changes a target', () => {
    const append = { ...tracking, operation: { ...tracking.operation, kind: 'evidence' as const } }
    const sameRevision = { ...result, outcome: { status: 'published' as const, strategy_id: 'strategy', revision: 4 } }
    expect(acknowledgedPublicationTarget({ ...target, operation: 'evidence' }, append, sameRevision)?.state).toBe('acknowledged')
    expect(acknowledgedPublicationTarget(target, { ...tracking, operation: { kind: 'publication', strategy_id: null, revision: null } }, result)).toBe(target)
  })
  it('expired tracking is an unknown result, never a failed publication', () => {
    expect(publicationStatusText(tracking.operation, null, true, tracking.request.expires_at)).toEqual({ title: 'Not confirmed yet.',
      detail: 'Check the Strategy Browser.' })
    expect(publicationStatusText(tracking.operation, result, true, tracking.request.expires_at).title).toBe('Strategy replaced: your card is updated in Discord.')
  })
  it.each(['expired', 'cancelled'] as const)('an unavailable %s result never claims that nothing was published', status => {
    expect(publicationStatusText(tracking.operation, { ...result, status, outcome: null }, false, tracking.request.expires_at))
      .toEqual({ title: 'Not confirmed yet.', detail: 'Check the Strategy Browser.' })
  })
  it('waiting gives the background-check deadline and distinguishes closing Share from quitting the app', () => {
    const deadline = new Date(tracking.request.expires_at).toLocaleTimeString()
    expect(publicationStatusText(tracking.operation, null, false, tracking.request.expires_at)).toEqual({ title: 'Waiting for Discord',
      detail: `Paste it in the sharing channel. You can close this window; it keeps checking until ${deadline} while the app stays open.` })
  })
  it('success identifies each completed Discord action without requesting another code', () => {
    for (const [kind, title] of [
      ['publication', 'Strategy published: your card is in Discord.'],
      ['evidence', 'Run added: your card is updated in Discord.'],
      ['replace', 'Strategy replaced: your card is updated in Discord.']
    ] as const) {
      expect(publicationStatusText({ ...tracking.operation, kind }, result, false, tracking.request.expires_at))
        .toEqual({ title, detail: null })
    }
  })
})
