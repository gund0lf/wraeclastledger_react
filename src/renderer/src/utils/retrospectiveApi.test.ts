import { describe, expect, it, vi } from 'vitest';
import {
  fetchRetrospectiveBoard,
  fetchRetrospectiveCatalog,
  fetchRetrospectiveStrategy,
} from './retrospectiveApi';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('retrospective API client', () => {
  it('reads the snapshot catalog from the as-built endpoint', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ retrospectives: [] }));

    await expect(fetchRetrospectiveCatalog(fetcher, 'https://example.test'))
      .resolves.toEqual({ retrospectives: [] });
    expect(fetcher).toHaveBeenCalledWith('https://example.test/retrospectives');
  });

  it('keys board reads by encoded league key and uses only supported sorts', async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      retrospective: {},
      sort: 'div_per_map',
      total: 0,
      limit: 10,
      offset: 0,
      strategies: [],
    }));

    await fetchRetrospectiveBoard(
      'curse of the allflame/test',
      'div_per_map',
      fetcher,
      'https://example.test',
    );

    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/retrospectives/curse%20of%20the%20allflame%2Ftest/strategies?sort=div_per_map&limit=10&offset=0',
    );
  });

  it('uses the single-strategy endpoint when a frozen card is loaded', async () => {
    const strategy = { id: 'strategy-id', discord_username: 'Example', posted_at: '2026-07-01' };
    const fetcher = vi.fn(async () => jsonResponse({ retrospective: {}, strategy }));

    await expect(fetchRetrospectiveStrategy(
      'mirage',
      'strategy/id',
      fetcher,
      'https://example.test',
    )).resolves.toMatchObject({ strategy });

    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/retrospectives/mirage/strategies/strategy%2Fid',
    );
  });

  it('fails loudly when the snapshot endpoint is unavailable', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: 'nope' }, 503));
    await expect(fetchRetrospectiveCatalog(fetcher, 'https://example.test'))
      .rejects.toThrow('Server returned 503');
  });
});
