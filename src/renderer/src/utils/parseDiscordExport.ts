/**
 * parseDiscordExport.ts
 *
 * Pure parser for WraeclastLedger Discord export strings.
 * No React or store dependencies — safe to test in isolation.
 */
import { stripExportDecoration } from './discordEmoji';

export interface DiscordImport {
  mapCount: number; mapType: string; multiplier: number;
  avgQuant: number; avgRarity: number; avgPack: number; avgCurr: number;
  perMapCost: number; totalInvest: number; totalReturn: number;
  netProfit: number; divPerMap: number; divPrice: number;
  chisel: string; runRegex: string; slamRegex: string; scarabs: string[]; scarabCosts: number[];
  atlasTreeUrl: string;
  strategyName: string; strategyNotes: string;
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
  /** Strategy-versioning marker (`Update strategy: <uuid>`): exposed for
   *  PROVENANCE only. Import Strategy must NEVER adopt it as the viewer's
   *  own update target (design v3.1 round-2 point 3d). null = no marker or
   *  malformed uuid. */
  updateStrategyId: string | null;
  gameDataRevision: number | null;
  gameDataPatchVersion: string | null;
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
    const markerM = textRaw.match(/^\s*Update strategy:\s*([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\s*$/im);
    const updateStrategyId = markerM ? markerM[1].toLowerCase() : null;
    const text = textRaw.replace(/^\s*Update strategy:[^\n]*$/gim, '').trim();
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
    const gameDataM = text.match(/Game Data:\s*r(\d+)\s*(?:[·-]\s*)?patch\s+([\w.-]+)/i);
    const gameDataRevision = gameDataM ? parseInt(gameDataM[1]) : null;
    const gameDataPatchVersion = gameDataM ? gameDataM[2] : null;
    if (mapCount === 0) return null;
    return { mapCount, mapType, multiplier, avgQuant, avgRarity, avgPack, avgCurr,
             perMapCost, totalInvest, totalReturn, netProfit, divPerMap, divPrice,
             chisel, runRegex, slamRegex, scarabs, scarabCosts, atlasTreeUrl, strategyName, strategyNotes,
             deliOrbQty, deliOrbType, deliOrbPrice, astroType, astroCount, astroPrice,
             excludedDrops, gemInfo, isGroupPlay,
             groupSize, sessionMinutes, atlasPoints, atlasPointsMax,
             updateStrategyId, gameDataRevision, gameDataPatchVersion };
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
