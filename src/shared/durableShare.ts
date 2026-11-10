import { AUTHOR_UUID, closedAuthorObject, type PublicationOperation } from './authorHandoff'
import type { AuthorSubmissionMetadata } from './authorSubmission'
import type { StrategyTarget } from './strategyTarget'

export interface DurableShareResult {
  id: string
  epoch: string
  draft_revision: number
  kind: PublicationOperation['kind']
  state: 'ready' | 'accepted' | 'committed' | 'complete' | 'restore_review'
  outcome: { strategy_id: string; revision: number } | null
}
export interface DurableShareView {
  id: string
  draftRevision: number
  copiedRevision: number | null
  core: string
  author: AuthorSubmissionMetadata['author']
  operation: PublicationOperation
  targetGeneration: string | null
  status: 'ready' | 'processing' | 'checking' | 'complete' | 'restore_review'
  accepted: boolean
  outcome: DurableShareResult['outcome']
  noticed: boolean
}
/** Presentation only. Preparation and replay protection still compare the full bound payload. */
function matchesShareForm(share: DurableShareView, core: string, target: StrategyTarget | null): boolean {
  if (share.operation.kind === 'publication') return target === null && share.targetGeneration === null && share.core === core
  if (!target || target.state === 'legacy_review' || target.operation !== share.operation.kind ||
    target.id !== share.operation.strategy_id || target.revision !== share.operation.revision ||
    target.generation !== share.targetGeneration || target.registrationId !== share.author.registration_id) return false
  try {
    const prepared: unknown = JSON.parse(share.core), form: unknown = JSON.parse(core)
    if (!Array.isArray(prepared) || !Array.isArray(form) || prepared.length !== form.length ||
      prepared[0] !== 4 || form[0] !== 4 || form[1] !== 0 || !Array.isArray(prepared[1]) ||
      prepared[1][0] !== (target.operation === 'replace' ? 1 : 2) || prepared[1][1] !== target.id ||
      (target.operation === 'evidence' && prepared[1][2] !== target.revision)) return false
    // The form has no continuation authority. That slot is supplied only after
    // the current target and run are revalidated during deliberate Copy.
    prepared[1] = 0
    return JSON.stringify(prepared) === JSON.stringify(form)
  } catch { return false }
}
export function shareCopyPresentation(share: DurableShareView | null, core: string, name: string, target: StrategyTarget | null = null) {
  const copied = share?.copiedRevision != null
  const changed = copied && (!matchesShareForm(share, core, target) || share.author.name !== name || share.copiedRevision !== share.draftRevision)
  return { label: changed ? 'Copy updated share' : copied ? 'Copy again' : 'Copy to Discord',
    pasteHint: copied && !changed && !share.accepted }
}
export function parseDurableShareResult(value: unknown, id: string, revision: number,
  operation: PublicationOperation): DurableShareResult {
  if (!closedAuthorObject(value, ['id','epoch','draft_revision','kind','state','outcome']) ||
    value.id !== id || typeof value.epoch !== 'string' || !AUTHOR_UUID.test(value.epoch) ||
    value.draft_revision !== revision || value.kind !== operation.kind ||
    !['ready','accepted','committed','complete','restore_review'].includes(value.state as string))
    throw new Error('Invalid share result')
  if (value.state === 'complete') {
    const o = value.outcome
    if (!closedAuthorObject(o, ['strategy_id','revision']) || typeof o.strategy_id !== 'string' ||
      !AUTHOR_UUID.test(o.strategy_id) || !Number.isInteger(o.revision) || (o.revision as number) < 1 ||
      (o.revision as number) > 2147483647 || (operation.kind !== 'publication' &&
        (o.strategy_id !== operation.strategy_id || o.revision !== operation.revision! + (operation.kind === 'replace' ? 1 : 0))))
      throw new Error('Share result belongs to another operation')
  } else if (value.outcome !== null) throw new Error('Unfinished share contains a result')
  return value as unknown as DurableShareResult
}
export function shareStatusText(view: Pick<DurableShareView, 'status' | 'operation'>): string {
  if (view.status === 'checking') return 'Checking share status…'
  if (view.status === 'processing') return 'Posted, updating Discord…'
  if (view.status === 'restore_review') return 'The service no longer has this share record. Check the Strategy Browser before sharing again.'
  if (view.status === 'complete') return view.operation.kind === 'evidence' ? 'Run added' : view.operation.kind === 'replace' ? 'Replaced' : 'Shared'
  return 'Ready to post'
}
