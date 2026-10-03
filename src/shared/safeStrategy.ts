import { AUTHOR_UUID } from './authorHandoff'
import { normalizePublicAuthorName } from './authorNames'
import { isStrategySetupCode, type StrategySetupCode } from './strategySetupCode'
import { isSafeStrategyAtlasUrl } from './atlasReaderSafety'

type Check<T> = (v: unknown) => T
const bad = (): never => { throw new Error('The strategy service returned an unsupported response.') }
const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : bad()
const string = (max: number): Check<string> => v => typeof v === 'string' && v.length <= max ? v : bad()
const num: Check<number> = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e15 ? v : bad()
const integer = (max = 2147483647, min = 0): Check<number> => v => Number.isInteger(v) && Number(v) >= min && Number(v) <= max ? Number(v) : bad()
const bool: Check<boolean> = v => typeof v === 'boolean' ? v : bad()
const nullable = <T>(check: Check<T>): Check<T | null> => v => v === null ? null : check(v)
const literal = <T extends string | number>(...values: T[]): Check<T> => v => values.includes(v as T) ? v as T : bad()
const array = <T>(check: Check<T>, max: number): Check<T[]> => v => Array.isArray(v) && v.length <= max ? v.map(check) : bad()
const shape = <S extends Record<string, Check<unknown>>>(schema: S): Check<{ [K in keyof S]: ReturnType<S[K]> }> => v => {
  const o = object(v)
  if (Object.keys(o).length !== Object.keys(schema).length || Object.keys(o).some(k => !Object.hasOwn(schema, k))) bad()
  return Object.fromEntries(Object.entries(schema).map(([k, check]) => [k, check(o[k])])) as { [K in keyof S]: ReturnType<S[K]> }
}
const uuid: Check<string> = v => typeof v === 'string' && AUTHOR_UUID.test(v) ? v : bad()
const date = nullable((v: unknown) => { const s = string(64)(v); return Number.isFinite(Date.parse(s)) ? s : bad() })
const metric = nullable(num), count = nullable(integer()), text = nullable(string(160))
const amount = nullable((v: unknown) => { const n = num(v); return n >= 0 ? n : bad() })
const atlas = nullable((v: unknown) => { const s = string(2000)(v); return isSafeStrategyAtlasUrl(s) ? s : bad() })
const cursor = nullable((v: unknown) => { const s = string(2048)(v); return s.length ? s : bad() })
const modifiers = nullable(shape({ allocated: nullable(bool), fragment_count: nullable(integer(6)) }))
const game = shape({ revision: count, patch_version: nullable(string(40)) })
const setupFields = { map_type: nullable(string(32)), group_play: nullable(bool), party_size: nullable(integer(6, 1)),
  chisel: text, scarabs: array(string(160), 5), delirium: nullable(shape({ type: text, count_per_map: nullable(integer(5)) })),
  astrolabe: text, multiplying_modifiers: modifiers, game_data: game }
const setup = shape({ ...setupFields, scarabs: array(shape({ name: string(160), price_each_chaos: metric }), 5), atlas: shape({ url: atlas, points: nullable(integer(1000)), points_max: nullable(integer(1000)) }),
  run_regex: nullable(string(4096)), slam_regex: nullable(string(4096)) })
const observedFields = { map_count: count, mod_average: metric, mod_sample_size: count }
const averages = { quantity_average: metric, rarity_average: metric, pack_size_average: metric, currency_average: metric }
const observed = shape({ ...observedFields, ...averages, multiplier_average: metric })
const runObserved = shape({ ...observedFields, ...averages, multiplier: metric })
const price = shape({ name: string(160), price_each_chaos: metric })
const costs = nullable(shape({ chisel: nullable(price), scarabs: array(price, 5),
  delirium: nullable(shape({ type: string(160), count_per_map: integer(5), price_each_chaos: num })),
  astrolabe: nullable(shape({ type: string(160), count: integer(), price_each_chaos: num })) }))
const runEconomics = shape({ recurring_cost_per_map_chaos: metric, total_invest_chaos: metric, net_profit_chaos: metric,
  net_per_map_divines: metric, divine_price_chaos: metric })
const timing = shape({ reported_minutes: metric })
const delirium = nullable(shape({ sample_size: integer(), levels: array(shape({ percentage: integer(100), count: integer() }), 6),
  rewards: array(shape({ name: string(160), count: integer() }), 100) }))
const lootIdentity: Check<Record<string, string | number | null> | null> = v => {
  if (v === null) return null
  const o = object(v)
  const allowed = ['kind', 'base', 'chart', 'member', 'quality', 'memory_strands', 'influence', 'equipment_group', 'reward']
  if (Object.keys(o).some(k => !allowed.includes(k))) bad()
  literal('quality-base', 'chart', 'syndicate-reward')(o.kind)
  return Object.fromEntries(Object.entries(o).map(([k, val]) => [k, ['quality', 'memory_strands'].includes(k) ? nullable(integer(100))(val) : text(val)]))
}
const loot = nullable(shape({ version: literal(1), row_limit: literal(30), rows: array(shape({ name: string(160), category: string(80), source: string(40), quantity: num, value_chaos: num,
  note: nullable(string(500)), valuation: nullable(shape({ baseline_quantity: num, current_quantity: num, baseline_value_chaos: num, current_value_chaos: num })),
  identity: lootIdentity }), 30), categories: array(shape({ category: string(80), value_chaos: num }), 100), has_baseline: bool,
  manual_total_chaos: metric, inventory_flow_chaos: metric, market_revaluation_chaos: metric,
  csv_positive_chaos: num, csv_negative_chaos: num, csv_net_chaos: num, csv_adjustment_chaos: num,
  gem_correction_chaos: num, investment_correction_chaos: num, reported_return_chaos: num,
  omitted_csv_rows: count, omitted_csv_value_chaos: metric, omitted_manual_rows: count, omitted_manual_value_chaos: metric }))
// Use the registration contract without changing the name returned by the service.
const authorName: Check<string> = v => {
  try {
    const { name } = normalizePublicAuthorName(v)
    if (name === v) return name
  } catch {
    return bad()
  }
  return bad()
}
const attribution = nullable(shape({ registration_id: uuid, display_name: nullable(authorName), status: literal('active', 'suspended', 'retired', 'removed', 'quarantined') }))
const identityFields = { schema_version: literal(2), scope: literal('current', 'frozen'), snapshot_key: nullable(uuid), revision: integer(2147483647, 1), read_version: uuid }
const common = { ...identityFields, id: uuid, title: nullable(string(160)), tags: array(string(80), 32), league: nullable(string(80)),
  attribution, community: nullable(shape({ id: uuid, name: string(160) })), published_at: date, updated_at: date, score: metric }
function scoped<T extends { scope: string; snapshot_key: string | null }>(check: Check<T>): Check<T> {
  return v => {
    const o = object(v), frozen = o.scope === 'frozen'
    if (frozen && o.snapshot_schema_version !== 1) bad()
    const { snapshot_schema_version, ...rest } = o
    if (!frozen && snapshot_schema_version !== undefined) bad()
    const result = check(rest)
    if (frozen ? result.snapshot_key === null : result.snapshot_key !== null) bad()
    return result
  }
}
export const parseSafeRow = scoped(shape({ ...common, map_type: nullable(string(32)), group_play: nullable(bool), party_size: nullable(integer(6, 1)), observed: shape(observedFields),
  results: shape({ all_in_cost_per_map_chaos: metric, net_per_map_divines: metric, net_divines_per_hour: metric, total_invest_chaos: metric, net_profit_chaos: metric,
    historical_net_divines: metric, historical_invest_divines: amount }),
  evidence: shape({ run_count: count, timed_run_count: count, timed_map_count: count }) }))
const reasons = literal('frozen', 'missing_membership', 'incomplete_seed', 'conflicting_seed', 'unsupported_identity', 'inactive_registration')
const seed = shape({ ...setupFields, league_key: string(80), multiplier_milli: integer(1e15), atlas_tree_url: atlas })
const continuation = (v: unknown) => object(v).status === 'available'
  ? shape({ status: literal('available'), identity_version: literal(1, 2), seed })(v)
  : shape({ status: literal('unavailable'), reason: reasons })(v)
const reusable = (v: unknown): { status: 'available'; value: StrategySetupCode } | { status: 'unavailable'; reason: string } => {
  if (object(v).status !== 'available') return shape({ status: literal('unavailable'), reason: string(100) })(v)
  return shape({ status: literal('available'), value: (value: unknown): StrategySetupCode =>
    isStrategySetupCode(value) && !Object.hasOwn(value, 'history') ? value : bad() })(v)
}
export const parseSafeRun = shape({ schema_version: literal(2), ordinal: integer(100, 1), contributed_on: date, setup: shape(setupFields),
  observed: runObserved, economics: runEconomics, timing, cost_breakdown: costs, display_cost_breakdown: costs, observed_delirium: delirium, loot })
export const parseSafeDetail = scoped(shape({ ...common, notes: nullable(string(16000)), setup, observed,
  economics: shape({ all_in_cost_per_map_chaos: metric, recurring_cost_per_map_chaos: metric, net_per_map_divines: metric,
    historical_net_divines: metric, historical_invest_divines: metric, total_invest_chaos: metric, net_profit_chaos: metric }),
  coverage: shape({ run_count: count, map_count: count, timed_run_count: count, timed_map_count: count, timed_minutes: metric,
    timed_net_divines: metric, net_divines_per_hour: metric, loot_available: bool }), loot, reusable_setup: reusable,
  authored_history: nullable(shape({ observed: runObserved, economics: runEconomics, timing, setup_display: nullable(shape({
    source: literal('structured', 'legacy_display'), authored_map_count: count, cost_breakdown: costs, combined_map_rolling_cost_per_map_chaos: metric })) })),
  ancillary: shape({ excluded_drops: nullable(shape({ entries: array(shape({ name: string(160), chaos: amount }), 100), declared_count: nullable(integer(1000000)), total_chaos: amount, complete: bool })),
    gem_leveling: nullable(shape({ count: nullable(integer(1000000)), buy_chaos: amount, sell_chaos: amount, net_chaos: metric })), observed_delirium: delirium }),
  continuation_setup: continuation, lifecycle: shape({ state: literal('current', 'frozen'), continuation_reason: nullable(reasons) }) }))
export const SAFE_SORTS = { activity: 'Latest activity', title: 'Strategy name', mod: 'Mod', maps: 'Maps', cost_per_map: 'Cost / map',
  profit_per_map: 'Div / map', net_profit: 'Net profit', total_invest: 'Total investment', score: 'Score', div_per_hour: 'Div / hour' } as const
export type SafeSort = keyof typeof SAFE_SORTS
export const safeSortOrder = (sort: SafeSort): 'asc' | 'desc' => ['title', 'cost_per_map', 'total_invest'].includes(sort) ? 'asc' : 'desc'
export const parseSafeList = shape({ schema_version: literal(2), scope: literal('current', 'frozen'), snapshot_key: nullable(uuid), read_version: uuid,
  total: integer(), limit: integer(100, 1), sort: literal(...Object.keys(SAFE_SORTS) as SafeSort[]), order: literal('asc', 'desc'),
  strategies: array(parseSafeRow, 100), next_cursor: cursor })
export const parseSafeEvidence = shape({ schema_version: literal(2), strategy_id: uuid, revision: integer(2147483647, 1), read_version: uuid,
  runs: array(parseSafeRun, 100), next_cursor: cursor })
export const parseSafeCatalogue = shape({ schema_version: literal(2), snapshots: array(shape({ snapshot_key: uuid, read_version: uuid,
  league: nullable(string(80)), cutoff_utc: date, frozen_at: date, strategy_count: integer() }), 1000) })
export type SafeRow = ReturnType<typeof parseSafeRow>
export type SafeDetail = ReturnType<typeof parseSafeDetail>
export type SafeRun = ReturnType<typeof parseSafeRun>
export type SafeList = ReturnType<typeof parseSafeList>
export type SafeSnapshot = ReturnType<typeof parseSafeCatalogue>['snapshots'][number]
export type SafeIdentity = Pick<SafeRow, 'scope' | 'snapshot_key' | 'id' | 'revision' | 'read_version'>
export const safeIdentityKey = (i: SafeIdentity) => JSON.stringify([i.scope, i.snapshot_key, i.id, i.revision, i.read_version])
export const sameSafeIdentity = (a: SafeIdentity, b: SafeIdentity) => safeIdentityKey(a) === safeIdentityKey(b)
