import { describe, expect, it } from 'vitest';
import {
  deriveCatalogFixtureWithinQuota,
  deriveMapPrefixPayload,
  extractWp14SessionPayload,
  summarizeTimings,
  utf8Size,
} from '../../../shared/wp14Benchmark';

const payloadState = (): Record<string, unknown> => ({
  maps: Array.from({ length: 10 }, (_, index) => ({
    id: `map-${index}`,
    rawText: 'x'.repeat(100),
  })),
  lootItems: [],
  baselineItems: [],
  baselineTotal: 0,
  settings: {},
  sessionNotes: '',
  investmentNeutralization: 0,
  investmentDismissed: false,
  loadedStrategyInfo: null,
  savedSessions: { ignored: true },
});

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

  it('extracts only current session-payload fields', () => {
    const payload = extractWp14SessionPayload(payloadState());
    expect(payload).toHaveProperty('maps');
    expect(payload).toHaveProperty('settings');
    expect(payload).not.toHaveProperty('savedSessions');
  });

  it('derives the largest deterministic catalogue within the safe quota ratio', () => {
    const sessions = Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [
        `session-${index}`,
        { id: `session-${index}`, notes: 'x'.repeat(100) },
      ]),
    );
    const content = JSON.stringify({
      state: { ...payloadState(), savedSessions: sessions },
      version: 17,
    });
    const derived = deriveCatalogFixtureWithinQuota(content, 2500, 0.8);
    const parsed = JSON.parse(derived.content) as {
      state: { savedSessions: Record<string, unknown> };
    };
    expect(derived.codeUnits).toBeLessThanOrEqual(2000);
    expect(Object.keys(parsed.state.savedSessions)).toHaveLength(derived.sessionCount);

    const oneMore = {
      ...parsed,
      state: {
        ...parsed.state,
        savedSessions: Object.fromEntries(Object.entries(sessions).slice(0, derived.sessionCount + 1)),
      },
    };
    if (derived.sessionCount < 10) expect(JSON.stringify(oneMore).length).toBeGreaterThan(2000);
  });

  it('derives the first map prefix that reaches the requested byte class', () => {
    const state = payloadState();
    const emptySize = utf8Size(JSON.stringify({ ...extractWp14SessionPayload(state), maps: [] }));
    const target = emptySize + 250;
    const payload = deriveMapPrefixPayload(state, target);
    const payloadBytes = utf8Size(JSON.stringify(payload));
    expect(payloadBytes).toBeGreaterThanOrEqual(target);
    expect((payload.maps as unknown[]).length).toBeGreaterThan(0);

    const previous = {
      ...payload,
      maps: (payload.maps as unknown[]).slice(0, -1),
    };
    expect(utf8Size(JSON.stringify(previous))).toBeLessThan(target);
  });
});
