import type { CovensWire } from '../../../shared/covensWireValidator.mjs';
import type { SetupHistory, StrategySetupCode } from '../../../shared/strategySetupCode';
import type { DiscordImport } from './parseDiscordExport';

export type StrategyImport = { kind: 'setup'; value: StrategySetupCode; atlasDrops?: CovensWire['atlas_drops'] } | { kind: 'discord'; value: DiscordImport };

/** Display model only. Never pass this optional historical data to the session loader. */
export function buildImportPreview(result: StrategyImport) {
  if (result.kind === 'setup') {
    const s = result.value;
    return { atlasDrops: result.atlasDrops ? result.atlasDrops.sum / result.atlasDrops.count : null, title: s.title, notes: s.notes, league: s.league, mapType: s.mapType,
      chisel: s.chisel, scarabs: s.scarabs, delirium: s.delirium, deliriumOrbTypes: s.deliriumOrbTypes, astrolabe: s.astrolabe,
      atlasTreeUrl: s.atlasTreeUrl, runRegex: s.runRegex, slamRegex: s.reference?.slamRegex ?? '', history: s.history ?? null,
      isGroupPlay: s.party?.group === true, groupSize: s.party?.size ?? null, excludedDrops: [], gemInfo: null, operationError: null,
      observedDelirium: null, approximateTotals: undefined as DiscordImport['approximateTotals'] };
  }
  const r = result.value;
  const history: SetupHistory = {
    maps: r.mapCount, runs: null, quantity: r.avgQuant, rarity: r.avgRarity, packSize: r.avgPack,
    currency: r.avgCurr, multiplier: r.multiplier, costPerMap: r.perMapCost,
    totalInvest: r.totalInvest, netProfit: r.netProfit, historicalInvestDivines: null,
    historicalNetDivines: null, netPerMapDivines: r.divPerMap,
    divinePrice: r.divPrice > 0 ? r.divPrice : null, minutes: r.sessionMinutes,
    timedMaps: r.sessionMinutes !== null ? r.mapCount : null, atlasPoints: r.atlasPoints,
    atlasPointsMax: r.atlasPointsMax, scarabPrices: r.scarabs.map((_, index) => r.scarabCosts[index] ?? null),
  };
  return { atlasDrops: r.covens?.atlas_drops ? r.covens.atlas_drops.sum / r.covens.atlas_drops.count : null, title: r.strategyName, notes: r.strategyNotes, league: r.league, mapType: r.mapType,
    chisel: r.chisel === 'None' ? null : r.chisel, scarabs: r.scarabs,
    delirium: r.deliOrbType ? { type: r.deliOrbType, countPerMap: r.deliOrbQty } : null,
    deliriumOrbTypes: undefined,
    astrolabe: r.astroType, atlasTreeUrl: r.atlasTreeUrl, runRegex: r.runRegex, slamRegex: r.slamRegex,
    history, isGroupPlay: r.isGroupPlay, groupSize: r.groupSize, excludedDrops: r.excludedDrops,
    gemInfo: r.gemInfo, operationError: r.operationError,
    observedDelirium: r.observedDelirium ?? null, approximateTotals: r.approximateTotals };
}
export type ImportPreview = ReturnType<typeof buildImportPreview>;
