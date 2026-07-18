import { STRATEGY_API_URL, type Strategy } from './strategyConstants';

export interface RetrospectiveSnapshot {
  league_key: string;
  league_name: string;
  cutoff_utc: string;
  frozen_at: string;
  strategy_count: number;
}

export interface RetrospectiveCatalogResponse {
  retrospectives: RetrospectiveSnapshot[];
}

export type RetrospectiveBoardSort = 'score' | 'div_per_map';

export interface RetrospectiveBoardResponse {
  retrospective: Omit<RetrospectiveSnapshot, 'strategy_count'>;
  sort: RetrospectiveBoardSort;
  total: number;
  limit: number;
  offset: number;
  strategies: Strategy[];
}

export interface RetrospectiveDetailResponse {
  retrospective: Omit<RetrospectiveSnapshot, 'strategy_count'>;
  strategy: Strategy;
}

type Fetcher = typeof fetch;

async function fetchJson<T>(url: string, fetcher: Fetcher): Promise<T> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function fetchRetrospectiveCatalog(
  fetcher: Fetcher = fetch,
  apiUrl = STRATEGY_API_URL,
): Promise<RetrospectiveCatalogResponse> {
  return fetchJson(`${apiUrl}/retrospectives`, fetcher);
}

export function fetchRetrospectiveBoard(
  leagueKey: string,
  sort: RetrospectiveBoardSort,
  fetcher: Fetcher = fetch,
  apiUrl = STRATEGY_API_URL,
  limit = 10,
): Promise<RetrospectiveBoardResponse> {
  const params = new URLSearchParams({
    sort,
    limit: String(limit),
    offset: '0',
  });
  return fetchJson(
    `${apiUrl}/retrospectives/${encodeURIComponent(leagueKey)}/strategies?${params}`,
    fetcher,
  );
}

export function fetchRetrospectiveStrategy(
  leagueKey: string,
  strategyId: string,
  fetcher: Fetcher = fetch,
  apiUrl = STRATEGY_API_URL,
): Promise<RetrospectiveDetailResponse> {
  return fetchJson(
    `${apiUrl}/retrospectives/${encodeURIComponent(leagueKey)}/strategies/${encodeURIComponent(strategyId)}`,
    fetcher,
  );
}
