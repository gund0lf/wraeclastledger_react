import {
  deriveAtlasCalcSettingsSnapshot,
  deriveBestiaryAtlasSetup,
  deriveMercenaryAtlasSetup,
  type AtlasStatGroup,
} from '../../../shared/atlasStats';
import type { SessionSettings } from '../types';
import { deriveAtlasDetectedTags } from './atlasTags';
import { isPathofpathingTreeUrl } from './atlasUrl';
import type { SessionMutationOrigin } from './sessionMutationOrigin';

export type AtlasStatsSyncPatch = Pick<
  SessionSettings,
  | 'smallNodesAllocated'
  | 'mountingModifiers'
  | 'multiplyingModifiersAllocated'
  | 'atlasDetectedTags'
  | 'bestiaryAtlasSetup'
  | 'mercenaryAtlasSetup'
  | 'atlasStatsRead'
>;

export type UpdateSessionSetting = <K extends keyof SessionSettings>(
  key: K,
  value: SessionSettings[K],
  origin?: SessionMutationOrigin,
) => void;

export function hasCurrentAtlasStatsRead(settings: SessionSettings): boolean {
  const read = settings.atlasStatsRead;
  return read !== undefined
    && read.schemaVersion === 1
    && typeof read.sourceUrl === 'string'
    && isPathofpathingTreeUrl(read.sourceUrl)
    && read.sourceUrl === settings.atlasTreeUrl
    && read.leagueName === settings.leagueName
    && typeof read.readAt === 'string'
    && typeof read.calc === 'object'
    && read.calc !== null
    && Number.isFinite(read.calc.smallNodesAllocated)
    && typeof read.calc.mountingModifiers === 'boolean'
    && typeof read.calc.multiplyingModifiersAllocated === 'boolean';
}

/** Build every Atlas-derived session value from one successful read so Calc,
 * Run Statistics, and freshness identity can never drift across call sites. */
export function buildAtlasStatsSyncPatch(
  groups: AtlasStatGroup[],
  sourceUrl: string,
  leagueName: string,
  readAt = new Date().toISOString(),
): AtlasStatsSyncPatch {
  if (!isPathofpathingTreeUrl(sourceUrl)) {
    throw new Error('A complete Path of Pathing tree URL is required for setup sync');
  }
  const calc = deriveAtlasCalcSettingsSnapshot(groups);
  return {
    ...calc,
    atlasDetectedTags: deriveAtlasDetectedTags(groups),
    bestiaryAtlasSetup: deriveBestiaryAtlasSetup(groups),
    mercenaryAtlasSetup: deriveMercenaryAtlasSetup(groups),
    atlasStatsRead: {
      schemaVersion: 1,
      sourceUrl,
      leagueName,
      readAt,
      calc,
    },
  };
}

export function applyAtlasStatsSyncPatch(
  updateSetting: UpdateSessionSetting,
  patch: AtlasStatsSyncPatch,
  origin: SessionMutationOrigin = 'automatic',
): void {
  updateSetting('smallNodesAllocated', patch.smallNodesAllocated, origin);
  updateSetting('mountingModifiers', patch.mountingModifiers, origin);
  updateSetting('multiplyingModifiersAllocated', patch.multiplyingModifiersAllocated, origin);
  updateSetting('atlasDetectedTags', patch.atlasDetectedTags, origin);
  updateSetting('bestiaryAtlasSetup', patch.bestiaryAtlasSetup, origin);
  updateSetting('mercenaryAtlasSetup', patch.mercenaryAtlasSetup, origin);
  updateSetting('atlasStatsRead', patch.atlasStatsRead, origin);
}
