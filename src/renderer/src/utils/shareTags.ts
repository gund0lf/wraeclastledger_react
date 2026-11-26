import { deviceInvestment } from './profit';
import { currentChoiceEffects } from './atlasChoices';
import { getManifest } from './gameData';
import { confirmedMapEncounters } from './mapParser';
import { PUBLIC_STRATEGY_TAG_LIMIT } from './strategyConstants';
import type { MapData, SessionSettings } from '../types';

type ShareTagSettings = Pick<
  SessionSettings,
  'scarabs' | 'threadSlots' | 'atlasDetectedTags' | 'advAstrolabeType' | 'atlasChoiceAnswers' | 'atlasStatsRead'
> & Partial<Pick<SessionSettings, 'atlasTreeUrl' | 'leagueName'>>;

type ShareTagMap = Pick<
  MapData,
  'isOriginator' | 'isEmpoweredMirage' | 'isNightmare' | 'rawText' | 'deliriousPct' | 'confirmedEncounters'
>;

const SCARAB_TAG_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['delirium', ['delirium']], ['legion', ['legion']], ['breach', ['breach']],
  ['harvest', ['harvest']], ['expedition', ['expedition']], ['ritual', ['ritual']],
  ['abyss', ['abyss']], ['blight', ['blight']], ['beyond', ['beyond']],
  ['incursion', ['incursion']], ['betrayal', ['betrayal']], ['bestiary', ['bestiary']],
  ['essence', ['essence']], ['divination', ['divination']], ['harbinger', ['harbinger']],
  ['titanic', ['titanic']], ['torment', ['torment']], ['ultimatum', ['ultimatum']],
  ['kalguuran', ['kalguur']], ['heist', ['heist']], ['metamorph', ['metamorph']],
  ['ambush', ['ambush']], ['anarchy', ['anarchy']], ['cartography', ['cartography']],
  ['mercenar', ['trarthus']],
  // Mercenaries is the encounter name; Trarthus is the one strategy taxonomy
  // label shared by direct Mercenary names and the Trarthan scarab family.
  ['trarth', ['trarthus']],
];

const choiceTagsByEffect: Readonly<Record<string, string | undefined>> = {
  'contain ore deposits': 'kalguur', 'contain a strongbox': 'ambush',
  'be inhabited by a mercenary': 'trarthus', 'contain a rogue exile': 'anarchy',
  'contain a buried sentinel': 'sentinel', 'contain the viridian wildwood': 'wildwood',
  'contain a demonic evocator': 'beyond', 'contain a mirror of delirium': 'delirium',
  'contain sacred flora': 'harvest', 'be haunted by a tormented spirit': 'torment',
  'contain an imprisoned monster': 'essence', 'contain a shrine': 'shrine',
};

function modernMapPool(league: string | undefined) {
  return getManifest().leagueRules?.[league ?? '']?.atlasDrops === true;
}

export function shareTagIssue(tags: readonly string[], league: string, observed: readonly string[]): string | null {
  if (tags.length > PUBLIC_STRATEGY_TAG_LIMIT) return `The public browser shows up to ${PUBLIC_STRATEGY_TAG_LIMIT} tags. Remove ${tags.length - PUBLIC_STRATEGY_TAG_LIMIT} to share this selection.`;
  if (tags.includes('mirage') && !observed.includes('mirage')) return 'The Mirage tag requires a captured map with the explicit “Area contains a Mirage” modifier. Remove Mirage to share without it.';
  if (modernMapPool(league) && tags.some(tag => tag === 'empowered' || tag === 'empowered-originator')) {
    return 'Empowered Mirage is a historical map type. Remove its tag before sharing this strategy.';
  }
  return null;
}

function mapSubtypeTag(maps: readonly ShareTagMap[], modern: boolean): string | null {
  if (maps.length === 0) return null;
  const isOriginator = (map: ShareTagMap) => map.isOriginator
    || (map.rawText?.includes("Originator's Memories") ?? false);
  const isEmpowered = (map: ShareTagMap) => map.isEmpoweredMirage
    || (map.rawText?.includes('Empowered Mirage which covers the entire Map') ?? false);
  const isNightmare = (map: ShareTagMap) => map.isNightmare
    || (map.rawText?.includes('Nightmare Map') ?? false);

  const hasOriginator = maps.some(isOriginator);
  const allOriginator = maps.every(isOriginator);
  const hasEmpowered = !modern && maps.some(isEmpowered);
  const allEmpowered = !modern && maps.every(isEmpowered);
  const hasNightmare = maps.some(isNightmare);

  if (hasNightmare && maps.every(isNightmare)) return 'nightmare';
  if (allOriginator && allEmpowered) return 'empowered-originator';
  if (allOriginator && !hasEmpowered) return 'originator';
  if (allEmpowered && !hasOriginator) return 'empowered';
  if (!hasOriginator && !hasEmpowered && !hasNightmare) return 'regular';
  return 'mixed';
}

function astrolabeTag(name: string): string | null {
  if (!name) return null;
  const normalized = name.toLowerCase();
  const variants: ReadonlyArray<readonly [string, string]> = [
    ['templar', 'astrolabe-templar'], ['deceptive', 'astrolabe-deceptive'],
    ['enshrouded', 'astrolabe-enshrouded'], ['timeless', 'astrolabe-timeless'],
    ['grasping', 'astrolabe-grasping'], ['nameless', 'astrolabe-nameless'],
    ['runic', 'astrolabe-runic'], ['fruiting', 'astrolabe-fruiting'],
    ['fungal', 'astrolabe-fungal'], ['chaotic', 'astrolabe-chaotic'],
    ['lightless', 'astrolabe-lightless'],
    ['immortal', 'astrolabe-immortal'], ['feral', 'astrolabe-feral'],
    ['royal', 'astrolabe-royal'], ['cryptic', 'astrolabe-cryptic'],
  ];
  return variants.find(([keyword]) => normalized.includes(keyword))?.[1] ?? 'astrolabe';
}

/** Derive a fresh initial tag set whenever Share opens. The modal may still be
 * edited manually, but no prior session/open is allowed to seed the next one. */
export function deriveShareTags(
  settings: ShareTagSettings,
  maps: readonly ShareTagMap[],
): string[] {
  const scarabNames = [...settings.scarabs, ...deviceInvestment(settings).activeSlots.filter(slot => slot && (slot.count > 0 || (slot.granted ?? 0) > 0))]
    .filter((scarab) => scarab.name)
    .map((scarab) => scarab.name.toLowerCase())
    .join(' ');
  const scarabTags = SCARAB_TAG_KEYWORDS
    .filter(([keyword]) => scarabNames.includes(keyword))
    .flatMap(([, tags]) => tags);
  const choiceTags = currentChoiceEffects(settings).flatMap(text => {
    const effect = text.match(/\d+% (?:increased |surpassing )?chance to (.+)$/i)?.[1].toLowerCase();
    const tag = effect && choiceTagsByEffect[effect];
    return tag ? [tag] : [];
  });
  const tags = Array.from(new Set([...choiceTags, ...scarabTags, ...(settings.atlasDetectedTags ?? []).filter(tag => tag !== 'mirage')]));

  const modern = modernMapPool(settings.leagueName);
  if (modern) {
    for (const map of maps) {
      for (const family of confirmedMapEncounters(map) ?? []) {
        if (!tags.includes(family)) tags.push(family);
      }
    }
  }
  const subtype = mapSubtypeTag(maps, modern);
  if (subtype && !tags.includes(subtype)) tags.unshift(subtype);

  if (maps.some((map) => Number.isInteger(map.deliriousPct)) && !tags.includes('delirium')) {
    tags.push('delirium');
  }

  const astro = astrolabeTag(settings.advAstrolabeType);
  if (astro && !tags.includes(astro)) tags.push(astro);
  return tags;
}
