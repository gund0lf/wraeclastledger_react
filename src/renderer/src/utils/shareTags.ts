import type { MapData, SessionSettings } from '../types';

type ShareTagSettings = Pick<
  SessionSettings,
  'scarabs' | 'atlasDetectedTags' | 'advAstrolabeType'
>;

type ShareTagMap = Pick<
  MapData,
  'isOriginator' | 'isEmpoweredMirage' | 'isNightmare' | 'rawText' | 'deliriousPct'
>;

const SCARAB_TAG_KEYWORDS: ReadonlyArray<readonly [string, string]> = [
  ['delirium', 'delirium'], ['legion', 'legion'], ['breach', 'breach'],
  ['harvest', 'harvest'], ['expedition', 'expedition'], ['ritual', 'ritual'],
  ['abyss', 'abyss'], ['blight', 'blight'], ['beyond', 'beyond'],
  ['incursion', 'incursion'], ['betrayal', 'betrayal'], ['essence', 'essence'],
  ['divination', 'divination'], ['harbinger', 'harbinger'], ['titanic', 'titanic'],
  ['torment', 'torment'], ['ultimatum', 'ultimatum'], ['kalguuran', 'kalguur'],
  ['heist', 'heist'], ['metamorph', 'metamorph'], ['ambush', 'ambush'],
  ['cartography', 'cartography'], ['mercenar', 'mercenaries'], ['trarth', 'trarthus'],
];

function mapSubtypeTag(maps: readonly ShareTagMap[]): string | null {
  if (maps.length === 0) return null;
  const isOriginator = (map: ShareTagMap) => map.isOriginator
    || (map.rawText?.includes("Originator's Memories") ?? false);
  const isEmpowered = (map: ShareTagMap) => map.isEmpoweredMirage
    || (map.rawText?.includes('Empowered Mirage which covers the entire Map') ?? false);
  const isNightmare = (map: ShareTagMap) => map.isNightmare
    || (map.rawText?.includes('Nightmare Map') ?? false);

  const hasOriginator = maps.some(isOriginator);
  const allOriginator = maps.every(isOriginator);
  const hasEmpowered = maps.some(isEmpowered);
  const allEmpowered = maps.every(isEmpowered);
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
  ];
  return variants.find(([keyword]) => normalized.includes(keyword))?.[1] ?? 'astrolabe';
}

/** Derive a fresh initial tag set whenever Share opens. The modal may still be
 * edited manually, but no prior session/open is allowed to seed the next one. */
export function deriveShareTags(
  settings: ShareTagSettings,
  maps: readonly ShareTagMap[],
): string[] {
  const scarabNames = settings.scarabs
    .filter((scarab) => scarab.name)
    .map((scarab) => scarab.name.toLowerCase())
    .join(' ');
  const scarabTags = SCARAB_TAG_KEYWORDS
    .filter(([keyword]) => scarabNames.includes(keyword))
    .map(([, tag]) => tag);
  const tags = Array.from(new Set([...scarabTags, ...(settings.atlasDetectedTags ?? [])]));

  const subtype = mapSubtypeTag(maps);
  if (subtype && !tags.includes(subtype)) tags.unshift(subtype);

  if (maps.some((map) => Number.isInteger(map.deliriousPct)) && !tags.includes('delirium')) {
    tags.push('delirium');
  }

  const astro = astrolabeTag(settings.advAstrolabeType);
  if (astro && !tags.includes(astro)) tags.push(astro);
  return tags;
}
