import type { SafeRun } from '../../../shared/safeStrategy'
import { computePublishedSetupCostBreakdown } from './strategySetupCosts'
export const safeNumber = (v: number | null | undefined, unit = '') => v == null ? 'Unrecorded' : v.toLocaleString(undefined, { maximumFractionDigits: unit === 'd' ? 3 : 1 }) + unit

export function safeCostEvidenceMessage(runs: SafeRun[] | null, error: string | null): string {
  if (error !== null) return 'Run evidence is unavailable. Retry below to load the historical cost summary.'
  return runs === null ? 'Loading complete run evidence…' : 'Incomplete cost evidence; no partial cost summary is calculated.'
}

/** Complete-only component costs. Missing per-run prices never become zero. */
export function safePooledCostComponents(runs: SafeRun[]): Record<string, number> | null {
  if (!runs.length) return null
  const totals = { Chisel: 0, Scarabs: 0, 'Delirium orbs': 0, Astrolabe: 0 }
  let totalMaps = 0
  for (const run of runs) {
    const c = run.cost_breakdown, n = run.observed.map_count
    if (!c || !n || c.scarabs.length !== run.setup.scarabs.length || c.scarabs.some((s, i) => s.price_each_chaos === null || s.name.toLowerCase() !== run.setup.scarabs[i].toLowerCase()) ||
      (run.setup.chisel && run.setup.chisel.toLowerCase() !== 'none' && (!c.chisel || c.chisel.price_each_chaos === null)) ||
      (run.setup.delirium?.type && !c.delirium) || (run.setup.astrolabe && !c.astrolabe)) return null
    const values = computePublishedSetupCostBreakdown({ mapCount: n, costPerMap: 0,
      scarabs: c.scarabs.map(s => ({ name: s.name, cost: s.price_each_chaos! })), chiselPrice: c.chisel?.price_each_chaos ?? 0,
      deliOrbQtyPerMap: c.delirium?.count_per_map ?? 0, deliOrbPriceEach: c.delirium?.price_each_chaos ?? 0,
      astrolabeCount: c.astrolabe?.count ?? 0, astrolabePriceEach: c.astrolabe?.price_each_chaos ?? 0 })
    totals.Chisel += values.chisel * n; totals.Scarabs += values.scarabs * n
    totals['Delirium orbs'] += values.deliriumOrbs * n; totals.Astrolabe += values.astrolabe * n; totalMaps += n
  }
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / totalMaps]))
}
