/**
 * sessionCompare.ts — pure derivation for the WP11 session-comparison view.
 *
 * Turns a SavedSession into a flat row of comparison metrics using the shared
 * profit engine (profit.ts), so the comparison columns match what each session
 * showed live in the Dashboard. No React, no store — fully unit-testable.
 *
 * NOTE: investmentNeutralization is now persisted per SavedSession (WP11 / C),
 * so each column applies its OWN correction — matching what that session showed
 * live. Sessions saved before C (or that never had a correction) resolve to 0.
 */
import type { SavedSession } from '../types';
import { computeProfit, computeMultiplier } from './profit';

export interface CompareColumn {
  id: string;
  name: string;
  createdAt: string;
  n: number;              // map count
  multiplier: number;
  avgQuant: number;
  avgRarity: number;
  avgPack: number;
  avgCurr: number;
  divPrice: number;       // this session's own divine price (0 when unset)
  costPerMap: number;     // all-in: totalInvest / maps (0 for an empty session)
  totalInvest: number;
  lootGain: number;
  net: number;
  cPerMap: number;        // net per map
  divPerMap: number;      // net per map in divines (PRIMARY metric)
  neutralization: number; // double-count correction applied to this session (0 if none)
  hasReturn: boolean;
}

const avgOf = (
  session: SavedSession,
  key: 'quantity' | 'rarity' | 'packSize' | 'moreCurrency'
): number => {
  const n = session.maps.length;
  if (n === 0) return 0;
  return session.maps.reduce((a, m) => a + ((m[key] as number) ?? 0), 0) / n;
};

export function buildCompareColumn(session: SavedSession): CompareColumn {
  const n = session.maps.length;
  const neutralization = session.investmentNeutralization ?? 0;
  const { multiplier } = computeMultiplier(session.settings, session.maps);
  const p = computeProfit({
    settings: session.settings,
    mapCount: n,
    lootItems: session.lootItems,
    manualLootItems: session.manualLootItems ?? [],
    baselineTotal: session.baselineTotal,
    investmentNeutralization: neutralization,
  });
  return {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    n,
    multiplier,
    avgQuant:  avgOf(session, 'quantity'),
    avgRarity: avgOf(session, 'rarity'),
    avgPack:   avgOf(session, 'packSize'),
    avgCurr:   avgOf(session, 'moreCurrency'),
    divPrice:  session.settings.divinePrice || 0,
    costPerMap: n > 0 ? p.totalInvest / n : 0,
    totalInvest: p.totalInvest,
    lootGain: p.lootGain,
    net: p.net,
    cPerMap: p.cPerMap,
    divPerMap: p.divPerMap,
    neutralization,
    hasReturn: p.hasReturn,
  };
}

/**
 * Indices of the best (highest) columns for a higher-is-better metric, used for
 * winner highlighting. `pick` returns null for ineligible columns (e.g. loot
 * gain for a session with no return CSV); those are excluded.
 *
 * Highlights the FULL set achieving the max, so if two of three tie for best
 * above a worse third, BOTH are highlighted. Returns an EMPTY set when a
 * highlight would carry no signal: fewer than two eligible columns, or every
 * eligible column ties (nothing to distinguish).
 */
export function bestIndices(
  cols: CompareColumn[],
  pick: (c: CompareColumn) => number | null
): Set<number> {
  const eligible: { i: number; v: number }[] = [];
  cols.forEach((c, i) => {
    const v = pick(c);
    if (v !== null) eligible.push({ i, v });
  });
  if (eligible.length < 2) return new Set();
  const max = Math.max(...eligible.map((e) => e.v));
  const winners = eligible.filter((e) => e.v === max);
  if (winners.length === eligible.length) return new Set(); // all eligible tie -> no signal
  return new Set(winners.map((e) => e.i));
}
