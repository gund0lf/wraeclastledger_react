import type { SessionLifecycle } from '../../../shared/sessionRepositoryIpc';
import type { FragmentCountSource } from './profit';
import { computeObservedModSample } from './profit';
import type { MapData, SessionSettings } from '../types';
import { isCrossLeagueSession } from './historicalSession';
import { hasCurrentAtlasStatsRead } from './atlasStatsSync';

export type AtlasSyncState =
  | 'never-read'
  | 'current'
  | 'changed-since-read'
  | 'previous-league'
  | 'legacy-imported';

export interface AtlasSyncPresentation {
  label: string;
  color: 'green' | 'yellow' | 'gray';
  detail: string;
}

export function atlasSyncPresentation(state: AtlasSyncState): AtlasSyncPresentation {
  switch (state) {
    case 'current':
      return { label: 'Synced', color: 'green', detail: 'Derived inputs match the saved Atlas Tree.' };
    case 'changed-since-read':
      return { label: 'Tree changed', color: 'yellow', detail: 'The tree URL changed after the last successful setup sync.' };
    case 'previous-league':
      return { label: 'Previous league', color: 'yellow', detail: 'This setup belongs to a previous league session.' };
    case 'legacy-imported':
      return { label: 'Legacy / imported', color: 'yellow', detail: 'Stored values are retained, but no successful Atlas sync identity exists.' };
    case 'never-read':
      return { label: 'Not synced', color: 'gray', detail: 'No successful Atlas setup sync has been recorded for this session.' };
  }
}

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
      source: `Map Log · ${observed.sampleSize}/${maps.length} exact counts`,
      detail: 'Every map has an exact modifier count, so this session average drives the multiplier.',
    };
  }

  const unidentified = maps.filter((map) => map.isUnidentified).length;
  const exact = maps.filter((map) => map.explicitModCount != null).length;
  const reason = maps.length === 0
    ? 'No captured maps yet.'
    : unidentified > 0
      ? `${unidentified} unidentified ${unidentified === 1 ? 'map prevents' : 'maps prevent'} complete coverage.`
      : `${exact}/${maps.length} maps have an exact modifier count.`;
  return {
    observed: false,
    value: mapType,
    source: maps.length === 0
      ? 'Provisional compatibility value'
      : `Map Log · ${exact}/${maps.length} exact counts`,
    detail: `${reason} The retained ${mapType} session value is only a fallback until every captured map has exact modifier-count data.`,
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
