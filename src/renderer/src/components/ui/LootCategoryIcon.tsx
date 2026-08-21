import {
  IconBug, IconCards, IconCircleDashed, IconCoins, IconDiamond,
  IconMap, IconPackage, IconPuzzle,
} from '@tabler/icons-react';
import type { LootCategory } from '../../types';
import { COLOR } from '../../utils/uiTokens';
import { PoeItemIcon } from './PoeItemIcon';

const REPRESENTATIVE_ITEM: Record<LootCategory, string | null> = {
  Currency: 'Divine Orb',
  Fragments: 'Sacrifice at Dusk',
  Scarabs: 'Breach Scarab',
  'Divination Cards': 'Stacked Deck',
  Essences: 'Deafening Essence of Greed',
  Deliriums: 'Fine Delirium Orb',
  Oils: 'Golden Oil',
  Incubators: 'Ornate Incubator',
  'Unique Weapons': null,
  'Unique Armours': null,
  'Unique Accessories': null,
  'Unique Flasks': null,
  'Unique Jewels': null,
  Maps: 'Map (Tier 16)',
  Gems: 'Empower Support',
  Beasts: 'Craicic Croaker',
  League: null,
  Other: null,
};

export const LootCategoryGlyph = ({ category, size = 18 }: { category: LootCategory; size?: number }) => {
  const props = { size, stroke: 1.5, color: COLOR.textMuted, style: { flexShrink: 0 } };
  if (category === 'Currency') return <IconCoins {...props} />;
  if (category === 'Fragments') return <IconPuzzle {...props} />;
  if (category === 'Scarabs' || category === 'Beasts') return <IconBug {...props} />;
  if (category === 'Divination Cards') return <IconCards {...props} />;
  if (category === 'Maps') return <IconMap {...props} />;
  if (category === 'Gems' || category === 'Essences' || category.startsWith('Unique')) return <IconDiamond {...props} />;
  if (category === 'Deliriums') return <IconCircleDashed {...props} />;
  return <IconPackage {...props} />;
};

/** Real representative PoE art when the economy icon cache has it, with an
 * honest vector category glyph offline or for categories without a canonical
 * item. */
export const LootCategoryIcon = ({ category, size = 18 }: { category: LootCategory; size?: number }) => (
  <PoeItemIcon
    name={REPRESENTATIVE_ITEM[category]}
    size={size}
    fallback={<LootCategoryGlyph category={category} size={size} />}
  />
);
