/** Public author labels are pseudonyms. Normalization conveys no ownership. */
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
