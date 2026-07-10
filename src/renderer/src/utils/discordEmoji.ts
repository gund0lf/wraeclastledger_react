/**
 * discordEmoji.ts - single source of truth for Discord export decoration.
 *
 * BACKLOG "Discord export/import" Part 2 (emoji hygiene). Every emoji that
 * appears in the Discord export is defined HERE, once, as a \uXXXX escape
 * sequence - so NO source line in discordExport.ts / parseDiscordExport.ts holds
 * a raw multibyte glyph, and editing those files never trips the edit_file
 * "emoji in matched text" failure again.
 *
 * Fields per marker:
 *  - uni:   the unicode glyph emitted in the manual copy-paste export today.
 *           This is the WIRE FORMAT - the bot + client parsers read it. Do not
 *           change these bytes without moving every parser in lockstep.
 *  - plain: plain-text fallback for a future no-emoji export mode (not emitted
 *           yet; here so the shape is ready).
 *  - name:  SUGGESTED application-emoji name for the DEFERRED bot-posted card
 *           (Part 3). The bot owns the canonical name->id map; the client never
 *           reads this - parseDiscordExport keys on the text label, not the glyph.
 *
 * Because the parser keys on labels (never glyphs) and strips all decoration up
 * front (see stripExportDecoration), the uni values can be swapped for
 * <:name:id> app-emoji refs on the bot side without breaking import.
 */

export interface ExportEmoji {
  uni: string;
  plain: string;
  name: string;
}

export const EXPORT_EMOJI = {
  maps:      { uni: '\uD83D\uDCE6',       plain: '[maps]',     name: 'wl_maps' },
  chisel:    { uni: '\uD83E\uDEA8',       plain: '[chisel]',   name: 'wl_chisel' },
  stats:     { uni: '\uD83D\uDCCA',       plain: '[stats]',    name: 'wl_stats' },
  cost:      { uni: '\uD83D\uDCB0',       plain: '[cost]',     name: 'wl_cost' },
  returns:   { uni: '\uD83C\uDFAF',       plain: '[return]',   name: 'wl_return' },
  div:       { uni: '\uD83D\uDCC8',       plain: '[div]',      name: 'wl_div' },
  scarabs:   { uni: '\uD83E\uDD82',       plain: '[scarabs]',  name: 'wl_scarab' },
  delirium:  { uni: '\uD83C\uDF2B\uFE0F', plain: '[deli]',     name: 'wl_deli' },
  astrolabe: { uni: '\uD83C\uDF0D',       plain: '[astro]',    name: 'wl_astro' },
  atlas:     { uni: '\uD83C\uDF33',       plain: '[atlas]',    name: 'wl_atlas' },
  league:    { uni: '\uD83C\uDFC6',       plain: '[league]',   name: 'wl_league' },
  strategy:  { uni: '\uD83D\uDCDD',       plain: '[strategy]', name: 'wl_strategy' },
  tags:      { uni: '\uD83C\uDFF7\uFE0F', plain: '[tags]',     name: 'wl_tags' },
  notes:     { uni: '\uD83D\uDCCB',       plain: '[notes]',    name: 'wl_notes' },
  party:     { uni: '\uD83D\uDC65',       plain: '[party]',    name: 'wl_party' },
  time:      { uni: '\u23F1\uFE0F',       plain: '[time]',     name: 'wl_time' },
  points:    { uni: '\uD83E\uDDED',       plain: '[points]',   name: 'wl_points' },
  excluded:  { uni: '\u26D4',             plain: '[excluded]', name: 'wl_excluded' },
  gem:       { uni: '\uD83D\uDCAB',       plain: '[gem]',      name: 'wl_gem' },
  search:    { uni: '\uD83D\uDD0D',       plain: '[regex]',    name: 'wl_regex' },
  run:       { uni: '\uD83D\uDFE2',       plain: '[run]',      name: 'wl_run' },
  slam:      { uni: '\uD83D\uDFE0',       plain: '[slam]',     name: 'wl_slam' },
} satisfies Record<string, ExportEmoji>;

/**
 * Strip ALL Discord decoration forms so a parser can key purely on text labels:
 *  - custom / application emoji refs:  <:name:id>  and  <a:name:id>
 *  - unicode emoji / pictographs (incl. the colored status circles), plus any
 *    dangling variation-selector (U+FE0F) / zero-width-joiner (U+200D).
 *
 * Deliberately does NOT touch non-pictographic symbols that are load-bearing in
 * the export - the multiplier sign (U+00D7) and the em-dash (U+2014) survive, so
 * "Multiplier: 1.63x" style parsing and header text stay intact.
 */
export function stripExportDecoration(s: string): string {
  return s
    .replace(/<a?:[A-Za-z0-9_]+:\d+>/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\uFE0F\u200D]/g, '');
}
