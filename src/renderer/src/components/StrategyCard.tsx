import {
  Text, Group, Stack, Badge, ActionIcon, Tooltip, Button,
  Collapse, Select, SegmentedControl,
} from '@mantine/core';
import { useState, useMemo, useRef, useLayoutEffect } from 'react';
import {
  IconChevronDown, IconChevronRight,
  IconThumbUp, IconThumbDown, IconExternalLink, IconUsers, IconAlertTriangle,
  IconSnowflake,
} from '@tabler/icons-react';
import {
  Strategy, TAG_COLORS, MAP_TYPE_TAGS, MAP_TYPE_LABELS, TAG_SHORT,
  BROWSER_COLS, BROWSER_GRID_TEMPLATE, BROWSER_MAXIMIZED_COLS,
  BROWSER_MAXIMIZED_GRID_TEMPLATE, BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE, BROWSER_ACTIVITY_WIDTH,
  BROWSER_MAXIMIZED_ACTIVITY_WIDTH, BROWSER_ROW_GAP, BROWSER_ROW_PAD_X,
} from '../utils/strategyConstants';
import { formatActiveTime } from '../utils/timeEstimate';
import { computeVisibleTagCount } from '../utils/tagFit';
import { checkStrategyCompat } from '../utils/strategyCompat';
import { fc, fcSep, f1, parseDiscordExport } from '../utils/parseDiscordExport';
import { chiselItemName, deliOrbItemName } from '../utils/itemIcons';
import { PoeItemIcon } from './ui/PoeItemIcon';
import { SectionLabel } from './ui/SectionLabel';
import { StatTile } from './ui/StatTile';
import { RegexLine } from './ui/RegexLine';
import { EvidenceRunsDisclosure } from './EvidenceRunsDisclosure';
import { LootEvidenceSummary } from './LootEvidenceSummary';
import { evidencePresentation } from '../utils/evidenceApi';
import { COLOR, FONT } from '../utils/uiTokens';
import { formatRelativeAge, latestStrategyActivity } from '../utils/relativeTime';
import { computePublishedSetupCostBreakdown } from '../utils/strategySetupCosts';
import { CHISEL_TYPES } from '../utils/constants';
import './StrategyCard.css';

const EconomicTile = ({
  label, value, color,
}: {
  label: string; value: string; color?: string;
}) => (
  <div className="strategy-card-economic-tile" style={{
    minWidth: 0, padding: '10px 12px', borderRadius: 7,
    background: COLOR.surfaceSectionBg, border: `1px solid ${COLOR.border}`,
    display: 'flex', flexDirection: 'column',
  }}>
    <SectionLabel>{label}</SectionLabel>
    <Text fw={800} ta="center" style={{ fontSize: FONT.xl, color, fontVariantNumeric: 'tabular-nums', margin: 'auto 0' }}>
      {value}
    </Text>
  </div>
);

type StrategyLabLayout =
  | 'pr'
  | 'balanced-wide'
  | 'quiet-wide'
  | 'loot-led-wide'
  | 'wide-run-sheet'
  | 'traceur-hybrid'
  | 'traceur-focus'
  | 'traceur-centered'
  | 'traceur-spread';

type StrategyLabSkin = 'native' | 'mockup';

const STRATEGY_LAB_LAYOUTS: { value: StrategyLabLayout; label: string }[] = [
  { value: 'pr', label: 'PR baseline' },
  { value: 'balanced-wide', label: '1 · Balanced wide' },
  { value: 'quiet-wide', label: '2 · Quiet wide' },
  { value: 'loot-led-wide', label: '3 · Loot-led wide' },
  { value: 'wide-run-sheet', label: '4 · Wide run sheet' },
  { value: 'traceur-hybrid', label: '5 · Traceur hybrid' },
  { value: 'traceur-focus', label: '6 · Traceur focus' },
  { value: 'traceur-centered', label: '7 · Traceur centered' },
  { value: 'traceur-spread', label: '8 · Traceur spread' },
];

// ─── CopyRegex ────────────────────────────────────────────────────────────────

export { CopyRegex } from './ui/RegexLine'; // moved to ui/RegexLine (WP6.4); re-exported for compatibility

// ─── TagStrip ─────────────────────────────────────────────────────────────────

const TAG_GAP = 2;
const TAG_FIT_SAFETY = 4; // covers sub-pixel rounding and a newly visible scrollbar

const renderTagBadge = (t: string) => (
  MAP_TYPE_TAGS.has(t) ? (
    <Tooltip key={t} label={MAP_TYPE_LABELS[t] ?? t} withArrow>
      <Badge size="xs" color={TAG_COLORS[t] ?? 'gray'} variant="light"
        style={{ fontSize: FONT.tiny, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
        {TAG_SHORT[t] ?? t}
      </Badge>
    </Tooltip>
  ) : (
    <Badge key={t} size="xs" color={TAG_COLORS[t] ?? 'gray'} variant="light"
      style={{ fontSize: FONT.tiny, padding: '0 3px', flexShrink: 0 }}>
      {TAG_SHORT[t] ?? t}
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

// ─── StrategyCard ─────────────────────────────────────────────────────────────

export const StrategyCard = ({
  strategy,
  onLoadBuild,
  onContinueStrategy,
  discordTag,
  frozen = false,
  maximized = false,
  showPublishedActivity = false,
  detailLoading = false,
  expanded,
  onExpandedChange,
}: {
  strategy: Strategy; onLoadBuild: (s: Strategy) => void;
  /** Continuing a strategy is author-only. This display heuristic only decides
   *  whether to offer the action; the bot/API independently enforce Discord
   *  ownership before accepting either operation. */
  onContinueStrategy?: (s: Strategy) => void;
  discordTag?: string;
  /** Frozen snapshot cards remain loadable but can never enter the update flow. */
  frozen?: boolean;
  /** Uses the roomier Browser grid only while the containing tabset is maximized. */
  maximized?: boolean;
  /** Adds relative publish/update age only while the Setup sidebar is collapsed. */
  showPublishedActivity?: boolean;
  /** Full strategy detail (raw share and itemized advanced costs) is loading. */
  detailLoading?: boolean;
  /** Controlled by the live Browser so one expanded strategy can take focus. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}) => {
  const browserCols = maximized ? BROWSER_MAXIMIZED_COLS : BROWSER_COLS;
  const browserActivityWidth = maximized
    ? BROWSER_MAXIMIZED_ACTIVITY_WIDTH
    : BROWSER_ACTIVITY_WIDTH;
  const browserGridTemplate = showPublishedActivity
    ? maximized
      ? BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE
      : BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE
    : maximized
      ? BROWSER_MAXIMIZED_GRID_TEMPLATE
      : BROWSER_GRID_TEMPLATE;
  const [internalOpen, setInternalOpen] = useState(false);
  // Disposable comparison-lab controls. These intentionally remain component-
  // local: the branch must not create a preference or repository contract for
  // a design decision that has not been made yet.
  const [labLayout, setLabLayout] = useState<StrategyLabLayout>('traceur-focus');
  const [labSkin, setLabSkin] = useState<StrategyLabSkin>('native');
  const open = expanded ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (expanded === undefined) setInternalOpen(next);
    onExpandedChange?.(next);
  };
  // Author's atlas multiplier at share time (from the export). Only parsed
  // when the card is expanded at least once — the raw_export parse is cheap
  // but there's no reason to run it for collapsed rows.
  const parsedExport = useMemo(() => {
    if (!open || !strategy.raw_export) return null;
    return parseDiscordExport(strategy.raw_export);
  }, [open, strategy.raw_export]);
  const authorMult = useMemo(() => {
    const m = parsedExport?.multiplier;
    return m && m > 0 ? m : null;
  }, [parsedExport]);
  const lootSummary = strategy.loot_summary ?? parsedExport?.lootSummary ?? null;
  const isOwn = !frozen && !!(
    discordTag?.trim()
    && strategy.discord_username?.toLowerCase() === discordTag.trim().toLowerCase()
  );
  const publishedDate = (() => { try { return new Date(strategy.posted_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return '—'; } })();
  // Versioning display: vN badge only when the strategy has actually been
  // updated (revision 1 = original post, no badge). updated_at may be null on
  // pre-versioning rows even if revision were >1 — render defensively.
  const revision = strategy.current_revision ?? 1;
  const updatedDate = (() => {
    if (!strategy.updated_at) return null;
    try { return new Date(strategy.updated_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }); } catch { return null; }
  })();
  const activity = latestStrategyActivity(
    strategy.posted_at,
    strategy.updated_at,
    revision,
  );
  const activityRelative = formatRelativeAge(activity.timestamp);
  const activityDate = activity.kind === 'Updated' ? updatedDate : publishedDate;
  const {
    runCount: evidenceRunCount,
    mapCount: displayMapCount,
    isPooled,
    divPerMap: div,
    costPerMap,
    historicalProfitDivines,
    divPerHour,
    timedRunCount,
  } = evidencePresentation(strategy);
  const divColor    = div != null ? (div >= 8 ? COLOR.profit : div >= 4 ? COLOR.accent : div >= 1 ? COLOR.warning : COLOR.textFaint) : COLOR.textFaint;
  const score       = strategy.score ?? 0;
  const scoreColor  = score > 0 ? COLOR.profit : score < 0 ? COLOR.loss : COLOR.dim;
  const profitColor = strategy.net_profit != null ? (strategy.net_profit >= 0 ? COLOR.profit : COLOR.loss) : COLOR.dim;
  // Author-declared div/hour: total session divines over reported active time.
  // Null unless the author shared session_minutes — never penalised, never a
  // default/primary ranking (div/map stays primary); the Browser column shows '—' when null.
  const observedModAverage = strategy.observed_mod_average;
  const observedModSampleSize = strategy.observed_mod_sample_size;
  const hasObservedMods = observedModAverage != null && observedModSampleSize != null
    && Number.isFinite(observedModAverage) && observedModSampleSize > 0;
  const setupBucketDisplay = strategy.map_type === '8-mod'
    ? '8.0'
    : strategy.map_type === '6-mod'
      ? '6.0'
      : strategy.map_type ?? '?';
  const modDisplay = hasObservedMods ? observedModAverage.toFixed(1) : setupBucketDisplay;
  const sessionMinutes = isPooled ? strategy.timed_session_minutes : strategy.session_minutes;
  const authoredMapCount = parsedExport?.mapCount ?? displayMapCount ?? 0;
  const setupCostBreakdown = computePublishedSetupCostBreakdown({
    costPerMap: costPerMap ?? 0,
    mapCount: authoredMapCount,
    scarabs: strategy.scarabs ?? [],
    chiselPrice: parsedExport?.chiselPrice ?? 0,
    deliOrbQtyPerMap: parsedExport?.deliOrbQty ?? 0,
    deliOrbPriceEach: parsedExport?.deliOrbPrice ?? 0,
    astrolabeCount: parsedExport?.astroCount ?? 0,
    astrolabePriceEach: parsedExport?.astroPrice ?? 0,
  });
  const chiselCostPerMap = setupCostBreakdown.chisel;
  const chiselName = strategy.chisel && strategy.chisel !== 'None'
    ? chiselItemName(strategy.chisel)
    : null;
  const deliOrbName = parsedExport?.deliOrbType
    ? deliOrbItemName(parsedExport.deliOrbType)
    : null;
  const observedDelirium = parsedExport?.observedDelirium ?? null;
  const observedDeliriumLevel = observedDelirium?.levelCounts.length === 1
    ? observedDelirium.levelCounts[0].percentage
    : null;
  const observedDeliriumTotal = parsedExport?.mapCount ?? observedDelirium?.sampleSize ?? 0;
  const observedDeliriumTooltip = observedDelirium
    ? [
        `Levels: ${observedDelirium.levelCounts.map((level) => `${level.percentage}% ×${level.count}`).join(' · ')}`,
        `Reward tracks: ${observedDelirium.rewardCounts.length > 0
          ? observedDelirium.rewardCounts.map((reward) => `${reward.name} ×${reward.count}`).join(' · ')
          : 'not recorded'}`,
      ].join('\n')
    : '';
  const chiselStatKey = strategy.chisel ? CHISEL_TYPES[strategy.chisel]?.statKey : null;
  const requirementColor = (statKey: string): string => (
    chiselStatKey === statKey ? COLOR.warning : COLOR.accent
  );
  const requirementStats: { label: string; value: string; color: string }[] = [];
  if (strategy.avg_quant != null) requirementStats.push({ label: 'Quantity', value: `${f1(strategy.avg_quant)}%`, color: requirementColor('quantity') });
  if (strategy.avg_rarity != null) requirementStats.push({ label: 'Rarity', value: `${f1(strategy.avg_rarity)}%`, color: requirementColor('rarity') });
  if (strategy.avg_pack != null) requirementStats.push({ label: 'Pack Size', value: `${f1(strategy.avg_pack)}%`, color: requirementColor('packSize') });
  if (strategy.avg_currency != null && strategy.avg_currency > 0) {
    requirementStats.push({ label: 'Currency', value: `${f1(strategy.avg_currency)}%`, color: requirementColor('moreCurrency') });
  }

  const isGroup = strategy.is_group_play ||
    (strategy.raw_export ? /Party Play:\s*Yes/i.test(strategy.raw_export) : false);

  // Compatibility vs the current game-data manifest (rollover step 4). Cheap;
  // resolves to 'ok' for every strategy until 3.29 lands renames/removals.
  const compat = checkStrategyCompat(strategy);
  const compatColor = compat.level === 'removed' ? 'red' : 'yellow';
  const compatTip = compat.issues.map((i) => i.detail).join('\n');

  const strategyActions = (
    <Group className="strategy-card-actions" gap="xs" wrap="wrap">
      <Button size="xs" variant="light" color="blue" onClick={(e) => { e.stopPropagation(); onLoadBuild(strategy); }}>
        {frozen ? 'Load Frozen Build' : 'Load Build Settings'}
      </Button>
      {strategy.atlas_tree_url && (
        <Tooltip label="Open atlas tree in browser">
          <Button size="xs" variant="default" rightSection={<IconExternalLink size={11} />}
            onClick={(e) => { e.stopPropagation(); window.open(strategy.atlas_tree_url!, '_blank'); }}>
            Atlas Tree
          </Button>
        </Tooltip>
      )}
      {!frozen && isOwn && onContinueStrategy && (
        <Tooltip label="Continue with a fresh cloned setup or use your current session, then choose whether the run adds evidence or replaces the published strategy." withArrow multiline w={290}>
          <Button size="xs" variant="light" color="teal"
            onClick={(e) => { e.stopPropagation(); onContinueStrategy(strategy); }}>
            Continue strategy
          </Button>
        </Tooltip>
      )}
      {strategy.discord_jump_url && (
        <Tooltip label="Jump to this message in Discord to vote">
          <Button size="xs" variant="default" rightSection={<IconExternalLink size={11} />}
            onClick={(e) => {
              e.stopPropagation();
              const jumpUrl = strategy.discord_jump_url!;
              window.open(jumpUrl.replace('https://discord.com', 'discord://discord.com'), '_blank');
            }}>
            View in Discord
          </Button>
        </Tooltip>
      )}
    </Group>
  );

  return (
    <div style={{
      background: 'var(--mantine-color-dark-6)',
      border: `1px solid ${score <= -3 ? COLOR.loss : isOwn ? COLOR.surfaceInfoBorder : COLOR.border}`,
      boxShadow: open ? `0 5px 16px ${COLOR.bgDeep}` : undefined,
      borderRadius: 8, overflow: 'hidden', position: 'relative',
    }}>
      {isOwn && <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, background: COLOR.info }} />}
      <div onClick={() => setOpen(!open)} style={{
        display: 'grid', gridTemplateColumns: browserGridTemplate,
        columnGap: BROWSER_ROW_GAP, alignItems: 'center', cursor: 'pointer',
        padding: `8px ${BROWSER_ROW_PAD_X}px`, userSelect: 'none',
      }}>
        <ActionIcon size={browserCols.chevron} variant="transparent" c="dimmed">
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </ActionIcon>
        <Stack gap={0} style={{ width: browserCols.author, minWidth: 0 }}>
          <Group gap={3} wrap="nowrap">
            <Text size="xs" fw={600} lineClamp={1} title={strategy.discord_username}>{strategy.discord_username}</Text>
            {isGroup && (
              <Tooltip label={`Group / Party play${strategy.group_size ? ` — ${strategy.group_size} players` : ''} — loot scales with more players`} withArrow>
                <Badge size="xs" color="cyan" variant="light" style={{ fontSize: FONT.micro, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
                  <IconUsers size={8} style={{ display: 'block' }} />
                </Badge>
              </Tooltip>
            )}
            {revision > 1 && (
              <Tooltip label={`Updated result — revision ${revision}${updatedDate ? `, last updated ${updatedDate}` : ''}. Votes carry across updates.`} withArrow multiline w={220}>
                <Badge size="xs" color="indigo" variant="light" style={{ fontSize: FONT.micro, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
                  v{revision}
                </Badge>
              </Tooltip>
            )}
            {frozen && (
              <Tooltip label="Frozen at league close; later votes and strategy updates do not change this result" withArrow multiline w={240}>
                <Badge size="xs" color="cyan" variant="light" style={{ fontSize: FONT.micro, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
                  <IconSnowflake size={8} style={{ display: 'block' }} />
                </Badge>
              </Tooltip>
            )}
            {compat.level !== 'ok' && (
              <Tooltip label={compatTip} withArrow multiline w={240} style={{ whiteSpace: 'pre-line' }}>
                <Badge size="xs" color={compatColor} variant="light" style={{ fontSize: FONT.micro, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
                  <IconAlertTriangle size={8} style={{ display: 'block' }} />
                </Badge>
              </Tooltip>
            )}
          </Group>
          {strategy.strategy_name && (
            <Text size="xs" c="dimmed" lineClamp={1} style={{ fontSize: FONT.label }}>{strategy.strategy_name}</Text>
          )}
        </Stack>
        <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <TagStrip tagStr={strategy.type_tag} layoutKey={open} />
        </div>
        {showPublishedActivity && (
          <Tooltip label={`${activity.kind} ${activityDate ?? 'date unavailable'}`} withArrow>
            <Text size="xs" c="dimmed" lineClamp={1} style={{ width: browserActivityWidth, flexShrink: 0, fontSize: FONT.small, cursor: 'help' }}>
              {activityRelative}
            </Text>
          </Tooltip>
        )}
        {hasObservedMods ? (
          <Tooltip
            label={`Observed explicit-mod average across ${observedModSampleSize} exact maps. Strategy bucket remains ${strategy.map_type ?? 'unclassified'}; Browser 6/8 filtering is unchanged.`}
            withArrow multiline w={250}>
            <Text size="xs" c="dimmed" style={{ width: browserCols.mod, flexShrink: 0, fontSize: FONT.small, cursor: 'help' }}>
              {modDisplay}
            </Text>
          </Tooltip>
        ) : (
          <Tooltip
            label={`No complete observed-mod sample is available. Showing the published ${strategy.map_type ?? 'unclassified'} setup bucket instead; observed averages require exact advanced-format data for every map in the run.`}
            withArrow multiline w={270}>
            <Text size="xs" c="dimmed" style={{ width: browserCols.mod, flexShrink: 0, fontSize: FONT.small, cursor: 'help' }}>{modDisplay}</Text>
          </Tooltip>
        )}
        <Tooltip
          disabled={!isPooled || displayMapCount == null}
          label={`${evidenceRunCount} independently submitted runs, ${displayMapCount} maps total. Aggregate profit uses each run's historical divine-price snapshot.`}
          withArrow multiline w={260}>
          <Stack gap={0} align="center" style={{ width: browserCols.maps, flexShrink: 0, cursor: isPooled ? 'help' : undefined }}>
            <Text size="xs" c="dimmed" style={{ lineHeight: 1 }}>{displayMapCount != null ? displayMapCount : '—'}</Text>
            {isPooled && (
              <Text c="blue" style={{ fontSize: FONT.micro, lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                {evidenceRunCount} runs
              </Text>
            )}
          </Stack>
        </Tooltip>
        <Text size="xs" c="dimmed" style={{ width: browserCols.cost, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {costPerMap != null ? fcSep(costPerMap) : '—'}
        </Text>
        <Text size="xs" c="dimmed" style={{ width: browserCols.invest, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {fc(strategy.total_invest)}
          {!isPooled && strategy.total_invest != null && strategy.divine_price != null && strategy.divine_price > 0 && (
            <Text span style={{ color: COLOR.dim, fontSize: FONT.label }}> ({(strategy.total_invest / strategy.divine_price).toFixed(1)}d)</Text>
          )}
        </Text>
        <Text size="xs" fw={600} style={{ width: browserCols.profit, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: profitColor, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {fc(strategy.net_profit, true)}
          {strategy.net_profit != null && historicalProfitDivines != null && (
            <Text span style={{ color: COLOR.dim, fontSize: FONT.label }}> ({strategy.net_profit >= 0 ? '+' : ''}{historicalProfitDivines.toFixed(1)}d)</Text>
          )}
        </Text>
        <Group gap={2} style={{ width: browserCols.score, flexShrink: 0 }} align="center">
          {score >= 0 ? <IconThumbUp size={10} style={{ color: scoreColor }} /> : <IconThumbDown size={10} style={{ color: scoreColor }} />}
          <Text size="xs" style={{ color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>{score > 0 ? `+${score}` : score}</Text>
        </Group>
        <Tooltip label={divPerHour != null ? (isPooled ? `Historical timed evidence only — ${timedRunCount}/${evidenceRunCount} runs reported active time` : 'Optional author-reported context — selectable as a sort, but never the default ranking; div/map stays primary') : 'No session time shared — div/h unavailable'} withArrow multiline w={250}>
          <Text size="xs" c="dimmed" style={{ width: browserCols.dph, textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums', cursor: 'help' }}>
            {divPerHour != null ? `${divPerHour.toFixed(1)}` : '—'}
          </Text>
        </Tooltip>
        <Tooltip disabled={!isPooled} label="Historical d/map — map-weighted across runs using each run's divine-price snapshot" withArrow multiline w={240}>
          <Stack gap={0} align="flex-end" style={{ width: browserCols.dpm, flexShrink: 0 }}>
            <Text size="sm" fw={800} style={{ color: divColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              {div != null ? `${div.toFixed(3)}d` : '—'}
            </Text>
            {isPooled && <Text c="dimmed" style={{ fontSize: FONT.micro, lineHeight: 1.1 }}>historical</Text>}
          </Stack>
        </Tooltip>
      </div>

      <Collapse in={open}>
        <div
          className="strategy-card-expanded"
          data-lab-layout={labLayout}
          data-lab-skin={labSkin}
          style={{ padding: '16px 20px', borderTop: `1px solid ${COLOR.border}` }}
        >
          <div className="strategy-card-lab-toolbar" onClick={(event) => event.stopPropagation()}>
            <Group justify="space-between" gap="sm" wrap="wrap">
              <Stack gap={1}>
                <Group gap={6}>
                  <Badge size="xs" color="blue" variant="light">Layout lab</Badge>
                  <Text size="xs" fw={700}>9 layouts × 2 visual skins</Text>
                  {detailLoading && <Badge size="xs" color="yellow" variant="light">Loading full share…</Badge>}
                </Group>
                <Text size="xs" c="dimmed">Disposable comparison controls — this choice is not saved.</Text>
              </Stack>
              <Group gap="xs" wrap="wrap">
                <Select
                  aria-label="Strategy detail layout"
                  size="xs"
                  w={210}
                  data={STRATEGY_LAB_LAYOUTS}
                  value={labLayout}
                  allowDeselect={false}
                  onChange={(value) => value && setLabLayout(value as StrategyLabLayout)}
                />
                <SegmentedControl
                  size="xs"
                  value={labSkin}
                  onChange={(value) => setLabSkin(value as StrategyLabSkin)}
                  data={[
                    { value: 'native', label: 'App native' },
                    { value: 'mockup', label: 'Mockup palette' },
                  ]}
                />
              </Group>
            </Group>
          </div>
          {/* session-16: boxed StatTiles — same treatment as the Dashboard's
              Map Multipliers grid (the free-floating look was the complaint) */}
          <div className="strategy-card-header" style={{ marginBottom: 14, paddingBottom: 14, borderBottom: `1px solid ${COLOR.border}` }}>
            <div className="strategy-card-hero">
            <Stack className="strategy-card-hero-identity" gap={6}>
              <Text size="xl" fw={800} style={{ overflowWrap: 'anywhere' }}>
                {strategy.strategy_name || `${strategy.discord_username}'s strategy`}
              </Text>
              {strategy.type_tag && (
                <Group gap={4} wrap="wrap">
                  {strategy.type_tag.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                    <Badge key={t} size="sm" color={TAG_COLORS[t] ?? 'gray'} variant="light">{t}</Badge>
                  ))}
                </Group>
              )}
              {labLayout === 'pr' && strategyActions}
            </Stack>
            <Stack className="strategy-card-hero-meta" gap={2}>
              <Text size="sm" c="dimmed">by <Text span fw={600} c="gray.3">{strategy.discord_username}</Text></Text>
              <Text size="xs" c="dimmed">Published {publishedDate}</Text>
              {revision > 1 && updatedDate && <Text size="xs" c="dimmed">Last updated {updatedDate}</Text>}
              <Text size="xs" c="dimmed" tt="uppercase">
                {displayMapCount != null ? `${displayMapCount} maps` : 'Maps —'} · {modDisplay} mod
              </Text>
              <Text size="xs" c="dimmed" tt="uppercase">
                Latest activity <Text span c="gray.3">{activityRelative}</Text>
                {sessionMinutes ? <> · Time <Text span c="gray.3">{formatActiveTime(sessionMinutes * 60_000)}{isPooled ? ` · ${timedRunCount}/${evidenceRunCount} timed runs` : ''}</Text></> : null}
              </Text>
              {(isPooled || strategy.divine_price != null || divPerHour != null) && (
                <Text size="xs" c="dimmed" tt="uppercase">
                  {isPooled
                    ? <>Divine <Text span c="gray.3">Per-run snapshots</Text></>
                    : strategy.divine_price != null ? <>Divine <Text span c="gray.3">{strategy.divine_price.toFixed(0)}c</Text></> : null}
                  {(isPooled || strategy.divine_price != null) && divPerHour != null ? ' · ' : null}
                  {divPerHour != null ? <>Div/hr <Text span c="gray.3">{divPerHour.toFixed(2)}</Text></> : null}
                </Text>
              )}
              {(strategy.game_data_revision != null || (strategy.atlas_points != null && strategy.atlas_points_max != null)) && (
                <Text size="xs" c="dimmed" tt="uppercase">
                  {strategy.game_data_revision != null ? <>Game data <Text span c="gray.3">r{strategy.game_data_revision}{strategy.game_data_patch_version ? ` · ${strategy.game_data_patch_version}` : ''}</Text></> : null}
                  {strategy.game_data_revision != null && strategy.atlas_points != null && strategy.atlas_points_max != null ? ' · ' : null}
                  {strategy.atlas_points != null && strategy.atlas_points_max != null ? <>Atlas <Text span c="gray.3">{strategy.atlas_points}/{strategy.atlas_points_max}</Text></> : null}
                </Text>
              )}
              {authorMult != null && (
                <Tooltip withArrow multiline w={260}
                  label="The author's atlas multiplier when they shared. All stat tiles here are base (unprojected) map averages — the regexes are built from them. Load the build and the Dashboard projects YOUR maps with YOUR atlas config.">
                  <Text size="xs" c="dimmed" tt="uppercase" style={{ cursor: 'help' }}>
                    Author mult. <Text span c="blue">{authorMult.toFixed(3)}×</Text>
                  </Text>
                </Tooltip>
              )}
            </Stack>
            </div>
          </div>

          <div className="strategy-card-economics" style={{ marginBottom: 14 }}>
            <EconomicTile label={isPooled ? 'Historical Net' : 'Net Profit'} value={strategy.net_profit != null ? `${fcSep(strategy.net_profit, true)}${historicalProfitDivines != null ? ` (${strategy.net_profit >= 0 ? '+' : ''}${historicalProfitDivines.toFixed(1)}d)` : ''}` : '—'} color={profitColor} />
            <EconomicTile label="Profit/map" value={div != null ? `${div.toFixed(3)}d` : '—'} color={divColor} />
            <EconomicTile label="Total investment" value={strategy.total_invest != null ? `${fcSep(strategy.total_invest)}${!isPooled && strategy.divine_price ? ` (${(strategy.total_invest / strategy.divine_price).toFixed(1)}d)` : ''}` : '—'} color={COLOR.textSoft} />
            <EconomicTile label="Cost/map" value={costPerMap != null ? `${f1(costPerMap)}c` : '—'} color={COLOR.warning} />
          </div>

          {lootSummary && (
            <div className="strategy-card-loot-panel" style={{ padding: 8, marginBottom: 12, background: COLOR.surfaceInfoBg, border: `1px solid ${COLOR.surfaceInfoBorder}`, borderRadius: 6 }}>
              <LootEvidenceSummary summary={lootSummary} />
            </div>
          )}

          {!frozen && isPooled && displayMapCount != null && (
            <div className="strategy-card-runs-panel" style={{ padding: 6, marginBottom: 8, background: COLOR.bgSunken, border: `1px solid ${COLOR.borderDeep}`, borderRadius: 6 }}>
            <EvidenceRunsDisclosure
              strategyId={strategy.id}
              runCount={evidenceRunCount}
              mapCount={displayMapCount}
            />
            </div>
          )}

          <div className="strategy-card-lower-grid">
            <Stack gap={8} className="strategy-card-lower-panel"
              style={{ background: COLOR.surfaceSectionBg, border: `1px solid ${COLOR.border}`, borderRadius: 6, padding: 10 }}>
              <SectionLabel>Strategy setup</SectionLabel>
            </Stack>

          {(() => {
            // Breakdown of the existing ALL-IN per-map figure. The current
            // share itemizes every setup cost except the base-map and rolling
            // buckets, so only that exact remainder stays combined.
            if (isPooled || costPerMap == null || costPerMap <= 0) return null;
            // The existing share contract does not transmit baseMapCost or
            // rollingSessionTotal as independent fields. Keep only their
            // remainder combined instead of inventing a historical split.
            return (
              <div className="strategy-card-cost-panel"
                style={{ background: COLOR.surfaceSectionBg, border: `1px solid ${COLOR.border}`, borderRadius: 6, padding: 10 }}>
                <SectionLabel mb={3}>Cost breakdown / map</SectionLabel>
                <Stack gap={6} className="strategy-card-cost-list">
                  {setupCostBreakdown.baseAndRolling > 0 && (
                    <Tooltip label="The current share contract does not transmit base-map cost and rolling costs as separate historical fields, so this is their exact combined remainder." withArrow multiline w={290}>
                      <Group gap="md" justify="space-between" wrap="nowrap" style={{ cursor: 'help' }}>
                        <Text size="xs" c="dimmed">Base map + rolling costs</Text>
                        <Text size="xs">{fcSep(setupCostBreakdown.baseAndRolling, false, 1)}</Text>
                      </Group>
                    </Tooltip>
                  )}
                  {chiselCostPerMap > 0 && <Group gap="md" justify="space-between" wrap="nowrap"><Text size="xs" c="dimmed">{chiselName ?? 'Chisel'}</Text><Text size="xs">{fcSep(chiselCostPerMap, false, 1)}</Text></Group>}
                  {setupCostBreakdown.scarabs > 0 && <Group gap="md" justify="space-between" wrap="nowrap"><Text size="xs" c="dimmed">Scarabs</Text><Text size="xs">{fcSep(setupCostBreakdown.scarabs, false, 1)}</Text></Group>}
                  {setupCostBreakdown.deliriumOrbs > 0 && <Group gap="md" justify="space-between" wrap="nowrap"><Text size="xs" c="dimmed">{deliOrbName ?? 'Delirium Orbs'}</Text><Text size="xs">{fcSep(setupCostBreakdown.deliriumOrbs, false, 1)}</Text></Group>}
                  {setupCostBreakdown.astrolabe > 0 && <Group gap="md" justify="space-between" wrap="nowrap"><Text size="xs" c="dimmed">{parsedExport?.astroType ?? 'Astrolabe'}</Text><Text size="xs">{fcSep(setupCostBreakdown.astrolabe, false, 1)}</Text></Group>}
                  <Group gap="md" justify="space-between" wrap="nowrap" pt={5} style={{ borderTop: `1px solid ${COLOR.border}` }}><Text size="xs" c="dimmed">= All-in</Text><Text size="xs" fw={700} c="yellow">{fcSep(costPerMap, false, 1)}</Text></Group>
                </Stack>
              </div>
            );
          })()}

          {parsedExport?.deliOrbType && (
            <Stack gap={3} className="strategy-card-setup-deli">
              <SectionLabel>Delirium Orbs</SectionLabel>
              <Group gap={6} wrap="nowrap" className="strategy-card-setup-item">
                <PoeItemIcon name={deliOrbName} size={20} category="orb" />
                <Text size="xs" c="grape" fw={600} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {deliOrbName ?? `${parsedExport.deliOrbType} Delirium Orb`}
                </Text>
                {!isPooled && (
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {parsedExport.deliOrbQty}x/map
                    {parsedExport.deliOrbPrice > 0 ? ` · ${parsedExport.deliOrbPrice}c ea` : ''}
                  </Text>
                )}
              </Group>
            </Stack>
          )}

          {chiselName && (
            <Stack gap={2} className="strategy-card-setup-chisel">
              <SectionLabel>Chisel</SectionLabel>
              <Group gap={6} wrap="nowrap" className="strategy-card-setup-item">
                <PoeItemIcon name={chiselName} size={20} category="chisel" />
                <Text size="xs" c="yellow" fw={600} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {chiselName}
                </Text>
                {!isPooled && (
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {chiselCostPerMap > 0 ? `${chiselCostPerMap}c/map` : 'Configured'}
                  </Text>
                )}
              </Group>
            </Stack>
          )}

          {parsedExport?.astroType && (
            <Stack gap={2} className="strategy-card-setup-astro">
              <SectionLabel>Astrolabe</SectionLabel>
              <Group gap={6} wrap="nowrap" className="strategy-card-setup-item">
                <PoeItemIcon name={parsedExport.astroType} size={20} category="astrolabe" />
                <Text size="xs" c="teal" fw={600} style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                  {parsedExport.astroType}
                </Text>
                {!isPooled && (parsedExport.astroCount > 0 || parsedExport.astroPrice > 0) && (
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {parsedExport.astroCount > 0 ? `${parsedExport.astroCount}x` : ''}
                    {parsedExport.astroCount > 0 && parsedExport.astroPrice > 0 ? ' · ' : ''}
                    {parsedExport.astroPrice > 0 ? `${parsedExport.astroPrice}c ea` : ''}
                  </Text>
                )}
              </Group>
            </Stack>
          )}

          {strategy.strategy_notes && (
            <div className="strategy-card-supporting-note" style={{ background: COLOR.surfaceSectionBg, borderRadius: 4, padding: '6px 8px' }}>
              <SectionLabel style={{ marginBottom: 2 }}>Notes</SectionLabel>
              <Text size="xs" style={{ color: COLOR.textDim, lineHeight: 1.5 }}>{strategy.strategy_notes}</Text>
            </div>
          )}

          {strategy.scarabs && strategy.scarabs.length > 0 && (
            <Stack gap={2} className="strategy-card-setup-scarabs">
              <Tooltip
                label="Setup scarabs. For pooled strategies, authored prices are preserved per run under Evidence runs."
                withArrow disabled={!isPooled}>
                <SectionLabel style={isPooled ? { cursor: 'help' } : undefined}>Scarabs</SectionLabel>
              </Tooltip>
              <Stack gap={2} className="strategy-card-scarab-list">
                {strategy.scarabs.map((s, i) => {
                  // Per-scarab compat cue (step 4). Match the precomputed issue
                  // by stored name so we don't resolve twice.
                  const issue = compat.issues.find((c) => c.kind === 'scarab' && c.storedName === s.name.trim());
                  const removed = issue?.level === 'removed';
                  const changed = issue?.level === 'changed';
                  const scarabColor = removed ? 'red' : changed ? 'yellow' : (TAG_COLORS[strategy.type_tag ?? ''] ?? 'orange');
                  return (
                    <Tooltip key={i} label={issue?.detail ?? s.name} withArrow>
                      <Group gap={6} wrap="nowrap" className="strategy-card-setup-item"
                        style={removed ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>
                        <PoeItemIcon name={s.name} size={18} category="scarab" />
                        <Text size="xs" c={scarabColor} fw={600} lineClamp={1}
                          style={{ flex: 1, minWidth: 0 }}>
                          {s.name}
                        </Text>
                        {!isPooled && s.cost > 0 && (
                          <Text size="xs" c={scarabColor} fw={600}
                            style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {s.cost}c
                          </Text>
                        )}
                      </Group>
                    </Tooltip>
                  );
                })}
              </Stack>
            </Stack>
          )}

          {(() => {
            if (!strategy.raw_export) return null;
            const exclM = strategy.raw_export.match(/Excluded drops \(\d+\):\s*([^\n]+)/i);
            const gemM  = strategy.raw_export.match(/Gem leveling:\s*(\d+) gems \| buy (\d+)c \| sell (\d+)c \| net ([+-]?\d+)c/i);
            if (!exclM && !gemM) return null;
            const drops = exclM ? exclM[1].split(',').map((p) => {
              const m = p.trim().match(/^(.+?)\s+\(([\d.]+)c\)$/);
              return m ? { name: m[1].trim(), value: parseFloat(m[2]) } : null;
            }).filter(Boolean) as { name: string; value: number }[] : [];
            return (
              <Stack gap={4} className="strategy-card-supporting-evidence">
                {drops.length > 0 && (
                  <div style={{ background: 'rgba(255,107,107,0.04)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,107,107,0.3)' }}>
                    <SectionLabel mb={2}>Excluded drops ({drops.length})</SectionLabel>
                    <Text size="xs" style={{ color: COLOR.textDim, lineHeight: 1.5 }}>{drops.map((d) => `${d.name} (${d.value.toFixed(0)}c)`).join(', ')}</Text>
                  </div>
                )}
                {gemM && (
                  <Group gap={4} wrap="wrap">
                    <Text size="xs" c="dimmed">Gem leveling:</Text>
                    <Text size="xs">{gemM[1]} gems · buy {gemM[2]}c · sell {gemM[3]}c ·</Text>
                    <Text size="xs" fw={600} c={parseInt(gemM[4]) >= 0 ? 'teal' : 'red'}>{parseInt(gemM[4]) >= 0 ? '+' : ''}{gemM[4]}c net *(not in map profit)*</Text>
                  </Group>
                )}
              </Stack>
            );
          })()}

          <Stack gap={6} className="strategy-card-map-panel"
            style={{ background: COLOR.surfaceSectionBg, border: `1px solid ${COLOR.border}`, borderRadius: 6, padding: 10 }}>
            <Group justify="space-between" gap="sm" wrap="wrap">
              <SectionLabel>Map requirements</SectionLabel>
              {observedDelirium && (
                <Tooltip label={observedDeliriumTooltip} multiline withArrow style={{ whiteSpace: 'pre-line' }}>
                  <Badge size="sm" color="grape" variant="outline" style={{ cursor: 'help' }}>
                    Observed {observedDeliriumLevel != null ? `${observedDeliriumLevel}% deli` : 'mixed deli'}
                    {' · '}{observedDelirium.sampleSize}/{observedDeliriumTotal} maps
                  </Badge>
                </Tooltip>
              )}
            </Group>
            <div className="strategy-card-map-stats">
              {requirementStats.map((stat) => (
                <StatTile key={stat.label} boxed centered label={stat.label} value={stat.value} color={stat.color} />
              ))}
            </div>
            {(strategy.run_regex || strategy.slam_regex) && (
              <Stack gap={4} style={{ background: COLOR.surfaceSectionContent, borderRadius: 4, padding: '6px 8px' }}>
                <SectionLabel>Regex</SectionLabel>
                {strategy.run_regex && <RegexLine value={strategy.run_regex} badge="Run" badgeColor="green" c="teal" />}
                {strategy.slam_regex && <RegexLine value={strategy.slam_regex} badge="Slam" badgeColor="orange" c="orange" />}
              </Stack>
            )}
          </Stack>
          </div>
          {labLayout !== 'pr' && strategyActions}
        </div>
      </Collapse>
    </div>
  );
};
