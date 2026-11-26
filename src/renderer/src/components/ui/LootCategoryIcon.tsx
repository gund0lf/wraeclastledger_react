import {
  IconBug, IconCards, IconCircleDashed, IconCoins, IconDiamond,
  IconDroplet, IconEgg, IconFlask, IconHexagon, IconMap, IconPackages,
  IconPuzzle, IconRings, IconShield, IconSparkles, IconSword,
} from '@tabler/icons-react';
import type { LootCategory } from '../../types';
import { COLOR } from '../../utils/uiTokens';
import { PoeItemIcon } from './PoeItemIcon';
import { useState } from 'react';
import threadArtwork from '../../assets/semantic/wl_thread.png';
import leagueArtwork from '../../assets/semantic/wl_loot_league.png';
import otherArtwork from '../../assets/semantic/wl_loot_other.png';

const CATEGORY_GLYPH: Record<LootCategory, typeof IconPackages> = {
  Currency: IconCoins,
  Fragments: IconPuzzle,
  Threads: IconRings,
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
  const [failed, setFailed] = useState<string | null>(null);
  const semanticArt = category === 'League' ? leagueArtwork : category === 'Other' ? otherArtwork : category === 'Threads' ? threadArtwork : null;
  if (semanticArt && failed !== semanticArt) {
    return <img src={semanticArt} alt="" aria-hidden="true" width={size} height={size}
      style={{ objectFit: 'contain', flexShrink: 0, verticalAlign: 'middle' }}
      onError={() => setFailed(semanticArt)} />;
  }
  const props = { size, stroke: 1.5, color: COLOR.textMuted, style: { flexShrink: 0 } };
  const Glyph = CATEGORY_GLYPH[category];
  return <Glyph {...props} />;
};

/** Real representative PoE art when the economy icon cache has it, with an
 * honest, category-specific vector glyph offline. League and Other always use
 * semantic symbols because neither catch-all has one canonical representative item. */
export const LootCategoryIcon = ({ category, size = 18 }: { category: LootCategory; size?: number }) => category === 'Threads' ? (
  <LootCategoryGlyph category={category} size={size} />
) : (
  <PoeItemIcon
    name={null}
    representativeCategory={category}
    size={size}
    fallback={<LootCategoryGlyph category={category} size={size} />}
  />
);
