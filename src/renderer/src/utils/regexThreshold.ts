/**
 * Exact integer-floor pattern for bounded Path of Exile percentage stats.
 *
 * Unlike the session-average helper in priceUtils, this never rounds a user-
 * authored floor down to the nearest ten. The generated forms are intentionally
 * compact because stash regexes are capped at 250 characters.
 */
export function exactIntegerThresholdPattern(floor: number): string {
  if (floor <= 0) return '\\d..';
  const f = Math.floor(floor);
  const range = (from: number, to = 9): string => from === to ? `${from}` : `[${from}-${to}]`;
  if (f >= 1000) return '\\d{4,}';
  if (f >= 100) {
    const hundreds = Math.floor(f / 100);
    const remainder = f % 100;
    if (remainder === 0) return hundreds === 1 ? '\\d..' : `${range(hundreds)}..`;
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    const parts = [
      ones === 0 ? `${hundreds}${range(tens)}.` : `${hundreds}${tens}${range(ones)}`,
      ...(ones > 0 && tens < 9 ? [`${hundreds}${range(tens + 1)}.`] : []),
    ];
    if (hundreds < 9) parts.push(`${range(hundreds + 1)}..`);
    return parts.join('|');
  }
  if (f >= 10) {
    const tens = Math.floor(f / 10);
    const ones = f % 10;
    return [
      ones === 0 ? `${range(tens)}.` : `${tens}${range(ones)}`,
      ...(ones > 0 && tens < 9 ? [`${range(tens + 1)}.`] : []),
      '\\d..',
    ].join('|');
  }
  return `${range(f)}|[1-9].|\\d..`;
}
