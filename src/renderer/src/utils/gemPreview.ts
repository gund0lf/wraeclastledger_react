/**
 * Preview-only index over normalized, deduplicated gem catalogue names.
 * Build once with the icon cache; each keystroke then needs only a Map lookup.
 * Distinct names remain ambiguous even when they happen to share artwork.
 * This never resolves loot identity or changes the authored exclusion text.
 */
export function buildGemPreviewIndex(gems: ReadonlyMap<string, string>): Map<string, string> {
  const prefixes = new Map<string, string | null>();
  for (const [name, icon] of gems) {
    if (!name || !icon) continue;
    for (let length = 1; length <= name.length; length++) {
      const prefix = name.slice(0, length);
      prefixes.set(prefix, prefixes.has(prefix) ? null : icon);
    }
  }
  // An exact base gem beats longer variants sharing its complete name.
  for (const [name, icon] of gems) {
    if (name && icon) prefixes.set(name, icon);
  }
  return new Map([...prefixes].filter((entry): entry is [string, string] => entry[1] !== null));
}
