/**
 * exportBudget.ts - character-budget math for the Discord share export.
 *
 * WHY: the bot re-posts the export as a card (attribution header + app-emote
 * decoration) bound by Discord's 2,000-unit message limit. Measured on a real
 * card (2026-07-19): plain 1,714 / decorated 2,290 - the emote refs add ~29
 * units per marker, and unbounded notes could previously push even the PLAIN
 * card past the limit, hitting the bot's (now removed) truncation fallback.
 * This module gives ShareModal a live budget so oversized exports are
 * prevented at the SOURCE, and a projection of whether the bot's decorated
 * card will fit (i.e. whether the share keeps its app emotes).
 *
 * COUNTING: Discord's limit and the bot's check (`card.js`, `.length`) both
 * count UTF-16 code units, so every figure here uses plain JS `.length`.
 * Astral-plane emoji count as 2 units - consistent on both sides.
 *
 * The header/versionLine and pooled-results templates MIRROR bot/card.js.
 * The allowance reserves whichever presentation is longer, so an export that
 * fits when first published cannot become unrenderable when later evidence
 * turns it into a pooled card. If either bot template changes, update it here
 * in the same batch - exportBudget.test.ts pins the derived allowance.
 *
 * ASCII-source rule: no raw emoji/middot literals - escapes only.
 */
import { EXPORT_EMOJI } from './discordEmoji';
import { DISCORD_SHARE_COMMAND_MAX } from './discordShareWire';
import { LOOT_EVIDENCE_LABEL, type LootSummary } from './lootSummary';

export const DISCORD_MSG_LIMIT = 2000;

/** Strategy names are labels, not documents (and not your private session
 *  names) - cap keeps the card budget stable and the Browser column sane. */
export const STRAT_NAME_MAX = 80;

// ── Bot card header allowance (mirrors bot/card.js buildCard) ───────────────
// Normal header worst case: 32-char username, 20-digit snowflake, update-run
// version line with the longest PostgreSQL int4 revision and a "28 Sep" stamp.
// 📨 = envelope-with-arrow header emoji; · = middot.
const WORST_USERNAME = 'x'.repeat(32);
const WORST_SNOWFLAKE = '9'.repeat(20);
const WORST_HEADER =
  '\uD83D\uDCE8 **Shared by:** ' + WORST_USERNAME + ' (<@' + WORST_SNOWFLAKE + '>)\n' +
  '*v2147483647 \u00B7 updated 28 Sep*\n' +
  '\n';

// Pooled cards can drop attribution/version before dropping evidence metadata.
// Reserve that minimal fallback too. Evidence is capped at 100 runs and each
// compact run at 100,000 maps; fixed-point JS numbers are longest immediately
// below 1e21 (larger magnitudes switch to shorter exponent notation).
const WORST_FIXED_INTEGER = '9'.repeat(21);
const WORST_POOLED_HEADER =
  '**Pooled results:** 10000000 maps \u00B7 100 runs \u00B7 +'
  + WORST_FIXED_INTEGER + '.999d net/map\n'
  + '**Totals:** Invest ' + WORST_FIXED_INTEGER + '.9d'
  + ' \u00B7 Return -' + WORST_FIXED_INTEGER + '.9d'
  + ' \u00B7 Net +' + WORST_FIXED_INTEGER + '.9d\n'
  + '\n';

export const CURRENT_CARD_HEADER_ALLOWANCE = WORST_HEADER.length;
export const POOLED_CARD_HEADER_ALLOWANCE = WORST_POOLED_HEADER.length;
/** Compatibility name: this is the future pooled-card guarantee, not the
 * ordinary card header shown by the live preview meter. */
export const CARD_HEADER_ALLOWANCE = Math.max(
  CURRENT_CARD_HEADER_ALLOWANCE,
  POOLED_CARD_HEADER_ALLOWANCE,
);

// ── Emote decoration projection (mirrors bot/card.js decorate) ──────────────
// The bot emits SHORT refs since 2026-07-20: `<:wl:` + 19-digit id + `>` =
// 25 units per marker regardless of the uploaded emote's name. Extra cost
// per occurrence = 25 - unicode glyph length.
const SHORT_REF_LENGTH = 25;

const countOccurrences = (text: string, needle: string): number => {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = text.indexOf(needle);
  while (index !== -1) { count += 1; index = text.indexOf(needle, index + needle.length); }
  return count;
};

/** Length of `text` after the bot swaps every known marker for its emote ref. */
export function projectDecoratedLength(text: string): number {
  let extra = 0;
  for (const marker of Object.values(EXPORT_EMOJI)) {
    extra += countOccurrences(text, marker.uni) * (SHORT_REF_LENGTH - marker.uni.length);
  }
  return text.length + extra;
}

const DECORATION_FALLBACK_ORDER: readonly (keyof typeof EXPORT_EMOJI)[] = [
  'strategy', 'notes', 'tags', 'party', 'time', 'points', 'league', 'atlas',
  'astrolabe', 'delirium', 'scarabs', 'excluded', 'gem', 'search', 'run', 'slam',
  'chisel', 'stats', 'cost', 'returns', 'div', 'maps',
];

export type DecorationMode = 'full' | 'mixed' | 'unicode';

/** Mirrors the bot's selective fallback: remove only as many custom emotes as
 * needed to fit, starting with the least essential presentation markers. */
export function projectBestDecoratedLength(
  text: string,
  bodyLimit: number,
): { length: number; mode: DecorationMode } {
  let length = projectDecoratedLength(text);
  if (length <= bodyLimit) return { length, mode: 'full' };
  let decoratedOccurrences = 0;
  for (const marker of Object.values(EXPORT_EMOJI)) {
    decoratedOccurrences += countOccurrences(text, marker.uni);
  }
  for (const key of DECORATION_FALLBACK_ORDER) {
    const marker = EXPORT_EMOJI[key];
    const occurrences = countOccurrences(text, marker.uni);
    if (occurrences === 0) continue;
    length -= occurrences * (SHORT_REF_LENGTH - marker.uni.length);
    decoratedOccurrences -= occurrences;
    if (length <= bodyLimit) {
      return { length, mode: decoratedOccurrences > 0 ? 'mixed' : 'unicode' };
    }
  }
  return { length: text.length, mode: 'unicode' };
}

// ── Notes budget ────────────────────────────────────────────────────────────
// The notes line the export gains when notes are non-empty:
// `\n` + notes marker + ` **Notes:** ` + <the notes text>
const NOTES_LINE_OVERHEAD = 1 + EXPORT_EMOJI.notes.uni.length + ' **Notes:** '.length;

export interface ShareBudget {
  /** Compact author paste length. */
  wireLength: number;
  /** True when the compact author paste fits either a message or slash command. */
  fitsWire: boolean;
  /** True when the author can paste directly as a normal channel message. */
  fitsDirectWire: boolean;
  /** Plain export + worst-case bot header, in UTF-16 units. */
  plainCardLength: number;
  /** Emote-projected export + worst-case bot header. */
  decoratedCardLength: number;
  /** Length after the bot keeps as many custom emotes as the current card permits. */
  postedCardLength: number;
  decorationMode: DecorationMode;
  /** Plain length reserved for the largest future pooled-results header. */
  pooledPlainCardLength: number;
  /** True when the posted card is guaranteed to fit at all. */
  fitsPlain: boolean;
  /** True when the bot's emote-decorated form also fits (no unicode fallback). */
  fitsDecorated: boolean;
  /** How many more UTF-16 units of notes fit before the plain card overflows.
   *  Negative = current notes already exceed the budget (copy must disable). */
  notesRemaining: number;
  /** Cap to apply to the notes input right now (never negative). */
  notesMax: number;
}

const visibleCardExport = (exportText: string): string => exportText
  .replace(new RegExp(`^${LOOT_EVIDENCE_LABEL}:\\s*\\S+\\s*(?:\\r?\\n|$)`, 'gim'), '')
  .trimEnd();

/** Presentation-only Discord-card compaction. The canonical readable export
 * and compact submission retain their authored Chaos values; only the posted
 * card (and its desktop preview/budget) changes units. Per-map cost and Divine
 * price intentionally stay in Chaos, while the three session totals switch at
 * one Divine. */
export function presentAuthoredTotals(exportText: string): string {
  const divinePriceMatch = exportText.match(/Divine Price:\*{0,2}\s*([\d.]+)c/i);
  const divinePrice = divinePriceMatch ? Number(divinePriceMatch[1]) : 0;
  if (!Number.isFinite(divinePrice) || divinePrice <= 0) return exportText;

  return exportText.replace(
    /(Total Invest|Total Return|Net Profit):(\*{0,2}\s*)([+-]?[\d.]+)c/gi,
    (matched, label: string, separator: string, rawAmount: string) => {
      const chaos = Number(rawAmount);
      const divines = chaos / divinePrice;
      if (!Number.isFinite(divines) || Math.abs(divines) < 1) return matched;
      const explicitPlus = rawAmount.startsWith('+') && divines >= 0 ? '+' : '';
      return `${label}:${separator}${explicitPlus}${divines.toFixed(1)}d`;
    },
  );
}

const lootCaption = (summary: LootSummary | null): string => {
  if (!summary) return '';
  const manualCount = summary.rows.filter((row) => row.source === 'manual').length;
  const marketCount = summary.rows.filter((row) => row.valuation != null).length;
  return `**Loot breakdown:** ${summary.rows.length} item rows`
    + `${manualCount > 0 ? ` \u00B7 ${manualCount} manual (${summary.manualTotal.toFixed(1)}c)` : ''}\n`
    + `${marketCount > 0 ? `**Market revaluation:** ${marketCount} rows (${summary.marketRevaluation.toFixed(1)}c)\n` : ''}`;
};

/** Readable body the bot will post, excluding its Discord-author attribution
 * header (which is unavailable inside the desktop app). */
export function compactPostedCardPreview(
  exportText: string,
  summary: LootSummary | null,
): string {
  const caption = lootCaption(summary);
  const visible = presentAuthoredTotals(visibleCardExport(exportText));
  return `${caption}${caption ? '\n' : ''}${visible}`;
}

/**
 * @param exportText          full export built with the CURRENT notes text
 * @param exportTextNoNotes   same export built with empty notes
 * @param notesLength         current notes length in UTF-16 units
 */
export function computeShareBudget(
  exportText: string,
  exportTextNoNotes: string,
  notesLength: number,
): ShareBudget {
  const presented = presentAuthoredTotals(exportText);
  const presentedNoNotes = presentAuthoredTotals(exportTextNoNotes);
  const plainCardLength = CURRENT_CARD_HEADER_ALLOWANCE + presented.length;
  const decoratedCardLength = CURRENT_CARD_HEADER_ALLOWANCE + projectDecoratedLength(presented);
  const bestDecoration = projectBestDecoratedLength(
    presented,
    DISCORD_MSG_LIMIT - CURRENT_CARD_HEADER_ALLOWANCE,
  );
  const pooledPlainCardLength = CARD_HEADER_ALLOWANCE + presented.length;
  const budgetForNotes = DISCORD_MSG_LIMIT
    - CARD_HEADER_ALLOWANCE
    - presentedNoNotes.length
    - NOTES_LINE_OVERHEAD;
  return {
    wireLength: exportText.length,
    fitsWire: exportText.length <= DISCORD_SHARE_COMMAND_MAX,
    fitsDirectWire: exportText.length <= DISCORD_MSG_LIMIT,
    plainCardLength,
    decoratedCardLength,
    postedCardLength: CURRENT_CARD_HEADER_ALLOWANCE + bestDecoration.length,
    decorationMode: bestDecoration.mode,
    pooledPlainCardLength,
    fitsPlain: pooledPlainCardLength <= DISCORD_MSG_LIMIT,
    fitsDecorated: decoratedCardLength <= DISCORD_MSG_LIMIT,
    notesRemaining: budgetForNotes - notesLength,
    notesMax: Math.max(0, budgetForNotes),
  };
}

/** Budget the compact author paste and the bot's reconstructed visible card.
 * Loot evidence is carried inside the compact wire and rendered as an image, so its opaque
 * wl1 line is deliberately absent from the final-card projection. */
export function computeCompactShareBudget(
  wireText: string,
  exportText: string,
  exportTextNoNotes: string,
  notesLength: number,
  summary: LootSummary | null,
): ShareBudget {
  const visible = presentAuthoredTotals(visibleCardExport(exportText));
  const visibleNoNotes = presentAuthoredTotals(visibleCardExport(exportTextNoNotes));
  const caption = lootCaption(summary);
  const currentBody = caption.length + visible.length;
  const plainCardLength = CURRENT_CARD_HEADER_ALLOWANCE + currentBody;
  const decoratedCardLength = CURRENT_CARD_HEADER_ALLOWANCE + caption.length + projectDecoratedLength(visible);
  const bestDecoration = projectBestDecoratedLength(
    visible,
    DISCORD_MSG_LIMIT - CURRENT_CARD_HEADER_ALLOWANCE - caption.length,
  );
  const pooledPlainCardLength = CARD_HEADER_ALLOWANCE + currentBody;
  const budgetForNotes = DISCORD_MSG_LIMIT
    - CARD_HEADER_ALLOWANCE
    - caption.length
    - visibleNoNotes.length
    - NOTES_LINE_OVERHEAD;
  return {
    wireLength: wireText.length,
    fitsWire: wireText.length <= DISCORD_SHARE_COMMAND_MAX,
    fitsDirectWire: wireText.length <= DISCORD_MSG_LIMIT,
    plainCardLength,
    decoratedCardLength,
    postedCardLength: CURRENT_CARD_HEADER_ALLOWANCE + caption.length + bestDecoration.length,
    decorationMode: bestDecoration.mode,
    pooledPlainCardLength,
    fitsPlain: pooledPlainCardLength <= DISCORD_MSG_LIMIT,
    fitsDecorated: decoratedCardLength <= DISCORD_MSG_LIMIT,
    notesRemaining: budgetForNotes - notesLength,
    notesMax: Math.max(0, budgetForNotes),
  };
}
