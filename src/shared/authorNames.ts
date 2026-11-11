/** Public author labels are pseudonyms. Normalization conveys no ownership. */
export const PUBLIC_NAME_RETENTION_NOTICE = 'Registering a public name stores your Discord account ID and chosen name in private recovery records to protect against abuse and data loss. These records are not routinely deleted. Retiring a name or forgetting it on this device does not erase them.'
export const SHARE_STATUS_RETENTION_NOTICE = 'Private share-status records are kept so old copies cannot create duplicate shares and the app can check the result later. Share-status records drop your Discord ID once sharing finishes. Strategy and recovery records still retain ownership information.'
export const PUBLIC_NAME_RETIRE_NOTICE = 'Strategy pages will show Anonymous. Existing Discord cards keep the name until removed; retiring it does not automatically update those cards.'
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
const reserved = new Set([
  'wraeclastledger',
  'admin',
  'administrator',
  'moderator',
  'system',
  'support',
  'wledger'
])
export function normalizePublicAuthorName(input: unknown): { name: string; key: string } {
  if (
    typeof input !== 'string' ||
    input.length > 256 ||
    /[\p{Default_Ignorable_Code_Point}\u20E3]/u.test(input) ||
    /[^\p{L}\p{N}\p{M} _.'-]/u.test(input)
  ) {
    throw new Error(
      'Use letters, numbers, ordinary spaces, underscores, hyphens, periods or apostrophes.'
    )
  }
  const name = input
    .normalize('NFKC')
    .replace(/^ +| +$/g, '')
    .replace(/ +/g, ' ')
  const length = [...segmenter.segment(name)].length
  if (
    length < 2 ||
    length > 32 ||
    !/[\p{L}\p{N}]/u.test(name) ||
    /[^\p{L}\p{N}\p{M} _.'-]/u.test(name)
  ) {
    throw new Error('Public author names need 2–32 characters and at least one letter or number.')
  }
  const key = name.toLowerCase()
  if (reserved.has(key)) throw new Error('That name is reserved for system use.')
  return { name, key }
}
