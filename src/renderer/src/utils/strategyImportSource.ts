import { isStrategySetupCode, type StrategySetupCode } from '../../../shared/strategySetupCode';
import { parseDiscordExport, type DiscordImport } from './parseDiscordExport';
import type { Strategy } from './strategyConstants';
import { isSafeStrategyAtlasUrl } from './atlasUrl';

const metric = (value: unknown): number | null => value === null || value === undefined || value === '' ? null
  : Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const family = (mapType: unknown, tags: string[]) => mapType === '8-mod' ? '8mod'
  : tags.find((tag) => ['nightmare', 'originator', 'empowered-originator', 'empowered'].includes(tag)) ?? 'regular';
const checked = (value: StrategySetupCode): StrategySetupCode => {
  if (!isStrategySetupCode(value)) throw new Error('This strategy does not contain a supported reusable setup.');
  return value;
};

/** Historical Discord snapshot. Financial values remain in its separate preview. */
export function discordImportSource(parsed: DiscordImport): StrategySetupCode {
  return checked({ version: 1, kind: 'setup', title: parsed.strategyName || 'Imported setup', notes: '',
    league: parsed.league, mapType: parsed.mapType as StrategySetupCode['mapType'],
    chisel: parsed.chisel && parsed.chisel.toLowerCase() !== 'none' ? parsed.chisel : null,
    scarabs: parsed.scarabs, delirium: parsed.deliOrbType ? { type: parsed.deliOrbType, countPerMap: parsed.deliOrbQty || null } : null,
    astrolabe: parsed.astroType || null, atlasTreeUrl: parsed.atlasTreeUrl && isSafeStrategyAtlasUrl(parsed.atlasTreeUrl) ? parsed.atlasTreeUrl : null,
    runRegex: parsed.runRegex, reference: { maps: metric(parsed.mapCount), quantity: metric(parsed.avgQuant),
      rarity: metric(parsed.avgRarity), packSize: metric(parsed.avgPack), currency: metric(parsed.avgCurr),
      mapFamily: family(parsed.mapType, parsed.typeTags), slamRegex: parsed.slamRegex || '' },
    multiplyingModifiers: { allocated: parsed.multiplyingModifiersAllocated, fragmentCount: parsed.multiplyingModifiersFragmentCount },
    party: { group: parsed.isGroupPlay, size: parsed.groupSize },
  });
}

/** Published rows already contain the current revision's combined observations.
 * raw_export contributes reusable fields only, never stale authored averages. */
export function publishedStrategyImportSource(strategy: Strategy): StrategySetupCode {
  const parsed = strategy.raw_export ? parseDiscordExport(strategy.raw_export) : null;
  const mapType = strategy.map_type ?? parsed?.mapType;
  const chisel = strategy.chisel ?? parsed?.chisel;
  return checked({ version: 1, kind: 'setup', title: strategy.strategy_name ?? parsed?.strategyName ?? 'Imported setup',
    notes: '', league: strategy.league ?? parsed?.league ?? '', mapType: mapType as StrategySetupCode['mapType'],
    chisel: chisel && chisel.toLowerCase() !== 'none' ? chisel : null,
    scarabs: strategy.scarabs?.map((item) => item.name) ?? parsed?.scarabs ?? [],
    delirium: parsed?.deliOrbType ? { type: parsed.deliOrbType, countPerMap: parsed.deliOrbQty || null } : null,
    astrolabe: parsed?.astroType || null,
    atlasTreeUrl: strategy.atlas_tree_url && isSafeStrategyAtlasUrl(strategy.atlas_tree_url) ? strategy.atlas_tree_url : null,
    runRegex: strategy.run_regex ?? parsed?.runRegex ?? '',
    reference: { maps: metric(strategy.evidence_map_count ?? strategy.map_count),
      quantity: metric(strategy.avg_quant), rarity: metric(strategy.avg_rarity),
      packSize: metric(strategy.avg_pack), currency: metric(strategy.avg_currency),
      mapFamily: family(mapType, strategy.type_tag?.split(',').map((tag) => tag.trim()) ?? []),
      slamRegex: strategy.slam_regex ?? parsed?.slamRegex ?? '' },
    multiplyingModifiers: { allocated: parsed?.multiplyingModifiersAllocated ?? null,
      fragmentCount: parsed?.multiplyingModifiersFragmentCount ?? null },
    party: { group: strategy.is_group_play ?? null, size: strategy.group_size ?? (strategy.is_group_play === false ? 1 : null) },
  });
}
