import { describe, expect, it, vi } from 'vitest'
import type { AuthorBridge, AuthorResult, ResumedPublication } from '../../../shared/authorHandoff'
import type { StrategyTarget } from '../../../shared/strategyTarget'
import { publicationMatchesTarget, restorePendingPublicationDraft, resumeSelectedPublication } from './publicationResume'

const context = { sessionId: 'session:1', generation: 'view' }
const tracking: ResumedPublication = { mode: 'operation', request: { request_id: 'request', client_request_id: 'client',
  expires_at: '2026-01-01T00:10:00Z' }, operation: { kind: 'evidence', strategy_id: 'strategy', revision: 1 },
  targetGeneration: 'choice', status: null }
const target: StrategyTarget = { version: 1, state: 'ready', operation: 'evidence', id: 'strategy', title: 'Test', revision: 1,
  registrationId: 'registration', scope: 'current', generation: 'choice', seed: null }

describe('resuming the selected share', () => {
  it('retains the same pending target, including after locally acknowledging it', async () => {
    const bridge = vi.fn().mockResolvedValue({ ok: true, value: tracking })
    for (const selected of [target, { ...target, state: 'acknowledged' as const }]) {
      expect(await resumeSelectedPublication(bridge as AuthorBridge, context, 'session', selected, () => true)).toBe(tracking)
    }
    expect(bridge.mock.calls.every(([request]) => request.action === 'resume-publication')).toBe(true)
  })
  it.each([
    { ...target, generation: 'fresh-choice' },
    { ...target, revision: 2 },
    { ...target, operation: 'replace' as const },
    { ...target, id: 'another-strategy' },
    null
  ])('detaches an old result after an explicit different Continue choice', async selected => {
    const bridge = vi.fn().mockResolvedValueOnce({ ok: true, value: tracking })
      .mockResolvedValueOnce({ ok: true, value: { stopped: true, remoteCancellation: 'unknown' } })
    expect(await resumeSelectedPublication(bridge as AuthorBridge, context, 'session', selected, () => true)).toBeNull()
    expect(bridge.mock.calls.map(([request]) => request.action)).toEqual(['resume-publication', 'cancel-publication'])
    expect(bridge.mock.calls[1][0]).toEqual({ action: 'cancel-publication', context, sessionIdentity: 'session' })
  })
  it('does not let ordinary publication tracking block a newly selected Continue target', () => {
    const ordinary = { ...tracking, operation: { kind: 'publication' as const, strategy_id: null, revision: null }, targetGeneration: null }
    expect(publicationMatchesTarget(ordinary, null)).toBe(true)
    expect(publicationMatchesTarget(ordinary, target)).toBe(false)
    expect(publicationMatchesTarget(tracking, { version: 1, state: 'legacy_review', replace: null,
      evidence: { id: 'strategy', title: 'Test', revision: 1, fingerprint: null } })).toBe(false)
  })
  it('does not cancel or apply a delayed resume after switching sessions', async () => {
    let resolve!: (result: AuthorResult<'resume-publication'>) => void
    const bridge = vi.fn(() => new Promise(yes => { resolve = yes }))
    let current = true
    const result = resumeSelectedPublication(bridge as AuthorBridge, context, 'session', null, () => current)
    current = false
    resolve({ ok: true, value: tracking })
    expect(await result).toBeUndefined()
    expect(bridge).toHaveBeenCalledTimes(1)
  })
  it('keeps cancellation failures visible and does not prepare over a retained binding', async () => {
    const bridge = vi.fn().mockResolvedValueOnce({ ok: true, value: tracking })
      .mockResolvedValueOnce({ ok: false, error: 'The saved reader could not be removed.' })
    await expect(resumeSelectedPublication(bridge as AuthorBridge, context, 'session', null, () => true))
      .rejects.toThrow('saved reader could not be removed')
    expect(bridge).toHaveBeenCalledTimes(2)
  })
  it('keeps a quota or storage refusal visible during resume', async () => {
    const bridge = vi.fn().mockResolvedValue({ ok: false, error: 'Reader limit reached. Stop an existing request first.' })
    await expect(resumeSelectedPublication(bridge as AuthorBridge, context, 'session', null, () => true))
      .rejects.toThrow('Reader limit reached')
    expect(bridge).toHaveBeenCalledTimes(1)
  })
})

describe('restoring an existing ordinary operation', () => {
  it('restores exactly the saved core and public author, without creating a registration or changing mode', async () => {
    const draft = { core: '[4,0,"original"]', author: { name: 'Original name', registration_id: null } }
    const bridge = vi.fn().mockResolvedValue({ ok: true, value: draft })
    expect(await restorePendingPublicationDraft(bridge as AuthorBridge, context, 'session', () => true)).toEqual(draft)
    expect(bridge).toHaveBeenCalledExactlyOnceWith({ action: 'share-draft', sessionId: 'session:1', sessionIdentity: 'session' })
    expect(draft.author.registration_id).toBeNull()
  })
  it('never uses stale public fields after a close or session change', async () => {
    let resolve!: (result: AuthorResult<'share-draft'>) => void
    const bridge = vi.fn(() => new Promise(yes => { resolve = yes }))
    let current = true
    const restored = restorePendingPublicationDraft(bridge as AuthorBridge, context, 'session', () => current)
    current = false
    resolve({ ok: true, value: { core: 'saved', author: { name: 'Other session', registration_id: null } } })
    expect(await restored).toBeUndefined()
  })
  it.each([null, { core: 'saved' }])('shows a recovery action if the exact public fields are unavailable', async value => {
    const bridge = vi.fn().mockResolvedValue({ ok: true, value })
    await expect(restorePendingPublicationDraft(bridge as AuthorBridge, context, 'session', () => true))
      .rejects.toThrow('Check the Strategy Browser')
  })
})
