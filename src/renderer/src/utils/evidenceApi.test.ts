import { describe, expect, it, vi } from 'vitest';
import { evidencePresentation, evidenceRunDivPerHour, fetchEvidenceRuns } from './evidenceApi';
import type { Strategy } from './strategyConstants';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('evidence API client', () => {
  it('requests the current revision with a bounded page and encoded cursor', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      strategy_id: 'strategy/id',
      revision: 2,
      runs: [],
      next_cursor: null,
    }));

    await fetchEvidenceRuns(
      'strategy/id',
      'cursor/value',
      fetcher,
      'https://example.test',
      12,
    );

    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/strategies/strategy%2Fid/evidence?revision=current&limit=12&cursor=cursor%2Fvalue',
    );
  });

  it('omits the cursor on the first page and returns the server shape', async () => {
    const value = {
      strategy_id: 'strategy-id',
      revision: 1,
      runs: [{ ordinal: 1, map_count: 20 }],
      next_cursor: 'next',
    };
    const fetcher = vi.fn(async () => jsonResponse(value));

    await expect(fetchEvidenceRuns(
      'strategy-id',
      null,
      fetcher,
      'https://example.test',
    )).resolves.toEqual(value);
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/strategies/strategy-id/evidence?revision=current&limit=20',
    );
  });

  it('fails loudly when the public evidence endpoint is unavailable', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: 'nope' }, 503));
    await expect(fetchEvidenceRuns('id', null, fetcher, 'https://example.test'))
      .rejects.toThrow('Server returned 503');
  });
});

describe('evidence presentation', () => {
  it('derives each evidence run rate from that run\'s own profit, price, and time', () => {
    expect(evidenceRunDivPerHour({
      net_profit: 4_000,
      divine_price: 200,
      session_minutes: 150,
    })).toBe(8);
    expect(evidenceRunDivPerHour({
      net_profit: -1_000,
      divine_price: 200,
      session_minutes: 60,
    })).toBe(-5);
  });

  it('does not invent a per-run rate without valid authored inputs', () => {
    expect(evidenceRunDivPerHour({
      net_profit: 4_000,
      divine_price: null,
      session_minutes: 150,
    })).toBeNull();
    expect(evidenceRunDivPerHour({
      net_profit: 4_000,
      divine_price: 200,
      session_minutes: 0,
    })).toBeNull();
  });

  it('uses historical pooled aggregates and timed runs only', () => {
    const strategy = {
      evidence_run_count: 3,
      evidence_map_count: 90,
      map_count: 30,
      historical_div_per_map: 1.25,
      div_per_map: 9,
      total_invest: 900,
      net_profit: 10_000,
      divine_price: 200,
      historical_total_divines: 112.5,
      timed_run_count: 2,
      timed_session_minutes: 300,
      timed_total_divines: 20,
      session_minutes: 999,
    } as Strategy;

    expect(evidencePresentation(strategy)).toEqual({
      runCount: 3,
      mapCount: 90,
      isPooled: true,
      divPerMap: 1.25,
      costPerMap: 10,
      historicalProfitDivines: 112.5,
      divPerHour: 4,
      timedRunCount: 2,
    });
  });

  it('preserves the existing single-run fallbacks', () => {
    const strategy = {
      evidence_run_count: 1,
      map_count: 20,
      total_invest: 400,
      net_profit: 2_000,
      divine_price: 100,
      session_minutes: 120,
    } as Strategy;

    expect(evidencePresentation(strategy)).toEqual({
      runCount: 1,
      mapCount: 20,
      isPooled: false,
      divPerMap: 1,
      costPerMap: 20,
      historicalProfitDivines: 20,
      divPerHour: 10,
      timedRunCount: 0,
    });
  });

  it('never invents pooled divines or timed rates when aggregate evidence is absent', () => {
    const strategy = {
      evidence_run_count: 2,
      evidence_map_count: 40,
      net_profit: 4_000,
      divine_price: 100,
      timed_session_minutes: 0,
    } as Strategy;

    expect(evidencePresentation(strategy)).toMatchObject({
      isPooled: true,
      historicalProfitDivines: null,
      divPerHour: null,
    });
  });
});
