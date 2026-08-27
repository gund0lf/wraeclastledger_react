import type { SessionLifecycle } from '../../../shared/sessionRepositoryIpc';
import type { FragmentCountSource } from './profit';
import { MIN_OBSERVED_MOD_SAMPLE, computeObservedModSample } from './profit';
import type { MapData, SessionSettings } from '../types';
import { isCrossLeagueSession } from './historicalSession';
import { hasCurrentAtlasStatsRead } from './atlasStatsSync';

export type AtlasSyncState =
  | 'never-read'
  | 'current'
  | 'changed-since-read'
  | 'previous-league'
  | 'legacy-imported';

export function shouldShowAtlasSyncGuidance(
  state: AtlasSyncState,
  options: {
    syncUnavailable: boolean;
    legacyNoticeDismissed: boolean;
  },
): boolean {
  if (options.syncUnavailable) return true;
  if (state === 'current') return false;
  if (state === 'legacy-imported') return !options.legacyNoticeDismissed;
  return true;
}

export function atlasSyncState(
  settings: SessionSettings,
  lifecycle: SessionLifecycle,
): AtlasSyncState {
  const read = settings.atlasStatsRead;
  const hasLegacyEvidence = settings.mountingModifiers
    || settings.multiplyingModifiersAllocated
    || settings.smallNodesAllocated > 0
    || settings.atlasDetectedTags.length > 0
    || settings.bestiaryAtlasSetup !== undefined
    || settings.mercenaryAtlasSetup !== undefined;

  if (isCrossLeagueSession(lifecycle, settings.leagueName) && (read || hasLegacyEvidence)) {
    return 'previous-league';
  }
  if (!read) return hasLegacyEvidence ? 'legacy-imported' : 'never-read';
  return hasCurrentAtlasStatsRead(settings) ? 'current' : 'changed-since-read';
}

export interface MapModifierSource {
  observed: boolean;
  value: string;
  source: string;
  detail: string;
}

export function describeMapModifierSource(
  maps: readonly Pick<MapData, 'explicitModCount' | 'isUnidentified'>[],
  mapType: SessionSettings['mapType'],
): MapModifierSource {
  const observed = computeObservedModSample(maps);
  if (observed) {
    return {
      observed: true,
      value: `${observed.average.toFixed(1)} observed`,
      source: `Map Log · ${observed.sampleSize}/${maps.length} advanced copies`,
      detail: 'Every map has an exact modifier count, so this session average drives the multiplier.',
    };
  }

  const unidentified = maps.filter((map) => map.isUnidentified).length;
  const exact = maps.filter((map) => map.explicitModCount != null).length;
  const reason = maps.length === 0
    ? 'No captured maps yet.'
    : maps.length < MIN_OBSERVED_MOD_SAMPLE
      ? `Needs at least ${MIN_OBSERVED_MOD_SAMPLE} captured maps.`
      : unidentified > 0
        ? `${unidentified} unidentified ${unidentified === 1 ? 'map prevents' : 'maps prevent'} complete coverage.`
        : `${exact}/${maps.length} maps have an exact advanced-copy modifier count.`;
  return {
    observed: false,
    value: mapType,
    source: 'Compatibility fallback',
    detail: `${reason} The retained ${mapType} session value drives the multiplier until coverage is complete.`,
  };
}

export function fragmentSourceLabel(source: FragmentCountSource, count: number): string {
  switch (source) {
    case 'observed':
      return `Investment · ${count} occupied ${count === 1 ? 'slot' : 'slots'}`;
    case 'override':
      return `Legacy/imported fallback · ${count} ${count === 1 ? 'fragment' : 'fragments'}`;
    case 'default':
      return `Device-capacity fallback · ${count} slots`;
    case 'off':
      return 'Atlas Tree · Multiplying Modifiers off';
  }
}
