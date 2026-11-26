import type { SessionSettings } from '../types';
import { getManifest } from './gameData';
import { isPathofpathingTreeUrl } from './atlasUrl';

type ChoiceContext = Partial<Pick<SessionSettings, 'atlasTreeUrl' | 'leagueName' | 'atlasChoiceAnswers' | 'atlasStatsRead'>>;

export function allocatedChoiceNodes(sourceUrl: string, allocatedIds?: readonly number[]) {
  if (!isPathofpathingTreeUrl(sourceUrl)) return [];
  const url = new URL(sourceUrl);
  const choices = getManifest().atlasTrees?.[url.searchParams.get('v') ?? '']?.choices;
  if (!choices) return [];
  if (Array.isArray(allocatedIds)) return [...new Set<number>(allocatedIds)].flatMap(id =>
    Number.isInteger(id) && Object.prototype.hasOwnProperty.call(choices, id) ? [{ id: String(id), ...choices[id] }] : []);
  try {
    const encoded = url.hash.slice(1).replaceAll('-', '+').replaceAll('_', '/');
    if (encoded.length > 4096) return [];
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const data = new DataView(bytes.buffer);
    const count = bytes[7];
    if (data.getUint32(0) !== 6 || bytes[6] !== count + bytes[8] + 1 || bytes.length < 11 + 2 * bytes[6]) return [];
    const ids = Array.from({ length: count }, (_, i) => String(data.getUint16(9 + i * 2)));
    return [...new Set(ids)].flatMap(id => choices[id] ? [{ id, ...choices[id] }] : []);
  } catch { return []; }
}

export function currentChoiceSelections(settings: ChoiceContext) {
  const answers = settings.atlasChoiceAnswers;
  if (!answers || !settings.atlasTreeUrl || answers.sourceUrl !== settings.atlasTreeUrl
    || answers.leagueName !== settings.leagueName || settings.atlasStatsRead?.sourceUrl !== answers.sourceUrl
    || settings.atlasStatsRead.leagueName !== answers.leagueName) return [];
  return allocatedChoiceNodes(answers.sourceUrl, settings.atlasStatsRead?.choiceNodeIds).flatMap(node =>
    node.options.filter(option => option.id === answers.effects?.[node.id]).map(option => ({ nodeId: node.id, option })));
}

export function currentChoiceEffects(settings: ChoiceContext) {
  return currentChoiceSelections(settings).map(({ option }) => option.text);
}
