import type { MapData, SessionSettings } from '../types';
import { getManifest } from './gameData';
import { recordedAtlasChoices } from './atlasShareReview';
import { deviceInvestment } from './profit';
import { summarizeConfirmedEncounters } from './runStatistics';
import { summarizeObservedDelirium } from './deliriumMetadata';
import { validCovens, type CovensWire } from '../../../shared/covensWireValidator.mjs';

const price = (amount: number | null) => amount === null ? null : { unit: 'chaos' as const, amount };

function observed(maps: readonly MapData[], key: 'atlasDrops' | 'moreThreads') {
  const values = maps.flatMap(map => map[key] == null ? [] : [map[key]!]);
  return values.length ? { sum: values.reduce((a,b) => a+b, 0), count: values.length } : null;
}

export function buildCovensShare(settings: SessionSettings, maps: readonly MapData[], reviewedAtlas?: CovensWire['atlas']): CovensWire | null {
  const manifest = getManifest();
  const rules = manifest.leagueRules?.[settings.leagueName];
  if (!rules?.threadSlots || manifest.patchVersion !== '3.30') return null;
  if (!settings.deliriumOrbSpend && settings.advDeliOrbType && settings.advDeliOrbQtyPerMap > 0)
    throw new Error('This session’s Delirium Orb cost was saved as an estimate per map. To share it, use Duplicate as new in Sessions. On the copy, open Investment → Advanced Costs → Delirium Orbs, clear Orb Type and enter the orbs you actually used. The original keeps its estimate.');
  const findId = (items: readonly { name: string; id: string }[] | undefined, name: string) => {
    const item = items?.find(row => row.name === name);
    if (!item) throw new Error('A configured item is missing from the sharing catalogue.');
    return item.id;
  };
  const device = deviceInvestment(settings);
  const attributed = device.activeSlots.reduce((sum, slot) => sum + (slot?.name ? slot.granted ?? 0 : 0), 0);
  if (device.effective - device.paid > attributed)
    throw new Error('Enter the granted Threads by type in Investment before sharing this Atlas setup.');
  const delirium = summarizeObservedDelirium(maps);
  const { readable, counts } = summarizeConfirmedEncounters(maps);
  const data: CovensWire = {
    version: 1, atlas_drops: observed(maps, 'atlasDrops'), more_threads: observed(maps, 'moreThreads'),
    threads: settings.threadSlots?.flatMap((slot, i) => slot?.name ? [{
      slot: i+1, id: findId(manifest.threads, slot.name), paid: slot.count, granted: device.oneType && i === 0 ? device.atlasGrant : slot.granted ?? 0,
      paused: Boolean(slot.paused || (device.oneType && i > 0)), price_each: price(slot.price || null),
    }] : []) ?? null,
    ember: settings.ember?.name ? {id: findId(manifest.embers,settings.ember.name), price_each: price(settings.ember.price || null)} : null,
    atlas: reviewedAtlas === undefined ? recordedAtlasChoices(settings) : reviewedAtlas,
    orbs: settings.deliriumOrbSpend?.map(row => ({id: findId(manifest.deliriumOrbs,row.type), used: row.count, price_each: price(row.priceEach)})) ?? null,
    delirium: delirium ? {resolution:'exact', levels: delirium.levelCounts.map(v => [v.percentage,v.count]),
      rewards: delirium.rewardCounts.map(v => [v.name.toLowerCase(),v.count])} : null,
    encounters: { readable, unknown: maps.length-readable, confirmed: counts },
  };
  if (!validCovens(data, maps.length)) throw new Error('The captured setup exceeds the supported Covens sharing format.');
  return data;
}
