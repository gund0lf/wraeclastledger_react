import { describe, it, expect } from 'vitest';
import { parseLootCsv, diffLootItems } from './lootUtils';

// ─── parseLootCsv ─────────────────────────────────────────────────────────────

describe('parseLootCsv', () => {
  const header = 'Name,Tab,Quantity,Price,Total\n';

  it('returns empty array for empty string', () => {
    expect(parseLootCsv('')).toEqual([]);
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseLootCsv(header.trim())).toEqual([]);
  });

  it('returns empty array for fewer than 5 columns', () => {
    expect(parseLootCsv(`${header}Chaos Orb,Stash 1,10,5\n`)).toEqual([]);
  });

  it('skips rows with non-numeric total', () => {
    expect(parseLootCsv(`${header}Chaos Orb,Stash 1,10,5,abc\n`)).toEqual([]);
  });

  it('skips rows with empty name', () => {
    expect(parseLootCsv(`${header},Stash 1,10,5,50\n`)).toEqual([]);
  });

  it('parses a single valid row', () => {
    const result = parseLootCsv(`${header}Chaos Orb,Stash 1,10,5,50\n`);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Chaos Orb');
    expect(result[0].tab).toBe('Stash 1');
    expect(result[0].quantity).toBe('10');
    expect(result[0].price).toBe('5');
    expect(result[0].total).toBe(50);
    expect(result[0].excluded).toBe(false);
    expect(result[0].id).toBeTruthy();
  });

  it('handles quoted fields with commas', () => {
    const result = parseLootCsv(`${header}"Orb, of Chaos",Stash 1,10,5,50\n`);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Orb, of Chaos');
  });

  it('strips BOM from start of file', () => {
    const result = parseLootCsv('\uFEFF' + header + 'Chaos Orb,Stash 1,10,5,50\n');
    expect(result).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const result = parseLootCsv(`${header}Chaos Orb,Stash 1,10,5,50\r\nDivine Orb,Stash 2,1,300,300\r\n`);
    expect(result).toHaveLength(2);
  });

  it('sorts by total value descending', () => {
    const result = parseLootCsv(
      `${header}Chaos Orb,S1,10,5,50\nDivine Orb,S1,1,300,300\nOrb of Alteration,S1,5,1,5\n`
    );
    expect(result[0].total).toBe(300);
    expect(result[1].total).toBe(50);
    expect(result[2].total).toBe(5);
  });

  it('assigns a unique id to each item', () => {
    const result = parseLootCsv(`${header}Chaos Orb,S1,10,5,50\nDivine Orb,S1,1,300,300\n`);
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('handles float totals', () => {
    const result = parseLootCsv(`${header}Some Orb,S1,1,12.5,12.5\n`);
    expect(result[0].total).toBeCloseTo(12.5);
  });
});

// ─── diffLootItems ───────────────────────────────────────────────────────────

const makeItem = (name: string, total: number, quantity = '1', tab = 'S1') => ({
  id: 'x', name, tab, quantity, price: '1', total, excluded: false,
});

describe('diffLootItems', () => {
  it('returns empty array for two empty snapshots', () => {
    expect(diffLootItems([], [])).toEqual([]);
  });

  it('returns positive delta for new items not in baseline', () => {
    const result = diffLootItems([], [makeItem('Divine Orb', 300)]);
    expect(result).toHaveLength(1);
    expect(result[0].delta).toBe(300);
    expect(result[0].name).toBe('Divine Orb');
  });

  it('returns negative delta for items that disappeared', () => {
    const result = diffLootItems([makeItem('Chaos Orb', 50)], []);
    expect(result).toHaveLength(1);
    expect(result[0].delta).toBe(-50);
  });

  it('returns delta for items that changed value', () => {
    const result = diffLootItems(
      [makeItem('Chaos Orb', 100, '20')],
      [makeItem('Chaos Orb', 150, '30')]
    );
    expect(result).toHaveLength(1);
    expect(result[0].delta).toBe(50);
    expect(result[0].baseQty).toBe(20);
    expect(result[0].currQty).toBe(30);
  });

  it('omits rows with |delta| < 0.01', () => {
    const result = diffLootItems(
      [makeItem('Chaos Orb', 100.004)],
      [makeItem('Chaos Orb', 100.005)]
    );
    expect(result).toEqual([]);
  });

  it('sorts by delta descending (biggest gain first)', () => {
    const result = diffLootItems(
      [],
      [makeItem('A', 10), makeItem('B', 300), makeItem('C', 50)]
    );
    expect(result[0].name).toBe('B');
    expect(result[1].name).toBe('C');
    expect(result[2].name).toBe('A');
  });

  it('uses current tab if available, falls back to baseline tab', () => {
    const base = [makeItem('X', 100, '1', 'OldTab')];
    const curr = [makeItem('X', 200, '2', 'NewTab')];
    const result = diffLootItems(base, curr);
    expect(result[0].tab).toBe('NewTab');

    const gone = diffLootItems([makeItem('Y', 50, '1', 'OldTab')], []);
    expect(gone[0].tab).toBe('OldTab');
  });

  it('carries the exact current category and falls back to the baseline category', () => {
    const base = [{ ...makeItem("Brother's Gift", 100), category: 'Divination Cards' as const }];
    const current = [{ ...makeItem("Brother's Gift", 200), category: 'Other' as const }];
    expect(diffLootItems(base, current)[0].category).toBe('Other');
    expect(diffLootItems(base, [])[0].category).toBe('Divination Cards');
  });

  it('handles multiple items with mixed gains and losses', () => {
    const baseline = [makeItem('A', 100), makeItem('B', 200), makeItem('C', 50)];
    const current  = [makeItem('A', 150), makeItem('C', 30),  makeItem('D', 80)];
    const result   = diffLootItems(baseline, current);
    const byName = Object.fromEntries(result.map((r) => [r.name, r.delta]));
    expect(byName['A']).toBe(50);
    expect(byName['B']).toBe(-200);
    expect(byName['C']).toBe(-20);
    expect(byName['D']).toBe(80);
  });
});
