import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
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
import { SessionSettings, LootItem, ManualLootItem } from '../types';
import { generateRunRegex, mapDropAverages, trimmedMean } from './priceUtils';
import { deviceInvestment, computeProfit, computeMultiplier, resolveFragmentCount } from './profit';
import { EXPORT_EMOJI as E } from './discordEmoji';
import { buildLootSummary, lootSummaryWireLine } from './lootSummary';
import { isSafeStrategyAtlasUrl } from './atlasUrl';
import type { DiscordImport } from './parseDiscordExport';
import {
  formatObservedDeliriumLine,
  groupedDeliriumNote,
  isGroupedDeliriumNote,
  summarizeObservedDelirium,
} from './deliriumMetadata';

/** Minimal structural map shape - keeps tests free of full MapData fixtures. */
export interface ExportMapStats {
  quantity: number; rarity: number; packSize: number;
  moreCurrency: number; moreScarabs: number;
  atlasDrops?: number; moreThreads?: number;
  explicitModCount?: number;
  isUnidentified?: boolean;
  deliriousPct?: number;
  deliriumRewardTypes?: readonly string[];
}

export interface DiscordExportInput {
  maps: ExportMapStats[];
  settings: SessionSettings;
  lootItems: LootItem[];
  /** Item-level baseline is optional for legacy/test callers. New shares pass
   * it so the public loot evidence can show actual gained rows. */
  baselineItems?: LootItem[];
  /** Explicitly author-valued drops absent from the Return CSV. These only
   * count when a Return CSV exists and are always disclosed in loot evidence. */
  manualLootItems?: ManualLootItem[];
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

const compactPrice = (value: number, decimals = 1): string =>
  value.toFixed(decimals).replace(/\.0+$/, '');

const compactAstrolabeType = (value: string): string => {
  const compact = value.trim().replace(/\s+Astrolabe$/i, '');
  return compact || value.trim();
};

export function hasShareDivinePrice(price: number): boolean {
  return Number.isFinite(price) && price > 0;
}

export function buildDiscordExport(input: DiscordExportInput): string {
  const { maps, settings, lootItems, baselineTotal, investmentNeutralization } = input;
  if (!hasShareDivinePrice(settings.divinePrice)) return '';
  const baselineItems = input.baselineItems ?? [];
  const manualLootItems = input.manualLootItems ?? [];
  const inlineText = (value: string | undefined): string =>
    value?.trim().replace(/\s*[\r\n]+\s*/g, ' ') ?? '';
  const stratName   = inlineText(input.stratName);
  const stratNotes  = inlineText(input.stratNotes);
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
    settings, mapCount: n, lootItems, manualLootItems, baselineTotal, investmentNeutralization,
  });
  const lootSummary = buildLootSummary({
    baselineItems,
    lootItems,
    baselineTotal,
    manualLootItems,
    gemCorrection: profit.gemBuyOffset,
    investmentCorrection: investmentNeutralization,
    reportedReturn: profit.lootGain,
  });
  const { multiplier, usesObservedMods, observedModAverage } = computeMultiplier(settings, maps);
  const multiplyingModifiers = resolveFragmentCount(settings);
  const summary = summarizeObservedDelirium(maps);
  const grouped = summary && summary.levelCounts.length > 11 ? groupedDeliriumNote(summary, n) : '';
  const observedDelirium = grouped ? null : summary;

  const excludedItems = lootItems.filter((l) => l.excluded);
  const gemNetPL = (settings.advGemCount * settings.advGemSellPrice) - (settings.advGemCount * settings.advGemBuyPrice);
  const league   = settings.leagueName;

  const drops = mapDropAverages(maps);
  const avgQuant = drops.quantity;
  const avgPack    = trimmedMean(maps.map((m) => m.packSize));
  const avgCurr    = trimmedMean(maps.map((m) => m.moreCurrency));
  const avgRarity  = trimmedMean(maps.map((m) => m.rarity));
  const avgScarabs = trimmedMean(maps.map((m) => m.moreScarabs));

  const allInPerMap = n > 0 ? profit.totalInvest / n : profit.perMapBase;
  if (input.updateStrategyId && input.evidence) {
    throw new TypeError('Discord export cannot be both an update and evidence');
  }
  const gameDataRevision = input.gameDataRevision ?? null;
  const gameDataPatchVersion = input.gameDataPatchVersion?.trim() ?? '';
  const hasGameDataProvenance = Number.isInteger(gameDataRevision)
    && gameDataRevision! > 0 && gameDataPatchVersion.length > 0;
  const threadDevice = BUNDLED_MANIFEST.leagueRules?.[league]?.threadSlots;
  const notes = stratNotes.split(' | ');
  const deviceNotes = [
    ...deviceInvestment(settings).activeSlots.filter(slot => slot?.name && slot.count > 0).map(slot => slot.count + ' x ' + slot.name + ' @ ' + slot.price + 'c'),
    ...(settings.ember?.name ? [settings.ember.name + ' @ ' + settings.ember.price + 'c'] : []),
  ];
  const filteredNotes = notes.filter(part => !isGroupedDeliriumNote(part)
    && !(deviceNotes.length && /^Map device per map: (?:\d+ x [A-Za-z ]+ Thread|Allflame Ember of [A-Za-z ]+) @ [\d.]+c(?:, (?:\d+ x [A-Za-z ]+ Thread|Allflame Ember of [A-Za-z ]+) @ [\d.]+c)*$/.test(part)));
  if (deviceNotes.length) filteredNotes.push('Map device per map: ' + deviceNotes.join(', '));
  if (drops.atlasCount || drops.threadCount) {
    const dropNotes: string[] = [];
    if (drops.atlasCount) dropNotes.push('Atlas Drops ' + Math.round(drops.atlas) + '% (' + drops.atlasCount + '/' + n + ' maps)');
    if (drops.threadCount) dropNotes.push('More Threads ' + Math.round(drops.threads) + '% (' + drops.threadCount + '/' + n + ' maps)');
    const prior = /^Map observations: (?:Atlas Drops|More Threads) \d+% \(\d+\/\d+ maps\)(?:, More Threads \d+% \(\d+\/\d+ maps\))?$/;
    for (let i = filteredNotes.length - 1; i >= 0; i--) if (prior.test(filteredNotes[i])) filteredNotes.splice(i, 1);
    filteredNotes.push('Map observations: ' + dropNotes.join(', '));
  }
  const distribution = grouped || (!summary ? notes.find(isGroupedDeliriumNote) : '');
  if (distribution) filteredNotes.push(distribution);
  return formatDiscordExport({
    mapCount: n, mapType: settings.mapType, multiplier,
    avgQuant, avgRarity, avgPack, avgCurr, perMapCost: allInPerMap,
    totalInvest: profit.totalInvest, totalReturn: profit.lootGain, netProfit: profit.net,
    divPerMap: profit.divPerMap, divPrice: settings.divinePrice,
    chisel: settings.chiselType || 'None', chiselPrice: settings.chiselPrice, chiselConfigured: !!settings.chiselType,
    scarabs: settings.scarabs.filter(s => s.name).map(s => s.name),
    scarabCosts: settings.scarabs.filter(s => s.name).map(s => s.cost),
    deliOrbType: settings.advDeliOrbType, deliOrbQty: settings.advDeliOrbQtyPerMap,
    deliOrbPrice: settings.advDeliOrbPriceEach, observedDelirium,
    astroType: settings.advAstrolabeType, astroCount: settings.advAstrolabeCount,
    astroPrice: settings.advAstrolabePrice,
    atlasTreeUrl: isSafeStrategyAtlasUrl(settings.atlasTreeUrl) ? settings.atlasTreeUrl : '',
    atlasPoints: hasPoints ? atlasPts : null, atlasPointsMax: hasPoints ? atlasPtsMax : null,
    league, gameDataRevision: hasGameDataProvenance ? gameDataRevision : null,
    gameDataPatchVersion: hasGameDataProvenance ? gameDataPatchVersion : null,
    multiplyingModifiersAllocated: threadDevice ? null : multiplyingModifiers.source !== 'off',
    multiplyingModifiersFragmentCount: threadDevice ? null : multiplyingModifiers.count,
    strategyName: stratName, strategyNotes: filteredNotes.filter(Boolean).join(' | '), typeTags: shareTags,
    isGroupPlay, groupSize, sessionMinutes,
    excludedDrops: excludedItems.map(i => ({ name: i.name, value: i.total })),
    gemInfo: settings.advGemCount > 0 ? { count: settings.advGemCount,
      buy: settings.advGemCount * settings.advGemBuyPrice,
      sell: settings.advGemCount * settings.advGemSellPrice, net: gemNetPL } : null,
    runRegex: n > 0 ? generateRunRegex({ avgQuant: drops.atlasCount ? drops.atlas : avgQuant, avgPack, avgCurr, avgRarity, avgScarabs,
      atlasDrops: drops.atlasCount > 0, avgThreads: drops.threads }, []) : '',
    observedModAverage: usesObservedMods ? observedModAverage : null,
    updateStrategyId: input.updateStrategyId ?? null,
    evidenceTargetStrategyId: input.evidence?.targetStrategyId ?? null,
    evidenceExpectedRevision: input.evidence?.expectedRevision ?? null,
    evidenceRunKey: input.evidence?.runKey ?? null,
    evidenceRunStartedAt: input.evidence?.runStartedAt ?? null,
    evidenceRunEndedAt: input.evidence?.runEndedAt ?? null,
    setupFingerprint: input.evidence?.setupFingerprint ?? null,
    lootSummary,
  });
}

type DiscordExportPresentation = Omit<DiscordImport, 'slamRegex' | 'operation' | 'operationError'
  | 'observedModSampleSize' | 'lootSummaryInvalid'> & { chiselConfigured?: boolean };

/** Render recorded values directly. No session, catalogue or profit calculation
 * belongs here: the same formatter also displays the exact accepted payload. */
export function formatDiscordExport(p: DiscordExportPresentation): string {
  const n = p.mapCount;
  const chiselLine = p.chiselConfigured ?? (!!p.chisel && p.chisel !== 'None')
    ? E.chisel.uni + ' **Chisel:** ' + p.chisel + ' (' + p.chiselPrice + 'c)'
    : E.chisel.uni + ' **Chisel:** None';
  // Un-indented bullets (2026-07-20): Discord rendered the old two-space
  // indent as inconsistent NESTED bullets. Both parsers match `^\s*-`, so the
  // flat form imports identically.
  const scarabLines = p.scarabs.map((name, i) => `- ${name} (${p.scarabCosts[i]}c)`).join('\n');
  const deliLine = p.deliOrbType && p.deliOrbQty > 0
    ? E.delirium.uni + ' **Delirium Orbs:** ' + p.deliOrbQty + 'x ' + p.deliOrbType +
      ' @ ' + compactPrice(p.deliOrbPrice) + 'c ea'
    : null;
  const astroLine = p.astroType
    ? E.astrolabe.uni + ' **Astrolabe:** ' + compactAstrolabeType(p.astroType) +
      ' \u00B7 ' + p.astroCount + 'x @ ' + compactPrice(p.astroPrice) + 'c ea'
    : null;
  const atlasUrl = isSafeStrategyAtlasUrl(p.atlasTreeUrl) ? p.atlasTreeUrl : null;

  let regexBlock = '';
  if (n > 0) {
    // Shared regexes are emitted WITHOUT the author's brick exclusions
    // (2026-07-20): exclusions are build-specific noise for everyone else,
    // which also retires the disclaimer line. In-app importers regenerate
    // with their own exclusions anyway; Discord-only readers get the neutral
    // form. Card-budget bonus: shorter regex strings.
    regexBlock = ['', `${E.search.uni} **Regex**`,
      `${E.run.uni} Run: \`${p.runRegex}\``,
    ].join('\n');
  }

  const updateStrategyId = p.updateStrategyId;
  const evidence = p.evidenceTargetStrategyId ? {
    targetStrategyId: p.evidenceTargetStrategyId, expectedRevision: p.evidenceExpectedRevision,
    runKey: p.evidenceRunKey, runStartedAt: p.evidenceRunStartedAt,
    runEndedAt: p.evidenceRunEndedAt, setupFingerprint: p.setupFingerprint,
  } : null;
  if (updateStrategyId && evidence) {
    throw new TypeError('Discord export cannot be both an update and evidence');
  }
  const gameDataRevision = p.gameDataRevision;
  const gameDataPatchVersion = p.gameDataPatchVersion ?? '';
  const hasGameDataProvenance = Number.isInteger(gameDataRevision)
    && gameDataRevision! > 0 && gameDataPatchVersion.length > 0;
  const hasPoints = p.atlasPoints != null && p.atlasPointsMax != null && p.atlasPointsMax > 0 && p.atlasPoints >= 0;

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
    `${E.maps.uni} **Maps:** ${n} | **Type:** ${p.mapType} | **Multiplier:** ${p.multiplier.toFixed(2)}\u00D7`,
    ...(p.observedModAverage != null
      ? [`**Observed Mods:** ${p.observedModAverage.toFixed(1)} avg`]
      : []),
    chiselLine,
    `${E.stats.uni} **Avg Quant:** ${p.avgQuant.toFixed(0)}% | **Avg Rarity:** ${p.avgRarity.toFixed(0)}% | **Avg Pack:** ${p.avgPack.toFixed(0)}% | **Avg Currency:** ${p.avgCurr.toFixed(0)}%`,
    `${E.cost.uni} **Per Map Cost:** ${p.perMapCost.toFixed(1)}c | **Total Invest:** ${p.totalInvest.toFixed(1)}c`,
    `${E.returns.uni} **Total Return:** ${p.totalReturn.toFixed(1)}c | **Net Profit:** ${p.netProfit >= 0 ? '+' : ''}${p.netProfit.toFixed(1)}c`,
    `${E.div.uni} **Div / Map:** ${p.divPerMap.toFixed(3)}d | **Divine Price:** ${p.divPrice}c`,
    ...(p.sessionMinutes != null && p.sessionMinutes > 0
      ? [`${E.time.uni} **Session Time:** ${Math.round(p.sessionMinutes)} min`] : []),
    ...(scarabLines ? [E.scarabs.uni + ' **Scarabs:**\n' + scarabLines] : []),
    ...(deliLine  ? [deliLine]  : []),
    ...(p.observedDelirium
      ? [formatObservedDeliriumLine(p.observedDelirium, n).replace(
          'Observed Delirium:',
          '**Observed Delirium:**',
        )]
      : []),
    ...(astroLine ? [astroLine] : []),
    ...(atlasUrl  ? [`${E.atlas.uni} **Atlas Tree:** ${atlasUrl}`] : []),
    ...(hasPoints ? [`${E.points.uni} **Atlas Points:** ${p.atlasPoints}/${p.atlasPointsMax}`] : []),
    ...(p.league ? [`${E.league.uni} **League:** ${p.league}`] : []),
    ...(hasGameDataProvenance
      ? [`**Data:** r${gameDataRevision}/${gameDataPatchVersion}`]
      : []),
    ...(p.multiplyingModifiersAllocated == null ? [] : [
      `**Multiplying Modifiers:** ${p.multiplyingModifiersAllocated ? p.multiplyingModifiersFragmentCount + ' fragments' : 'Off'}`,
    ]),
    ...(p.strategyName ? [`${E.strategy.uni} **Strategy:** ${p.strategyName}`] : []),
    ...(p.typeTags.length > 0 ? [`${E.tags.uni} **Tags:** ${p.typeTags.join(', ')}`] : []),
    ...(p.strategyNotes ? [`${E.notes.uni} **Notes:** ${p.strategyNotes}`] : []),
    ...(p.isGroupPlay ? [
      // Legacy-compatible extension: bare "Yes" stays valid for old parsers;
      // the "(N players)" suffix is only read by post-batch parsers.
      `${E.party.uni} **Party Play:** Yes${p.groupSize != null && p.groupSize >= 2 ? ` (${p.groupSize} players)` : ''}`,
    ] : []),
    ...(p.excludedDrops.length > 0 ? [
      `${E.excluded.uni} **Excluded drops (${p.excludedDrops.length}):** ${p.excludedDrops.map((i) => `${i.name} (${i.value.toFixed(0)}c)`).join(', ')}`
    ] : []),
    ...(p.gemInfo && p.gemInfo.count > 0 ? [
      `${E.gem.uni} **Gem leveling:** ${p.gemInfo.count} gems | buy ${p.gemInfo.buy.toFixed(0)}c | sell ${p.gemInfo.sell.toFixed(0)}c | net ${p.gemInfo.net >= 0 ? '+' : ''}${p.gemInfo.net.toFixed(0)}c *(excluded from map profit)*`
    ] : []),
    ...(regexBlock ? [regexBlock] : []),
    ...(p.lootSummary ? [lootSummaryWireLine(p.lootSummary)] : []),
  ].join('\n');
}
