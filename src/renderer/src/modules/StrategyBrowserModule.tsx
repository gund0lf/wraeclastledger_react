import {
  Card, Text, Group, Stack, Badge, TextInput, Select, MultiSelect, Button,
  ActionIcon, Loader, Alert, Tooltip, Modal, UnstyledButton, SegmentedControl,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect, useCallback, useRef } from 'react';
import { IconRefresh, IconBrandDiscord, IconShare2 } from '@tabler/icons-react';
import { DEFAULT_SETTINGS, useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { KNOWN_LEAGUES, activeKnownLeagues, isLeagueEnded } from '../utils/league';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import {
  Strategy, ApiResponse, ALL_TYPE_TAGS, BROWSER_COLS, BROWSER_GRID_TEMPLATE, BROWSER_ROW_GAP, BROWSER_ROW_PAD_X,
  BROWSER_MIN_CONTENT_WIDTH, BROWSER_MAXIMIZED_COLS, BROWSER_MAXIMIZED_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_MIN_CONTENT_WIDTH, BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE, BROWSER_SETUP_COLLAPSED_MIN_CONTENT_WIDTH,
  BROWSER_MAXIMIZED_SETUP_COLLAPSED_MIN_CONTENT_WIDTH, BROWSER_ACTIVITY_WIDTH,
  BROWSER_MAXIMIZED_ACTIVITY_WIDTH,
  SortKey, SortOrder, DEFAULT_STRATEGY_SORT, SORT_DEFAULT_DIR, SORT_OPTIONS, STRATEGY_API_URL,
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
import { fingerprintSetupSnapshot, setupSnapshotFromDiscordImport } from '../utils/evidenceIdentity';
import { usePanelMaximized, useSetupSidebarCollapsed } from '../layout/panelLayoutContext';
import { deriveShareTags } from '../utils/shareTags';
import {
  loadNamed,
  nameCurrent,
  startWorking,
} from '../repository/sessionRepositoryRuntime';

// API base (incl. the VITE_STRATEGY_API_URL dev override) moved to
// strategyConstants.STRATEGY_API_URL — shared with the game-data loader.

// ─── Main module ───────────────────────────────────────────────────────────────
export const StrategyBrowserModule = () => {
  const isMaximized = usePanelMaximized('strategy-browser');
  const isSetupSidebarCollapsed = useSetupSidebarCollapsed();
  const browserCols = isMaximized ? BROWSER_MAXIMIZED_COLS : BROWSER_COLS;
  const browserActivityWidth = isMaximized
    ? BROWSER_MAXIMIZED_ACTIVITY_WIDTH
    : BROWSER_ACTIVITY_WIDTH;
  const browserGridTemplate = isSetupSidebarCollapsed
    ? isMaximized
      ? BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE
      : BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE
    : isMaximized
      ? BROWSER_MAXIMIZED_GRID_TEMPLATE
      : BROWSER_GRID_TEMPLATE;
  const browserMinContentWidth = isSetupSidebarCollapsed
    ? isMaximized
      ? BROWSER_MAXIMIZED_SETUP_COLLAPSED_MIN_CONTENT_WIDTH
      : BROWSER_SETUP_COLLAPSED_MIN_CONTENT_WIDTH
    : isMaximized
      ? BROWSER_MAXIMIZED_MIN_CONTENT_WIDTH
      : BROWSER_MIN_CONTENT_WIDTH;
  const {
    maps, settings, discordTag, leagueOverride,
    updateSetting, updateAdvSetting, updateScarab, setLoadedStrategyInfo,
  } = useSessionKeys(
    'maps', 'settings', 'discordTag', 'leagueOverride',
    'updateSetting', 'updateAdvSetting', 'updateScarab', 'setLoadedStrategyInfo',
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
  const [sortBy,     setSortBy]     = useState<SortKey>(DEFAULT_STRATEGY_SORT);
  // null = server default direction for the active sort; only an explicit
  // header re-click sends ?order=. Changing the sort key always resets this.
  const [sortOrder,  setSortOrder]  = useState<SortOrder | null>(null);
  const [period,     setPeriod]     = useState('all');
  const [hideGroup,  setHideGroup]  = useState(false);
  const [browserView, setBrowserView] = useState<'live' | 'retrospectives'>('live');
  const LIMIT = 20;

  const requestCurrentAtlasApply = (
    url: string,
    multiplyingModifiers?: Pick<
      DiscordImport,
      'multiplyingModifiersAllocated' | 'multiplyingModifiersFragmentCount'
    >,
  ) => {
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
      // A schema-v2 authored value is authoritative. Atlas stats may confirm
      // the notable is allocated, but cannot reconstruct the authored fragment
      // count and must never turn an explicit Off back on asynchronously.
      if (multiplyingModifiers && multiplyingModifiers.multiplyingModifiersAllocated !== null) {
        updateSetting(
          'multiplyingModifiersAllocated',
          multiplyingModifiers.multiplyingModifiersAllocated,
        );
        updateSetting(
          'fragmentCountOverride',
          multiplyingModifiers.multiplyingModifiersAllocated
            ? multiplyingModifiers.multiplyingModifiersFragmentCount
            : null,
        );
      } else if (patch.multiplyingModifiersAllocated) {
        updateSetting('multiplyingModifiersAllocated', true);
      }
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

  const handleOpenShare = () => {
    setShareTags(deriveShareTags(settings, maps));
    openShare();
  };

  // ── Import modal ──────────────────────────────────────────────────────────────
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
  const [replacementGuardOpen, { open: openReplacementGuard, close: closeReplacementGuard }] = useDisclosure(false);
  const [replacementName, setReplacementName] = useState('');
  const [pendingReplacement, setPendingReplacement] = useState<(() => Promise<void>) | null>(null);

  const runReplacement = (action: () => Promise<void>): void => {
    void action().catch((error: unknown) => {
      setLoadedMsg(error instanceof Error ? error.message : 'Could not switch sessions.');
    });
  };

  const requestReplacement = (action: () => Promise<void>) => {
    const current = useSessionStore.getState();
    if (current.activeSessionId !== null || !isWorkingSessionMeaningful(current, DEFAULT_SETTINGS)) {
      runReplacement(action);
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

  const continueReplacement = async (saveFirst: boolean): Promise<void> => {
    const action = pendingReplacement;
    if (!action) return;
    try {
      if (saveFirst) {
        const name = replacementName.trim();
        if (!name) return;
        await nameCurrent(name);
      }
      cancelReplacement();
      await action();
    } catch (error: unknown) {
      setLoadedMsg(error instanceof Error ? error.message : 'Could not switch sessions.');
    }
  };

  // ── Load build (called by both StrategyCard and ImportModal) ─────────────────
  const applyStrategyBuild = async (s: Strategy): Promise<void> => {
    await startWorking(true);
    const parsed = s.raw_export ? parseDiscordExport(s.raw_export) : null;
    if (s.map_type === '6-mod' || s.map_type === '8-mod') {
      updateSetting('mapType', s.map_type);
    }
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
      requestCurrentAtlasApply(s.atlas_tree_url, parsed ?? undefined);
    }
    if (parsed) {
      if (parsed.multiplyingModifiersAllocated !== null) {
        updateSetting('multiplyingModifiersAllocated', parsed.multiplyingModifiersAllocated);
        updateSetting(
          'fragmentCountOverride',
          parsed.multiplyingModifiersAllocated
            ? parsed.multiplyingModifiersFragmentCount
            : null,
        );
      }
      if (parsed.mapType === '6-mod' || parsed.mapType === '8-mod') {
        updateSetting('mapType', parsed.mapType);
      }
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
    setLoadedMsg(`Loaded ${s.discord_username}'s build — scarabs, chisel, atlas tree, deli orbs & astrolabe applied.`);
    const p = parsed;
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
    // Viewing a named session preserves the distinct live working target, so
    // this path does not invoke the replacement guard.
    runReplacement(() => loadNamed(sessionId));
  };

  // ── Continue strategy (replacement or evidence, fresh or current) ──────────
  // The card action deliberately funnels both author workflows through one
  // choice. A fresh source clones setup into an empty session; a current source
  // leaves maps, loot and authored prices untouched and only arms the target.
  const [continueCandidate, setContinueCandidate] = useState<Strategy | null>(null);
  const [continueOperation, setContinueOperation] = useState<'evidence' | 'replace'>('evidence');
  const [continueSource, setContinueSource] = useState<'fresh' | 'current'>('fresh');
  const [continueStarting, setContinueStarting] = useState(false);
  const [continueError, setContinueError] = useState<string | null>(null);

  const openContinueCandidate = (s: Strategy) => {
    setContinueOperation('evidence');
    setContinueSource(maps.length > 0 ? 'current' : 'fresh');
    setContinueError(null);
    setContinueCandidate(s);
  };

  const armReplacementTarget = (candidate: Strategy, cloneSetup: boolean) => {
    const apply = async () => {
      if (cloneSetup) await applyStrategyBuild(candidate);
      updateSetting('evidenceTargetStrategyId', null);
      updateSetting('evidenceTargetStrategyName', null);
      updateSetting('evidenceTargetExpectedRevision', null);
      updateSetting('evidenceTargetSetupFingerprint', null);
      updateSetting('updateTargetStrategyId', candidate.id);
      updateSetting('updateTargetStrategyName', candidate.strategy_name || candidate.discord_username || null);
      setLoadedMsg(`Replacement run armed for "${candidate.strategy_name || 'your strategy'}" using ${cloneSetup ? 'a fresh cloned setup' : 'the current session'}. Sharing it will replace the published strategy while preserving votes.`);
    };
    setContinueCandidate(null);
    if (cloneSetup) requestReplacement(apply);
    else apply();
  };

  const armEvidenceTarget = async (candidate: Strategy, cloneSetup: boolean) => {
    setContinueStarting(true);
    setContinueError(null);
    try {
      const response = await fetch(`${apiUrl}/strategies/${candidate.id}`);
      if (!response.ok) throw new Error(`Strategy server returned ${response.status}`);
      const current = await response.json() as Strategy;
      const parsed = current.raw_export ? parseDiscordExport(current.raw_export) : null;
      if (!parsed || parsed.operationError) {
        throw new Error('The current strategy export cannot be verified. Refresh the card or report it before adding evidence.');
      }
      const targetLeague = parsed.league || current.league || '';
      if (!targetLeague) throw new Error('The strategy has no authoring league, so compatibility cannot be proved.');
      if (isLeagueEnded(targetLeague)) {
        throw new Error(`Evidence is closed for ended league ${targetLeague}.`);
      }
      const revision = current.current_revision;
      if (!Number.isInteger(revision) || revision! < 1) {
        throw new Error('The strategy revision is unavailable. Refresh and try again.');
      }
      const setupFingerprint = await fingerprintSetupSnapshot(
        setupSnapshotFromDiscordImport(parsed),
      );

      const apply = async () => {
        if (cloneSetup) {
          await applyStrategyBuild(current);
          updateSetting('leagueName', targetLeague);
        }
        updateSetting('updateTargetStrategyId', null);
        updateSetting('updateTargetStrategyName', null);
        updateSetting('evidenceTargetStrategyId', current.id);
        updateSetting('evidenceTargetStrategyName', current.strategy_name || current.discord_username || null);
        updateSetting('evidenceTargetExpectedRevision', revision!);
        updateSetting('evidenceTargetSetupFingerprint', setupFingerprint);
        setLoadedMsg(`Evidence run armed for "${current.strategy_name || 'your strategy'}" using ${cloneSetup ? 'a fresh cloned setup' : 'the current session'}. Authored prices may differ between runs; setup compatibility is rechecked when sharing.`);
      };
      setContinueCandidate(null);
      if (cloneSetup) requestReplacement(apply);
      else await apply();
    } catch (error: unknown) {
      setContinueError(error instanceof Error ? error.message : 'Could not continue the strategy.');
    } finally {
      setContinueStarting(false);
    }
  };

  const confirmContinueStrategy = (candidate: Strategy) => {
    const cloneSetup = continueSource === 'fresh';
    if (continueOperation === 'replace') armReplacementTarget(candidate, cloneSetup);
    else void armEvidenceTarget(candidate, cloneSetup);
  };

  const applyImportedBuild = async (parsed: DiscordImport): Promise<void> => {
    // Apply what we can from a parsed import (no Strategy object — use parsed fields)
    await startWorking(true);
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
    if (parsed.multiplyingModifiersAllocated !== null) {
      updateSetting('multiplyingModifiersAllocated', parsed.multiplyingModifiersAllocated);
      updateSetting(
        'fragmentCountOverride',
        parsed.multiplyingModifiersAllocated
          ? parsed.multiplyingModifiersFragmentCount
          : null,
      );
    }
    if (parsed.atlasTreeUrl) {
      updateSetting('atlasTreeUrl', parsed.atlasTreeUrl);
      requestCurrentAtlasApply(parsed.atlasTreeUrl, parsed);
    }
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

      <Modal opened={continueCandidate !== null}
        onClose={() => { if (!continueStarting) setContinueCandidate(null); }}
        title={`Continue "${continueCandidate?.strategy_name || 'your strategy'}"`} size="sm">
        <Stack gap="sm">
          <Text size="xs" fw={600}>What should the next share do?</Text>
          <SegmentedControl
            fullWidth size="xs" value={continueOperation}
            onChange={(value) => setContinueOperation(value as 'evidence' | 'replace')}
            data={[
              { value: 'evidence', label: 'Add another run' },
              { value: 'replace', label: 'Replace strategy' },
            ]}
          />
          <Alert color={continueOperation === 'evidence' ? 'teal' : 'indigo'} variant="light" p="xs">
            <Text size="xs">
              {continueOperation === 'evidence'
                ? 'Adds this run to the existing evidence pool without replacing the published strategy. Different authored prices are preserved per run and are not compatibility gates.'
                : 'Publishes this run as a new revision of the strategy. The previous evidence pool is replaced; votes and the original post date are preserved.'}
            </Text>
          </Alert>
          <Text size="xs" fw={600}>Where should the run start?</Text>
          <SegmentedControl
            fullWidth size="xs" value={continueSource}
            onChange={(value) => setContinueSource(value as 'fresh' | 'current')}
            data={[
              { value: 'fresh', label: 'Start fresh session' },
              { value: 'current', label: `Use current session (${maps.length} maps)` },
            ]}
          />
          <Text size="xs" c="dimmed">
            {continueSource === 'fresh'
              ? 'Clones the published scarabs, chisel, Atlas tree, delirium and astrolabe settings into a new empty session.'
              : 'Keeps the current maps, loot, settings and authored prices. Compatibility is checked before sharing, so an unrelated setup is blocked rather than mixed into the pool.'}
          </Text>
          {continueOperation === 'evidence' && (continueCandidate?.evidence_run_count ?? 0) > 0 && (
            <Text size="xs" c="teal">
              Current pool: {continueCandidate!.evidence_run_count} runs / {continueCandidate!.evidence_map_count ?? continueCandidate!.map_count ?? 0} maps
            </Text>
          )}
          {continueError && (
            <Alert color="red" variant="light" p="xs"><Text size="xs">{continueError}</Text></Alert>
          )}
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" disabled={continueStarting}
              onClick={() => setContinueCandidate(null)}>Cancel</Button>
            <Button size="xs" color={continueOperation === 'evidence' ? 'teal' : 'indigo'} loading={continueStarting}
              onClick={() => continueCandidate && confirmContinueStrategy(continueCandidate)}>
              Continue strategy
            </Button>
          </Group>
        </Stack>
      </Modal>

      <div style={{ height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ display: 'flex', flexDirection: 'column', minWidth: browserMinContentWidth }}>
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
            value={sortBy} onChange={(v) => setSort((v as SortKey) ?? DEFAULT_STRATEGY_SORT)} />
          <Tooltip label={hideGroup ? 'Group/party strategies hidden — click to show them' : 'Click to hide group/party strategies'} withArrow>
            <Button size="xs" variant={hideGroup ? 'light' : 'default'} color={hideGroup ? 'cyan' : undefined}
              onClick={() => setHideGroup((v) => !v)}>
              {hideGroup ? 'Show group' : 'Hide group'}
            </Button>
          </Tooltip>
        </Group>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: browserGridTemplate,
          columnGap: BROWSER_ROW_GAP, alignItems: 'center', marginBottom: 3,
          padding: `2px ${BROWSER_ROW_PAD_X}px`, position: 'sticky', top: 0,
          zIndex: 2, background: COLOR.bgPanel,
        }}>
          <div style={{ width: browserCols.chevron, flexShrink: 0 }} />
          <Text size="xs" c="dimmed" style={{ width: browserCols.author, flexShrink: 0, fontSize: FONT.small }}>Author</Text>
          <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 0, fontSize: FONT.small }}>Tags</Text>
          {isSetupSidebarCollapsed && (
            <Tooltip label="Time since the latest published result, or its latest update when revised — click to sort. Exact dates remain inside the expanded card." withArrow multiline w={270}>
              <UnstyledButton onClick={() => handleHeaderSort('activity')} aria-pressed={sortBy === 'activity'}
                style={{ width: browserActivityWidth, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>
                Published / updated{sortArrow('activity')}
              </UnstyledButton>
            </Tooltip>
          )}
          <Tooltip label="Observed average when exact map evidence was shared; otherwise the 6-mod/8-mod strategy bucket. Filtering always uses the bucket." withArrow multiline w={250}>
            <Text size="xs" c="dimmed" style={{ width: browserCols.mod,    flexShrink: 0, fontSize: FONT.small, cursor: 'help' }}>Mod</Text>
          </Tooltip>
          <Text size="xs" c="dimmed" style={{ width: browserCols.maps,   flexShrink: 0, fontSize: FONT.small }}>Maps</Text>
          <Tooltip label="All-in: total investment ÷ map count — click to sort" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('cost_per_map')} aria-pressed={sortBy === 'cost_per_map'}
              style={{ width: browserCols.cost, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Cost/map{sortArrow('cost_per_map')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Click to sort by total investment" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('least_invest')} aria-pressed={sortBy === 'least_invest'}
              style={{ width: browserCols.invest, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Total Invest{sortArrow('least_invest')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Click to sort by net profit" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('net_profit')} aria-pressed={sortBy === 'net_profit'}
              style={{ width: browserCols.profit, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Total Profit{sortArrow('net_profit')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Community score from thumbs reactions on the Discord post — click to sort" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('score')} aria-pressed={sortBy === 'score'}
              style={{ width: browserCols.score, flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Score{sortArrow('score')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Optional author-reported context — click to select it as the sort. It is never the default ranking; div/map stays primary. Strategies without shared time list last." withArrow multiline w={270}>
            <UnstyledButton onClick={() => handleHeaderSort('div_per_hour')} aria-pressed={sortBy === 'div_per_hour'}
              style={{ width: browserCols.dph, textAlign: 'right', flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>div/h{sortArrow('div_per_hour')}</UnstyledButton>
          </Tooltip>
          <Tooltip label="Click to sort by divines per map" withArrow>
            <UnstyledButton onClick={() => handleHeaderSort('div_per_map')} aria-pressed={sortBy === 'div_per_map'}
              style={{ width: browserCols.dpm, textAlign: 'right', flexShrink: 0, fontSize: FONT.small, color: COLOR.textFaint, cursor: 'pointer', userSelect: 'none' }}>Profit/map{sortArrow('div_per_map')}</UnstyledButton>
          </Tooltip>
        </div>

        {loadedMsg && <Alert color="teal" variant="light" p="xs" mb={6} style={{ flexShrink: 0 }}><Text size="xs">{loadedMsg}</Text></Alert>}
        {error     && <Alert color="red"  variant="light" p="xs" mb={6} style={{ flexShrink: 0 }}><Text size="xs">{error}</Text></Alert>}

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
              .map((s) => <StrategyCard key={s.id} strategy={s} onLoadBuild={handleLoadBuild}
                onContinueStrategy={openContinueCandidate}
                discordTag={discordTag} maximized={isMaximized}
                showPublishedActivity={isSetupSidebarCollapsed} />)}
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
