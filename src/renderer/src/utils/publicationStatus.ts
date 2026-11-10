import type { AuthorStatus, PublicationOperation, ResumedPublication } from '../../../shared/authorHandoff'
import { acknowledgeStrategyTarget, type StrategyTarget } from '../../../shared/strategyTarget'

export function publicationStatusText(operation: PublicationOperation, status: AuthorStatus | null, expired: boolean, expiresAt: string) {
  if (status?.outcome?.status === 'published' && ['confirmed', 'consumed'].includes(status.status)) {
    return { title: operation.kind === 'evidence' ? 'Run added: your card is updated in Discord.'
      : operation.kind === 'replace' ? 'Strategy replaced: your card is updated in Discord.'
        : 'Strategy published: your card is in Discord.', detail: null }
  }
  if (expired || status?.status === 'expired' || status?.status === 'cancelled') {
    return { title: 'Not confirmed yet.', detail: 'Check the Strategy Browser.' }
  }
  return { title: 'Waiting for Discord', detail: `Paste it in the sharing channel. You can close this window; it keeps checking until ${new Date(expiresAt).toLocaleTimeString()} while the app stays open.` }
}

/** A private receipt acknowledges only its original target; it never selects a newer one. */
export function acknowledgedPublicationTarget(target: StrategyTarget | null, tracking: ResumedPublication, status: AuthorStatus): StrategyTarget | null {
  if (status.request_id !== tracking.request.request_id || status.outcome?.status !== 'published' ||
    !['confirmed', 'consumed'].includes(status.status)) throw new Error('The saved result does not match this share.')
  if (tracking.operation.kind === 'publication') return target
  if (status.outcome.strategy_id !== tracking.operation.strategy_id ||
    status.outcome.revision !== (tracking.operation.revision ?? 0) + (tracking.operation.kind === 'replace' ? 1 : 0))
    throw new Error('The saved result does not match this strategy version.')
  if (!target || target.state === 'legacy_review' || target.operation !== tracking.operation.kind ||
    target.revision !== tracking.operation.revision || !tracking.targetGeneration) return target
  return acknowledgeStrategyTarget(target, tracking.targetGeneration, status.outcome.strategy_id, status.outcome.revision)
}
