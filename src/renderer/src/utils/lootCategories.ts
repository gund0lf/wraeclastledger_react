import type { LootCategory } from '../types';
import { valuableBeastName } from './runStatistics';

export type ItemCategory = LootCategory;

export const ITEM_CATEGORIES: ItemCategory[] = [
  'Currency', 'Fragments', 'Scarabs', 'Divination Cards',
  'Essences', 'Deliriums', 'Oils', 'Incubators',
  'Unique Weapons', 'Unique Armours', 'Unique Accessories',
  'Unique Flasks', 'Unique Jewels', 'Maps', 'Gems',
  'Beasts', 'League', 'Other',
];

const CATEGORY_DISPLAY_LABELS: Partial<Record<ItemCategory, string>> = {
  // Wire/storage keeps the established category key; this is presentation only.
  'Unique Accessories': 'Unique Jewellery',
};

export const lootCategoryLabel = (category: ItemCategory): string => (
  CATEGORY_DISPLAY_LABELS[category] ?? category
);

export const ITEM_CATEGORY_OPTIONS = ITEM_CATEGORIES.map((category) => ({
  value: category,
  label: lootCategoryLabel(category),
}));

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

const RULES: [RegExp | ((name: string) => boolean), ItemCategory][] = [
  [/scarab/i,               'Scarabs'],
  [/delirium orb/i,         'Deliriums'],
  [/\boil\b/i,              'Oils'],
  [/essence/i,              'Essences'],
  [/incubator/i,            'Incubators'],
  [(name) => valuableBeastName(name) !== null, 'Beasts'],
  [/splinter|emblem|fragment|relic|vessel|vial/i, 'Fragments'],
  // NOTE: vaal is intentionally NOT in this regex — "Vaal Burning Arrow"
  // (a gem) would otherwise match here before reaching the Gems rule below.
  // "Vaal Orb" matches via the explicit `vaal orb` token instead.
  [/chisel|orb|chaos|divine|exalted|vaal orb|scouring|alch|annulment|regal|alteration|augmentation|transmutation/i, 'Currency'],
  [/\b(?:astrolabe|coin|ducat|wombgift|runegraft|allflame|omen|tattoo|artifact|tincture)\b|enshrouding crystal/i, 'League'],
  [/fossil|resonator/i,     'League'],
  [/map$/i,                 'Maps'],
  [/support$|^vaal |awakened /i, 'Gems'],
];

/** Bounded legacy/name fallback. WealthyExile's Tab column is the literal
 * tracked stash tab, not item taxonomy, so it must never decide a category. */
export function categorise(name: string, _tab: string): ItemCategory {
  for (const [rule, cat] of RULES) {
    if (typeof rule === 'function') { if (rule(name)) return cat; }
    else if (rule.test(name)) return cat;
  }
  return 'Other';
}

export type LootCategoryResolver = (name: string) => LootCategory | undefined;

/** Attach the exact catalog category to a newly imported snapshot. Unknown
 * identities retain the bounded name fallback; the stash tab stays provenance. */
export function assignLootCategories<T extends { name: string; tab: string }>(
  items: T[],
  resolveCategory?: LootCategoryResolver,
): (T & { category: LootCategory })[] {
  return items.map((item) => ({
    ...item,
    category: resolveCategory?.(item.name) ?? categorise(item.name, item.tab),
  }));
}

export function buildCategoryBreakdown(
  items: { name: string; tab: string; total: number; excluded: boolean; category?: LootCategory }[]
): Map<ItemCategory, number> {
  const map = new Map<ItemCategory, number>();
  for (const item of items) {
    if (item.excluded) continue;
    const cat = item.category ?? categorise(item.name, item.tab);
    map.set(cat, (map.get(cat) ?? 0) + item.total);
  }
  return map;
}
