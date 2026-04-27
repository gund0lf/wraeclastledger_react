import { getCurrentLeague } from './league';

export const parsePriceInput = (raw: string, divinePrice: number): number => {
  let s = raw.trim().toLowerCase().replace(/,/g, '');
  if (!s) return 0;
  if (s.startsWith('.')) s = '0' + s;
  const dMatch = s.match(/^(\d+\.?\d*)\s*d$/);
  if (dMatch) return parseFloat((parseFloat(dMatch[1]) * divinePrice).toFixed(2));
  const cMatch = s.match(/^(\d+\.?\d*)\s*c?$/);
  if (cMatch) return parseFloat(parseFloat(cMatch[1]).toFixed(2));
  return 0;
};

export const formatChaos = (chaos: number, divinePrice: number): string => {
  const divs = divinePrice > 0 ? chaos / divinePrice : 0;
  return `${chaos.toFixed(1)}c (${divs.toFixed(2)}d)`;
};

/**
 * Trimmed mean: removes 1 outlier from each end when n > 4.
 */
export function trimmedMean(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length <= 4) return values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

// Sanitize exclusion terms — strips anything that looks like a full regex fragment
// rather than a bare term. This cleans up corrupted data where the whole
// '"!nsta|eche"' string ended up stored as a single element.
export function sanitizeExclusionTerms(terms: string[]): string[] {
  return terms
    .map((t) => t.trim().replace(/^"|"$/g, '').replace(/^!/, ''))
    .filter((t) => t.length > 0 && !t.includes('"') && !t.includes('(') && !t.includes('*'));
}

// ─── Regex helpers ────────────────────────────────────────────────────────────
function thresholdPat(floor: number): string {
  if (floor <= 0) return '\\d..';
  const f = Math.floor(floor);
  if (f >= 200) return '[2-9]..';
  if (f >= 100) {
    const tens = Math.floor((f % 100) / 10);
    if (tens === 0) return '\\d..'; // 100 → any 3-digit
    return `1[${tens}-9].|[2-9]..`; // e.g. 140 → 1[4-9].|[2-9]..
  }
  if (f >= 10) {
    const tens = Math.floor(f / 10);
    return tens >= 9 ? `9.|\\d..` : `[${tens}-9].|\\d..`;
  }
  return `[${f}-9]|[1-9].|\\d..`;
}

interface MapAverages {
  avgQuant: number; avgPack: number; avgCurr: number;
  avgRarity: number; avgScarabs: number;
}

export const generateRunRegex = (avg: MapAverages, exclusions?: string[]): string => {
  const parts: string[] = [];
  const cleanExcl = sanitizeExclusionTerms(exclusions ?? []);
  if (cleanExcl.length > 0) parts.push(`"!${cleanExcl.join('|')}"`);

  const packFloor = Math.max(Math.floor(avg.avgPack / 10) * 10, 20);

  if (avg.avgCurr >= 80) {
    // High-currency session: require currency AND pack as separate conditions
    const currFloor = Math.max(Math.floor(avg.avgCurr / 10) * 10, 80);
    parts.push(`"urr.*(${thresholdPat(currFloor)})%"`);
    parts.push(`"ack.*(${thresholdPat(packFloor)})%"`);
  } else {
    // Regular session: either decent currency OR decent pack is fine
    const currFloor = Math.max(Math.floor(avg.avgCurr / 10) * 10, 40);
    parts.push(`"(urr.*(${thresholdPat(currFloor)})%|ack.*(${thresholdPat(packFloor)})%)"`);
  }

  if (avg.avgQuant > 20) {
    const quantFloor = Math.max(Math.floor(avg.avgQuant * 0.6 / 10) * 10, 20);
    parts.push(`"iz.*(${thresholdPat(quantFloor)})%"`);
  }
  if (avg.avgRarity > 40) {
    const rarFloor = Math.max(Math.floor(avg.avgRarity * 0.6 / 10) * 10, 30);
    parts.push(`"m rar.*(${thresholdPat(rarFloor)})%"`);
  }
  return parts.join(' ');
};

export const generateSlamRegex = (avg: MapAverages, exclusions?: string[]): string => {
  const parts: string[] = [];
  const cleanExcl = sanitizeExclusionTerms(exclusions ?? []);
  if (cleanExcl.length > 0) parts.push(`"!${cleanExcl.join('|')}"`);
  const currFloor = Math.max(Math.floor(avg.avgCurr * 0.75 / 10) * 10, 30);
  const packFloor = Math.max(Math.floor(avg.avgPack * 0.75 / 10) * 10, 15);
  parts.push(`"(urr.*(${thresholdPat(currFloor)})%|ack.*(${thresholdPat(packFloor)})%)"`);
  return parts.join(' ');
};

// ─── Divine price fetching ────────────────────────────────────────────────────
//
// fetchDivinePrice always fetches and is short-timeout-bounded. It updates a
// module-level "last attempt" timestamp regardless of success, so the
// cooldown wrapper (tryFetchDivinePrice) can rate-limit auto-init paths
// without rate-limiting an explicit user-triggered refresh.

const DIVINE_PRICE_FETCH_TIMEOUT_MS = 5_000;
const DIVINE_PRICE_COOLDOWN_MS = 60_000;
let lastDivineFetchAttempt = 0;

export async function fetchDivinePrice(): Promise<number | null> {
  lastDivineFetchAttempt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DIVINE_PRICE_FETCH_TIMEOUT_MS);
  try {
    const league = await getCurrentLeague();
    const url = `https://poe.ninja/api/data/currencyoverview?league=${encodeURIComponent(league)}&type=Currency`;
    const res  = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data  = await res.json();
    const lines: { currencyTypeName: string; chaosEquivalent?: number }[] = data.lines ?? [];
    const divine = lines.find((l) => l.currencyTypeName === 'Divine Orb');
    return divine?.chaosEquivalent ?? null;
  } catch {
    // AbortError or network error — caller treats null as "no price".
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Cooldown-gated wrapper around fetchDivinePrice.
 *
 * Returns null without making a network call if the last attempt (success or
 * failure) was within the cooldown window. Pass `force: true` for explicit
 * user-triggered refreshes — those should never be rate-limited.
 *
 * The store's `initDivinePrice` uses this to prevent retry storms when
 * panels remount and the price keeps coming back as 0 due to an offline
 * network or a poe.ninja outage.
 */
export async function tryFetchDivinePrice(force = false): Promise<number | null> {
  if (!force) {
    const elapsed = Date.now() - lastDivineFetchAttempt;
    if (elapsed < DIVINE_PRICE_COOLDOWN_MS) return null;
  }
  return fetchDivinePrice();
}
