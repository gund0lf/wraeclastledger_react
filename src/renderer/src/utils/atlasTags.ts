import type { AtlasStatGroup } from '../../../shared/atlasStats';

const TITLE_TO_TAG: Record<string, string> = {
  delirium: 'delirium',
  beyond: 'beyond',
  legion: 'legion',
  breach: 'breach',
  harbinger: 'harbinger',
  abyss: 'abyss',
  ritual: 'ritual',
  expedition: 'expedition',
  incursion: 'incursion',
  betrayal: 'betrayal',
  essence: 'essence',
  harvest: 'harvest',
  blight: 'blight',
  heist: 'heist',
  metamorph: 'metamorph',
  ultimatum: 'ultimatum',
  torment: 'torment',
  cartography: 'cartography',
  titanic: 'titanic',
  'eater of worlds': 'eater',
  'the eater': 'eater',
  'the searing exarch': 'exarch',
  'searing exarch': 'exarch',
};

/** Path of Pathing keeps a mechanic heading visible for allocated block nodes.
 * The heading is not positive evidence when its stats say the mechanic cannot
 * occur, so exclude that group before deriving strategy tags. */
export function deriveAtlasDetectedTags(groups: readonly AtlasStatGroup[]): string[] {
  return Array.from(new Set(groups.flatMap((group) => {
    if (group.stats.some((stat) => /\bno chance to contain\b/i.test(stat))) return [];
    const tag = TITLE_TO_TAG[group.title.trim().toLowerCase()];
    return tag ? [tag] : [];
  })));
}
