import { buildDiscordSharePayload, DISCORD_SHARE_COMMAND_MAX } from './discordShareWire';
import { isSafeStrategyAtlasUrl } from './atlasUrl';
import type { DiscordImport } from './parseDiscordExport';

export interface PublicPrice {
  name: string;
  price_each_chaos: number;
}

export interface PublicEvidenceRun {
  schema_version: 1;
  ordinal: number;
  setup: {
    map_type: string | null;
    group_play: boolean | null;
    party_size: number | null;
    chisel: string | null;
    scarabs: string[];
    delirium: { type: string | null; count_per_map: number | null } | null;
    astrolabe: string | null;
    multiplying_modifiers: { allocated: boolean | null; fragment_count: number | null } | null;
    game_data: { revision: number | null; patch_version: string | null };
  };
  observed: {
    map_count: number | null;
    mod_average: number | null;
    mod_sample_size: number | null;
    quantity_average: number | null;
    rarity_average: number | null;
    pack_size_average: number | null;
    currency_average: number | null;
    multiplier: number | null;
  };
  economics: {
    recurring_cost_per_map_chaos: number | null;
    total_invest_chaos: number | null;
    net_profit_chaos: number | null;
    net_per_map_divines: number | null;
    divine_price_chaos: number | null;
  };
  timing: { reported_minutes: number | null };
  cost_breakdown: {
    chisel: PublicPrice | null;
    scarabs: PublicPrice[];
    delirium: ({ type: string; count_per_map: number } & Omit<PublicPrice, 'name'>) | null;
    astrolabe: ({ type: string; count: number } & Omit<PublicPrice, 'name'>) | null;
  } | null;
}

export interface PublicStrategyDetail {
  schema_version: 1;
  id: string;
  revision: number | null;
  title: string | null;
  notes: string | null;
  tags: string[];
  league: string | null;
  setup: {
    map_type: string | null;
    atlas: { url: string | null; points: number | null; points_max: number | null };
    run_regex: string | null;
  };
}

export interface PublicEvidencePage {
  schema_version: 1;
  strategy_id: string;
  revision: number;
  runs: PublicEvidenceRun[];
}

export type PublicSetupCodeResult =
  | { status: 'available'; code: string; sourceEvidenceOrdinal: number }
  | { status: 'unavailable'; reason: 'incomplete_safe_source' | 'encoding_failed' };

type SetupCodeEncoder = (payloadJson: string) => string | Promise<string>;

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value);
const boundedText = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length <= maximum && !/[\r\n]/.test(value);
// The public DTO preserves normalized line breaks, while the production wl2/wl3
// validators intentionally accept one-line strategy notes. Load does not apply
// notes, so flatten formatting for this optional portable code without rejecting
// otherwise complete financial/setup proof.
const wireNotes = (value: unknown, maximum: number): string | null => {
  if (typeof value !== 'string'
    || [...value].length > maximum
    || /[\r\u0000-\u0009\u000b-\u001f\u007f]/.test(value)) return null;
  return value.replace(/\n+/g, ' ').replace(/[ \t]+/g, ' ').trim();
};
const normalizedIdentity = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

function matchingPrices(names: string[], prices: PublicPrice[]): PublicPrice[] | null {
  if (names.length !== prices.length) return null;
  const unused = [...prices];
  const matched: PublicPrice[] = [];
  for (const name of names) {
    const index = unused.findIndex((price) =>
      boundedText(price.name, 120)
      && finite(price.price_each_chaos)
      && price.price_each_chaos >= 0
      && normalizedIdentity(price.name) === normalizedIdentity(name));
    if (index < 0) return null;
    matched.push(unused.splice(index, 1)[0]);
  }
  return matched;
}

function sameIdentity(left: string | null, right: string | null): boolean {
  return left === null
    ? right === null
    : right !== null && normalizedIdentity(left) === normalizedIdentity(right);
}

function sourceImport(
  strategy: PublicStrategyDetail,
  evidence: PublicEvidenceRun,
): DiscordImport | null {
  const { observed, economics, setup, cost_breakdown: costs } = evidence;
  const mapType = setup.map_type;
  const mapCount = observed.map_count;
  const strategyNotes = wireNotes(strategy.notes ?? '', 4000);
  if (
    (mapType !== '6-mod' && mapType !== '8-mod')
    || strategy.setup.map_type !== mapType
    || !integer(mapCount) || mapCount < 1 || mapCount > 100000
    || !finite(observed.multiplier)
    || !finite(observed.quantity_average)
    || !finite(observed.rarity_average)
    || !finite(observed.pack_size_average)
    || !finite(observed.currency_average)
    || !finite(economics.recurring_cost_per_map_chaos) || economics.recurring_cost_per_map_chaos < 0
    || !finite(economics.total_invest_chaos) || economics.total_invest_chaos < 0
    || !finite(economics.net_profit_chaos)
    || !finite(economics.net_per_map_divines)
    || !finite(economics.divine_price_chaos) || economics.divine_price_chaos <= 0
    || !costs
    || !boundedText(strategy.title ?? '', 80)
    || strategyNotes === null
    || !Array.isArray(strategy.tags) || strategy.tags.length > 32
    || !strategy.tags.every((tag) => boundedText(tag, 64))
    || !boundedText(strategy.league ?? '', 80)
    || !boundedText(strategy.setup.run_regex ?? '', 300)
  ) return null;

  const chiselName = setup.chisel && normalizedIdentity(setup.chisel) !== 'none'
    ? setup.chisel
    : null;
  const costChiselName = costs.chisel?.name ?? null;
  if (!sameIdentity(chiselName, costChiselName)) return null;

  if (!Array.isArray(setup.scarabs) || setup.scarabs.length > 10
    || !setup.scarabs.every((name) => boundedText(name, 120))) return null;
  const scarabs = matchingPrices(setup.scarabs, costs.scarabs);
  if (!scarabs) return null;

  const deliriumCount = setup.delirium?.count_per_map ?? 0;
  const deliriumType = deliriumCount > 0 ? setup.delirium?.type ?? null : null;
  const costDeliriumType = costs.delirium?.type ?? null;
  if (!Number.isInteger(deliriumCount) || deliriumCount < 0 || deliriumCount > 5
    || !sameIdentity(deliriumType, costDeliriumType)
    || (deliriumType !== null && costs.delirium?.count_per_map !== deliriumCount)
    || (costs.delirium && (!finite(costs.delirium.price_each_chaos)
      || costs.delirium.price_each_chaos < 0))) return null;

  const astrolabeType = setup.astrolabe;
  const costAstrolabeType = costs.astrolabe?.type ?? null;
  if (!sameIdentity(astrolabeType, costAstrolabeType)
    || (costs.astrolabe && (!Number.isInteger(costs.astrolabe.count)
      || costs.astrolabe.count < 0
      || !finite(costs.astrolabe.price_each_chaos)
      || costs.astrolabe.price_each_chaos < 0))) return null;

  const atlasUrl = strategy.setup.atlas.url ?? '';
  if (atlasUrl && !isSafeStrategyAtlasUrl(atlasUrl)) return null;
  const groupSize = setup.party_size;
  if (setup.group_play === null
    || (setup.group_play === false && groupSize !== 1)
    || (setup.group_play && groupSize !== null
      && (!Number.isInteger(groupSize) || groupSize < 2 || groupSize > 6))) return null;

  const observedModAverage = observed.mod_sample_size === mapCount
    && finite(observed.mod_average)
    ? observed.mod_average
    : null;
  const totalReturn = economics.total_invest_chaos + economics.net_profit_chaos;
  if (!finite(totalReturn)) return null;

  return {
    mapCount,
    mapType,
    multiplier: observed.multiplier,
    observedModAverage,
    observedModSampleSize: observedModAverage === null ? null : observed.mod_sample_size,
    observedDelirium: null,
    avgQuant: observed.quantity_average,
    avgRarity: observed.rarity_average,
    avgPack: observed.pack_size_average,
    avgCurr: observed.currency_average,
    perMapCost: economics.recurring_cost_per_map_chaos,
    totalInvest: economics.total_invest_chaos,
    totalReturn,
    netProfit: economics.net_profit_chaos,
    divPerMap: economics.net_per_map_divines,
    divPrice: economics.divine_price_chaos,
    chisel: costs.chisel?.name ?? 'None',
    chiselPrice: costs.chisel?.price_each_chaos ?? 0,
    runRegex: strategy.setup.run_regex ?? '',
    slamRegex: '',
    scarabs: scarabs.map((scarab) => scarab.name),
    scarabCosts: scarabs.map((scarab) => scarab.price_each_chaos),
    atlasTreeUrl: atlasUrl,
    strategyName: strategy.title ?? '',
    strategyNotes,
    typeTags: [...strategy.tags],
    deliOrbQty: deliriumCount,
    deliOrbType: costs.delirium?.type ?? '',
    deliOrbPrice: costs.delirium?.price_each_chaos ?? 0,
    astroType: costs.astrolabe?.type ?? '',
    astroCount: costs.astrolabe?.count ?? 0,
    astroPrice: costs.astrolabe?.price_each_chaos ?? 0,
    excludedDrops: [],
    gemInfo: null,
    isGroupPlay: setup.group_play,
    groupSize: setup.group_play ? groupSize : null,
    sessionMinutes: evidence.timing.reported_minutes,
    atlasPoints: strategy.setup.atlas.points,
    atlasPointsMax: strategy.setup.atlas.points_max,
    league: strategy.league ?? '',
    updateStrategyId: null,
    operation: 'share',
    operationError: null,
    evidenceTargetStrategyId: null,
    evidenceExpectedRevision: null,
    evidenceRunKey: null,
    evidenceRunStartedAt: null,
    evidenceRunEndedAt: null,
    setupFingerprint: null,
    gameDataRevision: setup.game_data.revision,
    gameDataPatchVersion: setup.game_data.patch_version,
    multiplyingModifiersAllocated: setup.multiplying_modifiers?.allocated ?? null,
    multiplyingModifiersFragmentCount: setup.multiplying_modifiers?.fragment_count ?? null,
    lootSummary: null,
    lootSummaryInvalid: false,
  };
}

/**
 * Generate a desktop-compatible setup code from the closed public DTO only.
 * The newest complete current-revision run supplies immutable wire-required
 * economics; Import still applies only reusable setup and discards its prices.
 */
export async function generatePublicStrategySetupCode(
  strategy: PublicStrategyDetail,
  evidencePage: PublicEvidencePage,
  encodePayload: SetupCodeEncoder,
): Promise<PublicSetupCodeResult> {
  if (
    !strategy
    || !evidencePage
    || strategy.schema_version !== 1
    || evidencePage.schema_version !== 1
    || typeof strategy.id !== 'string'
    || typeof evidencePage.strategy_id !== 'string'
    || strategy.id.toLowerCase() !== evidencePage.strategy_id.toLowerCase()
    || strategy.revision === null
    || strategy.revision !== evidencePage.revision
    || !Array.isArray(evidencePage.runs)
  ) return { status: 'unavailable', reason: 'incomplete_safe_source' };
  const candidates = [...evidencePage.runs]
    .filter((run) => run.schema_version === 1)
    .filter((run) => Number.isInteger(run.ordinal) && run.ordinal > 0)
    .sort((left, right) => right.ordinal - left.ordinal);
  for (const evidence of candidates) {
    let imported: DiscordImport | null;
    try {
      imported = sourceImport(strategy, evidence);
    } catch {
      imported = null;
    }
    if (!imported) continue;
    try {
      const code = await encodePayload(buildDiscordSharePayload(imported));
      if (!/^wl3\.[A-Za-z0-9_-]+$/.test(code) || code.length > DISCORD_SHARE_COMMAND_MAX) {
        return { status: 'unavailable', reason: 'encoding_failed' };
      }
      return { status: 'available', code, sourceEvidenceOrdinal: evidence.ordinal };
    } catch {
      return { status: 'unavailable', reason: 'encoding_failed' };
    }
  }
  return { status: 'unavailable', reason: 'incomplete_safe_source' };
}
