import {
  Card, Text, Group, Stack, Badge, TextInput, Select, MultiSelect, Button,
  ActionIcon, Loader, Alert, Tooltip, Modal, UnstyledButton, SegmentedControl,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { IconRefresh, IconBrandDiscord, IconShare2 } from '@tabler/icons-react';
import { DEFAULT_SETTINGS, useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { KNOWN_LEAGUES, activeKnownLeagues } from '../utils/league';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import {
  Strategy, ApiResponse, ALL_TYPE_TAGS, BROWSER_COLS, BROWSER_GRID_TEMPLATE, BROWSER_ROW_GAP, BROWSER_ROW_PAD_X,
  BROWSER_MIN_CONTENT_WIDTH,
  SortKey, SortOrder, SORT_DEFAULT_DIR, SORT_OPTIONS, STRATEGY_API_URL,
} from '../utils/strategyConstants';
import { StrategyCard } from '../components/StrategyCard';
import { ModuleHeader } from '../components/ui/ModuleHeader';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';
import { PersonalRetrospectives } from '../components/PersonalRetrospectives';
import { PublicRetrospectives } from '../components/PublicRetrospectives';
import type { DiscordImport } from '../utils/parseDiscordExport';
import { COLOR, FONT } from '../utils/uiTokens'
import { WorkingSessionGuardModal } from '../components/WorkingSessionGuardModal';
import { isWorkingSessionMeaningful } from '../utils/workingSession';
import { deriveAtlasCalcSettings } from '../../../shared/atlasStats';

// API base (incl. the VITE_STRATEGY_API_URL dev override) moved to
// strategyConstants.STRATEGY_API_URL — shared with the game-data loader.

// ─── Main module ───────────────────────────────────────────────────────────────
export const StrategyBrowserModule = () => {
  const {
    maps, settings, discordTag, leagueOverride,
    updateSetting, updateAdvSetting, updateScarab, newSession, saveAsNewSession, setLoadedStrategyInfo, loadSession,
  } = useSessionKeys(
    'maps', 'settings', 'discordTag', 'leagueOverride',
    'updateSetting', 'updateAdvSetting', 'updateScarab', 'newSession', 'saveAsNewSession', 'setLoadedStrategyInfo', 'loadSession',
  );
  // Pulled up here (before handleLoadBuild uses it) via a stable-action selector.
  const requestAtlasApply = useUIStore((s) => s.requestAtlasApply);

  const apiUrl = STRATEGY_API_URL;
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [offset,     setOffset]     = useState(0);
  const [loadedMsg,  setLoadedMsg]  = useState<string | null>(null);
  const [typeTags,   setTypeTags]   = useState<string[]>([]);
  // Default filter follows the active context: manual override wins, else the
  // newest known league/event (rollover D4). Initial value only — changing the
  // override mid-session doesn't yank an already-chosen filter.
  // Default follows the first NON-ENDED league (D5b) — a dead event stays
  // selectable in the dropdown but stops being the default.
  const [leagueFilter, setLeagueFilter] = useState<string>(leagueOverride ?? activeKnownLeagues()[0]);
  const [minDiv,     setMinDiv]     = useState('');
  const [sortBy,     setSortBy]     = useState<SortKey>('posted_at');
  // null = server default direction for the active sort; only an explicit
  // header re-click sends ?order=. Changing the sort key always resets this.
  const [sortOrder,  setSortOrder]  = useState<SortOrder | null>(null);
  const [period,     setPeriod]     = useState('all');
  const [hideGroup,  setHideGroup]  = useState(false);
  const [browserView, setBrowserView] = useState<'live' | 'retrospectives'>('live');
  const LIMIT = 20;

  const requestCurrentAtlasApply = (url: string) => {
    const targetSessionNonce = useSessionStore.getState().sessionNonce;
    requestAtlasApply(targetSessionNonce); // visible Atlas Tree lifecycle/reload
    void window.api.readAtlasTreeStats(url).then((result) => {
      if (useSessionStore.getState().sessionNonce !== targetSessionNonce) return;
      if (!result.groups) {
        setLoadedMsg(`Build loaded, but Atlas Calc could not read the Atlas Tree: ${result.error ?? 'unknown error'}.`);
        return;
      }
      const patch = deriveAtlasCalcSettings(result.groups);
      if (patch.smallNodesAllocated !== undefined) updateSetting('smallNodesAllocated', patch.smallNodesAllocated);
      if (patch.mountingModifiers) updateSetting('mountingModifiers', true);
      if (patch.fragmentsUsed) updateSetting('fragmentsUsed', patch.fragmentsUsed);
    }).catch((error: unknown) => {
      if (useSessionStore.getState().sessionNonce !== targetSessionNonce) return;
      const message = error instanceof Error ? error.message : 'unknown error';
      setLoadedMsg(`Build loaded, but Atlas Calc could not read the Atlas Tree: ${message}.`);
    });
  };

  // Refs mirroring loading/offset for the background-refresh interval —
  // keeps the interval effect off those fast-changing deps (no re-arm churn).
  const loadingRef = useRef(false);
  const offsetRef  = useRef(0);
  loadingRef.current = loading;
  offsetRef.current  = offset;

  // ── Share modal ───────────────────────────────────────────────────────────────
  const [shareOpen, { open: openShare, close: closeShare }] = useDisclosure(false);
  const [shareTags, setShareTags] = useState<string[]>([]);

  const autoTags = useMemo(() => {
    const names = settings.scarabs.filter((s) => s.name).map((s) => s.name.toLowerCase()).join(' ');
    const cats: [string, string][] = [
      ['delirium','delirium'],['legion','legion'],['breach','breach'],['harvest','harvest'],
      ['expedition','expedition'],['ritual','ritual'],['abyss','abyss'],['blight','blight'],
      ['beyond','beyond'],['incursion','incursion'],['betrayal','betrayal'],['essence','essence'],
      ['divination','divination'],['harbinger','harbinger'],['titanic','titanic'],
      ['torment','torment'],['ultimatum','ultimatum'],['kalguuran','kalguur'],
      ['heist','heist'],['metamorph','metamorph'],['ambush','ambush'],['cartography','cartography'],
    ];
    return cats.filter(([kw]) => names.includes(kw)).map(([, tag]) => tag);
  }, [settings.scarabs]);

  const handleOpenShare = () => {
    if (shareTags.length === 0) {
      const merged = Array.from(new Set([...autoTags, ...(settings.atlasDetectedTags ?? [])]));
      if (maps.length > 0) {
      const isOrig  = (m: any) => m.isOriginator      || (m.rawText?.includes("Originator's Memories") ?? false);
      const isEmp   = (m: any) => m.isEmpoweredMirage  || (m.rawText?.includes('Empowered Mirage which covers the entire Map') ?? false);
      const isNight = (m: any) => m.isNightmare         || (m.rawText?.includes('Nightmare Map') ?? false);
      const hasOrig  = maps.some(isOrig);  const allOrig  = maps.every(isOrig);
      const hasEmp   = maps.some(isEmp);   const allEmp   = maps.every(isEmp);
      const hasNight = maps.some(isNight);
      let subtype = '';
      if (hasNight && maps.every(isNight))       subtype = 'nightmare';
      else if (allOrig && allEmp)                subtype = 'empowered-originator';
      else if (allOrig && !hasEmp)               subtype = 'originator';
      else if (allEmp  && !hasOrig)              subtype = 'empowered';
      else if (!hasOrig && !hasEmp && !hasNight) subtype = 'regular';
      else                                       subtype = 'mixed';
      if (subtype && !merged.includes(subtype)) merged.unshift(subtype);
    }
    if (settings.advAstrolabeType) {
      const a = settings.advAstrolabeType.toLowerCase();
      let astroTag = 'astrolabe';
      if      (a.includes('templar'))         astroTag = 'astrolabe-templar';
      else if (a.includes('enshrouded'))      astroTag = 'astrolabe-enshrouded';
      else if (a.includes('timeless'))        astroTag = 'astrolabe-timeless';
      else if (a.includes('grasping'))        astroTag = 'astrolabe-grasping';
      else if (a.includes('nameless'))        astroTag = 'astrolabe-nameless';
      else if (a.includes('runic'))           astroTag = 'astrolabe-runic';
      else if (a.includes('fruiting'))        astroTag = 'astrolabe-fruiting';
      else if (a.includes('fungal'))          astroTag = 'astrolabe-fungal';
      else if (a.includes('chaotic'))         astroTag = 'astrolabe-chaotic';
      else if (a.includes('lightless'))       astroTag = 'astrolabe-lightless';
      if (!merged.includes(astroTag)) merged.push(astroTag);
      }
      if (merged.length > 0) setShareTags(merged);
    }
    openShare();
  };

  // ── Import modal ──────────────────────────────────────────────────────────────
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
  const [replacementGuardOpen, { open: openReplacementGuard, close: closeReplacementGuard }] = useDisclosure(false);
  const [replacementName, setReplacementName] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<(() => void) | null>(null);

  const requestReplacement = (action: () => void) => {
    if (!isWorkingSessionMeaningful(useSessionStore.getState(), DEFAULT_SETTINGS)) {
      action();
      return;
    }
    setPendingReplacement(() => action);
    setReplacementName('');
    openReplacementGuard();
  };

  const cancelReplacement = () => {
    setPendingReplacement(null);
    setReplacementName('');
    closeReplacementGuard();
  };

  const continueReplacement = (saveFirst: boolean) => {
    const action = pendingReplacement;
    if (!action) return;
    if (saveFirst) {
      const name = replacementName.trim();
      if (!name) return;
      saveAsNewSession(name);
    }
    cancelReplacement();
    action();
  };

  // ── Load build (called by both StrategyCard and ImportModal) ─────────────────
  const applyStrategyBuild = (s: Strategy) => {
    newSession();
    if (s.chisel && s.chisel !== 'None') {
      updateSetting('chiselType', s.chisel.split(' ')[0]);
      updateSetting('chiselUsed', true);
    }
    if (s.scarabs && s.scarabs.length > 0) {
      s.scarabs.slice(0, 5).forEach((scarab, i) => {
        updateScarab(i, 'name', scarab.name);
        updateScarab(i, 'cost', scarab.cost);
      });
    }
    if (s.atlas_tree_url) {
      updateSetting('atlasTreeUrl', s.atlas_tree_url);
      // Force the Atlas Tree to re-apply the tree to the Atlas Calc even when the
      // URL is unchanged (loading the SAME strategy twice). newSession() zeroed the
      // calc config; without this the URL-change effect can't fire on an unchanged
      // URL, so the calc would stay empty and the setup wizard would reappear.
      requestCurrentAtlasApply(s.atlas_tree_url);
    }
    if (s.raw_export) {
      const parsed = parseDiscordExport(s.raw_export);
      if (parsed) {
        if (parsed.deliOrbType) {
          updateAdvSetting('advDeliOrbType', parsed.deliOrbType);
          if (parsed.deliOrbQty   > 0) updateAdvSetting('advDeliOrbQtyPerMap',  parsed.deliOrbQty);
          if (parsed.deliOrbPrice > 0) updateAdvSetting('advDeliOrbPriceEach',  parsed.deliOrbPrice);
        }
        if (parsed.astroType) {
          updateAdvSetting('advAstrolabeType', parsed.astroType);
          if (parsed.astroCount > 0) updateAdvSetting('advAstrolabeCount', parsed.astroCount);
          if (parsed.astroPrice > 0) updateAdvSetting('advAstrolabePrice', parsed.astroPrice);
        }
      }
    }
    setLoadedMsg(`Loaded ${s.discord_username}'s build — scarabs, chisel, atlas tree, deli orbs & astrolabe applied.`);
    const p = s.raw_export ? parseDiscordExport(s.raw_export) : null;
    const runRegex = p?.runRegex || s.run_regex;
    if (runRegex) {
      setLoadedStrategyInfo({
        authorName: s.strategy_name || s.discord_username,
        mapCount:   p?.mapCount || s.map_count || 0,
        avgQuant:   p?.avgQuant  ?? s.avg_quant  ?? 0,
        avgRarity:  p?.avgRarity ?? s.avg_rarity ?? 0,
        avgPack:    p?.avgPack   ?? s.avg_pack   ?? 0,
        avgCurr:    p?.avgCurr   ?? s.avg_currency ?? 0,
        runRegex,
        slamRegex:  (p?.slamRegex || s.slam_regex) ?? undefined,
        mapType:    s.map_type === '8-mod' ? '8mod'
          : (s.type_tag?.split(',').find((t) =>
              ['nightmare','originator','empowered-originator','empowered'].includes(t.trim())
            ) ?? undefined),
      });
    }
    setTimeout(() => setLoadedMsg(null), 6000);
  };

  const handleLoadBuild = (strategy: Strategy) => {
    requestReplacement(() => applyStrategyBuild(strategy));
  };

  const handleLoadPersonalSession = (sessionId: string) => {
    requestReplacement(() => loadSession(sessionId));
  };

  // ── Update strategy (versioning client half, design v3.1 §2) ─────────────────
  // Button on OWN cards → confirmation (same-setup wording, round-2 point 7) →
  // setup-only clone into a fresh session (reuses handleLoadBuild: scarabs,
  // chisel, atlas tree, deli orbs, astrolabe — never maps/loot/baseline) +
  // the PERSISTED update target. ShareModal picks the target up from settings.
  const [updateCandidate, setUpdateCandidate] = useState<Strategy | null>(null);

  const confirmUpdateStrategy = (s: Strategy) => {
    setUpdateCandidate(null);
    requestReplacement(() => {
      applyStrategyBuild(s);
      updateSetting('updateTargetStrategyId', s.id);
      updateSetting('updateTargetStrategyName', s.strategy_name || s.discord_username || null);
      setLoadedMsg(`Update run started for "${s.strategy_name || 'your strategy'}" — setup cloned into a fresh session. Sharing it will UPDATE the published result.`);
    });
  };

  const applyImportedBuild = (parsed: DiscordImport) => {
    // Apply what we can from a parsed import (no Strategy object — use parsed fields)
    newSession();
    if (parsed.chisel && parsed.chisel !== 'None') {
      updateSetting('chiselType', parsed.chisel.split(' ')[0]);
      updateSetting('chiselUsed', true);
    }
    if (parsed.scarabs && parsed.scarabs.length > 0) {
      parsed.scarabs.slice(0, 5).forEach((name, i) => {
        updateScarab(i, 'name', name);
        if (parsed.scarabCosts[i] > 0) updateScarab(i, 'cost', parsed.scarabCosts[i]);
      });
    }
    if (parsed.atlasTreeUrl) { updateSetting('atlasTreeUrl', parsed.atlasTreeUrl); requestCurrentAtlasApply(parsed.atlasTreeUrl); }
    if (parsed.deliOrbType)  { updateAdvSetting('advDeliOrbType', parsed.deliOrbType); updateAdvSetting('advDeliOrbQtyPerMap', parsed.deliOrbQty); updateAdvSetting('advDeliOrbPriceEach', parsed.deliOrbPrice); }
    if (parsed.astroType)    { updateAdvSetting('advAstrolabeType', parsed.astroType); updateAdvSetting('advAstrolabeCount', parsed.astroCount); updateAdvSetting('advAstrolabePrice', parsed.astroPrice); }
    if (parsed.runRegex) {
      setLoadedStrategyInfo({
        authorName: parsed.strategyName || 'Imported',
        mapCount:   parsed.mapCount,
        avgQuant:   parsed.avgQuant,
        avgRarity:  parsed.avgRarity,
        avgPack:    parsed.avgPack,
        avgCurr:    parsed.avgCurr,
        runRegex:   parsed.runRegex,
        slamRegex:  parsed.slamRegex || undefined,
        mapType:    parsed.mapType === '8-mod' ? '8mod' : undefined,
      });
    }
    setLoadedMsg(`Imported build settings applied: chisel, scarabs, atlas tree, deli orbs & astrolabe.`);
    setTimeout(() => setLoadedMsg(null), 6000);
  };

  const handleLoadFromImport = (parsed: DiscordImport) => {
    requestReplacement(() => applyImportedBuild(parsed));
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchStrategies = useCallback(async (newOffset = 0) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(newOffset), sort: sortBy });
      if (sortOrder) params.set('order', sortOrder);
      if (typeTags.length > 0) params.set('type_tag', typeTags.join(','));
      const divNum = parseFloat(minDiv);
      if (!isNaN(divNum) && divNum > 0) params.set('min_div', String(divNum));
      if (period !== 'all') params.set('since', period);
      if (leagueFilter) params.set('league', leagueFilter);
      const res  = await fetch(`${apiUrl}/strategies?${params}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: ApiResponse = await res.json();
      setStrategies(newOffset === 0 ? data.strategies : (prev) => [...prev, ...data.strategies]);
      setTotal(data.total); setOffset(newOffset);
    } catch (err: any) { setError(err.message ?? 'Could not reach the strategy server.'); }
    finally { setLoading(false); }
  }, [apiUrl, typeTags, minDiv, sortBy, sortOrder, period, leagueFilter]);

  // ── Sorting (dropdown + click-header share the same state) ──────────────────
  const setSort = (key: SortKey) => { setSortBy(key); setSortOrder(null); };
  const effectiveDir: SortOrder = sortOrder ?? SORT_DEFAULT_DIR[sortBy];
  const handleHeaderSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortOrder(effectiveDir === 'asc' ? 'desc' : 'asc'); // re-click flips
    } else {
      setSort(key);
    }
  };
  const sortArrow = (key: SortKey) =>
    sortBy === key ? (effectiveDir === 'asc' ? ' ▲' : ' ▼') : '';

  const { pendingStrategyAction, clearStrategyAction } = useUIStore();

  useEffect(() => {
    if (!pendingStrategyAction) return;
    if (pendingStrategyAction === 'share')  handleOpenShare();
    if (pendingStrategyAction === 'import') openImport();
    clearStrategyAction();
  }, [pendingStrategyAction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStrategies(0); }, [fetchStrategies]);

  // Background refresh (Sad 2026-07-10): re-pull the first page every 5 min so
  // fresh shares/votes appear without manual refresh. Skipped while a fetch is
  // in flight or the user has paginated past page 1 (a refresh would discard
  // their loaded rows); the interval keys on fetchStrategies, so filter/sort
  // changes reset the timer naturally.
  useEffect(() => {
    const id = setInterval(() => {
      if (loadingRef.current || offsetRef.current > 0) return;
      fetchStrategies(0);
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [fetchStrategies]);

  const hasMore = offset + LIMIT < total;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <ShareModal opened={shareOpen} onClose={closeShare} initialTags={shareTags} />
      <ImportModal opened={importOpen} onClose={closeImport} onLoadBuild={handleLoadFromImport} />
      <WorkingSessionGuardModal
        opened={replacementGuardOpen}
        mapCount={maps.length}
        name={replacementName}
        actionDescription="Loading these build settings"
        onNameChange={setReplacementName}
        onSave={() => continueReplacement(true)}
        onDiscard={() => continueReplacement(false)}
        onCancel={cancelReplacement}
      />

      <Modal opened={updateCandidate !== null} onClose={() => setUpdateCandidate(null)}
        title={`Update "${updateCandidate?.strategy_name || 'your strategy'}"?`} size="sm">
        <Stack gap="sm">
          <Text size="xs">
            This starts a fresh measurement run: your setup (scarabs, chisel, atlas tree, deli
            orbs, astrolabe) is cloned into a new empty session. Run it, import a fresh baseline
            and return, then Share — the export will replace the published result in place.
            Votes and the original post date are kept.
          </Text>
          <Text size="xs" c="dimmed">
            Use this only for the SAME farming setup. Price changes are expected; changing
            scarabs, map type, atlas strategy or other core configuration should normally be
            shared as a new strategy instead.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setUpdateCandidate(null)}>Cancel</Button>
            <Button size="xs" color="indigo" onClick={() => updateCandidate && confirmUpdateStrategy(updateCandidate)}>
              Load setup &amp; start update run
            </Button>
          </Group>
        </Stack>
      </Modal>

      <div style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ display: 'flex', flexDirection: 'column', minWidth: BROWSER_MIN_CONTENT_WIDTH }}>
        {/* session-16: "Strategy Browser" title dropped (redundant with the
            tab label); the count badge anchors the left. */}
        <ModuleHeader
          title={
            <Group gap={6} wrap="nowrap">
              <SegmentedControl
                size="xs"
                value={browserView}
                onChange={(value) => setBrowserView(value as 'live' | 'retrospectives')}
                data={[
                  { value: 'live', label: 'Live' },
                  { value: 'retrospectives', label: 'Retrospectives' },
                ]}
              />
              {browserView === 'live' && (
                <Tooltip label="Strategies matching the current filters" withArrow>
                  <Badge color="gray" variant="outline" size="sm" style={{ cursor: 'default', fontVariantNumeric: 'tabular-nums' }}>{total} strategies</Badge>
                </Tooltip>
              )}
            </Group>
          }
          right={
            browserView === 'live' ? <Group gap={4}>
              <Tooltip label="Analyse an export from Discord">
                <Button size="xs" variant="default" leftSection={<IconBrandDiscord size={12} />} onClick={openImport}>Import Strategy</Button>
              </Tooltip>
              <Tooltip label="Share your current session">
                <Button size="xs" variant="default" leftSection={<IconShare2 size={12} />} onClick={handleOpenShare}>Share Strategy</Button>
              </Tooltip>
              <Tooltip label="Refresh strategies" withArrow>
                <ActionIcon size="md" variant="default" loading={loading} aria-label="Refresh strategies"
                  onClick={() => fetchStrategies(0)}><IconRefresh size={14} /></ActionIcon>
              </Tooltip>
            </Group> : undefined
          }
        />

        {browserView === 'live' ? (
          <>
        <Group gap={6} mb={6} style={{ flexShrink: 0 }} wrap="nowrap">
          <MultiSelect size="xs" placeholder="Any type" clearable style={{ flex: 1 }}
            data={ALL_TYPE_TAGS.map((t) => ({ value: t, label: t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }))}
            value={typeTags} onChange={setTypeTags} maxDropdownHeight={200} searchable />
          <Select size="xs" style={{ width: 110 }}
            data={[...new Set([...(leagueOverride ? [leagueOverride] : []), ...KNOWN_LEAGUES])]
              .filter((l) => l !== 'Standard').map((l) => ({ value: l, label: l }))}
            value={leagueFilter} onChange={(v) => setLeagueFilter(v ?? leagueOverride ?? activeKnownLeagues()[0])} />
          <TextInput size="xs" placeholder="Min d/map" style={{ width: 80 }}
            value={minDiv} onChange={(e) => setMinDiv(e.currentTarget.value)} />
          <Select size="xs" style={{ width: 90 }}
            data={[{ value: 'all', label: 'All time' },{ value: '1d', label: 'Last 24h' },{ value: '3d', label: 'Last 3 days' },{ value: '7d', label: 'Last 7 days' }]}
            value={period} onChange={(v) => setPeriod(v ?? 'all')} />
          <Select size="xs" style={{ flex: 1 }}
            data={SORT_OPTIONS}
            value={sortBy} onChange={(v) => setSort((v as SortKey) ?? 'posted_at')} />
          <Tooltip label={hideGroup ? 'Group/party strategies hidden — click to show them' : 'Click to hide group/party strategies'} withArrow>
            <Button size="xs" variant={hideGroup ? 'light' : 'default'} color={hideGroup ? 'cyan' : undefined}
              onClick={() => setHideGroup((v) => !v)}>
              {hideGroup ? 'Show group' : 'Hide group'}
            </Button>
          </Tooltip>
        </Group>

        <div style={{
          display: 'grid', gridTemplateColumns: BROWSER_GRID_TEMPLATE,
          columnGap: BROWSER_ROW_GAP, alignItems: 'center', marginBottom: 3,
          flexShrink: 0, padding: `0 ${BROWSER_ROW_PAD_X}px`,
        }}>
          <div style={{ width: BROWSER_COLS.chevron, flexShrink: 0 }} />
          <Text size="xs" c="dimmed" style={{ width: BROWSER_COLS.author, flexShrink: 0, fontSize: FONT.small }}>Author</Text>
          <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0, fontSize: FONT.small }}>Tags</Text>
          <Tooltip label="Observed average when exact map evidence was shared; otherwise the 6-mod/8-mod strategy bucket. Filtering always uses the bucket." withArrow multiline w={250}>
            <Text size="xs" c="dimmed" style={{ width: BROWSER_COLS.mod,    flexShrink: 0, fontSize: FONT.small, cursor: 'help' }}>Mod</Text>
          </Tooltip>
          <Text size="xs" c="dimmed" style={{ width: BROWSER_COLS.maps,   flexShrink: 0, fontSize: FONT.small }}>Maps</Text>
          <Tooltip label="All-in: total investment ÷ map count — click to sort" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('cost_per_map')} aria-pressed={sortBy === 'cost_per_map'}
              style={{ width: BROWSER_COLS.cost, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Cost/map{sortArrow('cost_per_map')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Click to sort by total investment" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('least_invest')} aria-pressed={sortBy === 'least_invest'}
              style={{ width: BROWSER_COLS.invest, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Total Invest{sortArrow('least_invest')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Click to sort by net profit" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('net_profit')} aria-pressed={sortBy === 'net_profit'}
              style={{ width: BROWSER_COLS.profit, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Total Profit{sortArrow('net_profit')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Community score from thumbs reactions on the Discord post — click to sort" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('score')} aria-pressed={sortBy === 'score'}
              style={{ width: BROWSER_COLS.score, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Score{sortArrow('score')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Optional author-reported context — click to select it as the sort. It is never the default ranking; div/map stays primary. Strategies without shared time list last." withArrow multiline w={270}>
            <UnstyledButton onClick={() => handleHeaderSort('div_per_hour')} aria-pressed={sortBy === 'div_per_hour'}
              style={{ width: BROWSER_COLS.dph, textAlign: 'right', flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>div/h{sortArrow('div_per_hour')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Click to sort by divines per map" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('div_per_map')} aria-pressed={sortBy === 'div_per_map'}
              style={{ width: BROWSER_COLS.dpm, textAlign: 'right', flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Profit/map{sortArrow('div_per_map')}</UnstyledButton>
          </Tooltip>
        </div>

        {loadedMsg && <Alert color="teal" variant="light" p="xs" mb={6} style={{ flexShrink: 0 }}><Text size="xs">{loadedMsg}</Text></Alert>}
        {error     && <Alert color="red"  variant="light" p="xs" mb={6} style={{ flexShrink: 0 }}><Text size="xs">{error}</Text></Alert>}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!loading && strategies.length === 0 && !error && (
            <Stack align="center" justify="center" style={{ height: 120 }} gap="xs">
              <Text size="sm" c="dimmed">No strategies yet.</Text>
              <Text size="xs" c="dimmed">Use the Share button to post your first session.</Text>
            </Stack>
          )}
          <Stack gap={3}>
            {strategies
              .filter((s) => {
                if (!hideGroup) return true;
                const grp = s.is_group_play || (s.raw_export ? /Party Play:\s*Yes/i.test(s.raw_export) : false);
                return !grp;
              })
              .map((s) => <StrategyCard key={s.id} strategy={s} onLoadBuild={handleLoadBuild} onUpdateStrategy={setUpdateCandidate} discordTag={discordTag} />)}
          </Stack>
          {hasMore && !loading && (
            <Button variant="subtle" size="xs" fullWidth mt={8} onClick={() => fetchStrategies(offset + LIMIT)}>
              Load more ({total - offset - LIMIT} remaining)
            </Button>
          )}
          {loading && <Group justify="center" mt={12}><Loader size="sm" /></Group>}
        </div>

        <Text size="xs" c="dimmed" ta="center" mt={6} style={{ flexShrink: 0 }}>
          Vote with the thumbs reactions in Discord · Share submits your session · Load Build starts a new session
        </Text>
          </>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <Stack gap="md">
              <PersonalRetrospectives onLoadSession={handleLoadPersonalSession} />
              <PublicRetrospectives onLoadStrategy={handleLoadBuild} />
            </Stack>
          </div>
        )}
      </Card>
      </div>
    </>
  );
};
