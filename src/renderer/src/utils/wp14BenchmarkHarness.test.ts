import { describe, expect, it } from 'vitest';
import {
  summarizeTimings,
  utf8Size,
} from '../../../shared/wp14Benchmark';

describe('WP14 benchmark characterization helpers', () => {
  it('reports nearest-rank P50, P95, and max timings', () => {
    const summary = summarizeTimings([10, 1, 4, 8, 2, 9, 3, 7, 5, 6]);
    expect(summary).toEqual({
      count: 10,
      p50Ms: 5,
      p95Ms: 10,
      maxMs: 10,
    });
    expect(summarizeTimings([])).toEqual({
      count: 0,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
    });
  });

  it('measures UTF-8 bytes rather than JavaScript code units', () => {
    expect(utf8Size('abc')).toBe(3);
    expect(utf8Size('a\u00e9')).toBe(3);
  });
});
