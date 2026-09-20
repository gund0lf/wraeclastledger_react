import type { AuthorReceipt } from './authorRecognition'
import type { AuthorSubmissionMetadata } from './authorSubmission'
import { normalizePublicAuthorName } from './authorNames'

export const AUTHOR_HANDOFF_CHANNEL = 'author-handoff:request'
export const AUTHOR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export interface AuthorContext { sessionId: string; generation: string }
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
  | { action: 'activate'; context: AuthorContext | null }
  | { action: 'prepare'; context: AuthorContext; operation: AuthorManagement }
  | { action: 'publication'; context: AuthorContext; core: string; metadata: AuthorSubmissionMetadata; confirmation: boolean }
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
export interface AuthorConfirmation extends AuthorReceipt { outcome: AuthorOutcome }
export interface AuthorResults {
  available: boolean
  read: unknown
  state: AuthorServiceState
  activate: null
  prepare: PreparedAuthorRequest
  publication: { token: string; request: PreparedAuthorRequest | null }
  status: AuthorStatus
  paste: AuthorConfirmation
  accept: AuthorConfirmation
  cancel: null
}
export type AuthorResult<K extends keyof AuthorResults> =
  | { ok: true; value: AuthorResults[K] }
  | { ok: false; error: string; terminal?: boolean }
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
