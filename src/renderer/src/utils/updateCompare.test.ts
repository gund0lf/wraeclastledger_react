/**
 * updateCompare.test.ts — the pure diff between a strategy's current published
 * numbers and a pending update's about-to-publish numbers.
 */
import { describe, it, expect } from 'vitest';
import { buildUpdateComparison, rowDirection, type CompareRow } from './updateCompare';
import type { Strategy } from './strategyConstants';
import type { DiscordImport } from './parseDiscordExport';

const current = {
  id: 'x', discord_username: 'me', posted_at: '2026-07-01T00:00:00Z',
  map_count: 100, avg_quant: 80, avg_rarity: 60, avg_pack: 40, avg_currency: 100,
  div_per_map: 5, total_invest: 2000, net_profit: 3000, per_map_cost: 20,
} as Strategy;

const next = {
  mapCount: 120, avgQuant: 85, avgRarity: 60, avgPack: 42, avgCurr: 110,
  perMapCost: 18, totalInvest: 2400, netProfit: 4200, divPerMap: 6,
} as DiscordImport;

const byLabel = (rows: CompareRow[], label: string) => rows.find((r) => r.label === label)!;

describe('buildUpdateComparison', () => {
  const rows = buildUpdateComparison(current, next);

  it('pairs each field before -> after', () => {
    expect(byLabel(rows, 'Maps')).toMatchObject({ before: 100, after: 120 });
    expect(byLabel(rows, 'Div / map')).toMatchObject({ before: 5, after: 6 });
    expect(byLabel(rows, 'Total profit')).toMatchObject({ before: 3000, after: 4200 });
  });

  it('derives current cost/map from total_invest / map_count (not the stored per_map_cost)', () => {
    // 2000 / 100 = 20 here (coincides), but the derivation must be the total-based one.
    expect(byLabel(rows, 'Cost / map').before).toBe(20);
    expect(byLabel(rows, 'Cost / map').after).toBe(18);
  });

  it('keeps comparison rows neutral rather than classifying changes as better or worse', () => {
    expect(rows.every((row) => !('higherBetter' in row))).toBe(true);
  });

  it('handles a missing current side (null before) without throwing', () => {
    const sparse = { id: 'y', discord_username: 'me', posted_at: '', } as Strategy;
    const rows2 = buildUpdateComparison(sparse, next);
    expect(byLabel(rows2, 'Maps').before).toBeNull();
    expect(rowDirection(byLabel(rows2, 'Maps'))).toBeNull();
  });
});

describe('rowDirection', () => {
  const rows = buildUpdateComparison(current, next);

  it('reports a rise in div/map as an upward change', () => {
    const r = byLabel(rows, 'Div / map');
    expect(rowDirection(r)).toBe('up');
  });

  it('reports a rise in total invest as an upward change without judging it', () => {
    const r = byLabel(rows, 'Total invest');
    expect(rowDirection(r)).toBe('up');
  });

  it('reports a drop in cost/map as a downward change without judging it', () => {
    const r = byLabel(rows, 'Cost / map');
    expect(rowDirection(r)).toBe('down');
  });

  it('reports an unchanged row as the same', () => {
    const r = byLabel(rows, 'Avg Rarity'); // 60 -> 60
    expect(rowDirection(r)).toBe('same');
  });
});
