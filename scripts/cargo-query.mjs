/**
 * Encode a value as a Cargo SQL-esque string literal.
 *
 * Cargo recommends single-quoted text values. Escape backslashes first so an
 * existing backslash cannot neutralise the quote escape added afterward.
 */
export function cargoStringLiteral(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Cargo string literal value must be a string');
  }
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/**
 * Cargo may HTML-encode punctuation in returned title values. Decode the
 * entities names can legitimately contain before applying manifest-specific
 * normalization.
 */
export function decodeCargoText(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Cargo text value must be a string');
  }
  return value
    .replace(/&#(\d+);/g, (entity, decimal) => {
      const codePoint = Number(decimal);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&#x([0-9a-f]+);/gi, (entity, hexadecimal) => {
      const codePoint = Number.parseInt(hexadecimal, 16);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&');
}
