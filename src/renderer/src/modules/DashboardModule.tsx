import {
  Card, Text, Group, Stack, Badge, Divider, ActionIcon,
  Button, SegmentedControl, Table, Checkbox, TextInput,
  Progress, Image, Skeleton, Tooltip, Modal, SimpleGrid, Anchor,
  NumberInput, Select, Textarea, Alert,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { QUALITY_STAT_EFFECTS, CHISEL_TYPES, DELIRIUM_ORB_LIST } from '../utils/constants';
import { LootCategory, ManualLootItem, MapData, LootItem } from '../types';
import { parseLootCsv, diffLootItems } from '../utils/lootUtils';
import {
  IconCoins, IconFileImport, IconPencil, IconPlus, IconPackage,
  IconSearch, IconTrash,
} from '@tabler/icons-react';
import { getItemIcons, chiselItemName } from '../utils/itemIcons';
import type { ItemIdentity } from '../utils/itemIcons';
import {
  EQUIPMENT_GROUP_LABEL,
  SYNDICATE_MEMBERS,
  ITEM_INFLUENCES,
  manualLootIdentityArtName,
  manualLootIdentityCategory,
  manualLootIdentityName,
  normalizeManualLootIdentity,
  normalizeTradeItemCatalog,
  type EquipmentCatalogGroup,
  type ItemInfluence,
  type ManualLootIdentity,
  type TradeItemCatalog,
} from '../../../shared/manualLoot';
import { PoeItemIcon } from '../components/ui/PoeItemIcon';
import { LootCategoryGlyph, LootCategoryIcon } from '../components/ui/LootCategoryIcon';
import { computeProfit, computeMultiplier } from '../utils/profit';
import { fcSep } from '../utils/parseDiscordExport';
import { computeTimeEstimate, formatActiveTime } from '../utils/timeEstimate';
import { assignLootCategories, buildCategoryBreakdown, categorise, ITEM_CATEGORIES, ItemCategory, CAT_COLORS } from '../utils/lootCategories';
import { LOOT_SUMMARY_ROW_LIMIT, MANUAL_LOOT_NAME_MAX, MANUAL_LOOT_NOTE_MAX } from '../utils/lootSummary';
import { StatTile } from '../components/ui/StatTile';
import { GettingStartedCard } from '../components/GettingStartedCard';
import { CollapsibleSection as Section } from '../components/ui/CollapsibleSection';
import { COLOR, FONT } from '../utils/uiTokens'
import { isCrossLeagueSession } from '../utils/historicalSession';
import { hasDivinePrice } from '../utils/currencyDisplay';
import {
  LootCurrencyPair,
  LootCurrencyToggle,
  LootCurrencyValue,
} from '../components/ui/LootCurrencyDisplay';
import {
  formatManualLootValueInput,
  manualLootTotalAfterQuantityChange,
  manualLootTotalFromEntry,
  parseManualLootValueInput,
  type ManualLootValueMode,
} from '../utils/manualLootValue';
import './DashboardModule.css';

// Smart page size: show INITIAL rows, user can load more in STEP increments
const INITIAL_ROWS = 25;
const STEP_ROWS    = 25;

const STAT_KEYS: (keyof MapData)[] = [
  'quantity', 'rarity', 'packSize', 'moreCurrency', 'moreMaps', 'moreScarabs', 'moreDivCards',
];
const STAT_LABELS: Record<string, string> = {
  quantity: 'Quantity', rarity: 'Rarity', packSize: 'Pack Size',
  moreCurrency: 'Currency', moreMaps: 'Maps', moreScarabs: 'Scarabs',
  moreDivCards: 'Div Cards',
};

const ICON_SIZE = 24; // density pass: 20 was undersized next to 12px row text

interface CsvCandidate {
  name: string;
  items: LootItem[];
  total: number;
}

interface ManualLootDraft {
  name: string;
  quantity: number;
  total: number;
  category: LootCategory;
  note: string;
  identity?: ManualLootIdentity;
}

const EMPTY_MANUAL_LOOT: ManualLootDraft = {
  name: '', quantity: 1, total: 0, category: 'Other', note: '',
};

type IconResolver = (name: string) => string | undefined;
type IdentityResolver = (name: string) => ItemIdentity | undefined;
type NameSuggestionResolver = (name: string) => ItemIdentity | undefined;
type ManualLootMode = 'free' | ManualLootIdentity['kind'];

const LootCategoryFallback = ({
  name, tab, category,
}: {
  name: string;
  tab: string;
  category?: LootCategory;
}) => {
  return <LootCategoryGlyph category={category ?? categorise(name, tab)} size={ICON_SIZE} />;
};

const ResolvedLootIcon = ({
  name, tab, category, resolver, loading,
}: {
  name: string;
  tab: string;
  category?: LootCategory;
  resolver: IconResolver | null;
  loading: boolean;
}) => {
  const url = resolver?.(name);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!resolver && loading) return <Skeleton w={ICON_SIZE} h={ICON_SIZE} radius="xs" />;
  if (!url || failedUrl === url) return <LootCategoryFallback name={name} tab={tab} category={category} />;
  return (
    <Tooltip label={name} openDelay={500} withinPortal>
      <Image src={url} w={ICON_SIZE} h={ICON_SIZE} fit="contain"
        style={{ flexShrink: 0 }} onError={() => setFailedUrl(url)} />
    </Tooltip>
  );
};

export const DashboardModule = () => {
  const {
    maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems,
    setLootItems, setBaselineItems, toggleLootItemExcluded, clearLoot,
    addManualLootItem, updateManualLootItem, removeManualLootItem,
    investmentNeutralization, setInvestmentNeutralization,
    investmentDismissed, setInvestmentDismissed,
    onboardingDismissed, dismissOnboarding, sessionLifecycle, leagueOverride,
    lootCurrencyMode, setLootCurrencyMode,
  } = useSessionKeys(
    'maps', 'settings', 'lootItems', 'baselineItems', 'baselineTotal', 'manualLootItems',
    'setLootItems', 'setBaselineItems', 'toggleLootItemExcluded', 'clearLoot',
    'addManualLootItem', 'updateManualLootItem', 'removeManualLootItem',
    'investmentNeutralization', 'setInvestmentNeutralization',
    'investmentDismissed', 'setInvestmentDismissed',
    'onboardingDismissed', 'dismissOnboarding', 'sessionLifecycle', 'leagueOverride',
    'lootCurrencyMode', 'setLootCurrencyMode',
  );

  // Phase 1.5 (rollover plan): cross-league loaded session banner. The
  // store-level guards already freeze prices/league/points; this is the
  // visible explanation.
  const crossLeague = isCrossLeagueSession(sessionLifecycle, settings.leagueName);

  const stats = useMemo(() => {
    const count = maps.length;
    if (count === 0) return null;
    const { multiplier, usesObservedMods, observedModAverage } = computeMultiplier(settings, maps);
    const qualBonuses: Record<string, number> = {};
    for (const map of maps) {
      const e = QUALITY_STAT_EFFECTS[map.qualityType];
      if (e && map.quality > 0) qualBonuses[e.statKey] = (qualBonuses[e.statKey] ?? 0) + map.quality * e.multiplier;
    }
    const chiselInfo = settings.chiselType ? CHISEL_TYPES[settings.chiselType] : null;
    const chiselExp: Record<string, number> = {};
    if (chiselInfo && settings.chiselPrice > 0) {
      const unc = maps.filter((m) => m.quality === 0).length;
      if (unc > 0) chiselExp[chiselInfo.statKey] = (unc / count) * chiselInfo.bonusAt20;
    }
    const result: Record<string, { avg: number; proj: number; hasChisel: boolean }> = {};
    for (const key of STAT_KEYS) {
      const avg    = maps.reduce((acc, m) => acc + ((m[key] as number) ?? 0), 0) / count;
      const qBonus = ((qualBonuses[key as string] ?? 0) / count) + (chiselExp[key as string] ?? 0);
      const atlasQFlat = (key === 'quantity' && settings.atlasBonus) ? 25 : 0;
      result[key as string] = { avg, proj: (avg - qBonus) * multiplier + qBonus + atlasQFlat,
        hasChisel: !!(chiselInfo?.statKey === key as string) };
    }
    return { count, multiplier, usesObservedMods, observedModAverage, stats: result };
  }, [maps, settings]);

  // All profit math lives in utils/profit.ts (WP1) - single source of truth
  // shared with ShareModal/discordExport and InvestmentModule. The rolling
  // session total is derived LIVE from settings + map count (the stored
  // settings.rollingCostPerMap was stale and is removed in migration v16).
  const profit = useMemo(() => computeProfit({
    settings, mapCount: maps.length, lootItems, baselineTotal, investmentNeutralization,
    manualLootItems,
  }), [maps.length, settings, lootItems, baselineTotal, investmentNeutralization, manualLootItems]);

  // WP9 Tier 1: local pace estimate from parsedAt gaps. Null until >= 5
  // timestamped maps; never persisted, never shared, never load-bearing.
  const pace = useMemo(() => computeTimeEstimate(maps), [maps]);
  const timestampedMaps = useMemo(
    () => maps.filter((map) => typeof map.parsedAt === 'number' && Number.isFinite(map.parsedAt)).length,
    [maps],
  );

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const pendingRoleRef = useRef<'baseline' | 'current' | null>(null);
  const [pendingItems, setPendingItems] = useState<LootItem[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [blOpen,     { open: openBl,   close: closeBl   }] = useDisclosure(false);
  const [pairOpen,   { open: openPair, close: closePair }] = useDisclosure(false);
  const [pairCandidates, setPairCandidates] = useState<CsvCandidate[]>([]);
  const [clearOpen,  { open: openClear, close: closeClear }] = useDisclosure(false);
  const [manualOpen, { open: openManual, close: closeManual }] = useDisclosure(false);
  const [lootView,  setLootView]  = useState<'list' | 'diff' | 'breakdown'>('list');
  const [search,    setSearch]    = useState('');
  const [diffTab,   setDiffTab]   = useState<'gains' | 'losses'>('gains');
  const [resolver,  setResolver]  = useState<IconResolver | null>(null);
  const [identityResolver, setIdentityResolver] = useState<IdentityResolver | null>(null);
  const [nameSuggester, setNameSuggester] = useState<NameSuggestionResolver | null>(null);
  const [manualCatalog, setManualCatalog] = useState<TradeItemCatalog>(
    () => normalizeTradeItemCatalog(null),
  );
  const [manualCatalogLoading, setManualCatalogLoading] = useState(false);
  const [manualCatalogError, setManualCatalogError] = useState<string | null>(null);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [visibleListRows, setVisibleListRows] = useState(INITIAL_ROWS);
  const [visibleDiffRows, setVisibleDiffRows] = useState(INITIAL_ROWS);
  const [hoveredLootClear, setHoveredLootClear] = useState(false); // loot-clear icon red hover (Sessions pattern)
  const [dragOver, setDragOver] = useState(false); // CSV drag-and-drop highlight
  const [editingManualId, setEditingManualId] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState<ManualLootDraft>(EMPTY_MANUAL_LOOT);
  const [manualValueMode, setManualValueMode] = useState<ManualLootValueMode>('total');
  const [manualValueText, setManualValueText] = useState('0');

  const hasBaseline = baselineItems.length > 0 || baselineTotal > 0;
  const hasCurrent  = lootItems.length > 0;
  const hasBoth     = hasBaseline && hasCurrent;
  const divPrice = hasDivinePrice(settings.divinePrice) ? settings.divinePrice : null;
  const manualValueParse = useMemo(
    () => parseManualLootValueInput(manualValueText, divPrice),
    [manualValueText, divPrice],
  );
  const manualCanonicalTotal = manualValueParse.ok
    ? manualLootTotalFromEntry(manualValueParse.chaos, manualDraft.quantity, manualValueMode)
    : 0;
  const manualValueError = manualValueParse.ok || manualValueText.trim().length === 0
    ? undefined
    : manualValueParse.reason === 'divine-price'
      ? 'Set a valid session Divine price before entering a Divine value.'
      : 'Enter Chaos as 100 or 100c, or Divines as 0.4d or .4d.';

  useEffect(() => {
    if (!hasCurrent && !hasBaseline) return;
    setIconsLoading(true);
    getItemIcons().then((catalog) => {
      setResolver(() => catalog.resolve);
      setIdentityResolver(() => catalog.resolveIdentity);
      setNameSuggester(() => catalog.suggestName);
    }).catch(() => {}).finally(() => setIconsLoading(false));
  }, [hasCurrent, hasBaseline, settings.leagueName, leagueOverride]);

  useEffect(() => {
    if (!manualOpen || !window.api?.fetchTradeItemCatalog) return;
    let alive = true;
    setManualCatalogLoading(true);
    setManualCatalogError(null);
    window.api.fetchTradeItemCatalog()
      .then((result) => {
        if (!alive || !result?.catalog) return;
        setManualCatalog(result.catalog);
        const hasEquipment = result.catalog.groups.some((group) => (
          group.id !== 'chart' && group.entries.length > 0
        ));
        if (!hasEquipment) {
          setManualCatalogError('The official base catalogue is unavailable. Reopen this window to retry.');
        }
      })
      .catch(() => {
        if (alive) {
          setManualCatalogError('The official base catalogue is unavailable. Reopen this window to retry.');
        }
      })
      .finally(() => { if (alive) setManualCatalogLoading(false); });
    return () => { alive = false; };
  }, [manualOpen]);

  // Search filters the complete imported list before pagination. Preserve the
  // user's accumulated "Show more" allowance while searching/clearing so a
  // lookup does not discard their browsing progress.
  useEffect(() => { setVisibleListRows(INITIAL_ROWS); }, [lootView]);
  useEffect(() => { setVisibleDiffRows(INITIAL_ROWS); }, [lootView, diffTab]);

  const allDiffRows = useMemo(() => hasBoth ? diffLootItems(baselineItems, lootItems) : [], [baselineItems, lootItems, hasBoth]);
  const gains    = allDiffRows.filter((r) => r.delta > 0);
  const losses   = allDiffRows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
  const netGain  = gains.reduce((a, b) => a + b.delta, 0) + losses.reduce((a, b) => a + b.delta, 0);
  const activeDiff = diffTab === 'gains' ? gains : losses;

  const detectedMatches = useMemo(() => {
    if (!hasBoth || losses.length === 0) return [];
    const investItems: { name: string }[] = [
      ...settings.scarabs.filter((s) => s.name.trim()).map((s) => ({ name: s.name })),
      ...(settings.advAstrolabeType ? [{ name: settings.advAstrolabeType }] : []),
      ...(settings.advDeliOrbType ? (() => {
        const entry = DELIRIUM_ORB_LIST.find((o) => o.value === settings.advDeliOrbType);
        const orbName = entry ? entry.label.split(' (')[0] + ' Delirium Orb' : settings.advDeliOrbType + ' Delirium Orb';
        return [{ name: orbName }];
      })() : []),
    ];
    return losses
      .filter((r) => {
        const normName = (s: string) => s.normalize('NFKD').replace(/[\u2018\u2019\u02BC]/g, "'").toLowerCase();
        return investItems.some((inv) => normName(inv.name) === normName(r.name));
      })
      .map((r) => ({ name: r.name, value: Math.abs(r.delta) }));
  }, [hasBoth, losses, settings]);

  const detectedTotal = detectedMatches.reduce((a, m) => a + m.value, 0);

  const categoryBreakdown = useMemo(() => {
    const gi = gains.map((r) => ({
      name: r.name,
      tab: r.tab,
      total: r.delta,
      excluded: false,
      category: r.category,
    }));
    const breakdown = buildCategoryBreakdown(hasBoth && gi.length > 0 ? gi : lootItems);
    for (const item of manualLootItems) {
      breakdown.set(item.category, (breakdown.get(item.category) ?? 0) + item.total);
    }
    return breakdown;
  }, [gains, lootItems, hasBoth, manualLootItems]);
  const sortedCats = [...categoryBreakdown.entries()].filter(([, v]) => v > 0.1).sort((a, b) => b[1] - a[1]);
  const maxCat     = sortedCats[0]?.[1] ?? 1;

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return q ? lootItems.filter((i) => i.name.toLowerCase().includes(q)) : lootItems;
  }, [lootItems, search]);
  const inclTotal = useMemo(() => lootItems.filter((i) => !i.excluded).reduce((a, b) => a + b.total, 0), [lootItems]);
  const manualTotal = useMemo(() => manualLootItems.reduce((sum, item) => sum + item.total, 0), [manualLootItems]);
  const manualMode: ManualLootMode = manualDraft.identity?.kind ?? 'free';
  const manualExactIdentity = useMemo(
    () => manualMode === 'free' ? identityResolver?.(manualDraft.name.trim()) : undefined,
    [identityResolver, manualDraft.name, manualMode],
  );
  const manualNameSuggestion = useMemo(
    () => manualMode === 'free' ? nameSuggester?.(manualDraft.name.trim()) : undefined,
    [manualDraft.name, manualMode, nameSuggester],
  );
  const manualEffectiveCategory = manualDraft.identity
    ? manualLootIdentityCategory(manualDraft.identity)
    : manualExactIdentity?.category ?? manualDraft.category;
  const normalizedDraftIdentity = normalizeManualLootIdentity(manualDraft.identity);
  const manualIdentityReady = manualMode === 'free'
    ? manualDraft.name.trim().length > 0
    : normalizedDraftIdentity !== undefined;
  const catalogEntries = (id: EquipmentCatalogGroup | 'chart'): string[] => (
    manualCatalog.groups.find((group) => group.id === id)?.entries ?? []
  );
  const setManualMode = (mode: ManualLootMode) => {
    setManualDraft((draft) => {
      if (mode === 'free') return { ...draft, name: '', category: 'Other', identity: undefined };
      if (mode === 'quality-base') return {
        ...draft,
        name: '',
        category: 'Other',
        identity: { kind: 'quality-base', equipmentGroup: 'armour', base: '', quality: 20 },
      };
      if (mode === 'chart') return {
        ...draft,
        name: 'Charts',
        category: 'League',
        identity: { kind: 'chart', chart: null },
      };
      return {
        ...draft,
        name: '',
        category: 'League',
        identity: {
          kind: 'syndicate-reward',
          member: '',
          reward: '',
          equipmentGroup: 'armour',
        },
      };
    });
  };

  const startAddManual = () => {
    setEditingManualId(null);
    setManualDraft(EMPTY_MANUAL_LOOT);
    setManualValueMode('total');
    setManualValueText('0');
    openManual();
  };
  const startEditManual = (item: ManualLootItem) => {
    setEditingManualId(item.id);
    setManualDraft({
      name: item.name,
      quantity: item.quantity,
      total: item.total,
      category: item.category,
      note: item.note,
      identity: item.identity,
    });
    setManualValueMode('total');
    setManualValueText(formatManualLootValueInput(item.total, item.quantity, 'total', 'chaos', divPrice));
    openManual();
  };
  const saveManual = () => {
    const identity = normalizeManualLootIdentity(manualDraft.identity);
    const exactIdentity = identity ? undefined : identityResolver?.(manualDraft.name.trim());
    const item = {
      name: (identity
        ? manualLootIdentityName(identity)
        : exactIdentity?.name ?? manualDraft.name.trim()).slice(0, MANUAL_LOOT_NAME_MAX),
      quantity: Math.max(1, Math.round(manualDraft.quantity || 1)),
      total: manualCanonicalTotal,
      category: identity
        ? manualLootIdentityCategory(identity)
        : exactIdentity?.category ?? manualDraft.category,
      note: manualDraft.note.trim().slice(0, MANUAL_LOOT_NOTE_MAX),
      ...(identity ? { identity } : {}),
    };
    if (!item.name || item.total <= 0) return;
    if (editingManualId) updateManualLootItem(editingManualId, item);
    else addManualLootItem(item);
    setEditingManualId(null);
    setManualDraft(EMPTY_MANUAL_LOOT);
    setManualValueText('0');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
    e.target.value = '';
  };
  const parseClassifiedCsv = async (csv: string): Promise<LootItem[]> => {
    const parsed = parseLootCsv(csv);
    if (!parsed.length) return [];
    setIconsLoading(true);
    try {
      const catalog = await getItemIcons();
      setResolver(() => catalog.resolve);
      setIdentityResolver(() => catalog.resolveIdentity);
      setNameSuggester(() => catalog.suggestName);
      return assignLootCategories(parsed, catalog.resolveCategory);
    } catch {
      return assignLootCategories(parsed);
    } finally {
      setIconsLoading(false);
    }
  };
  // Shared by the file picker and drag-and-drop. Role comes from
  // pendingRoleRef: null -> the "baseline or loot?" modal asks.
  const processCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const items = await parseClassifiedCsv(ev.target?.result as string);
      if (!items.length) return;
      const total = items.reduce((a, b) => a + b.total, 0);
      if (pendingRoleRef.current === 'baseline') { setBaselineItems(items); pendingRoleRef.current = null; if (hasCurrent) { setLootView('diff'); setDiffTab('gains'); } return; }
      if (pendingRoleRef.current === 'current')  { setLootItems(items); pendingRoleRef.current = null; if (hasBaseline) { setLootView('diff'); setDiffTab('gains'); } return; }
      setPendingItems(items); setPendingTotal(total); openBl();
    };
    reader.readAsText(file, 'utf-8');
  };
  const readCsvCandidate = (file: File): Promise<CsvCandidate | null> => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const items = await parseClassifiedCsv(ev.target?.result as string);
      resolve(items.length > 0
        ? { name: file.name, items, total: items.reduce((sum, item) => sum + item.total, 0) }
        : null);
    };
    reader.onerror = () => {
      console.error(`[Loot CSV] Failed to read dropped file: ${file.name}`);
      resolve(null);
    };
    reader.readAsText(file, 'utf-8');
  });
  const applyCsvPair = (baselineIndex: number) => {
    const baseline = pairCandidates[baselineIndex];
    const current = pairCandidates[baselineIndex === 0 ? 1 : 0];
    if (!baseline || !current) return;
    setBaselineItems(baseline.items);
    setLootItems(current.items);
    setLootView('diff');
    setDiffTab('gains');
    setPairCandidates([]);
    closePair();
  };
  const cancelCsvPair = () => {
    setPairCandidates([]);
    closePair();
  };
  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.csv'));
    if (files.length === 0) return;
    pendingRoleRef.current = null; // dropped files always ask their role
    if (files.length === 2) {
      Promise.all(files.map(readCsvCandidate)).then((candidates) => {
        if (candidates.every((candidate): candidate is CsvCandidate => candidate !== null)) {
          setPairCandidates(candidates);
          openPair();
        } else {
          console.error('[Loot CSV] One or both dropped CSV files contained no recognized items');
        }
      });
      return;
    }
    processCsvFile(files[0]);
  };
  const triggerImport = (role: 'baseline' | 'current' | null = null) => {
    pendingRoleRef.current = role; fileInputRef.current?.click();
  };
  const pc = (v: number) => v >= 0 ? COLOR.profit : COLOR.loss;

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />

      <Modal opened={blOpen} onClose={closeBl} title="How should this CSV be used?" size="sm">
        <Stack gap="md">
          <Text size="sm"><Text span fw={700}>{pendingItems.length} items</Text> worth <Text span fw={700} c="teal">{fcSep(pendingTotal, false, 1)}</Text></Text>
          <Button variant="light" color="yellow" leftSection={<IconPackage size={13} />} onClick={() => { setBaselineItems(pendingItems); setPendingItems([]); closeBl(); }} fullWidth>Set as Baseline ({fcSep(pendingTotal, false, 1)})</Button>
          <Button variant="light" color="teal" leftSection={<IconCoins size={13} />} onClick={() => { setLootItems(pendingItems); setPendingItems([]); closeBl(); if (hasBaseline) { setLootView('diff'); setDiffTab('gains'); } }} fullWidth>Use as Session Loot</Button>
          <Button variant="subtle" color="gray" onClick={closeBl} fullWidth>Cancel</Button>
        </Stack>
      </Modal>

      <Modal opened={clearOpen} onClose={closeClear} title="Clear Loot Tracker?" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">This will remove all imported loot and baseline data. This cannot be undone.</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeClear}>Cancel</Button>
            <Button color="red" onClick={() => { clearLoot(); setSearch(''); setLootView('list'); closeClear(); }}>Clear All</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={pairOpen} onClose={cancelCsvPair} title="Choose the Baseline CSV" size="md">
        <Stack gap="sm">
          {pairCandidates.map((candidate, index) => {
            const other = pairCandidates[index === 0 ? 1 : 0];
            return (
              <Button key={candidate.name} variant="default" h="auto" py="xs"
                onClick={() => applyCsvPair(index)}>
                <Stack gap={2} align="flex-start" style={{ width: '100%' }}>
                  <Text size="xs" fw={700}>{candidate.name}</Text>
                  <Text size="xs" c="dimmed">
                    {fcSep(candidate.total, false, 1)} · Other file becomes Return: {other ? `${other.name} (${fcSep(other.total, false, 1)})` : '—'}
                  </Text>
                </Stack>
              </Button>
            );
          })}
          <Button variant="subtle" color="gray" onClick={cancelCsvPair}>Cancel</Button>
        </Stack>
      </Modal>

      <Modal opened={manualOpen} onClose={() => {
        closeManual();
        setEditingManualId(null);
        setManualDraft(EMPTY_MANUAL_LOOT);
        setManualValueMode('total');
      }} title="Custom loot additions" size="lg">
        <Stack gap="sm">
          <Alert color="yellow" variant="light" title="Supplemental and always disclosed">
            <Text size="xs">
              Use this only for valuable drops missing from the Return CSV. Every custom row is marked Manual in shared strategies and included in the manual subtotal.
            </Text>
          </Alert>

          {manualLootItems.length > 0 && (
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="xs" fw={700}>Current additions</Text>
                <Badge color="yellow" variant="light" size="sm">
                  {manualLootItems.length} manual / {fcSep(manualTotal, false, 1)}
                </Badge>
              </Group>
              {manualLootItems.map((item) => (
                <Group key={item.id} justify="space-between" wrap="nowrap" p={6}
                  style={{ border: `1px solid ${COLOR.border}`, borderRadius: 6 }}>
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    <PoeItemIcon name={manualLootIdentityArtName(item.identity) ?? item.name} size={ICON_SIZE}
                      fallback={<LootCategoryGlyph category={item.category} size={ICON_SIZE} />} />
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={600} lineClamp={1}>{item.name}</Text>
                        <Badge color="yellow" variant="outline" size="xs">Manual</Badge>
                        {item.identity && (
                          <Badge color="gray" variant="light" size="xs">
                            {item.identity.kind === 'quality-base'
                              ? 'Quality base'
                              : item.identity.kind === 'chart'
                                ? 'Chart'
                                : 'Syndicate'}
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed" lineClamp={1} style={{ fontSize: FONT.small }}>
                        {item.quantity} item{item.quantity === 1 ? '' : 's'} / {item.category}{item.note ? ` / ${item.note}` : ''}
                      </Text>
                    </Stack>
                  </Group>
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" fw={700} c="teal">{fcSep(item.total, false, 1)}</Text>
                    <ActionIcon size="md" variant="subtle" aria-label={`Edit ${item.name}`}
                      onClick={() => startEditManual(item)}>
                      <IconPencil size={14} />
                    </ActionIcon>
                    <ActionIcon size="md" variant="subtle" color="red" aria-label={`Remove ${item.name}`}
                      onClick={() => {
                        removeManualLootItem(item.id);
                        if (editingManualId === item.id) {
                          setEditingManualId(null);
                          setManualDraft(EMPTY_MANUAL_LOOT);
                          setManualValueMode('total');
                        }
                      }}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              ))}
              <Divider my={2} />
            </Stack>
          )}

          <Text size="xs" fw={700}>{editingManualId ? 'Edit addition' : 'Add a missing drop'}</Text>
          <SegmentedControl
            size="xs"
            fullWidth
            aria-label="Custom loot identity type"
            value={manualMode}
            data={[
              { value: 'free', label: 'Item' },
              { value: 'quality-base', label: 'Quality base' },
              { value: 'chart', label: 'Chart' },
              { value: 'syndicate-reward', label: 'Syndicate' },
            ]}
            onChange={(value) => setManualMode(value as ManualLootMode)}
          />
          {manualCatalogError && (manualMode === 'quality-base' || manualMode === 'syndicate-reward') && (
            <Text size="xs" c="red">{manualCatalogError}</Text>
          )}

          {manualMode === 'free' && (
            <>
              <TextInput label="Item name" placeholder="e.g. Unidentified unique ring"
                value={manualDraft.name} maxLength={MANUAL_LOOT_NAME_MAX}
                onChange={(event) => {
                  const name = event.currentTarget.value;
                  setManualDraft((draft) => ({ ...draft, name }));
                }} />
              {manualExactIdentity && (
                <Text size="xs" c="teal" mt={-6}>
                  Known item — saves as {manualExactIdentity.name} / {manualExactIdentity.category}.
                </Text>
              )}
              {manualNameSuggestion && (
                <Group gap={4} mt={-6}>
                  <Text size="xs" c="dimmed">Did you mean</Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => setManualDraft((draft) => ({
                      ...draft,
                      name: manualNameSuggestion.name,
                      category: manualNameSuggestion.category,
                    }))}
                  >
                    {manualNameSuggestion.name}?
                  </Button>
                </Group>
              )}
            </>
          )}

          {manualDraft.identity?.kind === 'quality-base' && (
            <Stack gap="xs">
              <SimpleGrid cols={2} spacing="sm">
                <Select
                  label="Equipment category"
                  data={[
                    { value: 'armour', label: 'Armour' },
                    { value: 'weapon', label: 'Weapons' },
                  ]}
                  value={manualDraft.identity.equipmentGroup}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'quality-base') return draft;
                    return {
                      ...draft,
                      identity: {
                        ...draft.identity,
                        equipmentGroup: (value === 'weapon' ? 'weapon' : 'armour'),
                        base: '',
                      },
                    };
                  })}
                />
                <Select
                  label="Exact base"
                  placeholder={manualCatalogLoading ? 'Loading official bases…' : 'Choose a base'}
                  searchable
                  nothingFoundMessage="No exact base found"
                  data={catalogEntries(manualDraft.identity.equipmentGroup)}
                  value={manualDraft.identity.base || null}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'quality-base') return draft;
                    return { ...draft, identity: { ...draft.identity, base: value ?? '' } };
                  })}
                />
              </SimpleGrid>
              <SimpleGrid cols={2} spacing="sm">
                <NumberInput
                  label="Quality"
                  suffix="%"
                  min={1}
                  max={30}
                  allowDecimal={false}
                  value={manualDraft.identity.quality}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'quality-base') return draft;
                    return {
                      ...draft,
                      identity: {
                        ...draft.identity,
                        quality: Math.max(1, Math.min(30, Math.round(Number(value) || 1))),
                      },
                    };
                  })}
                />
                <Select
                  label="Influence (optional)"
                  placeholder="None"
                  clearable
                  data={ITEM_INFLUENCES.map((value) => ({ value, label: value }))}
                  value={manualDraft.identity.influence ?? null}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'quality-base') return draft;
                    return {
                      ...draft,
                      identity: {
                        ...draft.identity,
                        influence: (value || undefined) as ItemInfluence | undefined,
                      },
                    };
                  })}
                />
              </SimpleGrid>
              <Text size="xs" c="dimmed">
                Artwork follows the exact base; quality and influence stay in the visible label.
              </Text>
            </Stack>
          )}

          {manualDraft.identity?.kind === 'chart' && (
            <Select
              label="Chart type"
              description="Choose the exact Chart when known; the generic option still uses reviewed Chart artwork."
              searchable
              data={[
                { value: '__generic_chart__', label: 'Charts (type unknown)' },
                ...catalogEntries('chart').map((value) => ({ value, label: value })),
              ]}
              value={manualDraft.identity.chart ?? '__generic_chart__'}
              onChange={(value) => setManualDraft((draft) => {
                if (draft.identity?.kind !== 'chart') return draft;
                return {
                  ...draft,
                  identity: {
                    kind: 'chart',
                    chart: !value || value === '__generic_chart__' ? null : value,
                  },
                };
              })}
            />
          )}

          {manualDraft.identity?.kind === 'syndicate-reward' && (
            <Stack gap="xs">
              <SimpleGrid cols={2} spacing="sm">
                <Select
                  label="Syndicate member"
                  searchable
                  data={SYNDICATE_MEMBERS.map((value) => ({ value, label: value }))}
                  value={manualDraft.identity.member || null}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'syndicate-reward') return draft;
                    return { ...draft, identity: { ...draft.identity, member: value ?? '' } };
                  })}
                />
                <TextInput
                  label="Target reward / modifier"
                  placeholder="e.g. Rarity from slain Rare or Unique enemies"
                  maxLength={100}
                  value={manualDraft.identity.reward}
                  onChange={(event) => {
                    const reward = event.currentTarget.value;
                    setManualDraft((draft) => draft.identity?.kind === 'syndicate-reward'
                      ? { ...draft, identity: { ...draft.identity, reward } }
                      : draft);
                  }}
                />
              </SimpleGrid>
              <SimpleGrid cols={2} spacing="sm">
                <Select
                  label="Item category"
                  data={(Object.entries(EQUIPMENT_GROUP_LABEL) as [EquipmentCatalogGroup, string][])
                    .map(([value, label]) => ({ value, label }))}
                  value={manualDraft.identity.equipmentGroup}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'syndicate-reward') return draft;
                    const equipmentGroup = (value ?? 'armour') as EquipmentCatalogGroup;
                    return { ...draft, identity: { ...draft.identity, equipmentGroup, base: undefined } };
                  })}
                />
                <Select
                  label="Exact base (optional)"
                  placeholder={manualCatalogLoading ? 'Loading official bases…' : 'Use category only'}
                  clearable
                  searchable
                  nothingFoundMessage="No exact base found"
                  data={catalogEntries(manualDraft.identity.equipmentGroup)}
                  value={manualDraft.identity.base ?? null}
                  onChange={(value) => setManualDraft((draft) => {
                    if (draft.identity?.kind !== 'syndicate-reward') return draft;
                    return { ...draft, identity: { ...draft.identity, base: value || undefined } };
                  })}
                />
              </SimpleGrid>
              <Text size="xs" c="dimmed">
                This records a member-specific dropped reward, not a full Betrayal board setup.
              </Text>
            </Stack>
          )}

          <SegmentedControl
            size="xs"
            fullWidth
            aria-label="Custom loot value entry mode"
            value={manualValueMode}
            data={[
              { value: 'total', label: 'Enter total value' },
              { value: 'perItem', label: 'Enter value per item' },
            ]}
            onChange={(value) => {
              const nextMode = value as ManualLootValueMode;
              const unit = manualValueParse.ok ? manualValueParse.unit : 'chaos';
              setManualValueMode(nextMode);
              setManualValueText(formatManualLootValueInput(
                manualCanonicalTotal,
                manualDraft.quantity,
                nextMode,
                unit,
                divPrice,
              ));
            }}
          />
          <SimpleGrid cols={2} spacing="sm">
            <NumberInput
              label={
                <Group justify="space-between" gap={6} wrap="nowrap" style={{ width: '100%' }}>
                  <Text span size="sm" fw={500}>Quantity</Text>
                </Group>
              }
              styles={{ label: { display: 'block', width: '100%' } }}
              min={1} step={1} allowDecimal={false}
              value={manualDraft.quantity}
              onChange={(value) => setManualDraft((draft) => {
                const quantity = Math.max(1, Math.round(Number(value) || 1));
                return {
                  ...draft,
                  quantity,
                  total: manualLootTotalAfterQuantityChange(
                    draft.total,
                    draft.quantity,
                    quantity,
                    manualValueMode,
                  ),
                };
              })} />
            <TextInput
              label={
                <Group justify="space-between" gap={6} wrap="nowrap" style={{ width: '100%' }}>
                  <Text span size="sm" fw={500}>
                    {manualValueMode === 'perItem' ? 'Value per item (c or d)' : 'Total value (c or d)'}
                  </Text>
                  {manualValueMode === 'perItem' && (
                    <Text span size="xs" c="dimmed" fw={400} style={{ whiteSpace: 'nowrap' }}>
                      Saved total: {fcSep(manualCanonicalTotal, false, 1)}c
                    </Text>
                  )}
                </Group>
              }
              styles={{ label: { display: 'block', width: '100%' } }}
              placeholder="e.g. 100c or .4d"
              value={manualValueText}
              error={manualValueError}
              onChange={(event) => {
                const text = event.currentTarget.value;
                const parsed = parseManualLootValueInput(text, divPrice);
                setManualValueText(text);
                if (parsed.ok) {
                  setManualDraft((draft) => ({
                    ...draft,
                    total: manualLootTotalFromEntry(parsed.chaos, draft.quantity, manualValueMode),
                  }));
                }
              }}
            />
          </SimpleGrid>
          <Select label="Category" data={ITEM_CATEGORIES} value={manualEffectiveCategory}
            disabled={manualMode !== 'free' || manualExactIdentity !== undefined}
            description={manualMode !== 'free' || manualExactIdentity
              ? 'Category is determined by the exact structured/catalog identity.'
              : 'League is for named league-mechanic items such as Astrolabes, Allflames, Omens, tattoos, fossils and resonators. Other is the honest catch-all when no specific category fits.'}
            onChange={(value) => setManualDraft((draft) => ({ ...draft, category: (value as LootCategory | null) ?? 'Other' }))} />
          <Textarea label="Reason / note (optional)" placeholder="Why WealthyExile missed or underpriced it"
            value={manualDraft.note} maxLength={MANUAL_LOOT_NOTE_MAX} autosize minRows={2} maxRows={4}
            onChange={(event) => {
              const note = event.currentTarget.value;
              setManualDraft((draft) => ({ ...draft, note }));
            }} />
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {manualLootItems.length}/{LOOT_SUMMARY_ROW_LIMIT} manual rows / shared evidence shows at most {LOOT_SUMMARY_ROW_LIMIT} total rows.
            </Text>
            <Group gap="xs">
              {editingManualId && (
                <Button variant="subtle" color="gray" onClick={() => {
                  setEditingManualId(null);
                  setManualDraft(EMPTY_MANUAL_LOOT);
                  setManualValueMode('total');
                  setManualValueText('0');
                }}>Cancel edit</Button>
              )}
              <Button leftSection={<IconPlus size={14} />} onClick={saveManual}
                disabled={!manualIdentityReady || manualCanonicalTotal <= 0
                  || (!editingManualId && manualLootItems.length >= LOOT_SUMMARY_ROW_LIMIT)}>
                {editingManualId ? 'Save change' : 'Add item'}
              </Button>
              <Button variant="default" onClick={closeManual}>Done</Button>
            </Group>
          </Group>
        </Stack>
      </Modal>

      <Card className="dashboard-card dashboard-refined" shadow="sm" padding="sm" radius="md" withBorder h="100%"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleCsvDrop}
        style={{
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          outline: dragOver ? '2px dashed var(--mantine-color-blue-5)' : undefined,
          outlineOffset: -2,
        }}>

        {crossLeague && (
          <Tooltip label="Divine price, league and atlas points of this session are frozen — live refreshes never touch loaded sessions from another league. Start a new session to track the current league." withArrow multiline w={280}>
            <Badge color="yellow" variant="light" size="sm" mb={6}
              style={{ cursor: 'help', flexShrink: 0, alignSelf: 'flex-start' }}>
              Previous league — {settings.leagueName}
            </Badge>
          </Tooltip>
        )}

        {/* session-16: "Dashboard" title dropped (redundant with the tab
            label). session-17 review: the leftover right-aligned badge row is
            gone too — both pills moved into the Map Multipliers section
            header, where the multiplier is that section's summary number and
            the count contextualises its averages. Frees a full row. */}

        {!onboardingDismissed && maps.length === 0 && !hasCurrent && !hasBaseline && (
          <GettingStartedCard onDismiss={dismissOnboarding} />
        )}

        <div style={{ flexShrink: 0 }}>
          <Section title="Profit Overview" contentPaddingBottom={0}>
            <SimpleGrid cols={2} spacing="xs" mb={6}>
              <div style={{ background: profit.net >= 0 ? 'rgba(81,207,102,0.08)' : 'rgba(255,107,107,0.10)', border: `1px solid ${profit.net >= 0 ? 'rgba(81,207,102,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <Text size="xs" c="dimmed" mb={2}>Total Net Profit</Text>
                <Text style={{ fontSize: FONT.xl, fontWeight: 800, color: pc(profit.net), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fcSep(profit.net, true)}</Text>
                <Text size="xs" c="dimmed">({(profit.net / profit.div).toFixed(2)}d)</Text>
              </div>
              <div style={{ background: profit.cPerMap >= 0 ? 'rgba(81,207,102,0.08)' : 'rgba(255,107,107,0.10)', border: `1px solid ${profit.cPerMap >= 0 ? 'rgba(81,207,102,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <Text size="xs" c="dimmed" mb={2}>Per Map</Text>
                <Text style={{ fontSize: FONT.xl, fontWeight: 800, color: pc(profit.cPerMap), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{fcSep(profit.cPerMap, true)}</Text>
                <Text size="xs" c="dimmed">({profit.divPerMap.toFixed(3)}d)</Text>
              </div>
            </SimpleGrid>
            {/* session-17 experiment: Investment + Loot gain as a second,
                QUIETER tile row (neutral surface, compact) under the two big
                tinted decision tiles — same shape family, preserved hierarchy. */}
            <SimpleGrid cols={profit.hasBl ? 2 : 1} spacing="xs" mb={4}>
              <div style={{ background: 'var(--mantine-color-dark-6)', border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8, padding: '5px 8px', textAlign: 'center' }}>
                <Text size="xs" c="dimmed" mb={1}>Investment</Text>
                <Group gap={4} justify="center" align="baseline" wrap="nowrap">
                  <Text size="sm" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>{fcSep(profit.totalInvest)}</Text>
                  <Text size="xs" c="dimmed">({(profit.totalInvest / profit.div).toFixed(2)}d)</Text>
                </Group>
              </div>
              {profit.hasBl && (
                <div style={{ background: 'var(--mantine-color-dark-6)', border: '1px solid var(--mantine-color-dark-4)', borderRadius: 8, padding: '5px 8px', textAlign: 'center' }}>
                  <Text size="xs" c="dimmed" mb={1}>Loot gain (vs baseline)</Text>
                  <Group gap={4} justify="center" align="baseline" wrap="nowrap">
                    <Text size="sm" fw={600} c={profit.lootGain >= 0 ? 'teal' : 'red'} style={{ fontVariantNumeric: 'tabular-nums' }}>{fcSep(profit.lootGain, true)}</Text>
                    <Text size="xs" c="dimmed">({(profit.lootGain / profit.div).toFixed(2)}d)</Text>
                  </Group>
                </div>
              )}
            </SimpleGrid>
            {!profit.hasReturn && <Text size="xs" c="dimmed" fs="italic" pt={2}>No return CSV — loot not in profit</Text>}
            {pace && (
              <Group className="dashboard-pace-row" justify="space-between" py={3}>
                <Tooltip multiline w={280} label={`Measures the gaps between maps captured as you play: copy one before running it, then copy the next after finishing (${pace.countedGaps} gaps counted; ${pace.excludedGaps} break-like gaps excluded). Needs 5+ captured maps. This remains the automatic Share-time default; pre-imported runs can explicitly choose the manual timer instead.`}>
                  <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>Pace (estimate)</Text>
                </Tooltip>
                <Group gap={4} align="baseline">
                  <Text size="sm" fw={600}>{pace.mapsPerHour.toFixed(1)} maps/h</Text>
                  <Text size="xs" c="dimmed">· {formatActiveTime(pace.activeMs)} active</Text>
                </Group>
              </Group>
            )}
            {!pace && timestampedMaps > 0 && (
              <Group className="dashboard-pace-row dashboard-pace-pending" justify="space-between" py={3} gap="xs" wrap="nowrap">
                <Tooltip multiline w={300} label="Automatic Pace measures from one pre-map capture to the next, including the run, looting, stashing, and preparation. Clearly abnormal break-like gaps are excluded. Map Log shows the full timing guide.">
                  <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>Pace (collecting)</Text>
                </Tooltip>
                <Text size="xs" c="dimmed" ta="right">
                  {timestampedMaps < 5
                    ? `${timestampedMaps}/5 captures`
                    : 'Building a reliable 10m sample'}
                </Text>
              </Group>
            )}
          </Section>

          <Divider my={4} />

          {stats && (
            <Section title="Map Multipliers"
              right={
                <Group gap={4} wrap="nowrap">
                  <Badge color="gray" variant="outline" size="sm">{stats.count} maps</Badge>
                  <Tooltip label={stats.usesObservedMods && stats.observedModAverage != null
                    ? `Multiplier uses ${stats.observedModAverage.toFixed(1)} observed explicit mods per map`
                    : `Multiplier uses the ${settings.mapType} fallback`}>
                    <Badge color="blue" variant="outline" size="sm">{stats.multiplier.toFixed(3)}×</Badge>
                  </Tooltip>
                  {settings.chiselType && (
                    <Badge size="sm" color="yellow" variant="light"
                      leftSection={<PoeItemIcon name={chiselItemName(settings.chiselType)} size={14} category="chisel" />}>
                      {settings.chiselType}
                    </Badge>
                  )}
                </Group>
              }>
              <div className="dashboard-multiplier-grid">
                {STAT_KEYS.map((key) => {
                  const d = stats.stats[key as string];
                  if (!d || (d.avg === 0 && d.proj === 0)) return null;
                  return (
                    <StatTile
                      key={key as string}
                      boxed
                      labelStyle={{ marginBottom: 2, lineHeight: 1 }}
                      label={STAT_LABELS[key as string]}
                      value={
                        <Group gap={4} justify="center" align="center" wrap="nowrap" style={{ flex: 1 }}>
                          <Text fw={500} style={{ fontSize: FONT.stat, color: COLOR.textMuted, fontVariantNumeric: 'tabular-nums' }}>
                            {d.avg.toFixed(1)}%
                          </Text>
                          <Text style={{ fontSize: FONT.small, color: COLOR.borderSoft }}>→</Text>
                          <Text fw={600} style={{
                            fontSize: FONT.lg,
                            color: d.hasChisel ? COLOR.warning : COLOR.accent,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {d.proj.toFixed(1)}%
                          </Text>
                        </Group>
                      }
                    />
                  );
                })}
              </div>
            </Section>
          )}
          {!stats && (
            <Stack className="dashboard-map-empty" gap={1} align="center">
              <Text size="xs" fw={600} c="dimmed" ta="center">No maps captured yet</Text>
              <Text size="xs" c="dimmed" ta="center">
                Copy each map before running it; the next capture completes its automatic Pace interval.
              </Text>
            </Stack>
          )}

          <Divider my={4} />
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {detectedMatches.length > 0 && investmentNeutralization === 0 && !investmentDismissed && (
            <Stack gap={4} mb={6} p="xs"
              style={{ background: 'rgba(255,200,0,0.07)', border: '1px solid rgba(255,200,0,0.25)', borderRadius: 6, flexShrink: 0 }}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="xs" fw={600} c="yellow">Investment items found in your loot diff</Text>
                  <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
                    These items left your stash during the session and match your investment setup — so their cost is being counted twice (once as investment, once as &quot;lost&quot; loot):
                  </Text>
                  {detectedMatches.map((m) => (
                    <Text key={m.name} size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
                      · {m.name}: <Text span c="red">−{m.value.toFixed(1)}c</Text>
                    </Text>
                  ))}
                  <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
                    Correcting this adds <Text span c="teal">+{detectedTotal.toFixed(1)}c</Text> back to your loot gain so the profit numbers are right.
                  </Text>
                </Stack>
              </Group>
              <Group gap={4}>
                <Button size="xs" variant="light" color="yellow"
                  onClick={() => setInvestmentNeutralization(detectedTotal)}>
                  Correct double-count (+{detectedTotal.toFixed(1)}c)
                </Button>
                <Button size="xs" variant="subtle" color="gray"
                  onClick={() => setInvestmentDismissed(true)}>
                  These weren&apos;t double-counted
                </Button>
              </Group>
            </Stack>
          )}
          <div className="dashboard-loot-panel">
          <Group className="dashboard-loot-header" justify="space-between" mb={6} wrap="wrap" style={{ flexShrink: 0 }}>
            <Group className="dashboard-loot-title-row" justify="space-between" gap={6} wrap="nowrap">
              <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: FONT.small }}>
                Loot Tracker
              </Text>
              <LootCurrencyToggle
                mode={lootCurrencyMode}
                onChange={setLootCurrencyMode}
                divineAvailable={divPrice !== null}
                compact
                unavailableReason="Import or set a valid Divine-price snapshot before displaying loot in Divine Orbs."
              />
            </Group>
            <Group className="dashboard-loot-actions" gap={4} wrap="wrap">
              <Tooltip label="Import your stash CSV from before the session">
                <Button size="xs" variant={hasBaseline ? 'light' : 'default'} color={hasBaseline ? 'yellow' : undefined}
                  leftSection={<IconPackage size={12} />} onClick={() => triggerImport('baseline')}>
                  {hasBaseline ? 'Re-baseline' : 'Baseline'}
                </Button>
              </Tooltip>
              <Tooltip label="Import your stash CSV from after the session">
                <Button size="xs" variant={hasCurrent ? 'light' : 'default'} color={hasCurrent ? 'teal' : undefined}
                  leftSection={<IconFileImport size={12} />} onClick={() => triggerImport('current')}>
                  Return
                </Button>
              </Tooltip>
              <Tooltip label={hasCurrent
                ? 'Add a valuable drop that WealthyExile missed'
                : 'Import a Return CSV before adding custom loot'}>
                <Button size="xs" variant={manualLootItems.length > 0 ? 'light' : 'default'} color="yellow"
                  leftSection={<IconPlus size={12} />} disabled={!hasCurrent} onClick={startAddManual}>
                  Custom{manualLootItems.length > 0 ? ` (${manualLootItems.length})` : ''}
                </Button>
              </Tooltip>
              {(hasCurrent || hasBaseline) && (
                <Tooltip label="Clear all loot data">
                  <ActionIcon size="md" variant="default" aria-label="Clear all loot data"
                    onMouseEnter={() => setHoveredLootClear(true)}
                    onMouseLeave={() => setHoveredLootClear(false)}
                    style={hoveredLootClear ? { color: 'var(--mantine-color-red-4)', borderColor: 'var(--mantine-color-red-7)' } : undefined}
                    onClick={() => { setHoveredLootClear(false); openClear(); }}>
                    <IconTrash size={15} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>

          {(manualLootItems.length > 0 || investmentNeutralization > 0 ||
            (detectedMatches.length > 0 && investmentNeutralization === 0 && investmentDismissed)) && (
            <div className="dashboard-loot-status-grid">
              {manualLootItems.length > 0 && (
                <Group className="dashboard-loot-status dashboard-loot-status-manual" justify="space-between" gap={5} wrap="nowrap">
                  <Group className="dashboard-loot-status-label" gap={5} wrap="nowrap">
                    <Badge color="yellow" variant="outline" size="xs" style={{ flexShrink: 0 }}>Manual</Badge>
                    <Text className="dashboard-loot-status-detail" size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {manualLootItems.length} addition{manualLootItems.length === 1 ? '' : 's'}
                    </Text>
                  </Group>
                  <Button size="compact-xs" variant="subtle" color="yellow" onClick={startAddManual} style={{ flexShrink: 0 }}>
                    {fcSep(manualTotal, true, 1)} / review
                  </Button>
                </Group>
              )}
              {investmentNeutralization > 0 && (
                <Group className="dashboard-loot-status dashboard-loot-status-corrected" justify="space-between" gap={5} wrap="nowrap">
                  <Group className="dashboard-loot-status-label" gap={5} wrap="nowrap">
                    <Badge color="teal" variant="outline" size="xs" style={{ flexShrink: 0 }}>Corrected</Badge>
                    <Text className="dashboard-loot-status-detail" size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>double-count</Text>
                  </Group>
                  <Button size="compact-xs" variant="subtle" color="teal"
                    onClick={() => setInvestmentNeutralization(0)} style={{ flexShrink: 0 }}>
                    +{investmentNeutralization.toFixed(1)}c / undo
                  </Button>
                </Group>
              )}
              {detectedMatches.length > 0 && investmentNeutralization === 0 && investmentDismissed && (
                <Group className="dashboard-loot-status dashboard-loot-status-dismissed" justify="space-between" gap={5} wrap="nowrap">
                  <Group className="dashboard-loot-status-label" gap={5} wrap="nowrap">
                    <Badge color="gray" variant="outline" size="xs" style={{ flexShrink: 0 }}>Dismissed</Badge>
                    <Text className="dashboard-loot-status-detail" size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                      {detectedMatches.length} item{detectedMatches.length === 1 ? '' : 's'}
                    </Text>
                  </Group>
                  <Button size="compact-xs" variant="subtle" color="yellow"
                    onClick={() => setInvestmentDismissed(false)} style={{ flexShrink: 0 }}>
                    Recheck
                  </Button>
                </Group>
              )}
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {!hasCurrent && !hasBaseline && (
              <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
                <Text size="xs" c="dimmed" ta="center">Import a baseline before your session, then a return CSV to see your gains.</Text>
                <Text size="xs" c="dimmed" ta="center" style={{ fontStyle: 'italic', fontSize: FONT.small }}>
                  Tip: before importing a baseline, move your investment items (maps, scarabs etc.) out of any WealthyExile-monitored tab into your inventory or an unmonitored tab, then change zones so WealthyExile updates, then refresh and import. Otherwise your investment will be counted twice.
                </Text>
                <Text size="xs" c="dimmed" ta="center" style={{ fontSize: FONT.small }}>
                  Export from{' '}
                  <Anchor href="#" size="xs" onClick={(e) => { e.preventDefault(); window.open('https://wealthyexile.com', '_blank'); }}>
                    WealthyExile
                  </Anchor>
                  {' '}— log in, pick stash tabs, sync, then click ··· → Export CSV.
                </Text>
              </Stack>
            )}
            {!hasCurrent && hasBaseline && (
              <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
                <Badge color="yellow" variant="light">Baseline: {fcSep(baselineTotal, false, 1)}</Badge>
                <Text size="xs" c="dimmed">Go map. Import a return CSV to see your gains.</Text>
                <Button size="xs" variant="light" color="teal" onClick={() => triggerImport('current')}>Import Return CSV</Button>
              </Stack>
            )}

            {(hasCurrent || hasBoth) && (
              <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                <div className="dashboard-loot-view-controls">
                  <SegmentedControl value={lootView} onChange={(v) => setLootView(v as any)}
                    data={[{ value: 'list', label: 'List' }, { value: 'diff', label: 'Diff', disabled: !hasBoth }, { value: 'breakdown', label: 'Breakdown' }]}
                    size="xs" fullWidth style={{ flexShrink: 0 }} />
                </div>

                {lootView === 'list' && (
                  <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                    <TextInput size="xs" placeholder="Filter items..." leftSection={<IconSearch size={11} />}
                      value={search} onChange={(e) => setSearch(e.currentTarget.value)}
                      style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Table stickyHeader>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ width: 24 }}></Table.Th>
                            <Table.Th>Item</Table.Th>
                            <Table.Th>Qty</Table.Th>
                            <Table.Th ta="right">Value</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredItems.slice(0, visibleListRows).map((item) => {
                            return (
                            <Table.Tr key={item.id} style={{ opacity: item.excluded ? 0.4 : 1 }}>
                              <Table.Td><Checkbox checked={!item.excluded} onChange={() => toggleLootItemExcluded(item.id)} size="xs" /></Table.Td>
                              <Table.Td><Group gap={6} wrap="nowrap"><ResolvedLootIcon name={item.name} tab={item.tab} category={item.category} resolver={resolver} loading={iconsLoading} /><Text size="xs" lineClamp={1}>{item.name}</Text></Group></Table.Td>
                              <Table.Td><Text size="xs">{item.quantity}</Text></Table.Td>
                              <Table.Td ta="right">
                                <LootCurrencyValue
                                  chaosValue={item.total}
                                  divinePrice={divPrice}
                                  mode={lootCurrencyMode}
                                  color={item.excluded ? 'var(--mantine-color-dimmed)' : 'var(--mantine-color-teal-4)'}
                                />
                              </Table.Td>
                            </Table.Tr>
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                      {visibleListRows < filteredItems.length && (
                        <Button variant="subtle" size="xs" fullWidth mt={4}
                          onClick={() => setVisibleListRows((v) => v + STEP_ROWS)}>
                          Show {Math.min(STEP_ROWS, filteredItems.length - visibleListRows)} more
                          ({filteredItems.length - visibleListRows} remaining)
                        </Button>
                      )}
                    </div>
                    <Group className="dashboard-loot-summary" justify="space-between">
                      <Text size="xs" c="dimmed">
                        {filteredItems.length} items
                        {visibleListRows < filteredItems.length && ` (showing ${visibleListRows})`}
                      </Text>
                      <LootCurrencyPair
                        chaosValue={inclTotal}
                        divinePrice={divPrice}
                        mode={lootCurrencyMode}
                        color="var(--mantine-color-teal-4)"
                      />
                    </Group>
                  </Stack>
                )}

                {hasBoth && lootView === 'diff' && (
                  <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                    <SegmentedControl value={diffTab} onChange={(v) => setDiffTab(v as any)}
                      data={[{ value: 'gains', label: `Gained (${gains.length})` }, { value: 'losses', label: `Spent (${losses.length})` }]}
                      size="xs" fullWidth style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Table stickyHeader>
                        <Table.Thead><Table.Tr><Table.Th>Item</Table.Th><Table.Th>Qty</Table.Th><Table.Th ta="right">{diffTab === 'gains' ? 'Gained' : 'Reduced'}</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>
                          {activeDiff.slice(0, visibleDiffRows).map((r) => {
                            return (
                            <Table.Tr key={r.name}>
                              <Table.Td><Group gap={6} wrap="nowrap"><ResolvedLootIcon name={r.name} tab={r.tab} category={r.category} resolver={resolver} loading={iconsLoading} /><Text size="xs" lineClamp={1}>{r.name}</Text></Group></Table.Td>
                              <Table.Td><Text size="xs" c="dimmed">{r.baseQty} → {r.currQty}</Text></Table.Td>
                              <Table.Td ta="right">
                                <LootCurrencyValue
                                  chaosValue={r.delta}
                                  divinePrice={divPrice}
                                  mode={lootCurrencyMode}
                                  signed
                                  color={r.delta > 0 ? 'var(--mantine-color-green-4)' : 'var(--mantine-color-red-4)'}
                                />
                              </Table.Td>
                            </Table.Tr>
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                      {visibleDiffRows < activeDiff.length && (
                        <Button variant="subtle" size="xs" fullWidth mt={4}
                          onClick={() => setVisibleDiffRows((v) => v + STEP_ROWS)}>
                          Show {Math.min(STEP_ROWS, activeDiff.length - visibleDiffRows)} more
                          ({activeDiff.length - visibleDiffRows} remaining)
                        </Button>
                      )}
                    </div>
                    <Group className="dashboard-loot-summary" justify="space-between">
                      <Text size="xs" c="dimmed">
                        {activeDiff.length} items
                        {visibleDiffRows < activeDiff.length && ` (showing ${visibleDiffRows})`}
                      </Text>
                      <LootCurrencyPair
                        chaosValue={netGain}
                        divinePrice={divPrice}
                        mode={lootCurrencyMode}
                        signed
                        color={netGain >= 0 ? 'var(--mantine-color-green-4)' : 'var(--mantine-color-red-4)'}
                      />
                    </Group>
                  </Stack>
                )}

                {lootView === 'breakdown' && (() => {
                  const catTotal = sortedCats.reduce((a, [, v]) => a + v, 0) || 1;
                  return (
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Stack gap={4}>
                        {sortedCats.map(([cat, value]) => (
                          <Stack className="dashboard-loot-category" key={cat} gap={3} p={6}>
                            <Group justify="space-between">
                              <Group gap={6} wrap="nowrap">
                                <LootCategoryIcon category={cat as ItemCategory} size={20} />
                                <Badge color={CAT_COLORS[cat as ItemCategory] ?? 'gray'} size="xs" variant="light">{cat}</Badge>
                              </Group>
                              <Group gap={6} align="baseline">
                                <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>{((value / catTotal) * 100).toFixed(0)}%</Text>
                                <LootCurrencyValue
                                  chaosValue={value}
                                  divinePrice={divPrice}
                                  mode={lootCurrencyMode}
                                  color="var(--mantine-color-teal-4)"
                                />
                              </Group>
                            </Group>
                            <Progress value={(value / maxCat) * 100} size={6} radius="xl" color={CAT_COLORS[cat as ItemCategory] ?? 'gray'} />
                          </Stack>
                        ))}
                      </Stack>
                    </div>
                  );
                })()}
              </Stack>
            )}
          </div>
          </div>
        </div>
      </Card>
    </>
  );
};
