/**
 * parseDiscordExport.ts
 *
 * Pure parser for WraeclastLedger Discord export strings.
 * No React or store dependencies — safe to test in isolation.
 */

export interface DiscordImport {
  mapCount: number; mapType: string; multiplier: number;
  avgQuant: number; avgRarity: number; avgPack: number; avgCurr: number;
  perMapCost: number; totalInvest: number; totalReturn: number;
  netProfit: number; divPerMap: number; divPrice: number;
  chisel: string; runRegex: string; slamRegex: string; scarabs: string[];
  strategyName: string; strategyNotes: string;
  deliOrbQty: number; deliOrbType: string; deliOrbPrice: number;
  astroType: string; astroCount: number; astroPrice: number;
  excludedDrops: { name: string; value: number }[];
  gemInfo: { count: number; buy: number; sell: number; net: number } | null;
  isGroupPlay: boolean;
}

export function parseDiscordExport(raw: string): DiscordImport | null {
  try {
    const text = raw.replace(/^```\s*/m, '').replace(/\s*```\s*$/m, '').replace(/\*\*/g, '').trim();
    if (!text.includes('WraeclastLedger')) return null;
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
    const stripBt     = (s: string) => s.trim().replace(/^`+|`+$/g, '').trim();
    const runMatch    = text.match(/(?:\u{1F7E2}\s*)?Run:\s+(.+)/u);
    const slamMatch   = text.match(/(?:\u{1F7E0}\s*)?Slam:\s+(.+?)(?:\s*[*(]open|\s*$)/mu);
    const runRegex    = runMatch  ? stripBt(runMatch[1])  : '';
    const slamRegex   = slamMatch ? stripBt(slamMatch[1]) : '';
    const scarabs: string[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*-?\s*([A-Z][^\n(]+?)\s+\(\d/);
      if (m && !m[1].includes(':') && m[1].trim().length >= 5) scarabs.push(m[1].trim());
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
    if (mapCount === 0) return null;
    return { mapCount, mapType, multiplier, avgQuant, avgRarity, avgPack, avgCurr,
             perMapCost, totalInvest, totalReturn, netProfit, divPerMap, divPrice,
             chisel, runRegex, slamRegex, scarabs, strategyName, strategyNotes,
             deliOrbQty, deliOrbType, deliOrbPrice, astroType, astroCount, astroPrice,
             excludedDrops, gemInfo, isGroupPlay };
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

/** Format a number to one decimal place, or return null if nil. */
export const f1 = (v: number | null | undefined): string | null =>
  v != null ? v.toFixed(1) : null;
