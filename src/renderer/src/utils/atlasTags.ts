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
  bestiary: 'bestiary',
  essence: 'essence',
  harvest: 'harvest',
  blight: 'blight',
  heist: 'heist',
  metamorph: 'metamorph',
  ultimatum: 'ultimatum',
  torment: 'torment',
  cartography: 'cartography',
  titanic: 'titanic',
  mercenaries: 'trarthus',
  'settlers of kalguur': 'kalguur',
  'eater of worlds': 'eater',
  'the eater': 'eater',
  'the searing exarch': 'exarch',
  'searing exarch': 'exarch',
};

export const MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG = 50;

const ENCOUNTER_CHANCE_RE = /\+(\d+)% chance to (?:contain|be inhabited by)\b/i;
const SCARAB_DROP_CHANCE_RE =
  /^Scarabs dropped in your Maps have \d+% increased chance to be .+ Scarabs$/i;

/** A small travel node commonly contributes only encounter chance plus the
 * mirrored scarab-drop weighting. Treat that pair as incidental below 50%.
 * Any other mechanic-specific effect is evidence of deliberate investment,
 * while direct scarabs are handled independently by shareTags. */
function hasMeaningfulPositiveEvidence(stats: readonly string[]): boolean {
  const encounterChance = stats.reduce((sum, stat) => {
    const match = stat.trim().match(ENCOUNTER_CHANCE_RE);
    return sum + (match ? Number.parseInt(match[1], 10) : 0);
  }, 0);

  if (encounterChance === 0 || encounterChance >= MIN_ATLAS_ENCOUNTER_CHANCE_FOR_TAG) {
    return true;
  }

  return stats.some((stat) => {
    const normalized = stat.trim();
    return !ENCOUNTER_CHANCE_RE.test(normalized) && !SCARAB_DROP_CHANCE_RE.test(normalized);
  });
}

/** Path of Pathing keeps a mechanic heading visible for allocated block nodes.
 * The heading is not positive evidence when its stats say the mechanic cannot
 * occur. Low encounter-chance-only travel allocation is also not enough to
 * describe a strategy, so exclude both forms before deriving tags. */
export function deriveAtlasDetectedTags(groups: readonly AtlasStatGroup[]): string[] {
  return Array.from(new Set(groups.flatMap((group) => {
    if (group.stats.some((stat) => /\bno chance to contain\b/i.test(stat))) return [];
    const tag = TITLE_TO_TAG[group.title.trim().toLowerCase()];
    return tag && hasMeaningfulPositiveEvidence(group.stats) ? [tag] : [];
  })));
}
