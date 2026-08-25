import { STRATEGY_API_URL, type Strategy } from './strategyConstants';
import type { LootSummary } from './lootSummary';

export interface EvidenceCostBreakdown {
  chisel: { name: string; priceEach: number } | null;
  scarabs: { name: string; priceEach: number }[];
  delirium: { type: string; countPerMap: number; priceEach: number } | null;
  astrolabe: { type: string; count: number; priceEach: number } | null;
}

export interface PublicEvidenceRun {
  ordinal: number;
  run_started_at: string | null;
  run_ended_at: string | null;
  submitted_at: string;
  map_count: number;
  avg_quant: number | null;
  avg_rarity: number | null;
  avg_pack: number | null;
  avg_currency: number | null;
  observed_mod_average: number | null;
  observed_mod_sample_size: number | null;
  multiplier: number | null;
  per_map_cost: number | null;
  total_invest: number | null;
  net_profit: number | null;
  div_per_map: number | null;
  divine_price: number | null;
  session_minutes: number | null;
  cost_breakdown: EvidenceCostBreakdown;
  game_data_revision: number | null;
  game_data_patch_version: string | null;
  loot_summary: LootSummary | null;
}

export interface EvidenceRunsResponse {
  strategy_id: string;
  revision: number;
  runs: PublicEvidenceRun[];
  next_cursor: string | null;
}

type Fetcher = typeof fetch;

export interface EvidencePresentation {
  runCount: number;
  mapCount: number | null;
  isPooled: boolean;
  divPerMap: number | null;
  profitPerMapChaos: number | null;
  costPerMap: number | null;
  costPerMapDivines: number | null;
  totalInvestDivines: number | null;
  historicalProfitDivines: number | null;
  divPerHour: number | null;
  timedRunCount: number;
}

export function evidenceRunDivPerHour(
  run: Pick<PublicEvidenceRun, 'net_profit' | 'divine_price' | 'session_minutes'>,
): number | null {
  if (
    run.net_profit == null
    || !Number.isFinite(run.net_profit)
    || run.divine_price == null
    || !Number.isFinite(run.divine_price)
    || run.divine_price <= 0
    || run.session_minutes == null
    || !Number.isFinite(run.session_minutes)
    || run.session_minutes <= 0
  ) return null;
  return (run.net_profit / run.divine_price) / (run.session_minutes / 60);
}

/**
 * The single client-side presentation rule for strategy evidence aggregates.
 * The server owns pooling; this helper only selects the already-materialized
 * historical values and preserves the legacy single-run display semantics.
 */
export function evidencePresentation(strategy: Strategy): EvidencePresentation {
  const runCount = strategy.evidence_run_count ?? 0;
  const mapCount = strategy.evidence_map_count ?? strategy.map_count ?? null;
  const isPooled = runCount > 1;
  const divPerMap = strategy.historical_div_per_map ?? strategy.div_per_map ?? (
    strategy.net_profit != null
      && strategy.divine_price != null
      && strategy.divine_price > 0
      && mapCount != null
      && mapCount > 0
      ? strategy.net_profit / strategy.divine_price / mapCount
      : null
  );
  const costPerMap = strategy.total_invest != null && mapCount != null && mapCount > 0
    ? strategy.total_invest / mapCount
    : strategy.per_map_cost ?? null;
  const profitPerMapChaos = strategy.net_profit != null && mapCount != null && mapCount > 0
    ? strategy.net_profit / mapCount
    : null;
  // A pooled strategy contains several authored divine-price snapshots. The
  // server exposes historical profit divines, but not historical investment
  // divines, so applying one run's price to the aggregate would be dishonest.
  const totalInvestDivines = !isPooled
    && strategy.total_invest != null
    && strategy.divine_price != null
    && strategy.divine_price > 0
    ? strategy.total_invest / strategy.divine_price
    : null;
  const costPerMapDivines = !isPooled
    && costPerMap != null
    && strategy.divine_price != null
    && strategy.divine_price > 0
    ? costPerMap / strategy.divine_price
    : null;
  const historicalProfitDivines = isPooled
    ? strategy.historical_total_divines ?? null
    : strategy.net_profit != null && strategy.divine_price != null && strategy.divine_price > 0
      ? strategy.net_profit / strategy.divine_price
      : null;
  const divPerHour = isPooled
    ? strategy.timed_session_minutes != null
      && strategy.timed_session_minutes > 0
      && strategy.timed_total_divines != null
      ? strategy.timed_total_divines / (strategy.timed_session_minutes / 60)
      : null
    : strategy.session_minutes != null
      && strategy.session_minutes > 0
      && divPerMap != null
      && mapCount != null
      && mapCount > 0
      ? (divPerMap * mapCount) / (strategy.session_minutes / 60)
      : null;

  return {
    runCount,
    mapCount,
    isPooled,
    divPerMap,
    profitPerMapChaos,
    costPerMap,
    costPerMapDivines,
    totalInvestDivines,
    historicalProfitDivines,
    divPerHour,
    timedRunCount: strategy.timed_run_count ?? 0,
  };
}

export async function fetchEvidenceRuns(
  strategyId: string,
  cursor: string | null = null,
  fetcher: Fetcher = fetch,
  apiUrl = STRATEGY_API_URL,
  limit = 20,
): Promise<EvidenceRunsResponse> {
  const params = new URLSearchParams({
    revision: 'current',
    limit: String(limit),
  });
  if (cursor) params.set('cursor', cursor);
  const response = await fetcher(
    `${apiUrl}/strategies/${encodeURIComponent(strategyId)}/evidence?${params}`,
  );
  if (!response.ok) throw new Error(`Server returned ${response.status}`);
  return response.json() as Promise<EvidenceRunsResponse>;
}
