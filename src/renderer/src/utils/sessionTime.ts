/**
 * sessionTime.ts — session-time INPUT grammar (WP9 Tier 2).
 *
 * Companion to utils/timeEstimate.ts (Tier 1), which owns time DERIVATION
 * (computeTimeEstimate over parsedAt stamps) and display formatting
 * (formatActiveTime). This module owns only the human input side of the
 * ShareModal time field.
 *
 * Time is OPTIONAL author-declared context: div/MAP stays the primary profit
 * metric everywhere; div/h is a self-reported overlay computed from the value
 * produced here (locked WP9 decision — opting out is never punished).
 *
 * The WIRE format is always plain minutes ("**Session Time:** 245 min").
 */

/**
 * Parse a human time input into whole minutes.
 *
 * Accepted (BACKLOG spec, mirroring parsePriceInput's tolerance):
 *   "245"    -> 245   (plain number = minutes)
 *   "4h"     -> 240   (hours)
 *   "4.5h"   -> 270   (decimal hours, dot)
 *   "4,5h"   -> 270   (decimal hours, comma — EU keyboards)
 *   "90m" / "90 min" -> 90 (explicit minutes suffix tolerated)
 *
 * Returns null for empty/invalid/non-positive input — null means "no claim"
 * and suppresses the export line entirely.
 */
export function parseTimeInput(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const hours = s.match(/^(\d+(?:[.,]\d+)?)\s*h$/);
  if (hours) {
    const v = Math.round(parseFloat(hours[1].replace(',', '.')) * 60);
    return v > 0 ? v : null;
  }
  const mins = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minutes)?$/);
  if (mins) {
    const v = Math.round(parseFloat(mins[1].replace(',', '.')));
    return v > 0 ? v : null;
  }
  return null;
}
