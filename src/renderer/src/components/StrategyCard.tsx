import {
  Text, Group, Stack, Badge, ActionIcon, Tooltip, Button,
  Collapse, SimpleGrid,
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
  BROWSER_MAXIMIZED_GRID_TEMPLATE, BROWSER_ROW_GAP, BROWSER_ROW_PAD_X,
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
import { evidencePresentation } from '../utils/evidenceApi';
import { COLOR, FONT } from '../utils/uiTokens';

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
}) => {
  const browserCols = maximized ? BROWSER_MAXIMIZED_COLS : BROWSER_COLS;
  const browserGridTemplate = maximized ? BROWSER_MAXIMIZED_GRID_TEMPLATE : BROWSER_GRID_TEMPLATE;
  const [open, setOpen] = useState(false);
  // Author's atlas multiplier at share time (from the export). Only parsed
  // when the card is expanded at least once — the raw_export parse is cheap
  // but there's no reason to run it for collapsed rows.
  const authorMult = useMemo(() => {
    if (!open || !strategy.raw_export) return null;
    const m = parseDiscordExport(strategy.raw_export)?.multiplier;
    return m && m > 0 ? m : null;
  }, [open, strategy.raw_export]);
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

  const isGroup = strategy.is_group_play ||
    (strategy.raw_export ? /Party Play:\s*Yes/i.test(strategy.raw_export) : false);

  // Compatibility vs the current game-data manifest (rollover step 4). Cheap;
  // resolves to 'ok' for every strategy until 3.29 lands renames/removals.
  const compat = checkStrategyCompat(strategy);
  const compatColor = compat.level === 'removed' ? 'red' : 'yellow';
  const compatTip = compat.issues.map((i) => i.detail).join('\n');

  return (
    <div style={{
      background: isOwn ? 'rgba(74,158,255,0.03)' : score <= -3 ? 'rgba(255,107,107,0.04)' : 'rgba(255,255,255,0.025)',
      boxShadow: `inset 0 0 0 1px ${score <= -3 ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8, overflow: 'hidden', position: 'relative',
    }}>
      {isOwn && <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 3, background: 'rgba(74,158,255,0.55)' }} />}
      <div onClick={() => setOpen((o) => !o)} style={{
        display: 'grid', gridTemplateColumns: browserGridTemplate,
        columnGap: BROWSER_ROW_GAP, alignItems: 'center', cursor: 'pointer',
        padding: `7px ${BROWSER_ROW_PAD_X}px`, userSelect: 'none',
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
        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {/* session-16: boxed StatTiles — same treatment as the Dashboard's
              Map Multipliers grid (the free-floating look was the complaint) */}
          {strategy.strategy_name && (
            <Group gap={4} mb={8} wrap="wrap">
              <SectionLabel>Strategy</SectionLabel>
              <Text size="xs" fw={600} style={{ overflowWrap: 'anywhere' }}>{strategy.strategy_name}</Text>
            </Group>
          )}
          <SimpleGrid cols={3} spacing={5} mb={10}>
            {strategy.avg_quant    != null && <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label="Quantity" value={`${f1(strategy.avg_quant)}%`} color={COLOR.accent} />}
            {strategy.avg_rarity   != null && <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label="Rarity" value={`${f1(strategy.avg_rarity)}%`} color={COLOR.accent} />}
            {strategy.avg_pack     != null && <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label="Pack" value={`${f1(strategy.avg_pack)}%`} color={COLOR.accent} />}
            {strategy.avg_currency != null && strategy.avg_currency > 0 && <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label="Currency" value={`${f1(strategy.avg_currency)}%`} color={COLOR.warning} />}
            {costPerMap != null && <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label="Cost/map" value={`${f1(costPerMap)}c`} />}
            {authorMult != null && (
              <Tooltip withArrow multiline w={260}
                label="The author's atlas multiplier when they shared. All stat tiles here are base (unprojected) map averages — the regexes are built from them. Load the build and the Dashboard projects YOUR maps with YOUR atlas config.">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label="Author Mult." value={`${authorMult.toFixed(3)}×`} color={COLOR.accentStrong} />
                </div>
              </Tooltip>
            )}
            {strategy.net_profit   != null && <StatTile boxed centered labelStyle={{ marginBottom: 2, lineHeight: 1 }} label={isPooled ? 'Historical Net' : 'Net Profit'} value={`${fcSep(strategy.net_profit, true)}${historicalProfitDivines != null ? ` (${strategy.net_profit >= 0 ? '+' : ''}${historicalProfitDivines.toFixed(1)}d)` : ''}`} color={strategy.net_profit >= 0 ? COLOR.profit : COLOR.loss} />}
          </SimpleGrid>

          <Group gap="md" mb={8} wrap="wrap">
            <Group gap={4}><SectionLabel>Published</SectionLabel><Text size="xs" c="dimmed">{publishedDate}</Text></Group>
            {revision > 1 && updatedDate && (
              <Group gap={4}><SectionLabel>Last updated</SectionLabel><Text size="xs" c="dimmed">{updatedDate}</Text></Group>
            )}
            {isPooled
              ? <Group gap={4}><SectionLabel>Divine pricing</SectionLabel><Text size="xs" c="dimmed">Per-run snapshots</Text></Group>
              : strategy.divine_price != null && <Group gap={4}><SectionLabel>Divine at time</SectionLabel><Text size="xs" c="dimmed">{strategy.divine_price.toFixed(0)}c</Text></Group>}
            {strategy.game_data_revision != null && (
              <Tooltip label="The game-data snapshot active when this result was shared" withArrow>
                <Group gap={4}><SectionLabel>Game data</SectionLabel><Text size="xs" c="dimmed">r{strategy.game_data_revision}{strategy.game_data_patch_version ? ` · ${strategy.game_data_patch_version}` : ''}</Text></Group>
              </Tooltip>
            )}
            {strategy.total_invest != null && <Group gap={4}><SectionLabel>Total invest</SectionLabel><Text size="xs" c="dimmed">{fcSep(strategy.total_invest)}{!isPooled && strategy.divine_price ? ` (${(strategy.total_invest / strategy.divine_price).toFixed(1)}d)` : ''}</Text></Group>}
          </Group>
          {(() => {
            // Optional author-declared session context (shared-metadata batch
            // 2026-07): time (+ derived div/h) and atlas points. Absent fields
            // simply do not render — no placeholder, no penalty.
            const mins = isPooled ? strategy.timed_session_minutes : strategy.session_minutes;
            const pts  = strategy.atlas_points;
            const ptsMax = strategy.atlas_points_max;
            if (!mins && pts == null) return null;
            // divPerHour is hoisted to the component top (shared with the row cell).
            return (
              <Group gap="md" mb={6} wrap="wrap">
                {mins ? (
                  <Tooltip label="Optional author-reported context — selectable as a sort, but never the default ranking; div/map stays primary" withArrow multiline w={250}>
                    <Group gap={4} wrap="nowrap" style={{ cursor: 'help' }}>
                      <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Time</Text>
                      <Text size="xs">{formatActiveTime(mins * 60_000)}{divPerHour != null ? ` · ${divPerHour.toFixed(2)} div/h` : ''}{isPooled ? ` · ${timedRunCount}/${evidenceRunCount} timed runs` : ''}</Text>
                    </Group>
                  </Tooltip>
                ) : null}
                {pts != null && ptsMax != null && (
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Atlas points</Text>
                    <Text size="xs">{pts}/{ptsMax}</Text>
                  </Group>
                )}
              </Group>
            );
          })()}

          {!frozen && isPooled && displayMapCount != null && (
            <EvidenceRunsDisclosure
              strategyId={strategy.id}
              runCount={evidenceRunCount}
              mapCount={displayMapCount}
            />
          )}

          {(() => {
            // Breakdown of the ALL-IN per-map figure. The remainder after
            // scarabs + chisel includes the base map AND amortized session
            // costs / one-time scarabs — labeled honestly as one bucket.
            if (isPooled || costPerMap == null || costPerMap <= 0) return null;
            const scarabTotal = (strategy.scarabs ?? []).reduce((a, s) => a + (s.cost ?? 0), 0);
            const chiselM = strategy.raw_export?.match(/Chisel:\s*[^(]+\((\d+(?:\.\d+)?)c(?:\s*each)?\)/i);
            const chiselCost = chiselM ? parseFloat(chiselM[1]) : 0;
            const baseImplied = Math.round(costPerMap - scarabTotal - chiselCost);
            if (scarabTotal === 0 && chiselCost === 0) return null; // nothing to break down
            return (
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4, padding: '5px 8px', marginBottom: 8 }}>
                <SectionLabel mb={3}>Cost breakdown / map</SectionLabel>
                <Group gap="md" wrap="wrap">
                  {baseImplied > 0 && <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Base + session</Text><Text size="xs">{fcSep(baseImplied)}</Text></Group>}
                  {chiselCost > 0 && <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Chisel</Text><Text size="xs">{chiselCost}c</Text></Group>}
                  {scarabTotal > 0 && <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Scarabs</Text><Text size="xs">{fcSep(scarabTotal)}</Text></Group>}
                  <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>= All-in</Text><Text size="xs" fw={600}>{fcSep(costPerMap)}</Text></Group>
                </Group>
              </div>
            );
          })()}

          {(() => {
            if (!strategy.raw_export) return null;
            const deliM = strategy.raw_export.match(/Delirium Orbs:\s*(\d+)x\s+([^\s(]+)/i);
            const astM  = strategy.raw_export.match(/Astrolabe:\s*([^\n(]+?)\s+\(\d+x/i);
            if (!deliM && !astM) return null;
            return (
              <Group gap={4} mb={6} wrap="wrap">
                {deliM && (
                  <Badge size="sm" color="grape" variant="light"
                    leftSection={<PoeItemIcon name={deliOrbItemName(deliM[2].replace(/[^\x00-\x7F]/g, '').replace(/'s$/i, ''))} size={16} category="orb" />}>
                    {deliM[1]}x {deliM[2].replace(/[^\x00-\x7F]/g, '')} ({parseInt(deliM[1]) * 20}% delirious)
                  </Badge>
                )}
                {astM && (
                  <Badge size="sm" color="teal" variant="light"
                    leftSection={<PoeItemIcon name={astM[1].replace(/[^\x00-\x7F]/g, '').trim()} size={16} category="astrolabe" />}>
                    {astM[1].replace(/[^\x00-\x7F]/g, '').trim()}
                  </Badge>
                )}
              </Group>
            );
          })()}

          {strategy.chisel && strategy.chisel !== 'None' && (
            <Group gap={4} mb={6}>
              <Badge size="sm" color="yellow" variant="light"
                leftSection={<PoeItemIcon name={chiselItemName(strategy.chisel)} size={16} category="chisel" />}>
                {strategy.chisel}
              </Badge>
            </Group>
          )}

          {strategy.type_tag && (
            <Group gap={4} mb={6} wrap="wrap">
              {strategy.type_tag.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                <Badge key={t} size="sm" color={TAG_COLORS[t] ?? 'gray'} variant="light">{t}</Badge>
              ))}
            </Group>
          )}

          {strategy.strategy_notes && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '6px 8px', marginBottom: 8, borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
              <SectionLabel style={{ marginBottom: 2 }}>Notes</SectionLabel>
              <Text size="xs" style={{ color: COLOR.textDim, lineHeight: 1.5 }}>{strategy.strategy_notes}</Text>
            </div>
          )}

          {strategy.scarabs && strategy.scarabs.length > 0 && (
            <Stack gap={2} mb={8}>
              <Tooltip
                label="Setup scarabs. For pooled strategies, authored prices are preserved per run under Evidence runs."
                withArrow disabled={!isPooled}>
                <SectionLabel style={isPooled ? { cursor: 'help' } : undefined}>Scarabs</SectionLabel>
              </Tooltip>
              <Group gap={4} wrap="wrap">
                {strategy.scarabs.map((s, i) => {
                  // Per-scarab compat cue (step 4). Match the precomputed issue
                  // by stored name so we don't resolve twice.
                  const issue = compat.issues.find((c) => c.kind === 'scarab' && c.storedName === s.name.trim());
                  const removed = issue?.level === 'removed';
                  const changed = issue?.level === 'changed';
                  return (
                    <Tooltip key={i} label={issue?.detail ?? ''} withArrow disabled={!issue}>
                      <Badge size="sm"
                        color={removed ? 'red' : changed ? 'yellow' : (TAG_COLORS[strategy.type_tag ?? ''] ?? 'orange')}
                        variant="light"
                        leftSection={<PoeItemIcon name={s.name} size={16} category="scarab" />}
                        style={removed ? { textDecoration: 'line-through', opacity: 0.7 } : undefined}>
                        {s.name}{!isPooled && s.cost > 0 ? ` · ${s.cost}c` : ''}
                      </Badge>
                    </Tooltip>
                  );
                })}
              </Group>
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
              <Stack gap={4} mb={8}>
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

          {(strategy.run_regex || strategy.slam_regex) && (
            <Stack gap={4} mb={8} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '6px 8px' }}>
              <SectionLabel>Regex</SectionLabel>
              {strategy.run_regex && <RegexLine value={strategy.run_regex} badge="Run" badgeColor="green" c="teal" />}
              {strategy.slam_regex && <RegexLine value={strategy.slam_regex} badge="Slam" badgeColor="orange" c="orange" />}
            </Stack>
          )}

          <Group gap="xs">
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
        </div>
      </Collapse>
    </div>
  );
};
