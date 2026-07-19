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
 * The header/versionLine templates MIRROR bot/card.js buildCard(). If the bot
 * header changes (e.g. the planned instruction-line slim), update the
 * templates here in the same batch - exportBudget.test.ts pins the derived
 * allowance so a drift is loud.
 *
 * ASCII-source rule: no raw emoji/middot literals - escapes only.
 */
import { EXPORT_EMOJI } from './discordEmoji';

export const DISCORD_MSG_LIMIT = 2000;

/** Strategy names are labels, not documents (and not your private session
 *  names) - cap keeps the card budget stable and the Browser column sane. */
export const STRAT_NAME_MAX = 80;

// ── Bot card header allowance (mirrors bot/card.js buildCard) ───────────────
// Worst case: 32-char username, 20-digit snowflake, update-run version line
// with a 2-digit revision and a "28 Sep"-style stamp.
// 📨 = envelope-with-arrow header emoji; · = middot.
const WORST_USERNAME = 'x'.repeat(32);
const WORST_SNOWFLAKE = '9'.repeat(20);
const WORST_HEADER =
  '\uD83D\uDCE8 **Shared by:** ' + WORST_USERNAME + ' (<@' + WORST_SNOWFLAKE + '>)\n' +
  '*Current result \u00B7 v99 \u00B7 updated 28 Sep*\n' +
  '*Copy this message into WraeclastLedger to import the strategy.*\n\n';

export const CARD_HEADER_ALLOWANCE = WORST_HEADER.length;

// ── Emote decoration projection (mirrors bot/card.js decorate) ──────────────
// A marker's app-emote ref is `<:` + name + `:` + id + `>`; live ids are 19
// digits. Extra cost per occurrence = ref length - unicode glyph length.
const EMOTE_ID_DIGITS = 19;

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
    const refLength = 2 + marker.name.length + 1 + EMOTE_ID_DIGITS + 1;
    extra += countOccurrences(text, marker.uni) * (refLength - marker.uni.length);
  }
  return text.length + extra;
}

// ── Notes budget ────────────────────────────────────────────────────────────
// The notes line the export gains when notes are non-empty:
// `\n` + notes marker + ` **Notes:** ` + <the notes text>
const NOTES_LINE_OVERHEAD = 1 + EXPORT_EMOJI.notes.uni.length + ' **Notes:** '.length;

export interface ShareBudget {
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
    plainCardLength,
    decoratedCardLength,
    fitsPlain: plainCardLength <= DISCORD_MSG_LIMIT,
    fitsDecorated: decoratedCardLength <= DISCORD_MSG_LIMIT,
    notesRemaining: budgetForNotes - notesLength,
    notesMax: Math.max(0, budgetForNotes),
  };
}
