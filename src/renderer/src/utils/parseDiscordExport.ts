/**
 * parseDiscordExport.ts
 *
 * Pure parser for WraeclastLedger Discord export strings.
 * No React or store dependencies — safe to test in isolation.
 */
import { stripExportDecoration } from './discordEmoji';
import { decodeLootSummary, LOOT_EVIDENCE_LABEL, type LootSummary } from './lootSummary';

export interface DiscordImport {
  mapCount: number; mapType: string; multiplier: number;
  avgQuant: number; avgRarity: number; avgPack: number; avgCurr: number;
  perMapCost: number; totalInvest: number; totalReturn: number;
  netProfit: number; divPerMap: number; divPrice: number;
  chisel: string; runRegex: string; slamRegex: string; scarabs: string[]; scarabCosts: number[];
  atlasTreeUrl: string;
  strategyName: string; strategyNotes: string;
  typeTags: string[];
  deliOrbQty: number; deliOrbType: string; deliOrbPrice: number;
  astroType: string; astroCount: number; astroPrice: number;
  excludedDrops: { name: string; value: number }[];
  gemInfo: { count: number; buy: number; sell: number; net: number } | null;
  isGroupPlay: boolean;
  // Optional author-declared metadata (shared-metadata batch 2026-07).
  // null = line absent = no claim.
  groupSize: number | null;
  sessionMinutes: number | null;
  atlasPoints: number | null;
  atlasPointsMax: number | null;
  league: string;
  observedModAverage: number | null;
  observedModSampleSize: number | null;
  /** Strategy-versioning marker (`Update strategy: <uuid>`): exposed for
   *  PROVENANCE only. Import Strategy must NEVER adopt it as the viewer's
   *  own update target (design v3.1 round-2 point 3d). null = no marker or
   *  malformed uuid. */
  updateStrategyId: string | null;
  operation: 'share' | 'update' | 'evidence' | null;
  operationError: 'multiple_operation_markers' | 'invalid_operation_marker' | 'incomplete_evidence_markers' | null;
  evidenceTargetStrategyId: string | null;
  evidenceExpectedRevision: number | null;
  evidenceRunKey: string | null;
  evidenceRunStartedAt: string | null;
  evidenceRunEndedAt: string | null;
  setupFingerprint: string | null;
  gameDataRevision: number | null;
  gameDataPatchVersion: string | null;
  /** null means the pre-schema-v2 wire did not record Multiplying Modifiers. */
  multiplyingModifiersAllocated: boolean | null;
  multiplyingModifiersFragmentCount: number | null;
  lootSummary: LootSummary | null;
  lootSummaryInvalid: boolean;
}

export function parseDiscordExport(raw: string): DiscordImport | null {
  try {
    // Strip all decoration (custom/app emoji refs + unicode emoji) up front so
    // every field pattern below keys on the text label, never on a glyph
    // (BACKLOG "Discord export/import" Part 1 - import stays decoration-proof).
    const textRaw = stripExportDecoration(
      raw.replace(/^```\s*/m, '').replace(/\s*```\s*$/m, '').replace(/\*\*/g, '')
    ).trim();
    if (!textRaw.includes('WraeclastLedger')) return null;
    // Update marker: extract FIRST, then strip the ENTIRE marker line from the
    // working text BEFORE any field matching. Lesson inherited from the live
    // TEST-bot pass (2026-07-11): the unanchored /Strategy:/ name matcher read
    // the uuid out of a marker placed above the real Strategy: line. Malformed
    // markers are stripped too (never allowed to leak into other fields) but
    // yield null (no silent half-parse).
    const operationLabels = ['Update strategy', 'Add evidence to', 'Evidence run', 'Run window', 'Setup fingerprint'];
    const countLabel = (label: string): number => (
      textRaw.match(new RegExp(`^\\s*${label}:`, 'gim')) ?? []
    ).length;
    const updateCount = countLabel('Update strategy');
    const evidenceCounts = operationLabels.slice(1).map(countLabel);
    const hasEvidenceMarker = evidenceCounts.some((count) => count > 0);
    let operation: DiscordImport['operation'] = 'share';
    let operationError: DiscordImport['operationError'] = null;
    let updateStrategyId: string | null = null;
    let evidenceTargetStrategyId: string | null = null;
    let evidenceExpectedRevision: number | null = null;
    let evidenceRunKey: string | null = null;
    let evidenceRunStartedAt: string | null = null;
    let evidenceRunEndedAt: string | null = null;
    let setupFingerprint: string | null = null;

    const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const hash = 'sha256-v1:[0-9a-f]{64}';
    if (updateCount > 1 || evidenceCounts.some((count) => count > 1) || (updateCount > 0 && hasEvidenceMarker)) {
      operation = null;
      operationError = 'multiple_operation_markers';
    } else if (updateCount === 1) {
      const marker = textRaw.match(new RegExp(`^\\s*Update strategy:\\s*(${uuid})\\s*$`, 'im'));
      if (!marker) {
        operation = null;
        operationError = 'invalid_operation_marker';
      } else {
        operation = 'update';
        updateStrategyId = marker[1].toLowerCase();
      }
    } else if (hasEvidenceMarker) {
      const target = textRaw.match(new RegExp(`^\\s*Add evidence to:\\s*(${uuid})@(\\d+)\\s*$`, 'im'));
      const run = textRaw.match(new RegExp(`^\\s*Evidence run:\\s*(${hash})\\s*$`, 'm'));
      const window = textRaw.match(/^\s*Run window:\s*([^\s/]+)\/([^\s]+)\s*$/im);
      const fingerprint = textRaw.match(new RegExp(`^\\s*Setup fingerprint:\\s*(${hash})\\s*$`, 'm'));
      if (!evidenceCounts.every((count) => count === 1) || !target || !run || !window || !fingerprint) {
        operation = null;
        operationError = 'incomplete_evidence_markers';
      } else {
        operation = 'evidence';
        evidenceTargetStrategyId = target[1].toLowerCase();
        evidenceExpectedRevision = parseInt(target[2]);
        evidenceRunKey = run[1];
        evidenceRunStartedAt = window[1];
        evidenceRunEndedAt = window[2];
        setupFingerprint = fingerprint[1];
      }
    }
    const labels = operationLabels.join('|');
    const text = textRaw.replace(new RegExp(`^\\s*(?:${labels}):.*(?:\\r?\\n|$)`, 'gim'), '').trim();
    const num = (patterns: RegExp[]): number => {
      for (const p of patterns) { const m = text.match(p); if (m) return parseFloat(m[1].replace(/,/g, '')); }
      return 0;
    };
    const str = (patterns: RegExp[]): string => {
      for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim(); }
      return '';
    };
    const mapCount    = num([/Maps:\s*(\d+)/]);
    const multiplier  = num([/Multiplier:\s*([\d.]+)[x\u00d7]/i]);
    const observedM = text.match(/Observed Mods:\s*([\d.]+)\s+average\s*\((\d+)\/\d+\s+exact maps\)/i);
    const observedModAverage = observedM ? parseFloat(observedM[1]) : null;
    const observedModSampleSize = observedM ? parseInt(observedM[2]) : null;
    const avgQuant    = num([/Avg Quant:\s*(\d+)%/]);
    const avgRarity   = num([/Avg Rarity:\s*(\d+)%/]);
    const avgPack     = num([/Avg Pack:\s*(\d+)%/]);
    const avgCurr     = num([/Avg Currency:\s*(\d+)%/]);
    const perMapCost  = num([/Per Map Cost:\s*([\d.]+)c/]);
    const totalInvest = num([/Total Invest:\s*([\d.]+)c/]);
    const totalReturn = num([/Total Return:\s*([\d.]+)c/]);
    const divPerMap   = num([/Profit\/map:\s*([\d.]+)d/, /Div \/ Map:\s*([\d.]+)d/]);
    const divPrice    = num([/Divine Price:\s*([\d.]+)c/]);
    const profitMatch = text.match(/Net Profit:\s*([+-]?[\d.]+)c/);
    const netProfit   = profitMatch ? parseFloat(profitMatch[1]) : 0;
    const mapType     = str([/Type:\s*([68]-mod)/]);
    const chiselRaw   = str([/Chisel:\s*([^\n]+)/]);
    const chisel      = chiselRaw.replace(/\(.*/, '').replace(/[^\x00-\x7F]/g, '').trim();
    const atlasTreeUrl = str([/Atlas Tree:\s*(https?:\/\/\S+)/]);
    const stripBt     = (s: string) => s.trim().replace(/^`+|`+$/g, '').trim();
    // Decoration already stripped above, so key purely on the label.
    const runMatch    = text.match(/Run:\s+(.+)/);
    const slamMatch   = text.match(/Slam:\s+(.+?)(?:\s*[*(]open|\s*$)/m);
    const runRegex    = runMatch  ? stripBt(runMatch[1])  : '';
    const slamRegex   = slamMatch ? stripBt(slamMatch[1]) : '';
    const scarabs: string[] = [];
    const scarabCosts: number[] = [];
    for (const line of text.split('\n')) {
      // Scarabs are bullet sub-lines under the Scarabs header: "  - Name (Ncost)".
      // The leading "-" is REQUIRED - without it, label lines that happen to end
      // in " (N" (e.g. "Excluded drops (2):", "Generated Regex (38 maps") get
      // mis-read as scarabs once decoration is stripped. Key on structure, not glyphs.
      const m = line.match(/^\s*-\s*([A-Z][^\n(]+?)\s+\((\d[\d.]*)/);
      if (m && !m[1].includes(':') && m[1].trim().length >= 5) { scarabs.push(m[1].trim()); scarabCosts.push(parseFloat(m[2])); }
    }
    const strategyNameRaw  = str([/Strategy:\s*([^\n]+)/]);
    const strategyName     = strategyNameRaw.replace(/[^\x00-\x7F]/g, '').trim();
    const strategyNotesRaw = str([/Notes:\s*([^\n]+)/]);
    const strategyNotes    = strategyNotesRaw.replace(/[^\x00-\x7F]/g, '').trim();
    const typeTagsRaw      = str([/Tags:\s*([^\n]+)/]);
    const typeTags         = typeTagsRaw
      .split(',')
      .map((tag) => tag.trim().toLowerCase())
      .filter(Boolean);
    const deliOrbMatch    = text.match(/Delirium Orbs:\s*(\d+)x\s+([^\s(]+)[^\n]*?(\d+\.?\d*)c each/i);
    const deliOrbQty      = deliOrbMatch ? parseInt(deliOrbMatch[1]) : 0;
    const deliOrbType     = deliOrbMatch ? deliOrbMatch[2].replace(/[^\x00-\x7F]/g, '').trim() : '';
    const deliOrbPrice    = deliOrbMatch ? parseFloat(deliOrbMatch[3]) : 0;
    const astroMatch      = text.match(/Astrolabe:\s*([^\n(]+?)\s+\((\d+)x,\s*(\d+\.?\d*)c each\)/i);
    const astroType       = astroMatch ? astroMatch[1].replace(/[^\x00-\x7F]/g, '').trim() : '';
    const astroCount      = astroMatch ? parseInt(astroMatch[2]) : 0;
    const astroPrice      = astroMatch ? parseFloat(astroMatch[3]) : 0;
    const excludedDrops: { name: string; value: number }[] = [];
    const exclMatch = text.match(/Excluded drops \(\d+\):\s*([^\n]+)/i);
    if (exclMatch) {
      for (const part of exclMatch[1].split(',')) {
        const m = part.trim().match(/^(.+?)\s+\(([\d.]+)c\)$/);
        if (m) excludedDrops.push({ name: m[1].trim(), value: parseFloat(m[2]) });
      }
    }
    const gemMatch = text.match(/Gem leveling:\s*(\d+) gems \| buy (\d+)c \| sell (\d+)c \| net ([+-]?\d+)c/i);
    const gemInfo = gemMatch ? {
      count: parseInt(gemMatch[1]), buy: parseInt(gemMatch[2]),
      sell: parseInt(gemMatch[3]), net: parseInt(gemMatch[4]),
    } : null;
    const isGroupPlay = /Party Play:\s*Yes/i.test(text);
    // Extended party line "Yes (N players)" — bare "Yes" (legacy) leaves size null.
    const partyM      = text.match(/Party Play:\s*Yes(?:\s*\((\d)\s*players?\))?/i);
    const groupSize   = partyM && partyM[1] ? parseInt(partyM[1]) : null;
    const timeM          = text.match(/Session Time:\s*(\d+)\s*min/i);
    const sessionMinutes = timeM ? parseInt(timeM[1]) : null;
    // "Atlas Points: a/max" — label distinct from "Atlas Tree:", no collision.
    const ptsM           = text.match(/Atlas Points:\s*(\d+)\s*\/\s*(\d+)/i);
    const atlasPoints    = ptsM ? parseInt(ptsM[1]) : null;
    const atlasPointsMax = ptsM ? parseInt(ptsM[2]) : null;
    const league = str([/League:\s*([^\n]+)/]);
    const gameDataM = text.match(/Game Data:\s*r(\d+)\s*(?:[·-]\s*)?patch\s+([\w.-]+)/i);
    const gameDataRevision = gameDataM ? parseInt(gameDataM[1]) : null;
    const gameDataPatchVersion = gameDataM ? gameDataM[2] : null;
    const multiplyingM = text.match(/Multiplying Modifiers:\s*(Off|(\d+)\s+fragments?)/i);
    const multiplyingModifiersAllocated = multiplyingM
      ? multiplyingM[1].toLowerCase() !== 'off'
      : null;
    const multiplyingModifiersFragmentCount = multiplyingM
      ? multiplyingModifiersAllocated ? parseInt(multiplyingM[2]) : 0
      : null;
    const lootLines = [...text.matchAll(new RegExp(`^${LOOT_EVIDENCE_LABEL}:\\s*(\\S+)\\s*$`, 'gim'))];
    const lootSummary = lootLines.length === 1 ? decodeLootSummary(lootLines[0][1]) : null;
    const lootSummaryInvalid = lootLines.length > 1 || (lootLines.length === 1 && lootSummary === null);
    if (mapCount === 0) return null;
    return { mapCount, mapType, multiplier, avgQuant, avgRarity, avgPack, avgCurr,
             perMapCost, totalInvest, totalReturn, netProfit, divPerMap, divPrice,
             chisel, runRegex, slamRegex, scarabs, scarabCosts, atlasTreeUrl, strategyName, strategyNotes, typeTags,
             deliOrbQty, deliOrbType, deliOrbPrice, astroType, astroCount, astroPrice,
             excludedDrops, gemInfo, isGroupPlay,
             groupSize, sessionMinutes, atlasPoints, atlasPointsMax,
             league, observedModAverage, observedModSampleSize,
             operation, operationError, updateStrategyId,
             evidenceTargetStrategyId, evidenceExpectedRevision, evidenceRunKey,
             evidenceRunStartedAt, evidenceRunEndedAt, setupFingerprint,
             gameDataRevision, gameDataPatchVersion,
             multiplyingModifiersAllocated, multiplyingModifiersFragmentCount,
             lootSummary, lootSummaryInvalid };
  } catch { return null; }
}

/** Format a number as `Xc` or `X.Xkc`. Returns `'—'` for null/undefined. */
export const fc = (v: number | null | undefined, sign = false): string => {
  if (v == null) return '\u2014';
  const abs = Math.abs(v);
  const s = abs >= 1000
    ? `${parseFloat((abs / 1000).toFixed(1))}k`
    : `${Math.round(abs)}`;
  const prefix = sign ? (v >= 0 ? '+' : '-') : (v < 0 ? '-' : '');
  return `${prefix}${s}c`;
};

/** DISPLAY-ONLY: thousands-separated chaos (`+107,047c`). NEVER use this in
 *  the Discord export wire format — the bot + all 3 client parsers expect
 *  plain digits there (session 17; large raw values were unreadable). */
export const fcSep = (v: number | null | undefined, sign = false, decimals = 0): string => {
  if (v == null) return '\u2014';
  const prefix = sign ? (v >= 0 ? '+' : '-') : (v < 0 ? '-' : '');
  const abs = Math.abs(v);
  const s = decimals > 0
    ? abs.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals })
    : Math.round(abs).toLocaleString('en-US');
  return `${prefix}${s}c`;
};

/** Format a number to one decimal place, or return null if nil. */
export const f1 = (v: number | null | undefined): string | null =>
  v != null ? v.toFixed(1) : null;
