/**
 * WP9 Tier 1 — local time estimates from map parse timestamps.
 *
 * Stance (IMPROVEMENT_PLAN 0.2, locked): time metrics are strictly optional,
 * derived, and never load-bearing. div/MAP stays the primary comparison unit.
 * This module computes a LOCAL estimate only — it is never shared, never
 * persisted, and never feeds any other metric.
 *
 * Method: sort the parsedAt timestamps, take inter-map gaps, drop outlier
 * gaps (> OUTLIER_GAP_FACTOR x the median gap = breaks/AFK/town time), sum
 * the rest as "active time". maps/hour = counted gaps per active hour (each
 * counted gap represents one completed map). Requires MIN_TIMESTAMPED_MAPS
 * timestamped maps before it produces anything at all.
 *
 * Old persisted maps lack parsedAt (Tier 0 was additive) — they are simply
 * ignored, so mixed sessions degrade gracefully.
 */
import { MapData } from '../types';

export const MIN_TIMESTAMPED_MAPS = 5;
export const OUTLIER_GAP_FACTOR = 3;
/** Below this much measured active time, any rate extrapolation is noise
 *  (a paste-burst of 5 maps in 20s would otherwise show ~12000 maps/h —
 *  observed live 2026-07-06). No estimate is better than an absurd one. */
export const MIN_ACTIVE_MS = 10 * 60_000;

export interface TimeEstimate {
  /** Sum of counted (non-outlier) gaps, in ms. */
  activeMs: number;
  /** Counted maps per active hour. */
  mapsPerHour: number;
  /** How many maps carried a usable parsedAt. */
  timestampedMaps: number;
  /** Gaps included in the estimate. */
  countedGaps: number;
  /** Break-like gaps excluded (> factor x median). */
  excludedGaps: number;
}

/**
 * Returns null when there is not enough data for a meaningful estimate:
 * fewer than MIN_TIMESTAMPED_MAPS timestamped maps, or less than
 * MIN_ACTIVE_MS of measurable active time (bulk pastes, identical stamps).
 */
export function computeTimeEstimate(
  maps: ReadonlyArray<Pick<MapData, 'parsedAt'>>
): TimeEstimate | null {
  const ts = maps
    .map((m) => m.parsedAt)
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
    .sort((a, b) => a - b);
  if (ts.length < MIN_TIMESTAMPED_MAPS) return null;

  const gaps: number[] = [];
  for (let i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]);

  const sorted = [...gaps].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 1
    ? sorted[(n - 1) / 2]
    : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;

  // Degenerate median (paste bursts) would exclude every real gap — keep all
  // instead; the MIN_ACTIVE_MS guard below still rejects burst-only sessions.
  const counted = median > 0
    ? gaps.filter((g) => g <= median * OUTLIER_GAP_FACTOR)
    : gaps;
  const excludedGaps = gaps.length - counted.length;

  const activeMs = counted.reduce((a, b) => a + b, 0);
  if (activeMs < MIN_ACTIVE_MS) return null;

  return {
    activeMs,
    mapsPerHour: counted.length / (activeMs / 3_600_000),
    timestampedMaps: ts.length,
    countedGaps: counted.length,
    excludedGaps,
  };
}

/** 5025000ms -> "1h 24m"; sub-hour -> "42m"; sub-minute -> "<1m". */
export function formatActiveTime(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  if (totalMin < 1) return '<1m';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
