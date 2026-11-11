import type { AuthorReceipt } from './authorRecognition'
import type { AuthorSubmissionMetadata } from './authorSubmission'
import { normalizePublicAuthorName } from './authorNames'
import type { DurableShareView } from './durableShare'

export const AUTHOR_HANDOFF_CHANNEL = 'author-handoff:request'
export const AUTHOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export interface AuthorContext { sessionId: string; generation: string }
export type ShareStorageCode = 'encryption_unavailable' | 'damaged' | 'full' | 'io' | 'recovery_required'
export type AuthorScope = { kind: 'all_eligible' } | { kind: 'selected'; strategy_ids: string[] }
export type AuthorManagement =
  | { kind: 'recovery'; intent: null }
  | { kind: 'initial_assignment'; intent: { author: AuthorSubmissionMetadata['author']; scope: AuthorScope } }
  | { kind: 'reassignment'; intent: { registration_id: string; scope: AuthorScope } }
  | { kind: 'unregister'; intent: { registration_id: string } }
export type AuthorRequest =
  | { action: 'available' }
  | { action: 'read'; path: string }
  | { action: 'state' }
  | { action: 'share-results' }
  | { action: 'share-refresh'; shareId?: string }
  | { action: 'share-noticed'; shareId: string }
  | { action: 'share-copied'; context: AuthorContext; sessionIdentity: string; shareId: string; draftRevision: number }
  | { action: 'share-result'; context: AuthorContext; sessionIdentity: string; targetGeneration: string | null }
  | { action: 'resume-name'; context: AuthorContext; sessionIdentity: string }
  | { action: 'share-draft'; sessionId: string; sessionIdentity: string }
  | { action: 'activate'; context: AuthorContext | null }
  | { action: 'storage-recovery-preview'; context: AuthorContext }
  | { action: 'storage-recovery-confirm'; context: AuthorContext; recoveryId: string; confirmed: true }
  | { action: 'prepare'; context: AuthorContext; operation: AuthorManagement }
  | { action: 'publication'; context: AuthorContext; core: string; metadata: AuthorSubmissionMetadata; confirmation: boolean; newIntent: false; sessionIdentity: string; targetGeneration?: string | null; recoveryConfirmed?: true }
  | { action: 'status' | 'paste' | 'accept' | 'cancel'; context: AuthorContext; requestId: string }
export interface AuthorServiceState { schema_version: 1; epoch: string; author_actions_available: boolean }
export type AuthorOutcome =
  | { status: 'recovered' }
  | { status: 'published'; strategy_id: string; revision: number }
  | { status: 'assigned' | 'retired'; registration_id: string; count: number }
export interface AuthorStatus {
  request_id: string; epoch: string
  status: 'pending' | 'confirmed' | 'consumed' | 'expired' | 'cancelled'
  expires_at: string; outcome: AuthorOutcome | null
}
export interface PreparedAuthorRequest { request_id: string; client_request_id: string; expires_at: string }
export interface PublicationOperation {
  kind: 'publication' | 'replace' | 'evidence'
  strategy_id: string | null
  revision: number | null
}
export interface AuthorConfirmation extends AuthorReceipt { outcome: AuthorOutcome }
export interface AuthorResults {
  available: boolean
  read: unknown
  state: AuthorServiceState
  'share-results': DurableShareView[]
  'share-refresh': null
  'share-noticed': null
  'share-copied': DurableShareView
  'share-result': DurableShareView | null
  'resume-name': PreparedAuthorRequest | null
  'share-draft': { core: string; author?: AuthorSubmissionMetadata['author'] } | null
  activate: null
  'storage-recovery-preview': { recoveryId: string }
  'storage-recovery-confirm': { recoveredAt: number }
  prepare: PreparedAuthorRequest
  publication: { token: string; request: PreparedAuthorRequest | null; acknowledgement: 'name' | 'operation'; share: DurableShareView }
  status: AuthorStatus
  paste: AuthorConfirmation
  accept: AuthorConfirmation
  cancel: null
}
export type AuthorResult<K extends keyof AuthorResults> =
  | { ok: true; value: AuthorResults[K] }
  | { ok: false; error: string; terminal?: boolean; storageCode?: ShareStorageCode; recoveryConfirmationRequired?: true }
export type AuthorBridge = <T extends AuthorRequest>(request: T) => Promise<AuthorResult<T['action']>>

export function closedAuthorObject(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
}
export function validAuthorContext(value: unknown): value is AuthorContext {
  return closedAuthorObject(value, ['sessionId', 'generation']) &&
    typeof value.sessionId === 'string' && value.sessionId.length > 0 && value.sessionId.length <= 128 &&
    typeof value.generation === 'string' && AUTHOR_UUID.test(value.generation)
}
export function validateAuthorManagement(value: unknown): AuthorManagement {
  if (!closedAuthorObject(value, ['kind', 'intent'])) throw new Error('Invalid author operation')
  const i = value.intent
  if (value.kind === 'recovery' && i === null) return { kind: 'recovery', intent: null }
  const validRegistration = (id: unknown): id is string => typeof id === 'string' && AUTHOR_UUID.test(id)
  const scope = (s: unknown): AuthorScope => {
    if (closedAuthorObject(s, ['kind']) && s.kind === 'all_eligible') return { kind: 'all_eligible' }
    if (!closedAuthorObject(s, ['kind', 'strategy_ids']) || s.kind !== 'selected' ||
      !Array.isArray(s.strategy_ids) || s.strategy_ids.length < 1 || s.strategy_ids.length > 100 ||
      !s.strategy_ids.every(validRegistration) || new Set(s.strategy_ids).size !== s.strategy_ids.length)
      throw new Error('Choose between one and 100 unique strategies')
    return { kind: 'selected', strategy_ids: [...s.strategy_ids].sort() }
  }
  if (value.kind === 'initial_assignment' && closedAuthorObject(i, ['author', 'scope']) &&
    closedAuthorObject(i.author, ['name', 'registration_id']) && typeof i.author.name === 'string' &&
    (i.author.registration_id === null || validRegistration(i.author.registration_id))) {
    const name = normalizePublicAuthorName(i.author.name).name
    if (name !== i.author.name) throw new Error('Use the normalized public name')
    return { kind: 'initial_assignment', intent: { author: { name, registration_id: i.author.registration_id }, scope: scope(i.scope) } }
  }
  if (value.kind === 'reassignment' && closedAuthorObject(i, ['registration_id', 'scope']) && validRegistration(i.registration_id))
    return { kind: 'reassignment', intent: { registration_id: i.registration_id, scope: scope(i.scope) } }
  if (value.kind === 'unregister' && closedAuthorObject(i, ['registration_id']) && validRegistration(i.registration_id))
    return { kind: 'unregister', intent: { registration_id: i.registration_id } }
  throw new Error('Invalid author operation')
}

export function parseAuthorOutcome(value: unknown): AuthorOutcome {
  if (closedAuthorObject(value, ['status']) && value.status === 'recovered') return { status: 'recovered' }
  if (closedAuthorObject(value, ['status', 'strategy_id', 'revision']) && value.status === 'published' &&
    typeof value.strategy_id === 'string' && AUTHOR_UUID.test(value.strategy_id) &&
    Number.isInteger(value.revision) && (value.revision as number) > 0 && (value.revision as number) <= 2147483647)
    return { status: 'published', strategy_id: value.strategy_id, revision: value.revision as number }
  if (closedAuthorObject(value, ['status', 'registration_id', 'count']) &&
    (value.status === 'assigned' || value.status === 'retired') &&
    typeof value.registration_id === 'string' && AUTHOR_UUID.test(value.registration_id) &&
    Number.isInteger(value.count) && (value.count as number) >= 0)
    return { status: value.status, registration_id: value.registration_id, count: value.count as number }
  throw new Error('Invalid author outcome')
}
