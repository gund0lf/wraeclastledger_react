import { buildAuthorSubmission, canonicalAuthorJson, type AuthorSubmissionMetadata } from './authorSubmission'
import { AUTHOR_UUID, closedAuthorObject } from './authorHandoff'

/** Local publication bookkeeping, not ownership authority or portable session data. */
export interface ShareIntentSnapshot {
  version: 1
  sessionId: string
  intentId: string
  core: string
  metadata: AuthorSubmissionMetadata
}
export class ShareIntentError extends Error {}
export const SHARE_CONTENT_CHANGED = 'This share differs from the one already prepared. If you have not posted it, choose Start a new separate share explicitly, then prepare your changes and discard the old copied text. If you already posted it, do not start another share: finish confirmation (or Recover in Manage public names), then choose Replace and Continue strategy in the Strategy Browser.'

export function parseShareIntent(value: unknown): ShareIntentSnapshot {
  if (!closedAuthorObject(value, ['version', 'sessionId', 'intentId', 'core', 'metadata']) || value.version !== 1 ||
    typeof value.sessionId !== 'string' || value.sessionId.length < 1 || value.sessionId.length > 128 ||
    typeof value.intentId !== 'string' || !AUTHOR_UUID.test(value.intentId) || typeof value.core !== 'string' ||
    !closedAuthorObject(value.metadata, ['author', 'expected_revision', 'confirmation_request_id']) ||
    value.metadata.confirmation_request_id !== null || value.metadata.expected_revision !== null)
    throw new ShareIntentError('The saved share intent is invalid. Keep this session and review its recovery data.')
  const snapshot = value as unknown as ShareIntentSnapshot
  buildAuthorSubmission(snapshot.core, { ...snapshot.metadata, share_intent_id: snapshot.intentId })
  if (JSON.parse(snapshot.core)[1] !== 0) throw new ShareIntentError('Invalid publication intent.')
  return snapshot
}

export function selectShareIntent(previous: ShareIntentSnapshot | null, sessionId: string, core: string,
  metadata: AuthorSubmissionMetadata, startNew: boolean, createId: () => string): ShareIntentSnapshot {
  // Confirmation is transport state, never part of the immutable submission.
  if (metadata.confirmation_request_id !== null || Object.hasOwn(metadata, 'share_intent_id'))
    throw new ShareIntentError('Invalid share intent input.')
  if (previous && !startNew) {
    const saved = parseShareIntent(previous)
    const sameAuthor = saved.metadata.author.name === metadata.author.name &&
      (saved.metadata.author.registration_id === null || metadata.author.registration_id === null ||
        saved.metadata.author.registration_id === metadata.author.registration_id)
    if (saved.sessionId !== sessionId || !sameAuthor || metadata.expected_revision !== null ||
      canonicalAuthorJson(JSON.parse(saved.core)) !== canonicalAuthorJson(JSON.parse(core)))
      throw new ShareIntentError(SHARE_CONTENT_CHANGED)
    // A just-confirmed registration must not rewrite the originally submitted metadata.
    return structuredClone(saved)
  }
  return parseShareIntent({ version: 1, sessionId, intentId: createId(), core, metadata: structuredClone(metadata) })
}

export function defaultShareConfirmation(continuation: boolean, confirmedName: boolean): boolean {
  return !continuation && !confirmedName
}
