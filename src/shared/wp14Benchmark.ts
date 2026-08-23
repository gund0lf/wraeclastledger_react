export const WP14_BENCHMARK_REPORT_NAME = 'wp14-benchmark-report.json';
export const WP14_BENCHMARK_SCHEMA_VERSION = 2;

// Phase 0's measured 100-session envelope was 9,778,864 UTF-8 bytes.
// Exports are user-initiated and may include metadata beyond that envelope, so
// the recommended ceiling is an explicit 2x evidence-derived allowance. The
// Phase 2B binding must pass this value (or another documented policy) rather
// than inheriting a hidden adapter default.
export const WP14_PHASE0_MANY_SESSION_ENVELOPE_BYTES = 9_778_864;
export const WP14_RECOMMENDED_MAX_EXPORT_DOCUMENT_BYTES =
  WP14_PHASE0_MANY_SESSION_ENVELOPE_BYTES * 2;

export const WP14_BENCHMARK_COUNTS = {
  bootstrapWarmups: 5,
  bootstrapIterations: 30,
  saveWarmups: 5,
  saveIterations: 30,
  rendererValidationWarmups: 5,
  rendererValidationIterations: 30,
} as const;

export const WP14_BENCHMARK_TARGETS = {
  bootstrapP95Ms: 500,
  rendererValidationMaxMs: 50,
  tenMiBSaveAckP95Ms: 500,
} as const;

export interface Wp14TimingSummary {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

const round = (value: number): number => Math.round(value * 1000) / 1000;

export function summarizeTimings(values: readonly number[]): Wp14TimingSummary {
  if (values.length === 0) {
    return { count: 0, p50Ms: null, p95Ms: null, maxMs: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const percentile = (fraction: number): number => {
    const index = Math.max(0, Math.ceil(sorted.length * fraction) - 1);
    return round(sorted[index]);
  };
  return {
    count: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: round(sorted[sorted.length - 1]),
  };
}

export function utf8Size(value: string): number {
  return new TextEncoder().encode(value).length;
}
