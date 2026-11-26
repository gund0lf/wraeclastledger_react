import { isStrategySetupCode, type StrategySetupCode } from '../../../shared/strategySetupCode';
import { buildImportedSetupPlan } from './investmentSetup';
import { getManifest } from './gameData';
import type { SessionState } from '../store/useSessionStore';

/** One bounded application plan; no historical counts, prices or author authority. */
export function buildSetupOnlyImportPlan(value: StrategySetupCode) {
  if (!isStrategySetupCode(value)) throw new Error('Unsupported setup code');
  const manifest = getManifest();
  const canonical = (name: string | null | undefined, entries: { name: string }[]) =>
    name ? entries.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase())?.name ?? name.trim() : null;
  const reference = value.reference;
  const commonSource = { authorName: value.title || 'Imported setup', runRegex: value.runRegex,
    mapType: reference?.mapFamily ?? (value.mapType === '8-mod' ? '8mod' : 'regular'),
    ...(reference?.slamRegex ? { slamRegex: reference.slamRegex } : {}) };
  const source: SessionState['loadedStrategyInfo'] = !value.runRegex ? null
    : reference && reference.maps !== null && reference.quantity !== null && reference.rarity !== null
      && reference.packSize !== null && reference.currency !== null
      ? { ...commonSource, kind: 'run', mapCount: reference.maps, avgQuant: reference.quantity,
        avgRarity: reference.rarity, avgPack: reference.packSize, avgCurr: reference.currency }
      : { ...commonSource, kind: 'setup' };
  return {
    ...(value.covens ? { device: {
      threadSlots: value.covens.threads === null ? undefined : Array.from({ length: manifest.leagueRules?.[value.league]?.threadSlots ?? 0 }, (_, i) => {
        const row = value.covens?.threads?.find(t => t.slot === i + 1);
        return row ? { name: manifest.threads?.find(t => t.id === row.id)?.name ?? row.id,
          count: row.paid, granted: row.granted, paused: row.paused, price: 0 } : { name: '', count: 1, price: 0 };
      }),
      ember: { name: manifest.embers?.find(e => e.id === value.covens?.ember)?.name ?? '', price: 0 },
      choices: Object.fromEntries((value.covens.atlas?.choices ?? []).flatMap(c =>
        c.option === null ? [] : [[String(c.node), String(c.option)]])),
    } } : {}),
    investment: buildImportedSetupPlan({
      league: value.league,
      mapType: value.mapType,
      chisel: canonical(value.chisel, manifest.chisels),
      scarabs: value.scarabs.map((name) => canonical(name, manifest.scarabs)!),
      deliriumType: canonical(value.delirium?.type, manifest.deliriumOrbs),
      deliriumCountPerMap: value.delirium?.countPerMap,
      deliriumOrbTypes: value.deliriumOrbTypes?.map(name => manifest.deliriumOrbs.find(o => o.id === name)?.name ?? name),
      astrolabeType: canonical(value.astrolabe, manifest.astrolabes),
    }),
    atlasTreeUrl: value.atlasTreeUrl,
    source,
    multiplyingModifiers: value.multiplyingModifiers ?? { allocated: null, fragmentCount: null },
  };
}
