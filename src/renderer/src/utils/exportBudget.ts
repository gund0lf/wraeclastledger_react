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
import { LOOT_EVIDENCE_LABEL, type LootSummary } from './lootSummary';

export const DISCORD_MSG_LIMIT = 2000;

/** Strategy names are labels, not documents (and not your private session
 *  names) - cap keeps the card budget stable and the Browser column sane. */
export const STRAT_NAME_MAX = 80;

// ── Bot card header allowance (mirrors bot/card.js buildCard) ───────────────
// Normal header worst case: 32-char username, 20-digit snowflake, update-run
// version line with a 2-digit revision and a "28 Sep"-style stamp.
// 📨 = envelope-with-arrow header emoji; · = middot.
const WORST_USERNAME = 'x'.repeat(32);
const WORST_SNOWFLAKE = '9'.repeat(20);
const WORST_HEADER =
  '\uD83D\uDCE8 **Shared by:** ' + WORST_USERNAME + ' (<@' + WORST_SNOWFLAKE + '>)\n' +
  '*v99 \u00B7 updated 28 Sep*\n' +
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

export const CARD_HEADER_ALLOWANCE = Math.max(
  WORST_HEADER.length,
  WORST_POOLED_HEADER.length,
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

// ── Notes budget ────────────────────────────────────────────────────────────
// The notes line the export gains when notes are non-empty:
// `\n` + notes marker + ` **Notes:** ` + <the notes text>
const NOTES_LINE_OVERHEAD = 1 + EXPORT_EMOJI.notes.uni.length + ' **Notes:** '.length;

export interface ShareBudget {
  /** Compact author paste length. */
  wireLength: number;
  /** True when the compact author paste fits one Discord message. */
  fitsWire: boolean;
  /** Plain export + worst-case bot header, in UTF-16 units. */
  plainCardLength: number;
  /** Emote-projected export + worst-case bot header. */
  decoratedCardLength: number;
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
  return `${caption}${caption ? '\n' : ''}${visibleCardExport(exportText)}`;
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
  const plainCardLength = CARD_HEADER_ALLOWANCE + exportText.length;
  const decoratedCardLength = CARD_HEADER_ALLOWANCE + projectDecoratedLength(exportText);
  const budgetForNotes = DISCORD_MSG_LIMIT
    - CARD_HEADER_ALLOWANCE
    - exportTextNoNotes.length
    - NOTES_LINE_OVERHEAD;
  return {
    wireLength: exportText.length,
    fitsWire: exportText.length <= DISCORD_MSG_LIMIT,
    plainCardLength,
    decoratedCardLength,
    fitsPlain: plainCardLength <= DISCORD_MSG_LIMIT,
    fitsDecorated: decoratedCardLength <= DISCORD_MSG_LIMIT,
    notesRemaining: budgetForNotes - notesLength,
    notesMax: Math.max(0, budgetForNotes),
  };
}

/** Budget the compact author paste and the bot's reconstructed visible card.
 * Loot evidence is carried inside wl2 and rendered as an image, so its opaque
 * wl1 line is deliberately absent from the final-card projection. */
export function computeCompactShareBudget(
  wireText: string,
  exportText: string,
  exportTextNoNotes: string,
  notesLength: number,
  summary: LootSummary | null,
): ShareBudget {
  const visible = visibleCardExport(exportText);
  const visibleNoNotes = visibleCardExport(exportTextNoNotes);
  const caption = lootCaption(summary);
  const plainCardLength = CARD_HEADER_ALLOWANCE + caption.length + visible.length;
  const decoratedCardLength = CARD_HEADER_ALLOWANCE + caption.length + projectDecoratedLength(visible);
  const budgetForNotes = DISCORD_MSG_LIMIT
    - CARD_HEADER_ALLOWANCE
    - caption.length
    - visibleNoNotes.length
    - NOTES_LINE_OVERHEAD;
  return {
    wireLength: wireText.length,
    fitsWire: wireText.length <= DISCORD_MSG_LIMIT,
    plainCardLength,
    decoratedCardLength,
    fitsPlain: plainCardLength <= DISCORD_MSG_LIMIT,
    fitsDecorated: decoratedCardLength <= DISCORD_MSG_LIMIT,
    notesRemaining: budgetForNotes - notesLength,
    notesMax: Math.max(0, budgetForNotes),
  };
}
