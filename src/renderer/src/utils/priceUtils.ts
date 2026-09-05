import { getCurrentLeague } from './league';
import { MOD_TOKENS } from './modTokens';
import { exactIntegerThresholdPattern } from './regexThreshold';
import {
  brickExclusionMarker,
  compileBrickExclusionPattern,
  compileBrickInclusionPattern,
  normalizeBrickExclusionEntries,
} from '../../../shared/brickMods';

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
  const legacyReflectTerms = new Set<string>([
    MOD_TOKENS.reflect_physical_damage,
    MOD_TOKENS.reflect_elemental_damage,
    MOD_TOKENS.uber_reflect_20_physical_elemental,
  ]);
  const sanitized = terms
    .map((t) => t.trim().replace(/^"|"$/g, '').replace(/^!/, ''))
    .map((t) => legacyReflectTerms.has(t) ? MOD_TOKENS.thorns_reflection : t)
    .filter((t) => t.length > 0 && !t.includes('"') && !t.includes('(') && !t.includes('*'));
  return [...new Set(sanitized)];
}

/** Exact body of the stash negative-look block after semantic leaf compilation. */
export function buildExclusionRegexPattern(exclusions: readonly string[]): string {
  return compileBrickExclusionPattern(sanitizeExclusionTerms([...exclusions]));
}

export function buildExclusionRegexBlock(exclusions: readonly string[]): string {
  const pattern = buildExclusionRegexPattern(exclusions);
  return pattern ? `"!${pattern}"` : '';
}

/** Positive stash requirement: one selected modifier is a required term; two
 * or more are one OR clause so any selected target can satisfy the search. */
export function buildInclusionRegexBlock(inclusions: readonly string[]): string {
  const pattern = compileBrickInclusionPattern(sanitizeExclusionTerms([...inclusions]));
  if (!pattern) return '';
  return pattern.includes('|') ? `"(${pattern})"` : `"${pattern}"`;
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

export const generateRunRegex = (
  avg: MapAverages,
  exclusions: string[] = [],
  inclusions: string[] = [],
): string => {
  const parts: string[] = [];
  const exclusionBlock = buildExclusionRegexBlock(exclusions);
  if (exclusionBlock) parts.push(exclusionBlock);
  const inclusionBlock = buildInclusionRegexBlock(inclusions);
  if (inclusionBlock) parts.push(inclusionBlock);

  const packFloor = Math.max(Math.floor(avg.avgPack / 10) * 10, 20);

  if (avg.avgCurr >= 80) {
    // High-currency session: require currency AND pack as separate conditions
    const currFloor = Math.max(Math.floor(avg.avgCurr / 10) * 10, 80);
    parts.push(`"urr.*(${thresholdPat(currFloor)})%"`);
    parts.push(`"ack.*(${thresholdPat(packFloor)})%"`);
  } else if (avg.avgCurr > 0) {
    // Regular session: either decent currency OR decent pack is fine
    const currFloor = Math.max(Math.floor(avg.avgCurr / 10) * 10, 40);
    parts.push(`"(urr.*(${thresholdPat(currFloor)})%|ack.*(${thresholdPat(packFloor)})%)"`);
  } else {
    // Currency explicitly zeroed — pack only
    parts.push(`"ack.*(${thresholdPat(packFloor)})%"`);
  }

  if (avg.avgQuant > 20) {
    const quantFloor = Math.max(Math.floor(avg.avgQuant * 0.6 / 10) * 10, 20);
    // `m q` targets Item Quantity. Keep it distinct from the `ack` Pack Size
    // anchor: the previous `iz` anchor also matched Pack Size and therefore
    // turned the quantity gate into a second, stricter pack-size gate.
    parts.push(`"m q.*(${thresholdPat(quantFloor)})%"`);
  }
  if (avg.avgRarity > 40) {
    const rarFloor = Math.max(Math.floor(avg.avgRarity * 0.6 / 10) * 10, 30);
    parts.push(`"m rar.*(${thresholdPat(rarFloor)})%"`);
  }
  if (avg.avgScarabs > 0) {
    const scarabFloor = Math.max(Math.floor(avg.avgScarabs * 0.6 / 10) * 10, 20);
    parts.push(`"scarabs.*(${thresholdPat(scarabFloor)})%"`);
  }
  return parts.join(' ');
};

export interface TradeRegexBrick {
  id: string;
  regexTerm: string;
}

/**
 * The modal selection is authoritative for catalogue bricks. Preserve only
 * genuinely custom session terms so deselecting a known brick in the modal
 * cannot be undone by stale session settings.
 */
export function resolveTradeRegexExclusions(
  selectedBrickIds: readonly string[],
  bricks: readonly TradeRegexBrick[],
  sessionExclusions: readonly string[],
): string[] {
  const availableIds = new Set(bricks.map((brick) => brick.id));
  const { customTerms } = normalizeBrickExclusionEntries(
    sanitizeExclusionTerms([...sessionExclusions]),
  );
  return [
    ...customTerms,
    ...selectedBrickIds
      .filter((id) => availableIds.has(id))
      .map(brickExclusionMarker),
  ];
}

/** Generate the modal's approximate stash regex from its live controls. */
export function generateTradeRegex(
  exclusions: string[],
  inclusions: string[],
  minIIQ: number,
  minPack: number,
  minCurr: number,
  minIIR: number,
  deliriousPercent = -1,
  deliriumRewardTerms: readonly string[] = [],
  minScarabs = 0,
  minMaps = 0,
): string {
  const numericParts: string[] = [];
  const exclusionBlock = buildExclusionRegexBlock(exclusions);
  if (exclusionBlock) numericParts.push(exclusionBlock);
  const inclusionBlock = buildInclusionRegexBlock(inclusions);
  if (inclusionBlock) numericParts.push(inclusionBlock);
  // These controls are labelled Min, so their values are literal floors.
  // Do not route them through generateRunRegex: that function deliberately
  // derives lenient thresholds from session averages (including a 60% IIQ/IIR
  // factor and a default Pack gate), which changes the user's Trade inputs.
  if (minCurr > 0) numericParts.push(`"urr.*(${exactIntegerThresholdPattern(minCurr)})%"`);
  if (minPack > 0) numericParts.push(`"ack.*(${exactIntegerThresholdPattern(minPack)})%"`);
  if (minIIQ > 0) numericParts.push(`"m q.*(${exactIntegerThresholdPattern(minIIQ)})%"`);
  if (minIIR > 0) numericParts.push(`"m rar.*(${exactIntegerThresholdPattern(minIIR)})%"`);
  if (minScarabs > 0) numericParts.push(`"scarabs.*(${exactIntegerThresholdPattern(minScarabs)})%"`);
  if (minMaps > 0) numericParts.push(`"maps.*(${exactIntegerThresholdPattern(minMaps)})%"`);
  const numericRegex = numericParts.join(' ');
  const deliriumRegex = deliriousPercent === 0
    ? '"!delirious"'
    : deliriousPercent > 0
      ? `"${deliriousPercent}%.+delirious"`
      : '';
  const rewardTerms = [...new Set(deliriumRewardTerms
    .map((term) => term.trim().toLocaleLowerCase('en-US'))
    .filter((term) => /^[a-z0-9 ]+$/.test(term)))];
  const rewardRegex = rewardTerms.length === 0
    ? ''
    : rewardTerms.length === 1
      ? `": ${rewardTerms[0]}"`
      : `": (${rewardTerms.join('|')})"`;
  return [numericRegex, deliriumRegex, rewardRegex].filter(Boolean).join(' ');
}

export const generateSlamRegex = (
  avg: MapAverages,
  exclusions: string[] = [],
  inclusions: string[] = [],
): string => {
  const parts: string[] = [];
  const exclusionBlock = buildExclusionRegexBlock(exclusions);
  if (exclusionBlock) parts.push(exclusionBlock);
  const inclusionBlock = buildInclusionRegexBlock(inclusions);
  if (inclusionBlock) parts.push(inclusionBlock);
  const packFloor = Math.max(Math.floor(avg.avgPack * 0.75 / 10) * 10, 15);
  const packTerm = `ack.*(${thresholdPat(packFloor)})%`;
  if (avg.avgCurr > 0) {
    const currFloor = Math.max(Math.floor(avg.avgCurr * 0.75 / 10) * 10, 30);
    parts.push(`"(urr.*(${thresholdPat(currFloor)})%|${packTerm})"`);
  } else {
    parts.push(`"${packTerm}"`);
  }
  return parts.join(' ');
};

// ─── Divine price fetching ────────────────────────────────────────────────────
//
// fetchDivinePrice always fetches and is short-timeout-bounded. The cooldown
// wrapper remembers the result of the latest attempt for that league. A fresh
// session can therefore reuse a quote fetched moments ago instead of being
// stranded at 0c, while a failed attempt still remains a real failure.

const DIVINE_PRICE_COOLDOWN_MS = 60_000;
export interface DivinePriceRequest {
  readonly league: string;
  readonly result: Promise<number | null>;
  /** Recheck at application time, even if the result has already resolved. */
  isCurrent: () => boolean;
}

interface DivinePriceAttempt {
  attemptedAt: number;
  pending: boolean;
  request: DivinePriceRequest;
}

const divinePriceAttempts = new Map<string, DivinePriceAttempt>();

/** The caller supplies its captured league; an attempt's identity owns that cache entry. */
export function requestDivinePrice(league: string, force = false): DivinePriceRequest {
  const previous = divinePriceAttempts.get(league);
  if (!force && previous && (
    previous.pending || Date.now() - previous.attemptedAt < DIVINE_PRICE_COOLDOWN_MS
  )) return previous.request;

  const attempt: DivinePriceAttempt = {
    attemptedAt: Date.now(),
    pending: true,
    request: {
      league,
      isCurrent: () => divinePriceAttempts.get(league) === attempt,
      // Defer the transport until this attempt owns the entry. Pending callers
      // share this promise, including a failure; force creates a new owner.
      result: Promise.resolve().then(async () => {
        try {
          const res = await window.api?.fetchCurrencyOverview(league);
          if (!attempt.request.isCurrent()) return null;
          const divine = res?.lines?.find((line) => line.id === 'divine');
          const price = Number(divine?.primaryValue);
          return Number.isFinite(price) && price > 0 ? price : null;
        } catch {
          return null;
        } finally {
          attempt.pending = false;
        }
      }),
    },
  };
  divinePriceAttempts.set(league, attempt);
  return attempt.request;
}

export async function fetchDivinePrice(): Promise<number | null> {
  try {
    const request = requestDivinePrice(await getCurrentLeague(), true);
    const price = await request.result;
    return request.isCurrent() ? price : null;
  } catch {
    return null;
  }
}

/**
 * Cooldown-gated access to the shared per-league request cache.
 *
 * Reuses the latest result without making a network call when an attempt for
 * the same league is still inside the cooldown window. A successful result is
 * safe to seed another fresh session; a failed result stays null. Pass
 * `force: true` for explicit user-triggered refreshes — those should never be
 * rate-limited. Each league reuses only its own pending attempt or recent result.
 *
 * The store uses requestDivinePrice directly with its captured league and
 * rechecks ownership before applying the result. Both paths share this cooldown
 * to prevent retry storms during an offline network or poe.ninja outage.
 */
export async function tryFetchDivinePrice(force = false): Promise<number | null> {
  try {
    const league = await getCurrentLeague();
    const request = requestDivinePrice(league, force);
    const price = await request.result;
    return request.isCurrent() ? price : null;
  } catch {
    return null;
  }
}
