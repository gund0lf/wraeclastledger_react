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
    investment: buildImportedSetupPlan({
      mapType: value.mapType,
      chisel: canonical(value.chisel, manifest.chisels),
      scarabs: value.scarabs.map((name) => canonical(name, manifest.scarabs)!),
      deliriumType: canonical(value.delirium?.type, manifest.deliriumOrbs),
      deliriumCountPerMap: value.delirium?.countPerMap,
      astrolabeType: canonical(value.astrolabe, manifest.astrolabes),
    }),
    atlasTreeUrl: value.atlasTreeUrl,
    source,
    multiplyingModifiers: value.multiplyingModifiers ?? { allocated: null, fragmentCount: null },
  };
}
