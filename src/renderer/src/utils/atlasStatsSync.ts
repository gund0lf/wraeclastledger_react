import {
  deriveAtlasCalcSettingsSnapshot,
  deriveBestiaryAtlasSetup,
  deriveMercenaryAtlasSetup,
  type AtlasStatGroup,
  type AtlasStatsReadResult,
} from '../../../shared/atlasStats';
import type { SessionSettings } from '../types';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { getManifest } from './gameData';
import { allocatedChoiceNodes } from './atlasChoices';
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
  | 'atlasChoiceAnswers'
  | 'atlasStatsRead'
>;

export type UpdateSessionSetting = <K extends keyof SessionSettings>(
  key: K,
  value: SessionSettings[K],
  origin?: SessionMutationOrigin,
) => void;

export function incompatibleAtlasVersion(sourceUrl: string, league: string): string | undefined {
  const required = getManifest().leagueRules?.[league]?.atlasTreeVersion
    ?? BUNDLED_MANIFEST.leagueRules?.[league]?.atlasTreeVersion;
  if (required && new URL(sourceUrl).searchParams.get('v') !== required) return required;
  return undefined;
}

function assertSyncSource(sourceUrl: string, leagueName: string): void {
  if (!isPathofpathingTreeUrl(sourceUrl)) {
    throw new Error('A complete Atlas planner tree URL is required for setup sync');
  }
  const required = incompatibleAtlasVersion(sourceUrl, leagueName);
  if (required) throw new Error(`Open a ${required} tree to sync Atlas bonuses for ${leagueName}.`);
}

export async function readAtlasStatsForLeague(sourceUrl: string, leagueName: string): Promise<AtlasStatsReadResult> {
  assertSyncSource(sourceUrl, leagueName);
  return window.api.readAtlasTreeStats(sourceUrl);
}

export function hasCurrentAtlasStatsRead(settings: SessionSettings): boolean {
  const read = settings.atlasStatsRead;
  return read !== undefined
    && read.schemaVersion === 1
    && typeof read.sourceUrl === 'string'
    && isPathofpathingTreeUrl(read.sourceUrl)
    && !incompatibleAtlasVersion(read.sourceUrl, settings.leagueName)
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
  allocatedNodeIds?: number[],
  authoredUrl = sourceUrl,
  choiceEffects?: Record<string, string>,
  savedAnswers?: SessionSettings['atlasChoiceAnswers'],
): AtlasStatsSyncPatch {
  assertSyncSource(sourceUrl, leagueName);
  if (authoredUrl !== sourceUrl && isPathofpathingTreeUrl(authoredUrl)) assertSyncSource(authoredUrl, leagueName);
  if (choiceEffects && savedAnswers?.sourceUrl === sourceUrl && savedAnswers.leagueName === leagueName
    && Object.entries(savedAnswers.effects).some(([node, effect]) => effect && choiceEffects[node] !== effect)) {
    throw new Error('The saved Atlas choices differ from the planner link. Choose Sync setup on the Atlas tree to use its choices.');
  }
  const calc = deriveAtlasCalcSettingsSnapshot(groups);
  return {
    ...calc,
    ...(choiceEffects && { atlasChoiceAnswers: { sourceUrl, leagueName, effects: choiceEffects } }),
    atlasDetectedTags: deriveAtlasDetectedTags(groups),
    bestiaryAtlasSetup: deriveBestiaryAtlasSetup(groups),
    mercenaryAtlasSetup: deriveMercenaryAtlasSetup(groups),
    atlasStatsRead: {
      schemaVersion: 1,
      sourceUrl,
      leagueName,
      readAt,
      ...(allocatedNodeIds && { choiceNodeIds: allocatedChoiceNodes(sourceUrl, allocatedNodeIds).map(node => Number(node.id)) }),
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
  if (patch.atlasChoiceAnswers) updateSetting('atlasChoiceAnswers', patch.atlasChoiceAnswers, origin);
  updateSetting('atlasStatsRead', patch.atlasStatsRead, origin);
}
