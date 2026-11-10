import type { AuthorBridge, AuthorContext, AuthorResults, ResumedPublication } from '../../../shared/authorHandoff'
import type { StrategyTarget } from '../../../shared/strategyTarget'

/** A newly saved Continue choice owns its own result; old tracking cannot block it. */
export function publicationMatchesTarget(tracking: ResumedPublication, target: StrategyTarget | null): boolean {
  if (tracking.operation.kind === 'publication') return target === null && tracking.targetGeneration === null
  return !!target && target.state !== 'legacy_review' && tracking.targetGeneration === target.generation &&
    tracking.operation.kind === target.operation && tracking.operation.strategy_id === target.id &&
    tracking.operation.revision === target.revision
}

/** Undefined discards a stale response after close or session/target change. */
export async function resumeSelectedPublication(bridge: AuthorBridge, context: AuthorContext, sessionIdentity: string,
  target: StrategyTarget | null, isCurrent: () => boolean): Promise<ResumedPublication | null | undefined> {
  const result = await bridge({ action: 'resume-publication', context, sessionIdentity })
  if (!isCurrent()) return undefined
  if (!result.ok) throw new Error(result.error)
  if (!result.value || publicationMatchesTarget(result.value, target)) return result.value
  const cancelled = await bridge({ action: 'cancel-publication', context, sessionIdentity })
  if (!isCurrent()) return undefined
  if (!cancelled.ok) throw new Error(cancelled.error)
  return null
}

export type RestoredPublicationDraft = Required<NonNullable<AuthorResults['share-draft']>>

/** Only an existing ordinary operation uses these original public fields. They grant no name recognition. */
export async function restorePendingPublicationDraft(bridge: AuthorBridge, context: AuthorContext, sessionIdentity: string,
  isCurrent: () => boolean): Promise<RestoredPublicationDraft | undefined> {
  const result = await bridge({ action: 'share-draft', sessionId: context.sessionId, sessionIdentity })
  if (!isCurrent()) return undefined
  if (!result.ok) throw new Error(result.error)
  if (!result.value?.author) throw new Error('The original share details are unavailable. Check the Strategy Browser before preparing again.')
  return { core: result.value.core, author: { ...result.value.author } }
}
