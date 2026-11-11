import { createHash } from 'node:crypto'
import { buildAuthorSubmission, canonicalAuthorJson, type AuthorSubmissionMetadata } from '../shared/authorSubmission'
import { AUTHOR_UUID, closedAuthorObject, type PublicationOperation } from '../shared/authorHandoff'
import { parseDurableShareResult, parseCompletedShareOutcome, type DurableShareResult, type ActiveDurableShareView, type CompletedShareView } from '../shared/durableShare'

export interface ShareDraft {
  revision: number
  core: string
  metadata: AuthorSubmissionMetadata
  payloadSha256: string
}
export interface DurableShareRecord {
  id: string
  readerSecret: string
  sessionIdentity: string
  sessionId: string
  epoch: string
  operation: PublicationOperation
  targetGeneration: string | null
  draft: ShareDraft | null
  proposed: ShareDraft | null
  result: DurableShareResult | null
  noticed: boolean
  copiedRevision?: number | null
  /** Main-process scheduling metadata, not a deadline or publication authority. */
  pollingActivityAt?: number
}
export interface CompletedShareRecord {
  id: string
  sessionIdentity: string
  targetGeneration: string | null
  draftRevision: number
  operation: PublicationOperation
  outcome: NonNullable<DurableShareResult['outcome']>
}
export function validCompletedShare(value: unknown): value is CompletedShareRecord {
  if (!closedAuthorObject(value, ['id', 'sessionIdentity', 'targetGeneration', 'draftRevision', 'operation', 'outcome']) ||
    typeof value.id !== 'string' || !AUTHOR_UUID.test(value.id) ||
    typeof value.sessionIdentity !== 'string' || !value.sessionIdentity || value.sessionIdentity.length > 128 ||
    !Number.isInteger(value.draftRevision) || (value.draftRevision as number) < 1 || (value.draftRevision as number) > 2147483647 ||
    !closedAuthorObject(value.operation, ['kind', 'strategy_id', 'revision'])) return false
  const o = value.operation
  if (o.kind === 'publication' ? o.strategy_id !== null || o.revision !== null || value.targetGeneration !== null :
    !['replace', 'evidence'].includes(o.kind as string) || typeof o.strategy_id !== 'string' || !AUTHOR_UUID.test(o.strategy_id) ||
    !Number.isInteger(o.revision) || (o.revision as number) < 1 || (o.revision as number) > 2147483647 ||
    typeof value.targetGeneration !== 'string' || !AUTHOR_UUID.test(value.targetGeneration)) return false
  try {
    parseCompletedShareOutcome(value.outcome, o as unknown as PublicationOperation)
  } catch { return false }
  return true
}
export function completedShare(s: DurableShareRecord): CompletedShareRecord {
  if (s.result?.state !== 'complete' || !s.result.outcome || !s.noticed || !s.draft || s.proposed)
    throw new Error('Only completed and noticed shares can be compacted.')
  return { id: s.id, sessionIdentity: s.sessionIdentity, targetGeneration: s.targetGeneration,
    draftRevision: s.draft.revision, operation: s.operation, outcome: s.result.outcome }
}
export function completedView(s: CompletedShareRecord): CompletedShareView {
  return { archived: true, id: s.id, draftRevision: s.draftRevision, copiedRevision: null, core: null, author: null,
    operation: s.operation, targetGeneration: s.targetGeneration, status: 'complete', accepted: true,
    outcome: s.outcome, noticed: true }
}
export function shareDraft(id: string, revision: number, core: string, metadata: AuthorSubmissionMetadata): ShareDraft {
  const meta = { ...metadata, confirmation_request_id: null, share_intent_id: id, draft_revision: revision }
  const plain = buildAuthorSubmission(core, meta)
  const payloadSha256 = createHash('sha256').update('WL-AUTHOR-HANDOFF/1\0')
    .update(canonicalAuthorJson(JSON.parse(plain))).digest('hex')
  return { revision, core, metadata: meta, payloadSha256 }
}
export function validDurableShare(value: unknown): value is DurableShareRecord {
  if (!closedAuthorObject(value, ['id','readerSecret','sessionIdentity','sessionId','epoch','operation',
    'targetGeneration','draft','proposed','result','noticed',
    ...(value && typeof value === 'object' && Object.hasOwn(value, 'copiedRevision') ? ['copiedRevision'] : []),
    ...(value && typeof value === 'object' && Object.hasOwn(value, 'pollingActivityAt') ? ['pollingActivityAt'] : [])]) ||
    typeof value.id !== 'string' || !AUTHOR_UUID.test(value.id) ||
    typeof value.epoch !== 'string' || !AUTHOR_UUID.test(value.epoch) ||
    typeof value.readerSecret !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value.readerSecret) ||
    typeof value.sessionIdentity !== 'string' || !value.sessionIdentity || value.sessionIdentity.length > 128 ||
    typeof value.sessionId !== 'string' || !value.sessionId || value.sessionId.length > 128 ||
    typeof value.noticed !== 'boolean' || !closedAuthorObject(value.operation, ['kind','strategy_id','revision'])) return false
  const o = value.operation
  if (o.kind === 'publication' ? o.strategy_id !== null || o.revision !== null || value.targetGeneration !== null :
    !['replace','evidence'].includes(o.kind as string) || typeof o.strategy_id !== 'string' || !AUTHOR_UUID.test(o.strategy_id) ||
    !Number.isInteger(o.revision) || (o.revision as number) < 1 || (o.revision as number) > 2147483647 ||
    typeof value.targetGeneration !== 'string' || !AUTHOR_UUID.test(value.targetGeneration)) return false
  try {
    for (const d of [value.draft, value.proposed]) {
      if (d === null) continue
      if (!closedAuthorObject(d, ['revision','core','metadata','payloadSha256']) || typeof d.core !== 'string' ||
        d.core.length > 128 * 1024 || !Number.isInteger(d.revision) || (d.revision as number) < 1) return false
      const built = shareDraft(value.id, d.revision as number, d.core, d.metadata as AuthorSubmissionMetadata)
      if (canonicalAuthorJson(built) !== canonicalAuthorJson(d)) return false
      const action = JSON.parse(d.core)[1]
      if (o.kind === 'publication' ? action !== 0 : !Array.isArray(action) ||
        action[0] !== (o.kind === 'replace' ? 1 : 2) || action[1] !== o.strategy_id ||
        built.metadata.expected_revision !== o.revision) return false
    }
    const s = value as unknown as DurableShareRecord
    if (s.pollingActivityAt !== undefined && (!Number.isSafeInteger(s.pollingActivityAt) || s.pollingActivityAt < 0)) return false
    if (s.copiedRevision != null && (!Number.isInteger(s.copiedRevision) || s.copiedRevision < 1 ||
      !s.draft || s.copiedRevision > s.draft.revision)) return false
    if (!s.draft && !s.proposed || s.proposed && s.proposed.revision !== (s.draft?.revision ?? 0) + 1) return false
    if (s.result) {
      if (!s.draft) return false
      parseDurableShareResult(s.result, s.id, s.draft.revision, s.operation)
    }
  } catch { return false }
  return true
}
export function shareView(s: DurableShareRecord, checking = false): ActiveDurableShareView {
  const draft = s.draft ?? s.proposed!
  const accepted = !!s.result && ['accepted', 'committed', 'complete'].includes(s.result.state)
  return { id: s.id, draftRevision: draft.revision, copiedRevision: s.copiedRevision ?? null, core: draft.core, author: draft.metadata.author,
    operation: s.operation, targetGeneration: s.targetGeneration, noticed: s.noticed, accepted,
    status: s.result?.state === 'complete' ? 'complete' : s.result?.state === 'restore_review' ? 'restore_review' :
      checking || !s.draft ? 'checking' : accepted ? 'processing' : 'ready', outcome: s.result?.outcome ?? null }
}
