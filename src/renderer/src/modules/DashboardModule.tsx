import {
  Card, Text, Group, Stack, Badge, Divider, ActionIcon,
  Button, SegmentedControl, Table, Checkbox, TextInput,
  Progress, Image, Skeleton, Tooltip, Modal, SimpleGrid, Anchor,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { QUALITY_STAT_EFFECTS, CHISEL_TYPES, DELIRIUM_ORB_LIST } from '../utils/constants';
import { MapData, LootItem } from '../types';
import { parseLootCsv, diffLootItems } from '../utils/lootUtils';
import { IconTrash, IconFileImport, IconSearch, IconPackage, IconCoins } from '@tabler/icons-react';
import { getItemIcons, chiselItemName } from '../utils/itemIcons';
import { PoeItemIcon } from '../components/ui/PoeItemIcon';
import { computeProfit, computeMultiplier } from '../utils/profit';
import { fcSep } from '../utils/parseDiscordExport';
import { computeTimeEstimate, formatActiveTime } from '../utils/timeEstimate';
import { buildCategoryBreakdown, ItemCategory, CAT_COLORS } from '../utils/lootCategories';
import { StatTile } from '../components/ui/StatTile';
import { GettingStartedCard } from '../components/GettingStartedCard';
import { CollapsibleSection as Section } from '../components/ui/CollapsibleSection';
import { COLOR, FONT } from '../utils/uiTokens'

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

export const DashboardModule = () => {
  const {
    maps, settings, lootItems, baselineItems, baselineTotal,
    setLootItems, setBaselineItems, toggleLootItemExcluded, clearLoot,
    investmentNeutralization, setInvestmentNeutralization,
    investmentDismissed, setInvestmentDismissed,
    onboardingDismissed, dismissOnboarding,
  } = useSessionKeys(
    'maps', 'settings', 'lootItems', 'baselineItems', 'baselineTotal',
    'setLootItems', 'setBaselineItems', 'toggleLootItemExcluded', 'clearLoot',
    'investmentNeutralization', 'setInvestmentNeutralization',
    'investmentDismissed', 'setInvestmentDismissed',
    'onboardingDismissed', 'dismissOnboarding',
  );

  const stats = useMemo(() => {
    const count = maps.length;
    if (count === 0) return null;
    const { multiplier } = computeMultiplier(settings);
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
    return { count, multiplier, stats: result };
  }, [maps, settings]);

  // All profit math lives in utils/profit.ts (WP1) - single source of truth
  // shared with ShareModal/discordExport and InvestmentModule. The rolling
  // session total is derived LIVE from settings + map count (the stored
  // settings.rollingCostPerMap was stale and is removed in migration v16).
  const profit = useMemo(() => computeProfit({
    settings, mapCount: maps.length, lootItems, baselineTotal, investmentNeutralization,
  }), [maps.length, settings, lootItems, baselineTotal, investmentNeutralization]);

  // WP9 Tier 1: local pace estimate from parsedAt gaps. Null until >= 5
  // timestamped maps; never persisted, never shared, never load-bearing.
  const pace = useMemo(() => computeTimeEstimate(maps), [maps]);

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const pendingRoleRef = useRef<'baseline' | 'current' | null>(null);
  const [pendingItems, setPendingItems] = useState<LootItem[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [blOpen,     { open: openBl,   close: closeBl   }] = useDisclosure(false);
  const [clearOpen,  { open: openClear, close: closeClear }] = useDisclosure(false);
  const [lootView,  setLootView]  = useState<'list' | 'diff' | 'breakdown'>('list');
  const [search,    setSearch]    = useState('');
  const [diffTab,   setDiffTab]   = useState<'gains' | 'losses'>('gains');
  const [resolver,  setResolver]  = useState<((n: string) => string | undefined) | null>(null);
  const [iconsLoading, setIconsLoading] = useState(false);
  const [visibleListRows, setVisibleListRows] = useState(INITIAL_ROWS);
  const [visibleDiffRows, setVisibleDiffRows] = useState(INITIAL_ROWS);
  const [hoveredLootClear, setHoveredLootClear] = useState(false); // loot-clear icon red hover (Sessions pattern)
  const [dragOver, setDragOver] = useState(false); // CSV drag-and-drop highlight

  const hasBaseline = baselineItems.length > 0 || baselineTotal > 0;
  const hasCurrent  = lootItems.length > 0;
  const hasBoth     = hasBaseline && hasCurrent;
  const divPrice    = settings.divinePrice || 1;

  useEffect(() => {
    if (!hasCurrent && !hasBaseline) return;
    setIconsLoading(true);
    getItemIcons().then((c) => setResolver(() => c.resolve)).catch(() => {}).finally(() => setIconsLoading(false));
  }, [hasCurrent, hasBaseline]);

  useEffect(() => { setVisibleListRows(INITIAL_ROWS); }, [lootView, search]);
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
    const gi = gains.map((r) => ({ name: r.name, tab: r.tab, total: r.delta, excluded: false }));
    return buildCategoryBreakdown(hasBoth && gi.length > 0 ? gi : lootItems);
  }, [gains, lootItems, hasBoth]);
  const sortedCats = [...categoryBreakdown.entries()].filter(([, v]) => v > 0.1).sort((a, b) => b[1] - a[1]);
  const maxCat     = sortedCats[0]?.[1] ?? 1;

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return q ? lootItems.filter((i) => i.name.toLowerCase().includes(q)) : lootItems;
  }, [lootItems, search]);
  const inclTotal = useMemo(() => lootItems.filter((i) => !i.excluded).reduce((a, b) => a + b.total, 0), [lootItems]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processCsvFile(file);
    e.target.value = '';
  };
  // Shared by the file picker and drag-and-drop. Role comes from
  // pendingRoleRef: null -> the "baseline or loot?" modal asks.
  const processCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const items = parseLootCsv(ev.target?.result as string);
      if (!items.length) return;
      const total = items.reduce((a, b) => a + b.total, 0);
      if (pendingRoleRef.current === 'baseline') { setBaselineItems(items); pendingRoleRef.current = null; if (hasCurrent) { setLootView('diff'); setDiffTab('gains'); } return; }
      if (pendingRoleRef.current === 'current')  { setLootItems(items); pendingRoleRef.current = null; if (hasBaseline) { setLootView('diff'); setDiffTab('gains'); } return; }
      setPendingItems(items); setPendingTotal(total); openBl();
    };
    reader.readAsText(file, 'utf-8');
  };
  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = Array.from(e.dataTransfer.files).find((f) => f.name.toLowerCase().endsWith('.csv'));
    if (!file) return;
    pendingRoleRef.current = null; // dropped files always ask their role
    processCsvFile(file);
  };
  const triggerImport = (role: 'baseline' | 'current' | null = null) => {
    pendingRoleRef.current = role; fileInputRef.current?.click();
  };
  const ItemIcon = useCallback(({ name }: { name: string }) => {
    if (!resolver && iconsLoading) return <Skeleton w={ICON_SIZE} h={ICON_SIZE} radius="xs" />;
    const url = resolver?.(name);
    if (!url) return <div style={{ width: ICON_SIZE, height: ICON_SIZE }} />;
    return (
      <Tooltip label={name} openDelay={500} withinPortal>
        <Image src={url} w={ICON_SIZE} h={ICON_SIZE}
          style={{ flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </Tooltip>
    );
  }, [resolver, iconsLoading]);

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

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleCsvDrop}
        style={{
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          outline: dragOver ? '2px dashed var(--mantine-color-blue-5)' : undefined,
          outlineOffset: -2,
        }}>

        {/* session-16: "Dashboard" title dropped (redundant with the tab
            label). session-17 review: the leftover right-aligned badge row is
            gone too — both pills moved into the Map Multipliers section
            header, where the multiplier is that section's summary number and
            the count contextualises its averages. Frees a full row. */}

        {!onboardingDismissed && maps.length === 0 && !hasCurrent && !hasBaseline && (
          <GettingStartedCard onDismiss={dismissOnboarding} />
        )}

        <div style={{ flexShrink: 0 }}>
          <Section title="Profit Overview">
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
            <SimpleGrid cols={profit.hasBl ? 2 : 1} spacing="xs" mb={2}>
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
                    <Text size="xs" style={{ color: COLOR.dim }}>({(profit.lootGain / profit.div).toFixed(2)}d)</Text>
                  </Group>
                </div>
              )}
            </SimpleGrid>
            {!profit.hasReturn && <Text size="xs" c="dimmed" fs="italic" pt={2}>No return CSV — loot not in profit</Text>}
            {pace && (
              <Group justify="space-between" py={3} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <Tooltip multiline w={260} label={`Measures your first captured map to your last activity, from the time between parsed maps (${pace.countedGaps} gaps counted; ${pace.excludedGaps} break-like gaps excluded). Needs 5+ captured maps. Rough local estimate — never shared.`}>
                  <Text size="sm" c="dimmed" style={{ cursor: 'help' }}>Pace (estimate)</Text>
                </Tooltip>
                <Group gap={4} align="baseline">
                  <Text size="sm" fw={600}>{pace.mapsPerHour.toFixed(1)} maps/h</Text>
                  <Text size="xs" c="dimmed">· {formatActiveTime(pace.activeMs)} active</Text>
                </Group>
              </Group>
            )}
          </Section>

          <Divider my={4} />

          {stats && (
            <Section title="Map Multipliers"
              right={
                <Group gap={4} wrap="nowrap">
                  <Badge color="gray" variant="outline" size="sm">{stats.count} maps</Badge>
                  <Badge color="blue" variant="outline" size="sm">{stats.multiplier.toFixed(3)}×</Badge>
                  {settings.chiselType && (
                    <Badge size="sm" color="yellow" variant="light"
                      leftSection={<PoeItemIcon name={chiselItemName(settings.chiselType)} size={14} />}>
                      {settings.chiselType}
                    </Badge>
                  )}
                </Group>
              }>
              <SimpleGrid cols={2} spacing={5} mt={2}>
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
              </SimpleGrid>
            </Section>
          )}
          {!stats && <Text size="xs" c="dimmed" ta="center" py="xs">No maps parsed yet</Text>}

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
          {detectedMatches.length > 0 && investmentNeutralization === 0 && investmentDismissed && (
            <Group gap={4} mb={4} align="center" style={{ flexShrink: 0 }}>
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
                Double-count check dismissed — {detectedMatches.length} investment item{detectedMatches.length > 1 ? 's' : ''} still detected in the diff.
              </Text>
              <Button size="compact-xs" variant="subtle" color="yellow"
                onClick={() => setInvestmentDismissed(false)} style={{ fontSize: FONT.label, padding: '0 4px' }}>
                Recheck
              </Button>
            </Group>
          )}
          {investmentNeutralization > 0 && (
            <Group gap={4} mb={4} style={{ flexShrink: 0 }}>
              <Badge color="teal" variant="light" size="xs">
                +{investmentNeutralization.toFixed(1)}c double-count corrected
              </Badge>
              {/* compact prop was removed in Mantine v8 — use size="compact-xs" instead */}
              <Button size="compact-xs" variant="subtle" color="gray"
                onClick={() => setInvestmentNeutralization(0)} style={{ fontSize: FONT.label, padding: '0 4px' }}>
                undo
              </Button>
            </Group>
          )}
          <Group justify="space-between" mb={4} style={{ flexShrink: 0 }}>
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: FONT.small }}>
              Loot Tracker
            </Text>
            <Group gap={4}>
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
                <SegmentedControl value={lootView} onChange={(v) => setLootView(v as any)}
                  data={[{ value: 'list', label: 'List' }, { value: 'diff', label: 'Diff', disabled: !hasBoth }, { value: 'breakdown', label: 'Breakdown' }]}
                  size="xs" fullWidth style={{ flexShrink: 0 }} />

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
                            <Table.Th>Value</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {filteredItems.slice(0, visibleListRows).map((item) => (
                            <Table.Tr key={item.id} style={{ opacity: item.excluded ? 0.4 : 1 }}>
                              <Table.Td><Checkbox checked={!item.excluded} onChange={() => toggleLootItemExcluded(item.id)} size="xs" /></Table.Td>
                              <Table.Td><Group gap={6} wrap="nowrap"><ItemIcon name={item.name} /><Text size="xs" lineClamp={1}>{item.name}</Text></Group></Table.Td>
                              <Table.Td><Text size="xs">{item.quantity}</Text></Table.Td>
                              <Table.Td><Text size="xs" fw={600} c={item.excluded ? 'dimmed' : 'teal'}>{fcSep(item.total, false, 1)}</Text></Table.Td>
                            </Table.Tr>
                          ))}
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
                    <Group justify="space-between" style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed">
                        {filteredItems.length} items
                        {visibleListRows < filteredItems.length && ` (showing ${visibleListRows})`}
                      </Text>
                      <Group gap={4}>
                        <Badge color="teal" variant="light" size="sm">{fcSep(inclTotal, false, 1)}</Badge>
                        <Badge color="yellow" variant="light" size="sm">{(inclTotal / divPrice).toFixed(2)}d</Badge>
                      </Group>
                    </Group>
                  </Stack>
                )}

                {hasBoth && lootView === 'diff' && (
                  <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed">Net Gain</Text>
                      <Text size="sm" fw={700} c={netGain >= 0 ? 'green' : 'red'}>{fcSep(netGain, true, 1)}</Text>
                    </Group>
                    <SegmentedControl value={diffTab} onChange={(v) => setDiffTab(v as any)}
                      data={[{ value: 'gains', label: `Gained (${gains.length})` }, { value: 'losses', label: `Spent (${losses.length})` }]}
                      size="xs" fullWidth style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Table stickyHeader>
                        <Table.Thead><Table.Tr><Table.Th>Item</Table.Th><Table.Th>Qty</Table.Th><Table.Th>{diffTab === 'gains' ? 'Gained' : 'Reduced'}</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>
                          {activeDiff.slice(0, visibleDiffRows).map((r) => (
                            <Table.Tr key={r.name}>
                              <Table.Td><Group gap={6} wrap="nowrap"><ItemIcon name={r.name} /><Text size="xs" lineClamp={1}>{r.name}</Text></Group></Table.Td>
                              <Table.Td><Text size="xs" c="dimmed">{r.baseQty} → {r.currQty}</Text></Table.Td>
                              <Table.Td><Text size="xs" fw={600} c={r.delta > 0 ? 'green' : 'red'}>{fcSep(r.delta, true, 1)}</Text></Table.Td>
                            </Table.Tr>
                          ))}
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
                  </Stack>
                )}

                {lootView === 'breakdown' && (() => {
                  const catTotal = sortedCats.reduce((a, [, v]) => a + v, 0) || 1;
                  return (
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Stack gap={4}>
                        {sortedCats.map(([cat, value]) => (
                          <Stack key={cat} gap={3} p={6}
                            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6 }}>
                            <Group justify="space-between">
                              <Badge color={CAT_COLORS[cat as ItemCategory] ?? 'gray'} size="xs" variant="light">{cat}</Badge>
                              <Group gap={6} align="baseline">
                                <Text size="xs" c="dimmed" style={{ fontVariantNumeric: 'tabular-nums' }}>{((value / catTotal) * 100).toFixed(0)}%</Text>
                                <Text size="xs" fw={600} c="teal" style={{ fontVariantNumeric: 'tabular-nums' }}>{fcSep(value, false, 1)}</Text>
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
      </Card>
    </>
  );
};
