export type ItemCategory =
  | 'Currency' | 'Fragments' | 'Scarabs' | 'Divination Cards'
  | 'Essences' | 'Deliriums' | 'Oils' | 'Incubators'
  | 'Unique Weapons' | 'Unique Armours' | 'Unique Accessories'
  | 'Unique Flasks' | 'Unique Jewels' | 'Maps' | 'Gems'
  | 'Beasts' | 'League' | 'Other';

export const CAT_COLORS: Partial<Record<ItemCategory, string>> = {
  Currency: 'yellow',
  Scarabs: 'teal',
  'Divination Cards': 'violet',
  Maps: 'blue',
  Essences: 'pink',
  Fragments: 'cyan',
  Gems: 'green',
  Beasts: 'orange',
  League: 'grape',
  Oils: 'lime',
  Deliriums: 'indigo',
};

const RULES: [RegExp | ((name: string, tab: string) => boolean), ItemCategory][] = [
  [(_, t) => t === 'curr',  'Currency'],
  [(_, t) => t === 'ess',   'Essences'],
  [(_, t) => t === 'oil',   'Oils'],
  [(_, t) => t === 'inc',   'Incubators'],
  [(_, t) => t === 'card',  'Divination Cards'],
  [(_, t) => t === 'gem',   'Gems'],
  [(_, t) => t === 'map',   'Maps'],
  [/scarab/i,               'Scarabs'],
  [/delirium orb/i,         'Deliriums'],
  [/\boil\b/i,              'Oils'],
  [/essence/i,              'Essences'],
  [/incubator/i,            'Incubators'],
  [/splinter|emblem|fragment|relic|vessel/i, 'Fragments'],
  [/chisel|orb|chaos|divine|exalted|vaal|scouring|alch|annulment|regal|alteration|augmentation|transmutation/i, 'Currency'],
  [/coin|wombgift|runegraft|allflame|omen/i, 'League'],
  [/fossil|resonator/i,     'League'],
  [/map$/i,                 'Maps'],
  [/support$|vaal |awakened /i, 'Gems'],
];

export function categorise(name: string, tab: string): ItemCategory {
  for (const [rule, cat] of RULES) {
    if (typeof rule === 'function') { if (rule(name, tab)) return cat; }
    else if (rule.test(name)) return cat;
  }
  return 'Other';
}

export function buildCategoryBreakdown(
  items: { name: string; tab: string; total: number; excluded: boolean }[]
): Map<ItemCategory, number> {
  const map = new Map<ItemCategory, number>();
  for (const item of items) {
    if (item.excluded) continue;
    const cat = categorise(item.name, item.tab);
    map.set(cat, (map.get(cat) ?? 0) + item.total);
  }
  return map;
}
