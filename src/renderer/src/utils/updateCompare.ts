/**
 * updateCompare.ts — pure diff between a strategy's CURRENT published numbers
 * and the numbers a pending Update share is about to publish.
 *
 * Used by ShareModal when a session carries an update target: it lets the author
 * eyeball what the update will change before committing (design: "Update
 * published result" is a replacement — this makes the replacement visible).
 *
 * The `next` side is the parsed export (parseDiscordExport of the about-to-share
 * text) precisely because that is what the bot/server will store — so the
 * preview matches the outcome exactly, with no parallel math to drift.
 */
import type { Strategy } from './strategyConstants';
import type { DiscordImport } from './parseDiscordExport';

export type CompareKind = 'pct' | 'div' | 'chaos' | 'count';

export interface CompareRow {
  label: string;
  before: number | null;
  after: number | null;
  kind: CompareKind;
}

/** Current all-in cost/map, matching the StrategyCard/Investment definition. */
function currentCostPerMap(s: Strategy): number | null {
  return s.total_invest != null && s.map_count != null && s.map_count > 0
    ? s.total_invest / s.map_count
    : s.per_map_cost ?? null;
}

export function buildUpdateComparison(current: Strategy, next: DiscordImport): CompareRow[] {
  return [
    { label: 'Maps',         before: current.map_count ?? null,    after: next.mapCount,    kind: 'count' },
    { label: 'Avg Quant',    before: current.avg_quant ?? null,    after: next.avgQuant,    kind: 'pct'   },
    { label: 'Avg Rarity',   before: current.avg_rarity ?? null,   after: next.avgRarity,   kind: 'pct'   },
    { label: 'Avg Pack',     before: current.avg_pack ?? null,     after: next.avgPack,     kind: 'pct'   },
    { label: 'Avg Currency', before: current.avg_currency ?? null, after: next.avgCurr,     kind: 'pct'   },
    { label: 'Div / map',    before: current.div_per_map ?? null,  after: next.divPerMap,   kind: 'div'   },
    { label: 'Cost / map',   before: currentCostPerMap(current),   after: next.perMapCost,  kind: 'chaos' },
    { label: 'Total invest', before: current.total_invest ?? null, after: next.totalInvest, kind: 'chaos' },
    { label: 'Total profit', before: current.net_profit ?? null,   after: next.netProfit,   kind: 'chaos' },
  ];
}

/** Directional change of a row, tolerant of tiny float noise. null = no meaningful change or a missing side. */
export function rowDirection(row: CompareRow): 'up' | 'down' | 'same' | null {
  if (row.before == null || row.after == null) return null;
  const delta = row.after - row.before;
  if (Math.abs(delta) < 1e-6) return 'same';
  return delta > 0 ? 'up' : 'down';
}
