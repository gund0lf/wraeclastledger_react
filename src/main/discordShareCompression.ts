import {
  brotliCompressSync,
  brotliDecompressSync,
  constants as zlibConstants,
} from 'node:zlib'

export const DISCORD_SHARE_BROTLI_PREFIX = 'wl3.'
export const DISCORD_SHARE_BROTLI_TOKEN_MAX = 6000
export const DISCORD_SHARE_BROTLI_OUTPUT_MAX = 128 * 1024

const normalizedToken = (raw: string): string => raw
  .trim()
  .replace(/^```\s*/m, '')
  .replace(/\s*```\s*$/m, '')
  .trim()

const validatedPayloadJson = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length >= DISCORD_SHARE_BROTLI_OUTPUT_MAX) {
    throw new TypeError('Compact Discord payload is outside the allowed size')
  }
  const payload = JSON.parse(raw) as unknown
  if (!Array.isArray(payload) || payload[0] !== 4) {
    throw new TypeError('Compact Discord payload has an unsupported schema')
  }
  return raw
}

/** Node owns Brotli because Chromium's CompressionStream does not expose it. */
export function encodeDiscordShareBrotli(rawPayloadJson: unknown): string {
  const payloadJson = validatedPayloadJson(rawPayloadJson)
  const compressed = brotliCompressSync(Buffer.from(payloadJson, 'utf8'), {
    params: {
      [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
      [zlibConstants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(payloadJson, 'utf8'),
    },
  })
  return `${DISCORD_SHARE_BROTLI_PREFIX}${compressed.toString('base64url')}`
}

export function decodeDiscordShareBrotli(rawToken: unknown): string {
  if (typeof rawToken !== 'string') throw new TypeError('Compact Discord token is invalid')
  const token = normalizedToken(rawToken)
  if (token.length > DISCORD_SHARE_BROTLI_TOKEN_MAX) {
    throw new TypeError('Compact Discord token is outside the allowed size')
  }
  const match = /^wl3\.([A-Za-z0-9_-]+)$/.exec(token)
  if (!match) throw new TypeError('Compact Discord token is invalid')
  const payloadJson = brotliDecompressSync(Buffer.from(match[1], 'base64url'), {
    maxOutputLength: DISCORD_SHARE_BROTLI_OUTPUT_MAX,
  }).toString('utf8')
  return validatedPayloadJson(payloadJson)
}
