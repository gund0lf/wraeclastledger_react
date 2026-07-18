export const WP14_BENCHMARK_ENV = 'WL_WP14_BENCH';
export const WP14_BENCHMARK_REPORT_NAME = 'wp14-benchmark-report.json';
export const WP14_BENCHMARK_SCHEMA_VERSION = 1;
export const WP14_BENCHMARK_TARGET_BYTES = 194 * 1024;

export const WP14_BENCHMARK_COUNTS = {
  bootstrapWarmups: 5,
  bootstrapIterations: 30,
  saveWarmups: 5,
  saveIterations: 30,
  typingWarmups: 1,
  typingIterations: 10,
} as const;

export const WP14_BENCHMARK_TARGETS = {
  bootstrapP95Ms: 500,
  rendererLongTaskMaxMs: 50,
  tenMiBSaveAckP95Ms: 500,
} as const;

export const WP14_SESSION_PAYLOAD_KEYS = [
  'maps',
  'lootItems',
  'baselineItems',
  'baselineTotal',
  'settings',
  'sessionNotes',
  'investmentNeutralization',
  'investmentDismissed',
  'loadedStrategyInfo',
] as const;

export type Wp14SessionPayloadKey = (typeof WP14_SESSION_PAYLOAD_KEYS)[number];
export type Wp14SaveTier = 'A' | 'B';

export interface Wp14TimingSummary {
  count: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
}

export interface Wp14LongTask {
  phase: string;
  durationMs: number;
  startTimeMs: number;
  source: 'benchmark-renderer' | 'hydrate-frame';
}

export interface Wp14HydrateResult {
  type: 'wp14-hydrate-result';
  nonce: string;
  durationMs: number;
  savedSessionCount: number;
  activeMapCount: number;
  longTaskObserverSupported: boolean;
  longTasks: Wp14LongTask[];
}

export interface Wp14SaveAcknowledgement {
  caseId: string;
  revision: number;
  mode: 'full' | 'slice';
  finalRawBytes: number;
  gzipBytes: number;
  sha256: string;
  fsync: {
    attempted: true;
    succeeded: boolean;
    error: string | null;
  };
  mainTimings: {
    parseAndMergeMs: number;
    stringifyMs: number;
    gzipMs: number;
    writeFsyncRenameMs: number;
    totalMs: number;
  };
}

export interface Wp14BenchmarkApi {
  readFixture(fileName: string): Promise<string>;
  setSaveBaseline(caseId: string, revision: number, payloadJson: string): Promise<void>;
  save(serializedRequest: string): Promise<Wp14SaveAcknowledgement>;
  finish(rendererResults: Record<string, unknown>): Promise<void>;
  fail(message: string): Promise<void>;
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

export function extractWp14SessionPayload(
  state: Record<string, unknown>,
): Record<Wp14SessionPayloadKey, unknown> {
  return Object.fromEntries(
    WP14_SESSION_PAYLOAD_KEYS.map((key) => [key, state[key]]),
  ) as Record<Wp14SessionPayloadKey, unknown>;
}

export interface DerivedCatalogFixture {
  content: string;
  sessionCount: number;
  codeUnits: number;
  quotaSafetyRatio: number;
}

export function deriveCatalogFixtureWithinQuota(
  manySessionEnvelope: string,
  measuredQuotaCodeUnits: number,
  quotaSafetyRatio = 0.8,
): DerivedCatalogFixture {
  const parsed = JSON.parse(manySessionEnvelope) as {
    state: Record<string, unknown> & { savedSessions?: Record<string, unknown> };
    version: number;
  };
  const entries = Object.entries(parsed.state.savedSessions ?? {});
  const safeLimit = Math.floor(measuredQuotaCodeUnits * quotaSafetyRatio);
  const contentForCount = (count: number): string =>
    JSON.stringify({
      ...parsed,
      state: {
        ...parsed.state,
        savedSessions: Object.fromEntries(entries.slice(0, count)),
      },
    });

  let lower = 0;
  let upper = entries.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (contentForCount(middle).length <= safeLimit) lower = middle;
    else upper = middle - 1;
  }

  const content = contentForCount(lower);
  return {
    content,
    sessionCount: lower,
    codeUnits: content.length,
    quotaSafetyRatio,
  };
}

export function deriveMapPrefixPayload(
  state: Record<string, unknown>,
  targetBytes = WP14_BENCHMARK_TARGET_BYTES,
): Record<Wp14SessionPayloadKey, unknown> {
  const payload = extractWp14SessionPayload(state);
  const maps = Array.isArray(payload.maps) ? payload.maps : [];
  const withMapCount = (count: number): Record<Wp14SessionPayloadKey, unknown> => ({
    ...payload,
    maps: maps.slice(0, count),
  });

  let lower = 0;
  let upper = maps.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (utf8Size(JSON.stringify(withMapCount(middle))) < targetBytes) lower = middle;
    else upper = middle - 1;
  }

  const candidate = withMapCount(lower);
  if (utf8Size(JSON.stringify(candidate)) < targetBytes && lower < maps.length) {
    return withMapCount(lower + 1);
  }
  return candidate;
}
