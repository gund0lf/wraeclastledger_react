import { describe, expect, it } from 'vitest';
import { EXPORT_EMOJI } from './discordEmoji';
import {
  CARD_HEADER_ALLOWANCE,
  DISCORD_MSG_LIMIT,
  STRAT_NAME_MAX,
  computeShareBudget,
  projectDecoratedLength,
} from './exportBudget';

describe('exportBudget', () => {
  it('pins the worst-case bot header allowance so template drift is loud', () => {
    // Mirrors bot/card.js buildCard as deployed 2026-07-20: header emoji +
    // 32-char username + 20-digit snowflake mention + slimmed version line +
    // blank separator (the instruction line is gone).
    const worstHeader =
      '📨 **Shared by:** ' + 'x'.repeat(32) + ' (<@' + '9'.repeat(20) + '>)\n' +
      '*v99 · updated 28 Sep*\n' +
      '\n';
    expect(CARD_HEADER_ALLOWANCE).toBe(worstHeader.length);
    // Sanity envelope: a header can never plausibly leave this band.
    expect(CARD_HEADER_ALLOWANCE).toBeGreaterThan(80);
    expect(CARD_HEADER_ALLOWANCE).toBeLessThan(150);
  });

  it('projects short-ref decoration cost per occurrence, including VS16 markers', () => {
    // Short ref <:wl:19-digit-id> = 25 units regardless of emote name.
    const scarab = EXPORT_EMOJI.scarabs.uni; // 2-unit glyph -> +23
    expect(projectDecoratedLength(scarab)).toBe(2 + 23);
    // wl_deli glyph carries a variation selector (3 units) -> +22.
    const deli = EXPORT_EMOJI.delirium.uni;
    expect(deli.length).toBe(3);
    expect(projectDecoratedLength(deli)).toBe(3 + 22);
    // Two occurrences count twice; marker-free text is unchanged.
    expect(projectDecoratedLength(scarab + ' and ' + scarab))
      .toBe((scarab + ' and ' + scarab).length + 2 * 23);
    expect(projectDecoratedLength('no markers here')).toBe('no markers here'.length);
  });

  it('computes the live notes budget from the notes-free export', () => {
    const noNotes = 'x'.repeat(500);
    const withNotes = 'x'.repeat(500) + '\n' + EXPORT_EMOJI.notes.uni + ' **Notes:** hello';
    const budget = computeShareBudget(withNotes, noNotes, 'hello'.length);
    const notesLineOverhead = 1 + EXPORT_EMOJI.notes.uni.length + ' **Notes:** '.length;
    const expectedMax = DISCORD_MSG_LIMIT - CARD_HEADER_ALLOWANCE - 500 - notesLineOverhead;
    expect(budget.notesMax).toBe(expectedMax);
    expect(budget.notesRemaining).toBe(expectedMax - 5);
    expect(budget.fitsPlain).toBe(true);
  });

  it('flags a plain overflow and never returns a negative cap', () => {
    const huge = 'x'.repeat(DISCORD_MSG_LIMIT + 100);
    const budget = computeShareBudget(huge, huge, 0);
    expect(budget.fitsPlain).toBe(false);
    expect(budget.fitsDecorated).toBe(false);
    expect(budget.notesMax).toBe(0);
    expect(budget.notesRemaining).toBeLessThan(0);
  });

  it('reproduces the 2026-07-19 real-card finding: emotes can overflow while plain fits', () => {
    // A realistic rich export: ~1,650 plain units carrying 20 markers.
    const markers = Object.values(EXPORT_EMOJI).slice(0, 20).map((m) => m.uni).join('\n');
    const filler = 'x'.repeat(1650 - markers.length);
    const exportText = markers + filler;
    const budget = computeShareBudget(exportText, exportText, 0);
    expect(budget.fitsPlain).toBe(true);
    expect(budget.fitsDecorated).toBe(false);
    expect(budget.decoratedCardLength).toBeGreaterThan(DISCORD_MSG_LIMIT);
  });

  it('exposes the strategy-name cap constant', () => {
    expect(STRAT_NAME_MAX).toBe(80);
  });
});
