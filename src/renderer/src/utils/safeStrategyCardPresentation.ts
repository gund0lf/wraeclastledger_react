import type { SafeDetail, SafeRun } from '../../../shared/safeStrategy'
import { divineEquivalent, formatChaosValue, formatDivineValue } from './currencyDisplay'
import { computePublishedSetupCostBreakdown } from './strategySetupCosts'
import { recordedProfitPerMap } from './strategyCardMetrics'
import { chiselItemName } from './itemIcons'
import { aggregateEvidenceSetupCosts } from './evidenceCosts'

export function publishedChiselName(name: string | null | undefined): string | null {
  if (!name || name.toLowerCase() === 'none') return null
  return /chisel/i.test(name) ? name : chiselItemName(name) ?? name
}

export const recordedCount = (value: number | null, noun: string) =>
  value === null ? `${noun} count unrecorded` : `${value.toLocaleString('en-US')} ${noun}${value === 1 ? '' : 's'}`

/** List totals are already historical server values, never a pooled conversion. */
export function listDivineTotal(value: number | null, signed = false): string | null {
  return value === null ? null : `${signed && value >= 0 ? '+' : ''}${value.toFixed(1)}d`
}
export function groupLabel(group: boolean | null, size: number | null): string | null {
  return group === true || (size !== null && size > 1) ? size !== null && size > 1 ? `Group · ${size} players` : 'Group' : null
}

export function compactChaos(value: number | null, signed = false): string {
  if (value === null) return '—'
  if (Math.abs(value) < 1000) return formatChaosValue(value, signed, 1)
  return `${signed && value >= 0 ? '+' : ''}${(value / 1000).toFixed(1)}kc`
}

export function singleRunQuote(d: SafeDetail): number | null {
  const history = d.authored_history
  return d.coverage.run_count === 1 && d.coverage.map_count !== null &&
    history?.observed.map_count === d.coverage.map_count && d.observed.map_count === d.coverage.map_count &&
    history.economics.divine_price_chaos !== null && history.economics.divine_price_chaos > 0
    ? history.economics.divine_price_chaos : null
}

export function detailMoney(d: SafeDetail) {
  const e = d.economics, quote = singleRunQuote(d)
  const netDivines = e.historical_net_divines ?? divineEquivalent(e.net_profit_chaos, quote)
  const investDivines = e.historical_invest_divines ?? divineEquivalent(e.total_invest_chaos, quote)
  return {
    quote,
    net: formatChaosValue(e.net_profit_chaos, true, 1),
    netSecondary: netDivines === null ? null : formatDivineValue(netDivines, true),
    invest: formatChaosValue(e.total_invest_chaos, false, 1),
    investSecondary: investDivines === null ? null : formatDivineValue(investDivines),
    perMap: e.net_per_map_divines === null ? 'Unrecorded' : formatDivineValue(e.net_per_map_divines, true),
    perMapChaos: formatChaosValue(recordedProfitPerMap(e.net_profit_chaos, d.coverage.map_count), true, 1),
    cost: formatChaosValue(e.all_in_cost_per_map_chaos, false, 1),
    costSecondary: divineEquivalent(e.all_in_cost_per_map_chaos, quote),
  }
}

/** Complete itemized authored prices, calculated by the existing cost authority. */
export function recordedCostBreakdown(costs: SafeRun['cost_breakdown'], setup: SafeRun['setup'], maps: number | null, allIn: number | null) {
  if (!costs || maps === null || maps <= 0 || allIn === null || allIn < 0 ||
    costs.scarabs.length !== setup.scarabs.length || costs.scarabs.some((s, i) => s.price_each_chaos === null || s.price_each_chaos < 0 || s.name !== setup.scarabs[i]) ||
    (setup.chisel && setup.chisel.toLowerCase() !== 'none' && (!costs.chisel || costs.chisel.price_each_chaos === null)) ||
    (costs.chisel && (costs.chisel.price_each_chaos === null || costs.chisel.price_each_chaos < 0)) ||
    (costs.delirium && costs.delirium.price_each_chaos < 0) || (costs.astrolabe && costs.astrolabe.price_each_chaos < 0) ||
    (setup.delirium?.type && !costs.delirium) || (setup.astrolabe && !costs.astrolabe)) return null
  return computePublishedSetupCostBreakdown({
    mapCount: maps, costPerMap: allIn,
    scarabs: costs.scarabs.map(s => ({ name: s.name, cost: s.price_each_chaos! })),
    chiselPrice: costs.chisel?.price_each_chaos ?? 0,
    deliOrbQtyPerMap: costs.delirium?.count_per_map ?? 0, deliOrbPriceEach: costs.delirium?.price_each_chaos ?? 0,
    astrolabeCount: costs.astrolabe?.count ?? 0, astrolabePriceEach: costs.astrolabe?.price_each_chaos ?? 0,
  })
}

/** Feed only complete public evidence to the existing weighted presentation.
 * Unlike legacy display fallback, an incomplete run must not look like zero. */
export function safePooledPresentation(runs: SafeRun[], detail: SafeDetail) {
  if (!runs.length || runs.length !== detail.coverage.run_count || runs.some(r =>
    !r.observed.map_count || r.economics.total_invest_chaos === null || r.economics.total_invest_chaos <= 0 ||
    !recordedCostBreakdown(r.cost_breakdown, r.setup, r.observed.map_count, 0))) return null
  const view = aggregateEvidenceSetupCosts(runs.map(r => ({
    ordinal: r.ordinal, run_started_at: null, run_ended_at: null, submitted_at: r.contributed_on ?? '',
    map_count: r.observed.map_count!, avg_quant: r.observed.quantity_average, avg_rarity: r.observed.rarity_average,
    avg_pack: r.observed.pack_size_average, avg_currency: r.observed.currency_average,
    observed_mod_average: r.observed.mod_average, observed_mod_sample_size: r.observed.mod_sample_size,
    multiplier: r.observed.multiplier, per_map_cost: null, total_invest: r.economics.total_invest_chaos,
    net_profit: r.economics.net_profit_chaos, div_per_map: r.economics.net_per_map_divines,
    divine_price: r.economics.divine_price_chaos, session_minutes: r.timing.reported_minutes,
    game_data_revision: r.setup.game_data.revision, game_data_patch_version: r.setup.game_data.patch_version, loot_summary: null,
    cost_breakdown: {
      chisel: r.cost_breakdown!.chisel ? { name: r.cost_breakdown!.chisel.name, priceEach: r.cost_breakdown!.chisel.price_each_chaos! } : null,
      scarabs: r.cost_breakdown!.scarabs.map(s => ({ name: s.name, priceEach: s.price_each_chaos! })),
      delirium: r.cost_breakdown!.delirium ? { type: r.cost_breakdown!.delirium.type, countPerMap: r.cost_breakdown!.delirium.count_per_map, priceEach: r.cost_breakdown!.delirium.price_each_chaos } : null,
      astrolabe: r.cost_breakdown!.astrolabe ? { type: r.cost_breakdown!.astrolabe.type, count: r.cost_breakdown!.astrolabe.count, priceEach: r.cost_breakdown!.astrolabe.price_each_chaos } : null,
    },
  })))
  return view?.runCount === runs.length && view.mapCount === detail.coverage.map_count ? view : null
}
