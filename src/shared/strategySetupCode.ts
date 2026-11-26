import { isSafeStrategyAtlasUrl } from './atlasReaderSafety';
import { paidDeliriumOrbLimit } from './deliriumOrbs';
import { validCovensImport, type CovensImport } from './covensImport';

export const SETUP_CODE_PREFIX = 'wls1.';
export const SETUP_CODE_MIN_APP_VERSION = '1.0.97';
export const SETUP_CODE_MAX_LENGTH = 32768;
const MAX_JSON_BYTES = 24000;

/** Reusable setup only. This is not a Discord submission or a historical run. */
export interface StrategySetupCode {
  version: 1;
  kind: 'setup';
  title: string;
  notes: string;
  league: string;
  mapType: '6-mod' | '8-mod';
  chisel: string | null;
  scarabs: string[];
  delirium: { type: string; countPerMap: number | null } | null;
  deliriumOrbTypes?: string[];
  covens?: CovensImport;
  astrolabe: string | null;
  atlasTreeUrl: string | null;
  runRegex: string;
  reference?: SetupReference;
  multiplyingModifiers?: { allocated: boolean | null; fragmentCount: number | null };
  party?: { group: boolean | null; size: number | null };
  /** Optional, unverified public display snapshot. Never applied to a session. */
  history?: SetupHistory;
}

/** Recorded guidance, never new Map Log entries or financial inputs. */
export interface SetupReference {
  maps: number | null;
  quantity: number | null;
  rarity: number | null;
  packSize: number | null;
  currency: number | null;
  mapFamily: string | null;
  slamRegex: string;
}

export interface SetupHistory {
  maps: number | null;
  runs: number | null;
  quantity: number | null;
  rarity: number | null;
  packSize: number | null;
  currency: number | null;
  multiplier: number | null;
  costPerMap: number | null;
  totalInvest: number | null;
  netProfit: number | null;
  historicalInvestDivines: number | null;
  historicalNetDivines: number | null;
  netPerMapDivines: number | null;
  divinePrice: number | null;
  minutes: number | null;
  timedMaps: number | null;
  atlasPoints: number | null;
  atlasPointsMax: number | null;
  scarabPrices: (number | null)[];
}
const historyKeys = ['maps', 'runs', 'quantity', 'rarity', 'packSize', 'currency', 'multiplier',
  'costPerMap', 'totalInvest', 'netProfit', 'historicalInvestDivines', 'historicalNetDivines',
  'netPerMapDivines', 'divinePrice', 'minutes', 'timedMaps', 'atlasPoints', 'atlasPointsMax', 'scarabPrices'];

const keys = ['version', 'kind', 'title', 'notes', 'league', 'mapType', 'chisel',
  'scarabs', 'delirium', 'astrolabe', 'atlasTreeUrl', 'runRegex'];
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, allowed: string[]): boolean =>
  Object.keys(value).length === allowed.length && Object.keys(value).every((key) => allowed.includes(key));
const text = (value: unknown, max: number, multiline = false): value is string =>
  typeof value === 'string' && value.length <= max
  && !(multiline ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value);
const name = (value: unknown): boolean => text(value, 120) && value.trim().length > 0;

export function isStrategySetupCode(value: unknown): value is StrategySetupCode {
  const optional = ['history', 'reference', 'multiplyingModifiers', 'party', 'deliriumOrbTypes', 'covens'];
  if (!record(value) || !exactKeys(value, [...keys, ...optional.filter((key) => value[key] !== undefined)])
    || value.version !== 1 || value.kind !== 'setup'
    || !text(value.title, 80) || !text(value.notes, 4000, true) || !text(value.league, 80)
    || (value.mapType !== '6-mod' && value.mapType !== '8-mod')
    || (value.chisel !== null && !name(value.chisel))
    || !Array.isArray(value.scarabs) || value.scarabs.length > 5 || !value.scarabs.every(name)
    || (value.astrolabe !== null && !name(value.astrolabe))
    || (value.atlasTreeUrl !== null && (typeof value.atlasTreeUrl !== 'string' || !isSafeStrategyAtlasUrl(value.atlasTreeUrl)))
    || !text(value.runRegex, 300)) return false;
  const bounded = (v: unknown, max = 1000000) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max);
  if (value.reference !== undefined) {
    const r = value.reference;
    if (!record(r) || !exactKeys(r, ['maps', 'quantity', 'rarity', 'packSize', 'currency', 'mapFamily', 'slamRegex'])
      || !['maps', 'quantity', 'rarity', 'packSize', 'currency'].every((key) => bounded(r[key]))
      || (r.mapFamily !== null && !['8mod', 'regular', 'nightmare', 'originator', 'empowered-originator', 'empowered'].includes(String(r.mapFamily)))
      || !text(r.slamRegex, 300)) return false;
  }
  if (value.multiplyingModifiers !== undefined) {
    const m = value.multiplyingModifiers;
    if (!record(m) || !exactKeys(m, ['allocated', 'fragmentCount'])
      || (m.allocated !== null && typeof m.allocated !== 'boolean')
      || !bounded(m.fragmentCount, 5) || (m.fragmentCount !== null && !Number.isInteger(m.fragmentCount))) return false;
  }
  if (value.party !== undefined) {
    const p = value.party;
    if (!record(p) || !exactKeys(p, ['group', 'size']) || (p.group !== null && typeof p.group !== 'boolean')
      || !bounded(p.size, 6) || (p.size !== null && (!Number.isInteger(p.size) || Number(p.size) < 1))) return false;
  }
  if (value.history !== undefined) {
    const h = value.history;
    if (!record(h) || !exactKeys(h, historyKeys)
      || !historyKeys.filter((key) => key !== 'scarabPrices').every((key) => h[key] === null
        || (typeof h[key] === 'number' && Number.isFinite(h[key]) && Math.abs(h[key]) <= 1e15
          && (['netProfit', 'historicalNetDivines', 'netPerMapDivines'].includes(key) || h[key] >= 0)))
      || !Array.isArray(h.scarabPrices) || h.scarabPrices.length !== value.scarabs.length
      || !h.scarabPrices.every((p) => p === null || (typeof p === 'number' && Number.isFinite(p) && p >= 0 && p <= 1e15))) return false;
  }
  const deli = value.delirium;
  if (value.covens !== undefined && (value.scarabs.length || deli !== null ||
    !validCovensImport(value.covens, value.league, value.atlasTreeUrl))) return false;
  if (value.deliriumOrbTypes !== undefined && (deli !== null || !Array.isArray(value.deliriumOrbTypes)
    || !value.deliriumOrbTypes.every(name) || new Set(value.deliriumOrbTypes).size !== value.deliriumOrbTypes.length)) return false;
  return deli === null || (record(deli) && exactKeys(deli, ['type', 'countPerMap']) && name(deli.type)
    && (deli.countPerMap === null || (Number.isSafeInteger(deli.countPerMap) && Number(deli.countPerMap) >= 1
      && Number(deli.countPerMap) <= paidDeliriumOrbLimit(value.league))));
}

export function encodeStrategySetupCode(value: StrategySetupCode): string {
  if (!isStrategySetupCode(value)) throw new Error('Unsupported reusable setup');
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.length > MAX_JSON_BYTES) throw new Error('Setup code is too long');
  const token = SETUP_CODE_PREFIX + btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (token.length > SETUP_CODE_MAX_LENGTH) throw new Error('Setup code is too long');
  return token;
}

export function decodeStrategySetupCode(input: string): StrategySetupCode | null {
  if (input.length > SETUP_CODE_MAX_LENGTH + 32) return null;
  const token = input.trim();
  if (!token.startsWith(SETUP_CODE_PREFIX) || token.length > SETUP_CODE_MAX_LENGTH) return null;
  const encoded = token.slice(SETUP_CODE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) return null;
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    if (binary.length > MAX_JSON_BYTES) return null;
    const canonical = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (canonical !== encoded) return null;
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value: unknown = JSON.parse(json);
    // Only canonical producer JSON is accepted, including unique object keys.
    if (!isStrategySetupCode(value) || JSON.stringify(value) !== json) return null;
    return value;
  } catch { return null; }
}

/** Explicit public projection: reusable fields plus a separate inspection-only snapshot. */
export function publicStrategySetup(detail: unknown, evidence?: unknown): StrategySetupCode | null {
  if (!record(detail) || detail.schema_version !== 1 || !record(detail.setup)
    || typeof detail.id !== 'string' || !Number.isSafeInteger(detail.revision) || Number(detail.revision) < 1) return null;
  const setup = detail.setup;
  let singleSetup: Record<string, unknown> | null = null;
  if (evidence !== undefined && evidence !== null) {
    if (!record(evidence) || evidence.schema_version !== 1 || evidence.strategy_id !== detail.id
      || evidence.revision !== detail.revision || evidence.next_cursor !== null || !Array.isArray(evidence.runs)) return null;
    const runs = evidence.runs;
    if (record(detail.coverage) && runs.length > 0 && runs.length === detail.coverage.run_count
      && runs.every((r) => record(r) && r.schema_version === 1 && record(r.setup) && record(r.observed))
      && runs.reduce((sum, r) => sum + Number(r.observed.map_count), 0) === detail.coverage.map_count) {
      const normalize = (v: unknown): string => JSON.stringify(v, (_key, entry) => typeof entry === 'string' ? entry.trim().toLowerCase() : entry);
      const names = (v: unknown) => Array.isArray(v) ? v.map((item) => normalize(record(item) ? item.name : item)).sort().join('|') : '';
      const matching = runs.every((r) => r.setup.map_type === setup.map_type
        && names(r.setup.scarabs) === names(setup.scarabs)
        && normalize(r.setup.chisel ?? 'none') === normalize(setup.chisel ?? 'none'));
      if (matching) {
        singleSetup = {};
        for (const key of ['delirium', 'astrolabe', 'multiplying_modifiers']) {
          if (runs.every((r) => normalize(r.setup[key] ?? null) === normalize(runs[0].setup[key] ?? null))) {
            singleSetup[key] = runs[0].setup[key] ?? null;
          } else if (setup[key] == null) return null;
        }
      } else if (['delirium', 'astrolabe', 'multiplying_modifiers'].some((key) => setup[key] == null)) {
        return null;
      }
    }
  }
  const deli = setup.delirium ?? singleSetup?.delirium ?? null;
  const none = (value: unknown): unknown => value === null || (typeof value === 'string' && value.toLowerCase() === 'none') ? null : value;
  const observed = record(detail.observed) ? detail.observed : {};
  const metric = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
  const multiplying = setup.multiplying_modifiers ?? singleSetup?.multiplying_modifiers;
  const value: unknown = {
    version: 1, kind: 'setup', title: detail.title ?? '', notes: detail.notes ?? '', league: detail.league ?? '',
    mapType: setup.map_type, chisel: none(setup.chisel),
    scarabs: Array.isArray(setup.scarabs) ? setup.scarabs.map((item) => typeof item === 'string' ? item : record(item) ? item.name : undefined) : null,
    delirium: record(deli) && deli.type === null && deli.count_per_map === 0 ? null
      : record(deli) ? { type: deli.type, countPerMap: deli.count_per_map } : deli,
    astrolabe: none(setup.astrolabe ?? singleSetup?.astrolabe ?? null),
    atlasTreeUrl: record(setup.atlas) ? setup.atlas.url : null,
    runRegex: setup.run_regex ?? '',
    reference: {
      maps: metric(record(detail.coverage) ? detail.coverage.map_count : observed.map_count),
      quantity: metric(observed.quantity_average), rarity: metric(observed.rarity_average),
      packSize: metric(observed.pack_size_average), currency: metric(observed.currency_average),
      mapFamily: setup.map_type === '8-mod' ? '8mod' : Array.isArray(detail.tags)
        ? detail.tags.find((tag) => ['nightmare', 'originator', 'empowered-originator', 'empowered'].includes(tag)) ?? 'regular' : 'regular',
      slamRegex: setup.slam_regex ?? '',
    },
    multiplyingModifiers: { allocated: record(multiplying) ? multiplying.allocated : null,
      fragmentCount: record(multiplying) ? multiplying.fragment_count : null },
    party: { group: typeof setup.group_play === 'boolean' ? setup.group_play : null,
      size: metric(setup.party_size) },
  };
  if (!isStrategySetupCode(value)) return null;
  return { ...value, history: publicSetupHistory(detail, evidence, value.scarabs.length) };
}

function publicSetupHistory(detail: Record<string, unknown>, evidence: unknown, scarabCount: number): SetupHistory {
  const obj = (v: unknown): Record<string, unknown> => record(v) ? v : {};
  const number = (v: unknown, signed = false): number | null => typeof v === 'number'
    && Number.isFinite(v) && Math.abs(v) <= 1e15 && (signed || v >= 0) ? v : null;
  const coverage = obj(detail.coverage), observed = obj(detail.observed), economics = obj(detail.economics);
  const setup = obj(detail.setup), atlas = obj(setup.atlas), page = obj(evidence);
  const runs = Array.isArray(page.runs) && page.runs.length === coverage.run_count
    && page.runs.every((r) => record(r) && r.schema_version === 1) ? page.runs : [];
  const complete = runs.length > 0 && runs.every((r) => number(obj(obj(r).observed).map_count) !== null)
    && runs.reduce((sum, r) => sum + Number(obj(obj(r).observed).map_count), 0) === coverage.map_count;
  const sum = (key: string, signed = false): number | null => {
    const values = runs.map((r) => number(obj(obj(r).economics)[key], signed));
    return complete && values.every((v) => v !== null) ? number(values.reduce<number>((a, b) => a + b!, 0), signed) : null;
  };
  const divinePrices = runs.map((r) => number(obj(obj(r).economics).divine_price_chaos));
  const divinePrice = complete && divinePrices[0] && divinePrices.every((p) => p === divinePrices[0]) ? divinePrices[0] : null;
  return {
    maps: number(coverage.map_count), runs: number(coverage.run_count),
    quantity: number(observed.quantity_average), rarity: number(observed.rarity_average),
    packSize: number(observed.pack_size_average), currency: number(observed.currency_average),
    multiplier: number(observed.multiplier_average), costPerMap: number(economics.all_in_cost_per_map_chaos),
    totalInvest: sum('total_invest_chaos'), netProfit: sum('net_profit_chaos', true),
    historicalInvestDivines: number(economics.historical_invest_divines),
    historicalNetDivines: number(economics.historical_net_divines, true),
    netPerMapDivines: number(economics.net_per_map_divines, true), divinePrice,
    minutes: number(coverage.timed_minutes), timedMaps: number(coverage.timed_map_count),
    atlasPoints: number(atlas.points), atlasPointsMax: number(atlas.points_max),
    scarabPrices: Array.from({ length: scarabCount }, (_, index) =>
      number(obj(Array.isArray(setup.scarabs) ? setup.scarabs[index] : null).price_each_chaos)),
  };
}
