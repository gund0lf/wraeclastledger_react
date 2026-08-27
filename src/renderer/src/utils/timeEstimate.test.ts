/**
 * timeEstimate.test.ts — WP9 Tier 1 local pace estimate.
 * Pure function over parsedAt timestamps; no store, no React.
 */
import { describe, it, expect } from 'vitest';
import {
  automaticPaceStatus,
  computeTimeEstimate,
  formatActiveTime,
  MIN_TIMESTAMPED_MAPS,
  MIN_ACTIVE_MS,
} from './timeEstimate';

const MIN = 60_000;
/** Build maps from gap minutes: gaps [2,2,2] -> 4 maps at t=0,2,4,6 min. */
function mapsFromGaps(gapMinutes: number[], startMs = 1_000_000): { parsedAt?: number }[] {
  const out: { parsedAt?: number }[] = [{ parsedAt: startMs }];
  let t = startMs;
  for (const g of gapMinutes) { t += g * MIN; out.push({ parsedAt: t }); }
  return out;
}

describe('computeTimeEstimate', () => {
  it('returns null below the minimum sample size', () => {
    expect(computeTimeEstimate([])).toBeNull();
    expect(computeTimeEstimate(mapsFromGaps([3, 3, 3]))).toBeNull(); // 4 maps
    expect(computeTimeEstimate(mapsFromGaps([3, 3, 3, 3]))).not.toBeNull(); // 5 = MIN
    expect(MIN_TIMESTAMPED_MAPS).toBe(5);
  });

  it('ignores maps without parsedAt (pre-Tier-0 persisted maps)', () => {
    const maps = [...mapsFromGaps([3, 3, 3]), {}, { parsedAt: undefined }]; // 4 stamped
    expect(computeTimeEstimate(maps)).toBeNull();
    const enough = [...mapsFromGaps([3, 3, 3, 3]), {}, {}]; // 5 stamped + 2 blank
    const est = computeTimeEstimate(enough);
    expect(est?.timestampedMaps).toBe(5);
  });

  it('steady 3-minute maps -> 20 maps/h, active time = sum of gaps', () => {
    const est = computeTimeEstimate(mapsFromGaps([3, 3, 3, 3]));
    expect(est).not.toBeNull();
    expect(est!.mapsPerHour).toBeCloseTo(20, 5);
    expect(est!.activeMs).toBe(12 * MIN);
    expect(est!.countedGaps).toBe(4);
    expect(est!.excludedGaps).toBe(0);
  });

  it('returns null below the minimum active time (paste-burst guard)', () => {
    // 6 maps 30s apart: valid sample size, plausible gaps, but only 2.5min
    // of measured time -> extrapolating a maps/h from this is noise
    // (observed live: 5 quick pastes displayed ~12000 maps/h).
    expect(computeTimeEstimate(mapsFromGaps([0.5, 0.5, 0.5, 0.5, 0.5]))).toBeNull();
    // exactly at the floor passes
    const atFloor = computeTimeEstimate(mapsFromGaps([2.5, 2.5, 2.5, 2.5]));
    expect(atFloor?.activeMs).toBe(MIN_ACTIVE_MS);
  });

  it('excludes break-like outlier gaps (> 3x median)', () => {
    // 3,3,3,30,3 -> median 3, threshold 9 -> the 30-min break is excluded
    const est = computeTimeEstimate(mapsFromGaps([3, 3, 3, 30, 3]));
    expect(est).not.toBeNull();
    expect(est!.excludedGaps).toBe(1);
    expect(est!.countedGaps).toBe(4);
    expect(est!.activeMs).toBe(12 * MIN);
    expect(est!.mapsPerHour).toBeCloseTo(20, 5);
  });

  it('is order-independent (timestamps sorted internally)', () => {
    const maps = mapsFromGaps([3, 4, 3, 5]);
    const shuffled = [maps[3], maps[0], maps[4], maps[2], maps[1]];
    expect(computeTimeEstimate(shuffled)).toEqual(computeTimeEstimate(maps));
  });

  it('returns null for zero measurable time (bulk paste, identical stamps)', () => {
    const t = 1_000_000;
    const maps = Array(6).fill(null).map(() => ({ parsedAt: t }));
    expect(computeTimeEstimate(maps)).toBeNull();
  });

  it('zero-median burst keeps all gaps instead of excluding everything', () => {
    // 4 identical stamps then real gaps: gaps [0,0,0,10,10] -> median 0.
    // The degenerate-median branch keeps ALL gaps; estimate stays meaningful.
    const t = 1_000_000;
    const maps = [
      { parsedAt: t }, { parsedAt: t }, { parsedAt: t }, { parsedAt: t },
      { parsedAt: t + 10 * MIN }, { parsedAt: t + 20 * MIN },
    ];
    const est = computeTimeEstimate(maps);
    expect(est).not.toBeNull();
    expect(est!.excludedGaps).toBe(0);
    expect(est!.activeMs).toBe(20 * MIN);
  });
});

describe('formatActiveTime', () => {
  it('formats hours, minutes, and sub-minute values', () => {
    expect(formatActiveTime(84 * MIN)).toBe('1h 24m');
    expect(formatActiveTime(42 * MIN)).toBe('42m');
    expect(formatActiveTime(20_000)).toBe('<1m');
    expect(formatActiveTime(60 * MIN)).toBe('1h 0m');
  });
});

describe('automaticPaceStatus', () => {
  it('describes the shared ready, collecting, sampling, and estimating states', () => {
    expect(automaticPaceStatus(null, 0)).toMatchObject({ badge: 'Ready', color: 'gray' });
    expect(automaticPaceStatus(null, 3)).toMatchObject({ badge: '3/5 captures', color: 'yellow' });
    expect(automaticPaceStatus(null, 5)).toMatchObject({ badge: 'Sampling', color: 'yellow' });
    const estimate = computeTimeEstimate(mapsFromGaps([3, 3, 3, 30, 3]));
    expect(automaticPaceStatus(estimate, 6)).toEqual({
      badge: 'Estimating',
      color: 'blue',
      detail: '20.0 maps/h · 12m active · 1 break excluded',
    });
  });
});
