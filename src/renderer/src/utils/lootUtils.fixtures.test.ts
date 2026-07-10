/**
 * lootUtils.fixtures.test.ts — WP1 tail: parseLootCsv + diffLootItems against
 * the REAL WealthyExile export pair (wexile_base.csv / wexile_return.csv,
 * provided by Sad 2026-07-02, see __fixtures__/README.md).
 *
 * The pair is a constructed scenario: baseline taken with 9x lvl-1 Enhance and
 * investment items still in monitored tabs; return taken after swapping to 9x
 * lvl-4 Enhance, returning withdrawn currency, and removing investment items.
 *
 * Expected values below were independently recomputed from the raw CSVs and
 * match the in-app numbers Sad confirmed (investment detection 6448.05c,
 * banner +6448.1c).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseLootCsv, diffLootItems } from './lootUtils';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)), 'utf-8');

const baseCsv   = fixture('wexile_base.csv');
const returnCsv = fixture('wexile_return.csv');

const baseline = parseLootCsv(baseCsv);
const current  = parseLootCsv(returnCsv);

describe('parseLootCsv on real WealthyExile exports', () => {
  it('tolerates the UTF-8 BOM — first data row is not corrupted', () => {
    // The BOM sits directly before the quoted header. If it leaked through,
    // the header row would fail to be recognised or the first item name would
    // carry a stray \uFEFF.
    expect(baseCsv.charCodeAt(0)).toBe(0xfeff); // fixture really has a BOM
    expect(baseline.every((i) => !i.name.includes('\uFEFF'))).toBe(true);
  });

  it('parses every data row (611 baseline / 606 return, no trailing newline)', () => {
    expect(baseline).toHaveLength(611);
    expect(current).toHaveLength(606);
  });

  it('sorts by total descending — Divine Orb tops both snapshots', () => {
    expect(baseline[0]).toMatchObject({ name: 'Divine Orb', quantity: '20', total: 11498 });
    expect(current[0]).toMatchObject({ name: 'Divine Orb', quantity: '182', total: 104631.8 });
  });

  it('preserves diacritic item names verbatim', () => {
    for (const items of [baseline, current]) {
      const names = items.map((i) => i.name);
      expect(names).toContain('Black Mórrigan');
      expect(names).toContain('Maelström of Chaos');
    }
  });

  it('reads quoted fields with commas-free free-text tab names', () => {
    const divine = baseline.find((i) => i.name === 'Divine Orb');
    expect(divine?.tab).toBe('curr');
    const gem = baseline.find((i) => i.name === 'Enhance Support - 1/0');
    expect(gem?.tab).toBe('gemy');
  });
});

describe('diffLootItems on the real baseline/return pair', () => {
  const rows = diffLootItems(baseline, current);
  const byName = new Map(rows.map((r) => [r.name, r]));

  it('produces exactly the 11 changed rows, sorted by delta descending', () => {
    expect(rows).toHaveLength(11);
    expect(rows[0].name).toBe('Divine Orb');
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].delta).toBeLessThanOrEqual(rows[i - 1].delta);
    }
  });

  it('captures the returned currency and the new gain', () => {
    expect(byName.get('Divine Orb')).toMatchObject({ baseQty: 20, currQty: 182 });
    expect(byName.get('Divine Orb')!.delta).toBeCloseTo(93133.8, 1);
    expect(byName.get("Valdo's Puzzle Box")).toMatchObject({ baseQty: 0, currQty: 29 });
    expect(byName.get("Valdo's Puzzle Box")!.delta).toBeCloseTo(12675.9, 1);
    expect(byName.get('Chaos Orb')).toMatchObject({ baseQty: 1300, currQty: 476 });
    expect(byName.get('Chaos Orb')!.delta).toBeCloseTo(-824, 1);
  });

  it('reports the six disappeared investment items, totalling 6448.05c', () => {
    const expected: [string, number][] = [
      ['Breach Scarab of Instability', 1547.36],
      ['Scarab of Wisps',              1545.19],
      ['Horned Scarab of Bloodlines',  1103],
      ['Grasping Astrolabe',           926.8],
      ['Cartography Scarab of Risk',   671.7],
      ['Fine Delirium Orb',            654],
    ];
    let total = 0;
    for (const [name, value] of expected) {
      const row = byName.get(name);
      expect(row, name).toBeDefined();
      expect(row!.delta).toBeCloseTo(-value, 2);
      expect(row!.currQty).toBe(0);
      total += value;
    }
    expect(total).toBeCloseTo(6448.05, 2);
  });

  it('captures the gem swap: lvl-1 Enhance (45c) out, lvl-4 corrupted (3600c) in', () => {
    // These two rows feed the advGemName auto-exclusion (store setLootItems,
    // partial match on "Enhance") and the 45c gemBuyOffset (profit.ts,
    // 9 gems x 5c buy) — the values here are what those features rely on.
    expect(byName.get('Enhance Support - 1/0')).toMatchObject({ baseQty: 9, currQty: 0 });
    expect(byName.get('Enhance Support - 1/0')!.delta).toBeCloseTo(-45, 2);
    expect(byName.get('Enhance Support - 4/0 corrupted')).toMatchObject({ baseQty: 0, currQty: 9 });
    expect(byName.get('Enhance Support - 4/0 corrupted')!.delta).toBeCloseTo(3600, 2);
  });

  it('advGemName partial match "enhance" catches both gem rows and nothing else', () => {
    // Mirrors the store's auto-exclusion predicate exactly:
    // i.name.toLowerCase().includes(gemName)
    const gemName = 'enhance';
    const matches = current.filter((i) => i.name.toLowerCase().includes(gemName));
    expect(matches.map((i) => i.name)).toEqual(['Enhance Support - 4/0 corrupted']);
    const baseMatches = baseline.filter((i) => i.name.toLowerCase().includes(gemName));
    expect(baseMatches.map((i) => i.name)).toEqual(['Enhance Support - 1/0']);
  });
});
