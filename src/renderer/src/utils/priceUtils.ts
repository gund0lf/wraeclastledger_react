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
  if (exclusions && exclusions.length > 0) parts.push(`"!${exclusions.join('|')}"`);

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
  if (exclusions && exclusions.length > 0) parts.push(`"!${exclusions.join('|')}"`);
  const currFloor = Math.max(Math.floor(avg.avgCurr * 0.75 / 10) * 10, 30);
  const packFloor = Math.max(Math.floor(avg.avgPack * 0.75 / 10) * 10, 15);
  parts.push(`"(urr.*(${thresholdPat(currFloor)})%|ack.*(${thresholdPat(packFloor)})%)"`);
  return parts.join(' ');
};

export async function fetchDivinePrice(): Promise<number | null> {
  try {
    const league = await getCurrentLeague();
    const url = `https://poe.ninja/api/data/currencyoverview?league=${encodeURIComponent(league)}&type=Currency`;
    const res  = await fetch(url);
    if (!res.ok) return null;
    const data  = await res.json();
    const lines: { currencyTypeName: string; chaosEquivalent?: number }[] = data.lines ?? [];
    const divine = lines.find((l) => l.currencyTypeName === 'Divine Orb');
    return divine?.chaosEquivalent ?? null;
  } catch { return null; }
}
