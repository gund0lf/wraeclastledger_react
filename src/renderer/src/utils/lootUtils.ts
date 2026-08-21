/**
 * lootUtils.ts
 *
 * Pure utilities for loot CSV parsing and baseline diff computation.
 * No React or store dependencies — safe to test in isolation.
 */

import { v4 as uuidv4 } from 'uuid';
import { LootItem } from '../types';

export interface DiffRow {
  name: string;
  tab: string;
  delta: number;
  baseQty: number;
  currQty: number;
  baseTotal: number;
  currTotal: number;
}

/**
 * Parse a WealthyExile CSV export into LootItems.
 * Handles quoted fields, BOM, CRLF, and malformed rows gracefully.
 * Returns items sorted by total value descending.
 */
export const parseLootCsv = (csv: string): LootItem[] => {
  const clean = csv.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const items: LootItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts: string[] = [];
    let cur = ''; let inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    if (parts.length < 5) continue;
    const [n, t, q, p] = parts.map((s) => s.trim());
    const total = parseFloat(parts[4].trim());
    if (!n || isNaN(total)) continue;
    items.push({ id: uuidv4(), name: n, tab: t, quantity: q, price: p, total, excluded: false });
  }
  return items.sort((a, b) => b.total - a.total);
};

/**
 * Compute the delta between a baseline and a current loot snapshot.
 * Rows with |delta| < 0.01c are omitted.
 * Returns rows sorted by delta descending (biggest gains first).
 */
export function diffLootItems(baseline: LootItem[], current: LootItem[]): DiffRow[] {
  const bMap = new Map(baseline.map((i) => [i.name, i]));
  const cMap = new Map(current.map((i) => [i.name, i]));
  const rows: DiffRow[] = [];
  for (const name of new Set([...bMap.keys(), ...cMap.keys()])) {
    const b = bMap.get(name), c = cMap.get(name);
    const delta = (c?.total ?? 0) - (b?.total ?? 0);
    if (Math.abs(delta) < 0.01) continue;
    rows.push({
      name, tab: c?.tab ?? b?.tab ?? '', delta,
      baseQty: parseInt(b?.quantity ?? '0') || 0,
      currQty: parseInt(c?.quantity ?? '0') || 0,
      baseTotal: b?.total ?? 0,
      currTotal: c?.total ?? 0,
    });
  }
  return rows.sort((a, b) => b.delta - a.delta);
}
