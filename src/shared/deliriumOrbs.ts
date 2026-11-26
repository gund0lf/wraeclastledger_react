import { BUNDLED_MANIFEST } from './gameData/manifest';

export const LEGACY_DELIRIUM_ORB_LIMIT = 5;

export function deliriumOrbRule(league: string | undefined, manifest = BUNDLED_MANIFEST) {
  const key = league?.trim().toLowerCase();
  const entry = Object.entries(manifest.leagueRules ?? {}).find(([name]) => name.toLowerCase() === key);
  return entry?.[1].deliriumOrbs ?? (manifest.legacyDeliriumLayerLeagues?.some(name => name.toLowerCase() === key) ? 'layers' : undefined);
}

export function paidDeliriumOrbLimit(league: string | undefined, manifest = BUNDLED_MANIFEST): number {
  return deliriumOrbRule(league, manifest) === 'reforge' ? Number.MAX_SAFE_INTEGER : LEGACY_DELIRIUM_ORB_LIMIT;
}

export function fixedDeliriumPercentage(league: string, count: number | null, manifest = BUNDLED_MANIFEST): number | null {
  return deliriumOrbRule(league, manifest) === 'layers' && count !== null && Number.isInteger(count)
    && count >= 1 && count <= LEGACY_DELIRIUM_ORB_LIMIT ? count * 20 : null;
}
