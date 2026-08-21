import { describe, expect, it } from 'vitest';
import { strToU8, zlibSync } from 'fflate';
import type { LootItem, ManualLootItem } from '../types';
import {
  buildLootSummary, compactLootSummary, decodeLootSummary, encodeLootSummary,
  expandCompactLootSummary,
  LOOT_SUMMARY_ROW_LIMIT, LOOT_SUMMARY_TOKEN_MAX,
} from './lootSummary';

const item = (name: string, total: number, quantity: string, tab = 'curr', excluded = false): LootItem => ({
  id: `${name}-${total}`, name, total, quantity, tab, excluded, price: '1',
});

const manual = (name: string, total: number, note = ''): ManualLootItem => ({
  id: name, name, total, note, quantity: 1, category: 'Other',
});

describe('buildLootSummary', () => {
  it('reconciles CSV diff, corrections and manual return', () => {
    const summary = buildLootSummary({
      baselineItems: [item('Divine Orb', 100, '1'), item('Chaos Orb', 50, '50')],
      lootItems: [item('Divine Orb', 300, '3'), item('Chaos Orb', 40, '40')],
      baselineTotal: 150,
      manualLootItems: [manual('Unpriced Blueprint', 75, 'WealthyExile left it unpriced')],
      gemCorrection: 10,
      investmentCorrection: 25,
      reportedReturn: 300,
    });
    expect(summary).not.toBeNull();
    expect(summary).toMatchObject({
      csvPositive: 200,
      csvNegative: -10,
      csvNet: 190,
      inventoryFlow: 190,
      marketRevaluation: 0,
      manualTotal: 75,
      gemCorrection: 10,
      investmentCorrection: 25,
      reportedReturn: 300,
    });
    expect(summary?.rows[0]).toMatchObject({ name: 'Divine Orb', source: 'wealthyexile', value: 200 });
    expect(summary?.rows[1]).toMatchObject({ name: 'Unpriced Blueprint', source: 'manual', value: 75 });
  });

  it('preserves same-quantity market gains with verified before and after values', () => {
    const summary = buildLootSummary({
      baselineItems: [item("The Maven's Writ", 776.1, '199', 'frag')],
      lootItems: [item("The Maven's Writ", 1134.3, '199', 'frag')],
      baselineTotal: 776.1,
      manualLootItems: [], gemCorrection: 0, investmentCorrection: 0,
      reportedReturn: 358.2,
    });

    expect(summary).toMatchObject({
      csvNet: 358.2,
      inventoryFlow: 0,
      marketRevaluation: 358.2,
      reportedReturn: 358.2,
    });
    expect(summary?.rows[0]).toMatchObject({
      name: "The Maven's Writ",
      quantity: 199,
      value: 358.2,
      valuation: {
        baselineQuantity: 199,
        currentQuantity: 199,
        baselineValue: 776.1,
        currentValue: 1134.3,
      },
    });
    expect(decodeLootSummary(encodeLootSummary(summary!))).toEqual(summary);
  });

  it('rejects forged valuation proof but still accepts legacy compact totals', () => {
    const summary = buildLootSummary({
      baselineItems: [item('Held item', 100, '5')],
      lootItems: [item('Held item', 125, '5')],
      baselineTotal: 100,
      manualLootItems: [], gemCorrection: 0, investmentCorrection: 0,
      reportedReturn: 25,
    })!;
    const forged = compactLootSummary(summary);
    forged.r[0][11] = 999;
    expect(expandCompactLootSummary(forged)).toBeNull();

    const legacy = compactLootSummary({
      ...summary,
      rows: [{
        name: 'New item', category: 'Other', source: 'wealthyexile',
        quantity: 1, value: 25,
      }],
      inventoryFlow: 25,
      marketRevaluation: 0,
    });
    legacy.t = legacy.t.slice(0, 13) as typeof legacy.t;
    expect(expandCompactLootSummary(legacy)).toMatchObject({
      inventoryFlow: 25,
      marketRevaluation: 0,
    });
  });

  it('always reserves the bounded row set for manual provenance', () => {
    const baselineItems: LootItem[] = [];
    const lootItems = Array.from({ length: 40 }, (_, index) => item(`CSV ${index}`, 1000 - index, '1'));
    const manualLootItems = [manual('Manual low value', 1, 'still visible')];
    const summary = buildLootSummary({
      baselineItems, lootItems, baselineTotal: 0, manualLootItems,
      gemCorrection: 0, investmentCorrection: 0,
      reportedReturn: lootItems.reduce((sum, row) => sum + row.total, 0) + 1,
    });
    expect(summary?.rows).toHaveLength(LOOT_SUMMARY_ROW_LIMIT);
    expect(summary?.rows.some((row) => row.name === 'Manual low value')).toBe(true);
    expect(summary?.omittedCsvRows).toBe(11);
  });

  it('ignores excluded return rows and records baseline-total residuals', () => {
    const summary = buildLootSummary({
      baselineItems: [item('A', 10, '1')],
      lootItems: [item('A', 30, '3'), item('Excluded', 500, '1', 'curr', true)],
      baselineTotal: 12,
      manualLootItems: [], gemCorrection: 0, investmentCorrection: 0,
      reportedReturn: 18,
    });
    expect(summary?.csvNet).toBe(18);
    expect(summary?.csvPositive).toBe(20);
    expect(summary?.csvAdjustment).toBe(-2);
    expect(summary?.rows.some((row) => row.name === 'Excluded')).toBe(false);
  });

  it('requires an imported return snapshot', () => {
    expect(buildLootSummary({
      baselineItems: [], lootItems: [], baselineTotal: 100,
      manualLootItems: [manual('Claim', 1000)],
      gemCorrection: 0, investmentCorrection: 0, reportedReturn: 0,
    })).toBeNull();
  });

  it('round-trips a full 30-row summary through the compact Discord token', () => {
    const lootItems = Array.from({ length: 35 }, (_, index) =>
      item(`Valuable item number ${index} with a useful name`, 5000 - index * 13, String(index + 1), index % 2 ? 'curr' : 'card'));
    const summary = buildLootSummary({
      baselineItems: [], lootItems, baselineTotal: 0,
      manualLootItems: [manual('Unidentified unique jewellery', 750, 'Priced manually after identification')],
      gemCorrection: 0, investmentCorrection: 25,
      reportedReturn: lootItems.reduce((sum, row) => sum + row.total, 0) + 775,
    });
    expect(summary).not.toBeNull();
    const token = encodeLootSummary(summary!);
    expect(token.length).toBeLessThan(1500);
    expect(decodeLootSummary(token)).toEqual(summary);
    expect(decodeLootSummary('wl1.not-valid-compressed-data')).toBeNull();
  });

  it('rejects a compact payload that inflates to the safety limit', () => {
    const compact = JSON.stringify({ v: 1, r: [], c: [], t: Array(13).fill(0) });
    const compressed = zlibSync(strToU8(compact + ' '.repeat(70 * 1024)), { level: 9 });
    let binary = '';
    for (const byte of compressed) binary += String.fromCharCode(byte);
    const token = `wl1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;

    expect(token.length).toBeLessThan(LOOT_SUMMARY_TOKEN_MAX);
    expect(decodeLootSummary(token)).toBeNull();
  });
});
