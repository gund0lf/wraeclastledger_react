import type { SafeDetail, SafeRow, SafeRun } from '../../../shared/safeStrategy'
import { computePublishedSetupCostBreakdown } from './strategySetupCosts'
export const safeNumber = (v: number | null | undefined, unit = '') => v == null ? '–' : v.toLocaleString('en-US', { maximumFractionDigits: unit === 'd' ? 3 : 1 }) + unit
export function safeDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'unrecorded'
  return new Date(value).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
export function recordedQuantityPrice(quantity: number | null | undefined, price: number | null | undefined, perMap = false): string {
  if (quantity == null && price == null) return '–'
  const count = quantity == null ? 'Quantity unrecorded' : `${safeNumber(quantity)}×${perMap ? '/map' : ''}`
  return `${count} · ${price == null ? 'Unit price unrecorded' : `${safeNumber(price, 'c')} each`}`
}
export const ANONYMOUS_AUTHOR_TOOLTIP = 'No public author name displayed'
export const hasPublicAuthorName = (attribution: SafeRow['attribution']): boolean =>
  attribution?.status === 'active' && attribution.display_name !== null

export function safeCostEvidenceMessage(runs: SafeRun[] | null, error: string | null, scope: SafeDetail['scope'] = 'current'): string {
  if (scope === 'frozen') return 'Individual run costs are not available for this frozen strategy.'
  if (error !== null) return 'Run evidence is unavailable. Retry below to load the historical cost summary.'
  return runs === null ? 'Loading complete run evidence…' : 'Incomplete cost evidence; no partial cost summary is calculated.'
}

export function safeAuthorLabel(attribution: SafeRow['attribution']): string {
  return hasPublicAuthorName(attribution) ? attribution!.display_name! : 'Anonymous'
}

export function safeAuthorStatus(attribution: SafeRow['attribution']): string {
  if (!attribution) return ''
  return { active: '', suspended: 'Name suspended', retired: 'Name retired', removed: 'Name removed', quarantined: 'Name unavailable' }[attribution.status]
}

/** Closed presentation messages, never service-provided reason text. */
export function safeSetupUnavailableMessage(reason: string): string {
  const messages: Record<string, string> = {
    missing_setup: 'Reusable setup was not recorded.',
    malformed_source: 'The recorded setup cannot be loaded safely.',
    title_limit: 'The recorded title is too long to import. The setup is still shown above.',
    regex_limit: 'The recorded regex is too long to import. The setup is still shown above.',
    invalid_atlas: 'The recorded Atlas link cannot be loaded safely.',
    conflicting_source: 'The recorded setup contains conflicting details.',
    unsupported_setup: 'This recorded setup cannot be imported by this version.'
  }
  return Object.hasOwn(messages, reason) ? messages[reason] : 'The reusable setup is unavailable.'
}

export function pooledAtlasDrops(runs: readonly SafeRun[] | null) {
  let sum = 0, count = 0
  for (const run of runs ?? []) {
    const sample = run.covens?.atlas_drops
    if (sample) { sum += sample.sum; count += sample.count }
  }
  return count ? sum / count : null
}

export function safeContinuationMessage(reason: string, unnamed = false): string {
  if (unnamed && (reason === 'inactive_registration' || reason === 'missing_membership')) return 'Name this strategy to continue it.'
  const messages: Record<string, string> = {
    frozen: 'This league is closed to strategy updates.',
    missing_membership: 'Continuation needs a confirmed public name for this strategy.',
    incomplete_seed: 'This strategy lacks the setup information needed for another run.',
    conflicting_seed: 'Conflicting setup details prevent continuing this strategy.',
    unsupported_identity: 'This version cannot continue this recorded setup.',
    inactive_registration: 'The assigned public name is not active. Continuation is unavailable.'
  }
  return Object.hasOwn(messages, reason) ? messages[reason] : 'Continuation is unavailable.'
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
