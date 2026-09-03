/**
 * PoeItemIcon — renders the real PoE item icon for a game entity (scarab,
 * chisel, delirium orb, astrolabe, ...) via the poe.ninja icon cache
 * (utils/itemIcons.ts). WP6.2.
 *
 * Behavior:
 *  - While the cache loads, or when the name can't be resolved, renders the
 *    `fallback` node (default: nothing). The general resolver can use category
 *    artwork; gemPreview opts into exact/unique-prefix gem artwork only.
 *  - The resolver is cached module-level, so only the first mounted instance
 *    triggers the (already IPC-cached) fetch; all later instances render
 *    synchronously.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Image } from '@mantine/core';
import { IconBug, IconCircleDashed, IconDiamond, IconTool, IconWorld } from '@tabler/icons-react';
import { getItemIcons } from '../../utils/itemIcons';
import { useSessionStore } from '../../store/useSessionStore';
import { COLOR } from '../../utils/uiTokens';

type Resolvers = Pick<Awaited<ReturnType<typeof getItemIcons>>, 'resolve' | 'resolveGemPreview'>;
export type PoeItemCategory = 'scarab' | 'orb' | 'chisel' | 'gem' | 'astrolabe';
let cachedResolvers: Resolvers | null = null;

const CategoryFallback = ({ category, size }: { category: PoeItemCategory; size: number }) => {
  const props = { size, stroke: 1.5, color: COLOR.textMuted, style: { flexShrink: 0 } };
  if (category === 'scarab') return <IconBug {...props} />;
  if (category === 'chisel') return <IconTool {...props} />;
  if (category === 'gem') return <IconDiamond {...props} />;
  if (category === 'astrolabe') return <IconWorld {...props} />;
  return <IconCircleDashed {...props} />;
};

export const PoeItemIcon = ({ name, size = 14, fallback = null, category, gemPreview = false }: {
  name: string | null | undefined;
  size?: number;
  fallback?: ReactNode;
  category?: PoeItemCategory;
  /** Exact or unique-prefix GEM match only; never generic support-gem art. */
  gemPreview?: boolean;
}) => {
  const leagueOverride = useSessionStore((s) => s.leagueOverride);
  const sessionLeague = useSessionStore((s) => s.settings.leagueName);
  const [resolvers, setResolvers] = useState<Resolvers | null>(() => cachedResolvers);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    getItemIcons()
      .then((c) => {
        cachedResolvers = { resolve: c.resolve, resolveGemPreview: c.resolveGemPreview };
        if (alive) setResolvers(cachedResolvers);
      })
      .catch(() => {}); // offline / poe.ninja down -> stay on fallback
    return () => { alive = false; };
  }, [leagueOverride, sessionLeague]);

  const url = name
    ? (gemPreview ? resolvers?.resolveGemPreview(name) : resolvers?.resolve(name))
    : undefined;
  useEffect(() => setImageFailed(false), [url]);

  const fallbackNode = fallback ?? (category ? <CategoryFallback category={category} size={size} /> : null);
  if (!url || imageFailed) return <>{fallbackNode}</>;
  return (
    <Image
      src={url} w={size} h={size} fit="contain" alt="" aria-hidden
      // session-16: no imageRendering:'pixelated' — nearest-neighbor downscaling
      // of the ~78px CDN icons to 14-24px is what made small icons look crunchy.
      style={{ flexShrink: 0, display: 'inline-block' }}
      onError={() => setImageFailed(true)}
    />
  );
};
