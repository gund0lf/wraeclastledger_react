import type { LootCategory, LootItem, ManualLootItem } from '../types';
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import { categorise, ITEM_CATEGORIES } from './lootCategories';
import { diffLootItems } from './lootUtils';

export const LOOT_SUMMARY_VERSION = 1 as const;
export const LOOT_SUMMARY_ROW_LIMIT = 30;
export const LOOT_SUMMARY_TOKEN_MAX = 1800;
const LOOT_SUMMARY_OUTPUT_MAX = 64 * 1024;
export const MANUAL_LOOT_NAME_MAX = 120;
export const MANUAL_LOOT_NOTE_MAX = 160;
export const LOOT_EVIDENCE_LABEL = 'Loot Evidence';

export type LootSummarySource = 'wealthyexile' | 'manual';

export interface LootSummaryRow {
  name: string;
  category: LootCategory;
  source: LootSummarySource;
  quantity: number;
  value: number;
  tab?: string;
  note?: string;
}

export interface LootSummaryCategory {
  category: LootCategory;
  value: number;
}

export interface LootSummary {
  version: typeof LOOT_SUMMARY_VERSION;
  rowLimit: typeof LOOT_SUMMARY_ROW_LIMIT;
  rows: LootSummaryRow[];
  categories: LootSummaryCategory[];
  hasBaseline: boolean;
  csvPositive: number;
  csvNegative: number;
  csvNet: number;
  csvAdjustment: number;
  manualTotal: number;
  gemCorrection: number;
  investmentCorrection: number;
  reportedReturn: number;
  omittedCsvRows: number;
  omittedCsvValue: number;
  omittedManualRows: number;
  omittedManualValue: number;
}

export interface BuildLootSummaryInput {
  baselineItems: LootItem[];
  lootItems: LootItem[];
  baselineTotal: number;
  manualLootItems: ManualLootItem[];
  gemCorrection: number;
  investmentCorrection: number;
  reportedReturn: number;
}

const finite = (value: number): number => Number.isFinite(value) ? value : 0;
const rounded = (value: number): number => Math.round(finite(value) * 10) / 10;
const cleanText = (value: string, max: number): string =>
  value.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const isLootCategory = (value: unknown): value is LootCategory =>
  typeof value === 'string' && ITEM_CATEGORIES.includes(value as LootCategory);

export type CompactLootSummary = {
  v: number;
  r: [string, LootCategory, 0 | 1, number, number, string?, string?][];
  c: [LootCategory, number][];
  t: [number, number, number, number, number, number, number, number, number, number, number, number, number];
};

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlToBytes = (encoded: string): Uint8Array => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

export const compactLootSummary = (summary: LootSummary): CompactLootSummary => ({
  v: summary.version,
  r: summary.rows.map((row) => [
    row.name, row.category, row.source === 'manual' ? 1 : 0,
    row.quantity, row.value, row.tab, row.note,
  ]),
  c: summary.categories.map((entry) => [entry.category, entry.value]),
  t: [
    summary.hasBaseline ? 1 : 0,
    summary.csvPositive, summary.csvNegative, summary.csvNet, summary.csvAdjustment,
    summary.manualTotal, summary.gemCorrection, summary.investmentCorrection,
    summary.reportedReturn, summary.omittedCsvRows, summary.omittedCsvValue,
    summary.omittedManualRows, summary.omittedManualValue,
  ],
});

/** Compress the bounded summary into the existing paste-based Discord wire.
 * The bot stores the decoded JSON and replaces this opaque line with a short
 * human caption plus a generated image. */
export function encodeLootSummary(summary: LootSummary): string {
  const compressed = zlibSync(strToU8(JSON.stringify(compactLootSummary(summary))), { level: 9 });
  return `wl1.${bytesToBase64Url(compressed)}`;
}

export function lootSummaryWireLine(summary: LootSummary): string {
  return `${LOOT_EVIDENCE_LABEL}: ${encodeLootSummary(summary)}`;
}

/** Decode for client round-trip/import tests. Server/bot has a strict mirror. */
export function expandCompactLootSummary(value: unknown): LootSummary | null {
  try {
    const compact = value as CompactLootSummary;
    if (compact.v !== LOOT_SUMMARY_VERSION || !Array.isArray(compact.r) || !Array.isArray(compact.c) || !Array.isArray(compact.t)) return null;
    if (compact.r.length > LOOT_SUMMARY_ROW_LIMIT || compact.c.length > ITEM_CATEGORIES.length || compact.t.length !== 13) return null;
    if (!compact.r.every((row) => Array.isArray(row) && row.length >= 5
      && typeof row[0] === 'string' && isLootCategory(row[1]) && (row[2] === 0 || row[2] === 1)
      && Number.isFinite(Number(row[3])) && Number(row[3]) > 0
      && Number.isFinite(Number(row[4])) && Number(row[4]) > 0)) return null;
    if (!compact.c.every((entry) => Array.isArray(entry) && entry.length === 2
      && isLootCategory(entry[0]) && Number.isFinite(Number(entry[1])) && Number(entry[1]) >= 0)) return null;
    if (!compact.t.every((entry) => Number.isFinite(Number(entry)))) return null;
    const [hasBaseline, csvPositive, csvNegative, csvNet, csvAdjustment,
      manualTotal, gemCorrection, investmentCorrection, reportedReturn,
      omittedCsvRows, omittedCsvValue, omittedManualRows, omittedManualValue] = compact.t;
    const rows: LootSummaryRow[] = compact.r.map((row) => ({
      name: cleanText(String(row[0] ?? ''), MANUAL_LOOT_NAME_MAX),
      category: row[1],
      source: row[2] === 1 ? 'manual' as const : 'wealthyexile' as const,
      quantity: finite(Number(row[3])),
      value: rounded(Number(row[4])),
      tab: row[5] ? cleanText(String(row[5]), 40) : undefined,
      note: row[6] ? cleanText(String(row[6]), MANUAL_LOOT_NOTE_MAX) : undefined,
    })).filter((row) => row.name.length > 0 && row.value > 0);
    const categories = compact.c.map(([category, amount]) => ({ category, value: rounded(Number(amount)) }));
    return {
      version: LOOT_SUMMARY_VERSION,
      rowLimit: LOOT_SUMMARY_ROW_LIMIT,
      rows, categories,
      hasBaseline: hasBaseline === 1,
      csvPositive: rounded(csvPositive), csvNegative: rounded(csvNegative),
      csvNet: rounded(csvNet), csvAdjustment: rounded(csvAdjustment),
      manualTotal: rounded(manualTotal), gemCorrection: rounded(gemCorrection),
      investmentCorrection: rounded(investmentCorrection), reportedReturn: rounded(reportedReturn),
      omittedCsvRows: Math.max(0, Math.round(finite(omittedCsvRows))),
      omittedCsvValue: rounded(omittedCsvValue),
      omittedManualRows: Math.max(0, Math.round(finite(omittedManualRows))),
      omittedManualValue: rounded(omittedManualValue),
    };
  } catch {
    return null;
  }
}

export function decodeLootSummary(token: string): LootSummary | null {
  try {
    if (token.length > LOOT_SUMMARY_TOKEN_MAX) return null;
    const match = /^wl1\.([A-Za-z0-9_-]+)$/.exec(token.trim());
    if (!match) return null;
    const inflated = unzlibSync(base64UrlToBytes(match[1]), {
      out: new Uint8Array(LOOT_SUMMARY_OUTPUT_MAX),
    });
    // A full buffer means the payload reached (or exceeded) the hard cap.
    // Valid 30-row summaries are only a few KiB, so reject rather than risk
    // accepting a truncated compression bomb from an untrusted strategy.
    if (inflated.length >= LOOT_SUMMARY_OUTPUT_MAX) return null;
    return expandCompactLootSummary(JSON.parse(strFromU8(inflated)));
  } catch {
    return null;
  }
}

/** Build the bounded, provenance-carrying payload shared by Dashboard,
 * StrategyCard, the API, and the Discord image. Manual rows are always kept
 * before CSV rows consume the remaining 30-row allowance. */
export function buildLootSummary(input: BuildLootSummaryInput): LootSummary | null {
  if (input.lootItems.length === 0) return null;

  const includedCurrent = input.lootItems.filter((item) => !item.excluded);
  const hasBaseline = input.baselineTotal > 0;
  const diff = diffLootItems(hasBaseline ? input.baselineItems : [], includedCurrent);
  const gains = diff.filter((row) => row.delta > 0);
  const losses = diff.filter((row) => row.delta < 0);
  const csvPositive = gains.reduce((sum, row) => sum + row.delta, 0);
  const csvNegative = losses.reduce((sum, row) => sum + row.delta, 0);
  const includedCurrentTotal = includedCurrent.reduce((sum, item) => sum + item.total, 0);
  const csvNet = includedCurrentTotal - (hasBaseline ? input.baselineTotal : 0);
  // Old/imported sessions can have only baselineTotal or a rounded total that
  // differs from the item rows. Keep the residual explicit so reconciliation
  // remains truthful instead of silently forcing the table to add up.
  const csvAdjustment = csvNet - csvPositive - csvNegative;

  const manualRows: LootSummaryRow[] = input.manualLootItems
    .filter((item) => item.total > 0 && item.name.trim().length > 0)
    .map((item) => ({
      name: cleanText(item.name, MANUAL_LOOT_NAME_MAX),
      category: item.category,
      source: 'manual' as const,
      quantity: Math.max(1, Math.round(finite(item.quantity))),
      value: rounded(Math.max(0, item.total)),
      note: cleanText(item.note, MANUAL_LOOT_NOTE_MAX) || undefined,
    }))
    .sort((a, b) => b.value - a.value);

  const csvRows: LootSummaryRow[] = gains.map((row) => ({
    name: cleanText(row.name, MANUAL_LOOT_NAME_MAX),
    category: categorise(row.name, row.tab),
    source: 'wealthyexile' as const,
    quantity: row.currQty - row.baseQty,
    value: rounded(row.delta),
    tab: cleanText(row.tab, 40) || undefined,
  }));

  const selectedManual = manualRows.slice(0, LOOT_SUMMARY_ROW_LIMIT);
  const csvAllowance = LOOT_SUMMARY_ROW_LIMIT - selectedManual.length;
  const selectedCsv = csvRows.slice(0, csvAllowance);
  const omittedManual = manualRows.slice(selectedManual.length);
  const omittedCsv = csvRows.slice(selectedCsv.length);
  const rows = [...selectedManual, ...selectedCsv].sort((a, b) => b.value - a.value);

  const categoryMap = new Map<LootCategory, number>();
  for (const row of [...csvRows, ...manualRows]) {
    categoryMap.set(row.category, (categoryMap.get(row.category) ?? 0) + row.value);
  }
  const categories = [...categoryMap.entries()]
    .map(([category, value]) => ({ category, value: rounded(value) }))
    .sort((a, b) => b.value - a.value);

  return {
    version: LOOT_SUMMARY_VERSION,
    rowLimit: LOOT_SUMMARY_ROW_LIMIT,
    rows,
    categories,
    hasBaseline,
    csvPositive: rounded(csvPositive),
    csvNegative: rounded(csvNegative),
    csvNet: rounded(csvNet),
    csvAdjustment: rounded(csvAdjustment),
    manualTotal: rounded(manualRows.reduce((sum, row) => sum + row.value, 0)),
    gemCorrection: rounded(input.gemCorrection),
    investmentCorrection: rounded(input.investmentCorrection),
    reportedReturn: rounded(input.reportedReturn),
    omittedCsvRows: omittedCsv.length,
    omittedCsvValue: rounded(omittedCsv.reduce((sum, row) => sum + row.value, 0)),
    omittedManualRows: omittedManual.length,
    omittedManualValue: rounded(omittedManual.reduce((sum, row) => sum + row.value, 0)),
  };
}
