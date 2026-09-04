import {
  IconBug, IconCards, IconCircleDashed, IconCoins, IconDiamond,
  IconDroplet, IconEgg, IconFlask, IconHexagon, IconMap, IconPackages,
  IconPuzzle, IconRings, IconShield, IconSparkles, IconSword,
} from '@tabler/icons-react';
import type { LootCategory } from '../../types';
import { COLOR } from '../../utils/uiTokens';
import { PoeItemIcon } from './PoeItemIcon';

const CATEGORY_GLYPH: Record<LootCategory, typeof IconPackages> = {
  Currency: IconCoins,
  Fragments: IconPuzzle,
  Scarabs: IconBug,
  'Divination Cards': IconCards,
  Essences: IconDiamond,
  Deliriums: IconCircleDashed,
  Oils: IconDroplet,
  Incubators: IconEgg,
  'Unique Weapons': IconSword,
  'Unique Armours': IconShield,
  'Unique Accessories': IconRings,
  'Unique Flasks': IconFlask,
  'Unique Jewels': IconHexagon,
  Maps: IconMap,
  Gems: IconDiamond,
  Beasts: IconBug,
  League: IconSparkles,
  Other: IconPackages,
};

export const LootCategoryGlyph = ({ category, size = 18 }: { category: LootCategory; size?: number }) => {
  const props = { size, stroke: 1.5, color: COLOR.textMuted, style: { flexShrink: 0 } };
  const Glyph = CATEGORY_GLYPH[category];
  return <Glyph {...props} />;
};

/** Real representative PoE art when the economy icon cache has it, with an
 * honest, category-specific vector glyph offline. League and Other always use
 * glyphs because neither catch-all has one canonical representative item. */
export const LootCategoryIcon = ({ category, size = 18 }: { category: LootCategory; size?: number }) => (
  <PoeItemIcon
    name={null}
    representativeCategory={category}
    size={size}
    fallback={<LootCategoryGlyph category={category} size={size} />}
  />
);
