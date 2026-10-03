import { Text, Group, Badge, Tooltip } from '@mantine/core';
import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import { TAG_COLORS, MAP_TYPE_TAGS, MAP_TYPE_LABELS, TAG_SHORT } from '../utils/strategyConstants';
import { computeVisibleTagCount } from '../utils/tagFit';
import { COLOR, FONT } from '../utils/uiTokens';
import { SectionLabel } from './ui/SectionLabel';

export const EconomicTile = ({
  label, primaryValue, secondaryValue, color,
}: {
  label: string; primaryValue: string; secondaryValue?: string | null; color?: string;
}) => (
  <div className="strategy-card-economic-tile" style={{
    minWidth: 0, padding: '10px 12px', borderRadius: 7,
    background: COLOR.surfaceSectionBg, border: `1px solid ${COLOR.border}`,
    display: 'flex', flexDirection: 'column',
  }}>
    <SectionLabel>{label}</SectionLabel>
    <Group justify="center" gap={5} wrap="wrap" style={{ margin: 'auto 0', lineHeight: 1.15 }}>
      <Text span fw={800} ta="center" style={{ fontSize: FONT.xl, color, fontVariantNumeric: 'tabular-nums' }}>
        {primaryValue}
      </Text>
      {secondaryValue && (
        <Text span fw={700} ta="center" style={{ fontSize: FONT.md, color, fontVariantNumeric: 'tabular-nums', opacity: 0.78 }}>
          ({secondaryValue})
        </Text>
      )}
    </Group>
  </div>
);

const TAG_GAP = 2;
const TAG_FIT_SAFETY = 4; // covers sub-pixel rounding and a newly visible scrollbar
const tagColor = (tag: string) => Object.hasOwn(TAG_COLORS, tag) ? TAG_COLORS[tag] : 'gray';
const tagLabel = (tag: string) => Object.hasOwn(TAG_SHORT, tag) ? TAG_SHORT[tag] : tag;

const renderTagBadge = (t: string) => (
  MAP_TYPE_TAGS.has(t) ? (
    <Tooltip key={t} label={MAP_TYPE_LABELS[t] ?? t} withArrow>
      <Badge size="xs" color={tagColor(t)} variant="light"
        style={{ fontSize: FONT.tiny, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
        {tagLabel(t)}
      </Badge>
    </Tooltip>
  ) : (
    <Badge key={t} size="xs" color={tagColor(t)} variant="light"
      style={{ fontSize: FONT.tiny, padding: '0 3px', flexShrink: 0 }}>
      {tagLabel(t)}
    </Badge>
  )
);

// Shows as many tag badges as CLEANLY fit the column width, collapsing the rest
// into a "+N" badge. A hidden measurement layer (all badges + a sample "+N")
// gives real px widths; a ResizeObserver recomputes on width changes. The fit
// math is the pure computeVisibleTagCount (tagFit.ts, tested).
export const TagStrip = ({ tagStr, layoutKey }: { tagStr?: string | null; layoutKey?: boolean }) => {
  const tags = useMemo(
    () => (tagStr ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    [tagStr],
  );
  const wrapRef    = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  // Safe until proven otherwise: an unmeasured/hidden panel shows only +N.
  const [visible, setVisible] = useState(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const meas = measureRef.current;
    if (!wrap || !meas) return undefined;
    const recompute = () => {
      const badges = Array.from(meas.querySelectorAll('[data-tag-badge]')) as HTMLElement[];
      const widths = badges.map((b) => Math.ceil(b.getBoundingClientRect().width));
      const plusEl = meas.querySelector('[data-tag-more]') as HTMLElement | null;
      const plusW  = plusEl ? Math.ceil(plusEl.getBoundingClientRect().width) : 22;
      const avail  = Math.max(0, Math.floor(wrap.getBoundingClientRect().width) - TAG_FIT_SAFETY);
      // Fonts and hidden FlexLayout tabs can report zero on an early pass.
      // Keep the safe +N fallback and let the frame/observer retry.
      if (badges.length !== tags.length || widths.some((w) => w <= 0) || plusW <= 0) {
        setVisible(0);
        return;
      }
      setVisible(computeVisibleTagCount(widths, avail, TAG_GAP, plusW));
    };
    recompute();
    // FlexLayout visibility, fonts, and a new scrollbar can settle across two
    // frames. ResizeObserver handles later moves/fullscreen/panel resizing.
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      recompute();
      frame2 = requestAnimationFrame(recompute);
    });
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
      ro.disconnect();
    };
  }, [tags, layoutKey]);

  if (tags.length === 0) return null;
  const hiddenCount = Math.max(0, tags.length - visible);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      {/* hidden measurement layer — never affects layout, always holds ALL badges */}
      <div ref={measureRef} aria-hidden style={{ position: 'absolute', top: 0, left: 0, width: 'max-content', visibility: 'hidden', pointerEvents: 'none', display: 'flex', gap: TAG_GAP, whiteSpace: 'nowrap' }}>
        {tags.map((t, i) => <span data-tag-badge key={i} style={{ display: 'inline-flex', flex: '0 0 auto' }}>{renderTagBadge(t)}</span>)}
        <span data-tag-more style={{ display: 'inline-flex', flex: '0 0 auto' }}>
          <Badge size="xs" color="gray" variant="outline" style={{ fontSize: FONT.tiny, padding: '0 3px' }}>+{tags.length}</Badge>
        </span>
      </div>
      {/* visible layer */}
      <div style={{ display: 'flex', gap: TAG_GAP, overflow: 'hidden', whiteSpace: 'nowrap' }}>
        {tags.slice(0, visible).map((t) => renderTagBadge(t))}
        {hiddenCount > 0 && (
          <Tooltip label={tags.slice(visible).join(', ')} withArrow>
            <Badge size="xs" color="gray" variant="outline"
              style={{ fontSize: FONT.tiny, padding: '0 3px', flexShrink: 0, cursor: 'default' }}>
              +{hiddenCount}
            </Badge>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
