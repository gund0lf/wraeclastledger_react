import { isLedgerAtlasUrl } from '../../../shared/atlasReaderSafety';
import type { CovensWire } from '../../../shared/covensWireValidator.mjs';
import type { MapData, SessionSettings } from '../types';
import { allocatedChoiceNodes, currentChoiceSelections } from './atlasChoices';
import { buildAtlasStatsSyncPatch, hasCurrentAtlasStatsRead, readAtlasStatsForLeague } from './atlasStatsSync';
import { isPathofpathingTreeUrl } from './atlasUrl';
import { getManifest } from './gameData';
import { deriveShareTags } from './shareTags';

export function atlasChoiceRows(settings: SessionSettings) {
  const read = settings.atlasStatsRead;
  if (!read || !hasCurrentAtlasStatsRead(settings) || !Array.isArray(read.choiceNodeIds)) return [];
  const ledger = isLedgerAtlasUrl(read.sourceUrl);
  const encoded = new URL(read.sourceUrl).searchParams.get('choices') ?? '';
  const tree = new Map(encoded.split('.').map(pair => pair.split('-') as [string, string]));
  const saved = new Map(currentChoiceSelections(settings).map(row => [row.nodeId, row.option]));
  return allocatedChoiceNodes(read.sourceUrl, read.choiceNodeIds).map(node => {
    const selected = saved.get(node.id);
    const option = ledger ? node.options.find(item => item.id === tree.get(node.id)) : selected;
    return { id: node.id, name: node.name, value: option?.text ?? '–', saved: selected?.text ?? '–',
      differs: ledger && selected?.id !== option?.id };
  });
}

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
      node: Number(node.id), option: isLedgerAtlasUrl(read.sourceUrl) ? answers.get(node.id) ?? null : null,
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
  repairedAnswers?: SessionSettings['atlasChoiceAnswers'];
}

export async function reviewAtlasForShare(settings: SessionSettings, maps: readonly MapData[],
  choice: 'sync' | 'recorded' | 'adopt', signal: AbortSignal): Promise<AtlasShareReview | undefined> {
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
  const patch = buildAtlasStatsSyncPatch(result.groups, url, settings.leagueName, undefined, result.allocatedNodeIds, undefined, result.choiceEffects, choice === 'adopt' ? undefined : settings.atlasChoiceAnswers);
  const snapshot = { ...settings, ...patch };
  const atlas = recordedAtlasChoices(snapshot);
  if (choice === 'adopt' && (!atlas || !patch.atlasChoiceAnswers)) throw new Error('The tree choices could not be verified. Try syncing the tree again.');
  const tagSource = isLedgerAtlasUrl(url) ? snapshot : { ...snapshot, atlasChoiceAnswers: undefined };
  return { atlas, tags: deriveShareTags(tagSource, maps),
    ...(choice === 'adopt' && { repairedAnswers: patch.atlasChoiceAnswers }) };

}
