import { normalizePublicAuthorName } from './authorNames'
export interface AuthorSubmissionMetadata {
  author: { name: string; registration_id: string | null }
  expected_revision: number | null
  confirmation_request_id: string | null
  share_intent_id?: string | null
  draft_revision?: number
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export function canonicalAuthorJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return '[' + value.map(canonicalAuthorJson).join(',') + ']'
  if (value && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>
    return (
      '{' +
      Object.keys(record)
        .sort()
        .map((key) => JSON.stringify(key) + ':' + canonicalAuthorJson(record[key]))
        .join(',') +
      '}'
    )
  }
  throw new Error('Invalid author payload')
}
/** Explicit opt-in envelope. Ordinary release emitters continue using v4. */
export function buildAuthorSubmission(
  coreJson: string,
  metadata: AuthorSubmissionMetadata
): string {
  const core: unknown = JSON.parse(coreJson)
  if (
    !Array.isArray(core) ||
    core.length !== 12 ||
    core[0] !== 4 ||
    JSON.stringify(core) !== coreJson ||
    !['author,confirmation_request_id,expected_revision', 'author,confirmation_request_id,expected_revision,share_intent_id',
      'author,confirmation_request_id,draft_revision,expected_revision,share_intent_id'].includes(Object.keys(metadata).sort().join(',')) ||
    Object.keys(metadata.author).sort().join(',') !== 'name,registration_id' ||
    normalizePublicAuthorName(metadata.author.name).name !== metadata.author.name ||
    (metadata.author.registration_id !== null && !uuid.test(metadata.author.registration_id)) ||
    (metadata.confirmation_request_id !== null && !uuid.test(metadata.confirmation_request_id))
  ) {
    throw new Error('Invalid author payload')
  }
  if (
    core[1] === 0
      ? metadata.expected_revision !== null
      : !Number.isInteger(metadata.expected_revision) ||
        metadata.expected_revision! < 1 ||
        metadata.expected_revision! > 2147483647 ||
        metadata.author.registration_id === null
  )
    throw new Error('Invalid author target')
  if (Object.hasOwn(metadata, 'draft_revision') && (!Number.isInteger(metadata.draft_revision) ||
    metadata.draft_revision! < 1 || metadata.draft_revision! > 2147483647 ||
    typeof metadata.share_intent_id !== 'string' || !uuid.test(metadata.share_intent_id)))
    throw new Error('Invalid share draft')
  if (!Object.hasOwn(metadata, 'draft_revision') && Object.hasOwn(metadata, 'share_intent_id') && (core[1] === 0
    ? typeof metadata.share_intent_id !== 'string' || !uuid.test(metadata.share_intent_id)
    : metadata.share_intent_id !== null)) throw new Error('Invalid share intent')
  if (Array.isArray(core[1]) && core[1][0] === 2 && core[1][2] !== metadata.expected_revision)
    throw new Error('Evidence revision changed')
  const version = Object.hasOwn(metadata, 'draft_revision') ? 7 : Object.hasOwn(metadata, 'share_intent_id') ? 6 : 5
  const text = JSON.stringify([version, core, metadata])
  if (new TextEncoder().encode(text).length > 128 * 1024)
    throw new Error('Author share is too large')
  canonicalAuthorJson([version, core, metadata])
  return text
}
