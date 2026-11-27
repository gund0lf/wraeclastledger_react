import { isLedgerAtlasUrl } from '../../../shared/atlasReaderSafety';
import type { CovensWire } from '../../../shared/covensWireValidator.mjs';
import type { MapData, SessionSettings } from '../types';
import { allocatedChoiceNodes, currentChoiceSelections } from './atlasChoices';
import { buildAtlasStatsSyncPatch, hasCurrentAtlasStatsRead, readAtlasStatsForLeague } from './atlasStatsSync';
import { isPathofpathingTreeUrl } from './atlasUrl';
import { getManifest } from './gameData';
import { deriveShareTags } from './shareTags';

export function recordedAtlasChoices(settings: SessionSettings): CovensWire['atlas'] {
  const version = getManifest().leagueRules?.[settings.leagueName]?.atlasTreeVersion;
  const read = settings.atlasStatsRead;
  if (!version || !hasCurrentAtlasStatsRead(settings) || !Array.isArray(read?.choiceNodeIds)) return null;
  const answers = new Map(currentChoiceSelections(settings).map(choice => [choice.nodeId, Number(choice.option.id)]));
  if (isLedgerAtlasUrl(read.sourceUrl)) {
    const selected = [...answers].sort(([a], [b]) => Number(a) - Number(b))
      .map(([node, effect]) => node + '-' + effect).join('.');
    if (selected !== (new URL(read.sourceUrl).searchParams.get('choices') ?? '')) return null;
  }
  return {
    version,
    choices: allocatedChoiceNodes(read.sourceUrl, read.choiceNodeIds).map(node => ({
      node: Number(node.id), option: answers.get(node.id) ?? null,
    })),
  };
}

export function needsAtlasShareReview(settings: SessionSettings): boolean {
  return Boolean(getManifest().leagueRules?.[settings.leagueName]?.threadSlots)
    && isPathofpathingTreeUrl(settings.atlasTreeUrl) && recordedAtlasChoices(settings) === null;
}

export interface AtlasShareReview {
  atlas: CovensWire['atlas'];
  tags: string[];
}

export async function reviewAtlasForShare(settings: SessionSettings, maps: readonly MapData[],
  choice: 'sync' | 'recorded', signal: AbortSignal): Promise<AtlasShareReview | undefined> {
  if (signal.aborted) return;
  if (choice === 'recorded') {
    return { atlas: null, tags: deriveShareTags({ ...settings, atlasDetectedTags: [], atlasStatsRead: undefined }, maps) };
  }
  const url = settings.atlasTreeUrl;
  const result = await readAtlasStatsForLeague(url, settings.leagueName);
  if (signal.aborted) return;
  if (!result.groups) throw new Error(result.error || 'Could not read the Atlas tree.');
  if (!Array.isArray(result.allocatedNodeIds)) throw new Error('Full allocation unavailable. Try syncing again or share as recorded.');
  // Project the read onto the share only. Recomputing the recorded run with
  // new Atlas cost modifiers would change its reported investment and profit.
  const patch = buildAtlasStatsSyncPatch(result.groups, url, settings.leagueName, undefined, result.allocatedNodeIds, undefined, result.choiceEffects, settings.atlasChoiceAnswers);
  const snapshot = { ...settings, ...patch };
  return { atlas: recordedAtlasChoices(snapshot), tags: deriveShareTags(snapshot, maps) };
}
