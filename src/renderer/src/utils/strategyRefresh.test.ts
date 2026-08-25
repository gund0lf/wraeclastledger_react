import { describe, expect, it } from 'vitest';
import type { Strategy } from './strategyConstants';
import {
  hasSameStrategyDetailVersion,
  mergeRefreshedStrategyPage,
} from './strategyRefresh';

const strategy = (patch: Partial<Strategy> = {}): Strategy => ({
  id: 'strategy-1',
  discord_username: 'traceuer',
  posted_at: '2026-08-25T00:00:00.000Z',
  current_revision: 2,
  evidence_generation: 4,
  updated_at: '2026-08-25T01:00:00.000Z',
  score: 1,
  ...patch,
});

describe('strategy background refresh detail retention', () => {
  it('retains raw detail while replacing fresh summary fields', () => {
    const current = strategy({ raw_export: 'full authored export', score: 1 });
    const refreshed = strategy({ score: 3 });

    expect(mergeRefreshedStrategyPage([current], [refreshed])).toEqual([
      strategy({ raw_export: 'full authored export', score: 3 }),
    ]);
  });

  it('does not retain detail after a strategy revision changes', () => {
    const current = strategy({ raw_export: 'old export' });
    const refreshed = strategy({ current_revision: 3, updated_at: '2026-08-25T02:00:00.000Z' });

    expect(hasSameStrategyDetailVersion(current, refreshed)).toBe(false);
    expect(mergeRefreshedStrategyPage([current], [refreshed])).toEqual([refreshed]);
  });

  it('does not retain detail after pooled evidence changes', () => {
    const current = strategy({ raw_export: 'old export' });
    const refreshed = strategy({ evidence_generation: 5 });

    expect(hasSameStrategyDetailVersion(current, refreshed)).toBe(false);
    expect(mergeRefreshedStrategyPage([current], [refreshed])).toEqual([refreshed]);
  });

  it('keeps server-supplied detail authoritative', () => {
    const current = strategy({ raw_export: 'old export' });
    const refreshed = strategy({ raw_export: 'new export', score: 2 });

    expect(mergeRefreshedStrategyPage([current], [refreshed])).toEqual([refreshed]);
  });
});
