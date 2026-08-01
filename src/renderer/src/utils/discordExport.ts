/**
 * discordExport.ts - pure builder for the WraeclastLedger Discord export string (WP1).
 *
 * Extracted from ShareModal so the wire format is testable and round-trippable
 * against parseDiscordExport. All money figures come from utils/profit.ts, so
 * the export ALWAYS matches the Dashboard (fixes the three v1.0.62 divergences:
 * missing preservation split, ungated gemBuyOffset, missing neutralization).
 *
 * DECORATION (BACKLOG "Discord export/import" Parts 1+2): every emoji marker
 * comes from utils/discordEmoji.ts (EXPORT_EMOJI), never an inline literal, and
 * the few non-ASCII punctuation marks (multiplier x, em-dash, middot) are written
 * as \uXXXX escapes. This file is intentionally ASCII-source so edit_file never
 * trips the "emoji in matched text" failure. The emitted glyphs are WIRE FORMAT
 * (parsed by the bot + client import paths) - do not change the bytes without
 * moving every parser in lockstep.
 */
import { SessionSettings, LootItem } from '../types';
import { generateRunRegex, generateSlamRegex, trimmedMean } from './priceUtils';
import { computeProfit, computeMultiplier, resolveFragmentCount } from './profit';
import { EXPORT_EMOJI as E } from './discordEmoji';

/** Minimal structural map shape - keeps tests free of full MapData fixtures. */
export interface ExportMapStats {
  quantity: number; rarity: number; packSize: number;
  moreCurrency: number; moreScarabs: number;
  explicitModCount?: number;
  isUnidentified?: boolean;
}

export interface DiscordExportInput {
  maps: ExportMapStats[];
  settings: SessionSettings;
  lootItems: LootItem[];
  baselineTotal: number;
  investmentNeutralization: number;
  stratName?: string;
  stratNotes?: string;
  shareTags?: string[];
  isGroupPlay?: boolean;
  /** Party size 2-6 (shared-metadata batch 2026-07). Only emitted when
   *  isGroupPlay is true; null/undefined keeps the legacy bare "Yes" line. */
  groupSize?: number | null;
  /** Author-confirmed session time in MINUTES (the canonical wire unit).
   *  null/undefined/0 = no claim -> line absent. Flexible input parsing lives
   *  in utils/sessionTime.ts, never here. */
  sessionMinutes?: number | null;
  /** Strategy-versioning update marker (design v3.1 §2): when set, the export
   *  gains ONE additive line `Update strategy: <uuid>` directly under the
   *  header. Legacy-safe — every pre-versioning parser ignores unknown lines.
   *  null/undefined = normal share, no marker. */
  updateStrategyId?: string | null;
  /** Evidence-pooling wire markers. All four lines are an atomic operation
   * marker and are mutually exclusive with updateStrategyId. */
  evidence?: {
    targetStrategyId: string;
    expectedRevision: number;
    runKey: string;
    runStartedAt: string;
    runEndedAt: string;
    setupFingerprint: string;
  } | null;
  /** Manifest provenance active when the author shares. Both fields must be
   * present or the line is suppressed (legacy/test callers remain valid). */
  gameDataRevision?: number | null;
  gameDataPatchVersion?: string | null;
}

export function buildDiscordExport(input: DiscordExportInput): string {
  const { maps, settings, lootItems, baselineTotal, investmentNeutralization } = input;
  const stratName   = input.stratName?.trim()  ?? '';
  const stratNotes  = input.stratNotes?.trim() ?? '';
  const shareTags   = input.shareTags ?? [];
  const isGroupPlay = input.isGroupPlay ?? false;
  const groupSize   = input.groupSize ?? null;
  const sessionMinutes = input.sessionMinutes ?? null;
  // Atlas points ride along from settings (captured by AtlasTreeModule);
  // both must be present and sane or the line is suppressed (no claim).
  const atlasPts    = settings.atlasPoints ?? null;
  const atlasPtsMax = settings.atlasPointsMax ?? null;
  const hasPoints   = atlasPts != null && atlasPtsMax != null && atlasPtsMax > 0 && atlasPts >= 0;

  const n = maps.length;
  const profit = computeProfit({
    settings, mapCount: n, lootItems, baselineTotal, investmentNeutralization,
  });
  const { multiplier, usesObservedMods, observedModAverage } = computeMultiplier(settings, maps);
  const multiplyingModifiers = resolveFragmentCount(settings);

  const excludedItems = lootItems.filter((l) => l.excluded);
  const gemNetPL = (settings.advGemCount * settings.advGemSellPrice) - (settings.advGemCount * settings.advGemBuyPrice);
  const league   = settings.leagueName;

  const avgQuant   = trimmedMean(maps.map((m) => m.quantity));
  const avgPack    = trimmedMean(maps.map((m) => m.packSize));
  const avgCurr    = trimmedMean(maps.map((m) => m.moreCurrency));
  const avgRarity  = trimmedMean(maps.map((m) => m.rarity));
  const avgScarabs = trimmedMean(maps.map((m) => m.moreScarabs));

  const chiselLine  = settings.chiselType
    ? E.chisel.uni + ' **Chisel:** ' + settings.chiselType + ' (' + settings.chiselPrice + 'c)'
    : E.chisel.uni + ' **Chisel:** None';
  // Un-indented bullets (2026-07-20): Discord rendered the old two-space
  // indent as inconsistent NESTED bullets. Both parsers match `^\s*-`, so the
  // flat form imports identically.
  const scarabLines = settings.scarabs.filter((s) => s.name).map((s) => `- ${s.name} (${s.cost}c)`).join('\n');
  const deliLine    = settings.advDeliOrbType && settings.advDeliOrbQtyPerMap > 0
    ? E.delirium.uni + ' **Delirium Orbs:** ' + settings.advDeliOrbQtyPerMap + 'x ' + settings.advDeliOrbType +
      ' (' + (settings.advDeliOrbQtyPerMap * 20) + '% delirious, ' +
      settings.advDeliOrbPriceEach.toFixed(1) + 'c each = ' +
      (settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach).toFixed(1) + 'c/map)'
    : null;
  const astroLine = settings.advAstrolabeType
    ? E.astrolabe.uni + ' **Astrolabe:** ' + settings.advAstrolabeType +
      ' (' + settings.advAstrolabeCount + 'x, ' + settings.advAstrolabePrice.toFixed(0) + 'c each)'
    : null;
  const atlasUrl = settings.atlasTreeUrl?.includes('#') ? settings.atlasTreeUrl : null;

  let regexBlock = '';
  if (n > 0) {
    const avg    = { avgQuant, avgPack, avgCurr, avgRarity, avgScarabs };
    const is8mod = settings.mapType === '8-mod';
    // Shared regexes are emitted WITHOUT the author's brick exclusions
    // (2026-07-20): exclusions are build-specific noise for everyone else,
    // which also retires the disclaimer line. In-app importers regenerate
    // with their own exclusions anyway; Discord-only readers get the neutral
    // form. Card-budget bonus: shorter regex strings.
    regexBlock = ['', `${E.search.uni} **Generated Regex (${n} maps, trimmed avg)**`,
      `Avg: ${avgQuant.toFixed(0)}%Q \u00B7 ${avgRarity.toFixed(0)}%R \u00B7 ${avgPack.toFixed(0)}%P \u00B7 ${avgCurr.toFixed(0)}% Curr`,
      `${E.run.uni} Run: \`${generateRunRegex(avg, [])}\``,
      ...(!is8mod ? [`${E.slam.uni} Slam: \`${generateSlamRegex(avg, [])}\` *(open slots only)*`] : []),
    ].join('\n');
  }

  // ALL-IN per-map cost - same definition as the in-app Investment badge:
  // total investment (incl. one-time scarabs + session costs) / maps.
  // One user-facing definition everywhere (decision 2026-07-02).
  const allInPerMap = n > 0 ? profit.totalInvest / n : profit.perMapBase;

  const updateStrategyId = input.updateStrategyId ?? null;
  const evidence = input.evidence ?? null;
  if (updateStrategyId && evidence) {
    throw new TypeError('Discord export cannot be both an update and evidence');
  }
  const gameDataRevision = input.gameDataRevision ?? null;
  const gameDataPatchVersion = input.gameDataPatchVersion?.trim() ?? '';
  const hasGameDataProvenance = Number.isInteger(gameDataRevision)
    && gameDataRevision! > 0 && gameDataPatchVersion.length > 0;

  return [
    `[WraeclastLedger Session]`,
    // Update marker sits ABOVE every other field line on purpose: both the
    // bot parser and parseDiscordExport extract-and-strip it BEFORE any field
    // matching (the live TEST-bot finding \u2014 an unanchored Strategy: matcher
    // must never read the uuid as the strategy name).
    ...(updateStrategyId ? [`Update strategy: ${updateStrategyId}`] : []),
    ...(evidence ? [
      `Add evidence to: ${evidence.targetStrategyId}@${evidence.expectedRevision}`,
      `Evidence run: ${evidence.runKey}`,
      `Run window: ${evidence.runStartedAt}/${evidence.runEndedAt}`,
      `Setup fingerprint: ${evidence.setupFingerprint}`,
    ] : []),
    // The "**Map Session \u2014 WraeclastLedger**" title line was retired
    // 2026-07-20: it duplicated the bracket header above, no parser anchors
    // on it (the bot triggers on the 'WraeclastLedger' substring, both
    // parsers key on field labels), and it cost ~33 card-budget units.
    `${E.maps.uni} **Maps:** ${n} | **Type:** ${settings.mapType} | **Multiplier:** ${multiplier.toFixed(2)}\u00D7`,
    ...(usesObservedMods && observedModAverage != null
      ? [`**Observed Mods:** ${observedModAverage.toFixed(1)} average (${n}/${n} exact maps)`]
      : []),
    chiselLine,
    `${E.stats.uni} **Avg Quant:** ${avgQuant.toFixed(0)}% | **Avg Rarity:** ${avgRarity.toFixed(0)}% | **Avg Pack:** ${avgPack.toFixed(0)}% | **Avg Currency:** ${avgCurr.toFixed(0)}%`,
    `${E.cost.uni} **Per Map Cost:** ${allInPerMap.toFixed(1)}c | **Total Invest:** ${profit.totalInvest.toFixed(1)}c`,
    `${E.returns.uni} **Total Return:** ${profit.lootGain.toFixed(1)}c | **Net Profit:** ${profit.net >= 0 ? '+' : ''}${profit.net.toFixed(1)}c`,
    `${E.div.uni} **Div / Map:** ${profit.divPerMap.toFixed(3)}d | **Divine Price:** ${profit.div}c`,
    ...(sessionMinutes != null && sessionMinutes > 0
      ? [`${E.time.uni} **Session Time:** ${Math.round(sessionMinutes)} min`] : []),
    ...(scarabLines ? [E.scarabs.uni + ' **Scarabs:**\n' + scarabLines] : []),
    ...(deliLine  ? [deliLine]  : []),
    ...(astroLine ? [astroLine] : []),
    ...(atlasUrl  ? [`${E.atlas.uni} **Atlas Tree:** ${atlasUrl}`] : []),
    ...(hasPoints ? [`${E.points.uni} **Atlas Points:** ${atlasPts}/${atlasPtsMax}`] : []),
    ...(league    ? [`${E.league.uni} **League:** ${league}`] : []),
    ...(hasGameDataProvenance
      ? [`**Game Data:** r${gameDataRevision} \u00B7 patch ${gameDataPatchVersion}`]
      : []),
    `**Multiplying Modifiers:** ${multiplyingModifiers.source === 'off'
      ? 'Off'
      : `${multiplyingModifiers.count} fragments`}`,
    ...(stratName   ? [`${E.strategy.uni} **Strategy:** ${stratName}`] : []),
    ...(shareTags.length > 0 ? [`${E.tags.uni} **Tags:** ${shareTags.join(', ')}`] : []),
    ...(stratNotes  ? [`${E.notes.uni} **Notes:** ${stratNotes}`] : []),
    ...(isGroupPlay ? [
      // Legacy-compatible extension: bare "Yes" stays valid for old parsers;
      // the "(N players)" suffix is only read by post-batch parsers.
      `${E.party.uni} **Party Play:** Yes${groupSize != null && groupSize >= 2 ? ` (${groupSize} players)` : ''}`,
    ] : []),
    ...(excludedItems.length > 0 ? [
      `${E.excluded.uni} **Excluded drops (${excludedItems.length}):** ${excludedItems.map((i) => `${i.name} (${i.total.toFixed(0)}c)`).join(', ')}`
    ] : []),
    ...(settings.advGemCount > 0 ? [
      `${E.gem.uni} **Gem leveling:** ${settings.advGemCount} gems | buy ${(settings.advGemCount * settings.advGemBuyPrice).toFixed(0)}c | sell ${(settings.advGemCount * settings.advGemSellPrice).toFixed(0)}c | net ${gemNetPL >= 0 ? '+' : ''}${gemNetPL.toFixed(0)}c *(excluded from map profit)*`
    ] : []),
    ...(regexBlock ? [regexBlock] : []),
  ].join('\n');
}
