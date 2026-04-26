import {
  Card, Text, Group, Stack, Badge, Divider, Collapse, ActionIcon,
  Button, SegmentedControl, Table, Checkbox, TextInput,
  Progress, Image, Skeleton, Tooltip, Modal, SimpleGrid,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { QUALITY_STAT_EFFECTS, CHISEL_TYPES, DELIRIUM_ORB_LIST } from '../utils/constants';
import { MapData, LootItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { FaChevronDown, FaChevronRight, FaTrash, FaFileImport, FaSearch } from 'react-icons/fa';
import { getItemIcons } from '../utils/itemIcons';
import { buildCategoryBreakdown, ItemCategory, CAT_COLORS } from '../utils/lootCategories';

// Smart page size: show INITIAL rows, user can load more in STEP increments
const INITIAL_ROWS = 25;
const STEP_ROWS    = 25;

const Section = ({
  title, children, defaultOpen = true, right,
}: {
  title: string; children: React.ReactNode;
  defaultOpen?: boolean; right?: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen((n) => !n);
  return (
    <Stack gap={0}>
      <Group justify="space-between" onClick={toggle}
        style={{ cursor: 'pointer', padding: '5px 0', userSelect: 'none' }}>
        <Text size="xs" fw={700} c="dimmed"
          style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
          {title}
        </Text>
        <Group gap={6} onClick={(e) => e.stopPropagation()}>
          {right}
          <ActionIcon size="xs" variant="transparent" c="dimmed" onClick={toggle}>
            {open ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
          </ActionIcon>
        </Group>
      </Group>
      <Collapse in={open}>
        <div style={{ paddingBottom: 6 }}>{children}</div>
      </Collapse>
    </Stack>
  );
};

const STAT_KEYS: (keyof MapData)[] = [
  'quantity', 'rarity', 'packSize', 'moreCurrency', 'moreMaps', 'moreScarabs',
];
const STAT_LABELS: Record<string, string> = {
  quantity: 'Quantity', rarity: 'Rarity', packSize: 'Pack Size',
  moreCurrency: 'Currency', moreMaps: 'Maps', moreScarabs: 'Scarabs',
};

const ICON_SIZE = 20;

const parseCsv = (csv: string): LootItem[] => {
  const clean = csv.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const items: LootItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts: string[] = [];
    let cur = ''; let inQuote = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
    if (parts.length < 5) continue;
    const [n, t, q, p] = parts.map((s) => s.trim());
    const total = parseFloat(parts[4].trim());
    if (!n || isNaN(total)) continue;
    items.push({ id: uuidv4(), name: n, tab: t, quantity: q, price: p, total, excluded: false });
  }
  return items.sort((a, b) => b.total - a.total);
};

interface DiffRow { name: string; tab: string; delta: number; baseQty: number; currQty: number; }
function diffItems(baseline: LootItem[], current: LootItem[]): DiffRow[] {
  const bMap = new Map(baseline.map((i) => [i.name, i]));
  const cMap = new Map(current.map((i) => [i.name, i]));
  const rows: DiffRow[] = [];
  for (const name of new Set([...bMap.keys(), ...cMap.keys()])) {
    const b = bMap.get(name), c = cMap.get(name);
    const delta = (c?.total ?? 0) - (b?.total ?? 0);
    if (Math.abs(delta) < 0.01) continue;
    rows.push({ name, tab: c?.tab ?? b?.tab ?? '', delta,
      baseQty: parseInt(b?.quantity ?? '0') || 0,
      currQty: parseInt(c?.quantity ?? '0') || 0 });
  }
  return rows.sort((a, b) => b.delta - a.delta);
}

export const DashboardModule = () => {
  const {
    maps, settings, lootItems, baselineItems, baselineTotal,
    setLootItems, setBaselineItems, toggleLootItemExcluded, clearLoot,
    investmentNeutralization, setInvestmentNeutralization,
  } = useSessionStore();

  const stats = useMemo(() => {
    const count = maps.length;
    if (count === 0) return null;
    const fragEffect = settings.fragmentsUsed * 3;
    const nodeEffect = settings.smallNodesAllocated * 2;
    const riskCount  = settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2;
    const baseMods   = settings.mapType === '8-mod' ? 8 : 6;
    const effMods    = baseMods + riskCount;
    const mountBonus = settings.mountingModifiers ? effMods * 2 : 0;
    const multiplier = 1 + (fragEffect + nodeEffect + mountBonus) / 100;
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

  const profit = useMemo(() => {
    const chiselCost      = settings.chiselType && settings.chiselPrice > 0 ? settings.chiselPrice : 0;
    const perMapScarabs   = settings.scarabs.filter((s) => !s.preserved).reduce((a, s) => a + (s.cost || 0), 0);
    const oneTimeScarabs  = settings.scarabs.filter((s) =>  s.preserved).reduce((a, s) => a + (s.cost || 0), 0);
    const count           = stats?.count ?? 0;
    let perMap = settings.baseMapCost + chiselCost + perMapScarabs;
    if (settings.advSplitPrice > 0) perMap = (settings.baseMapCost + chiselCost + settings.advSplitPrice) / 2 + perMapScarabs;
    const totalInvest = perMap * count + settings.rollingCostPerMap + oneTimeScarabs;
    const rawReturn   = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
    // If gems are configured with a name (auto-excluded from CSV) and a buy price,
    // add back the buy cost so gem activity is neutral to map profit.
    // Logic: you paid gemBuyTotal during the session (stash reduced), then excluded gem
    // sell value from return. Without the add-back, profit is understated by gemBuyTotal.
    const gemBuyOffset = (settings.advGemName?.trim() && settings.advGemCount > 0 && settings.advGemBuyPrice > 0)
      ? settings.advGemCount * settings.advGemBuyPrice
      : 0;
    const adjReturn   = rawReturn + gemBuyOffset + investmentNeutralization;
    const hasReturn   = lootItems.length > 0;
    const hasBl       = baselineTotal > 0 && hasReturn;
    const lootGain    = hasReturn ? (hasBl ? adjReturn - baselineTotal : adjReturn) : 0;
    const net         = lootGain - totalInvest;
    const div         = settings.divinePrice || 1;
    return { totalInvest, lootGain, net,
             divPerMap: count > 0 ? (net / div) / count : 0,
             cPerMap: count > 0 ? net / count : 0,
             div, hasReturn, hasBl };
  }, [stats, settings, lootItems, baselineTotal]);

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
  // Smart load-more: start with INITIAL_ROWS, expand on demand
  const [visibleListRows, setVisibleListRows] = useState(INITIAL_ROWS);
  const [visibleDiffRows, setVisibleDiffRows] = useState(INITIAL_ROWS);

  const hasBaseline = baselineItems.length > 0 || baselineTotal > 0;
  const hasCurrent  = lootItems.length > 0;
  const hasBoth     = hasBaseline && hasCurrent;
  const divPrice    = settings.divinePrice || 1;

  useEffect(() => {
    if (!hasCurrent && !hasBaseline) return;
    setIconsLoading(true);
    getItemIcons().then((c) => setResolver(() => c.resolve)).catch(() => {}).finally(() => setIconsLoading(false));
  }, [hasCurrent, hasBaseline]);

  // Reset visible rows when view or search changes
  useEffect(() => { setVisibleListRows(INITIAL_ROWS); }, [lootView, search]);
  useEffect(() => { setVisibleDiffRows(INITIAL_ROWS); }, [lootView, diffTab]);

  const allDiffRows = useMemo(() => hasBoth ? diffItems(baselineItems, lootItems) : [], [baselineItems, lootItems, hasBoth]);
  const gains    = allDiffRows.filter((r) => r.delta > 0);
  const losses   = allDiffRows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
  const netGain  = gains.reduce((a, b) => a + b.delta, 0) + losses.reduce((a, b) => a + b.delta, 0);
  const activeDiff = diffTab === 'gains' ? gains : losses;

  // Auto-detect investment items in diff losses
  const detectedMatches = useMemo(() => {
    if (!hasBoth || losses.length === 0) return [];
    const investItems: { name: string }[] = [
      // Scarabs from configured slots
      ...settings.scarabs.filter((s) => s.name.trim()).map((s) => ({ name: s.name })),
      // Astrolabe — full name is the value itself (e.g. "Grasping Astrolabe")
      ...(settings.advAstrolabeType ? [{ name: settings.advAstrolabeType }] : []),
      // Deli orbs — label contains the correct apostrophe form e.g. "Armoursmith's (Armour)"
      // Extract the prefix before " (" and append " Delirium Orb" to match WealthyExile export
      ...(settings.advDeliOrbType ? (() => {
        const entry = DELIRIUM_ORB_LIST.find((o) => o.value === settings.advDeliOrbType);
        const orbName = entry ? entry.label.split(' (')[0] + ' Delirium Orb' : settings.advDeliOrbType + ' Delirium Orb';
        return [{ name: orbName }];
      })() : []),
    ];
    return losses
      .filter((r) => investItems.some((inv) => inv.name.toLowerCase() === r.name.toLowerCase()))
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      const items = parseCsv(ev.target?.result as string);
      if (!items.length) return;
      const total = items.reduce((a, b) => a + b.total, 0);
      if (pendingRoleRef.current === 'baseline') { setBaselineItems(items); pendingRoleRef.current = null; if (hasCurrent) { setLootView('diff'); setDiffTab('gains'); } return; }
      if (pendingRoleRef.current === 'current')  { setLootItems(items); pendingRoleRef.current = null; if (hasBaseline) { setLootView('diff'); setDiffTab('gains'); } return; }
      setPendingItems(items); setPendingTotal(total); openBl();
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
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
          style={{ imageRendering: 'pixelated', flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </Tooltip>
    );
  }, [resolver, iconsLoading]);

  const pc = (v: number) => v >= 0 ? '#51cf66' : '#ff6b6b';

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />

      {/* CSV role modal */}
      <Modal opened={blOpen} onClose={closeBl} title="How should this CSV be used?" size="sm">
        <Stack gap="md">
          <Text size="sm"><Text span fw={700}>{pendingItems.length} items</Text> worth <Text span fw={700} c="teal">{pendingTotal.toFixed(1)}c</Text></Text>
          <Button variant="light" color="yellow" onClick={() => { setBaselineItems(pendingItems); setPendingItems([]); closeBl(); }} fullWidth>📦 Set as Baseline ({pendingTotal.toFixed(1)}c)</Button>
          <Button variant="light" color="teal" onClick={() => { setLootItems(pendingItems); setPendingItems([]); closeBl(); if (hasBaseline) { setLootView('diff'); setDiffTab('gains'); } }} fullWidth>💰 Use as Session Loot</Button>
          <Button variant="subtle" color="gray" onClick={closeBl} fullWidth>Cancel</Button>
        </Stack>
      </Modal>

      {/* Clear confirmation modal */}
      <Modal opened={clearOpen} onClose={closeClear} title="Clear Loot Tracker?" size="sm">
        <Stack gap="md">
          <Text size="sm" c="dimmed">This will remove all imported loot and baseline data. This cannot be undone.</Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={closeClear}>Cancel</Button>
            <Button color="red" onClick={() => { clearLoot(); setSearch(''); setLootView('list'); closeClear(); }}>
              Clear All
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <Group justify="space-between" mb={4} style={{ flexShrink: 0 }}>
          <Text fw={700} size="sm">Dashboard</Text>
          {stats && (
            <Group gap={4}>
              <Badge variant="light" size="sm">{stats.count} maps</Badge>
              <Badge color="blue" variant="outline" size="sm">{stats.multiplier.toFixed(3)}×</Badge>
            </Group>
          )}
        </Group>

        {/* Fixed upper sections */}
        <div style={{ flexShrink: 0 }}>

          {/* ── Profit Overview ── */}
          <Section title="Profit Overview">
            <SimpleGrid cols={2} spacing="xs" mb={6}>
              <div style={{ background: profit.net >= 0 ? 'rgba(81,207,102,0.08)' : 'rgba(255,107,107,0.10)', border: `1px solid ${profit.net >= 0 ? 'rgba(81,207,102,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <Text size="xs" c="dimmed" mb={2}>Total Net Profit</Text>
                <Text style={{ fontSize: 18, fontWeight: 800, color: pc(profit.net), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{profit.net >= 0 ? '+' : ''}{profit.net.toFixed(0)}c</Text>
                <Text size="xs" c="dimmed">({(profit.net / profit.div).toFixed(2)}d)</Text>
              </div>
              <div style={{ background: profit.cPerMap >= 0 ? 'rgba(81,207,102,0.08)' : 'rgba(255,107,107,0.10)', border: `1px solid ${profit.cPerMap >= 0 ? 'rgba(81,207,102,0.3)' : 'rgba(255,107,107,0.3)'}`, borderRadius: 8, padding: '8px', textAlign: 'center' }}>
                <Text size="xs" c="dimmed" mb={2}>Per Map</Text>
                <Text style={{ fontSize: 18, fontWeight: 800, color: pc(profit.cPerMap), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{profit.cPerMap >= 0 ? '+' : ''}{profit.cPerMap.toFixed(0)}c</Text>
                <Text size="xs" c="dimmed">({profit.divPerMap.toFixed(3)}d)</Text>
              </div>
            </SimpleGrid>
            <Group justify="space-between" py={3} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <Text size="sm" c="dimmed">Investment</Text>
              <Group gap={4} align="baseline">
                <Text size="sm" fw={600}>{profit.totalInvest.toFixed(0)}c</Text>
                <Text size="xs" c="dimmed">({(profit.totalInvest / profit.div).toFixed(2)}d)</Text>
              </Group>
            </Group>
            {profit.hasBl && (
              <Group justify="space-between" py={3} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <Text size="sm" c="dimmed">Loot gain (vs baseline)</Text>
                <Group gap={4} align="baseline">
                  <Text size="sm" fw={600} c={profit.lootGain >= 0 ? 'teal' : 'red'}>{profit.lootGain >= 0 ? '+' : ''}{profit.lootGain.toFixed(0)}c</Text>
                  <Text size="xs" style={{ color: '#555' }}>({(profit.lootGain / profit.div).toFixed(2)}d)</Text>
                </Group>
              </Group>
            )}
            {!profit.hasReturn && <Text size="xs" c="dimmed" fs="italic" pt={2}>No return CSV — loot not in profit</Text>}
          </Section>

          <Divider my={4} />

          {/* ── Map Multipliers: label baked into box, values take full height ── */}
          {stats && (
            <Section title="Map Multipliers"
              right={settings.chiselType
                ? <Badge size="xs" color="yellow" variant="light">🪨 {settings.chiselType}</Badge>
                : undefined}>
              <SimpleGrid cols={2} spacing={5} mt={2}>
                {STAT_KEYS.map((key) => {
                  const d = stats.stats[key as string];
                  if (!d || (d.avg === 0 && d.proj === 0)) return null;
                  return (
                    <div key={key as string} style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 6, padding: '4px 8px 6px',
                      display: 'flex', flexDirection: 'column',
                    }}>
                      {/* Label embedded at top, small */}
                      <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase',
                        letterSpacing: 0.8, marginBottom: 2, lineHeight: 1 }}>
                        {STAT_LABELS[key as string]}
                      </Text>
                      {/* Values take remaining space, centered */}
                      <Group gap={4} justify="center" align="center" wrap="nowrap" style={{ flex: 1 }}>
                        <Text fw={500} style={{ fontSize: 14, color: '#666', fontVariantNumeric: 'tabular-nums' }}>
                          {d.avg.toFixed(1)}%
                        </Text>
                        <Text style={{ fontSize: 10, color: '#444' }}>→</Text>
                        <Text fw={600} style={{
                          fontSize: 16,
                          color: d.hasChisel ? '#ffd43b' : '#74c0fc',
                          fontVariantNumeric: 'tabular-nums',
                        }}>
                          {d.proj.toFixed(1)}%{d.hasChisel ? ' 🪨' : ''}
                        </Text>
                      </Group>
                    </div>
                  );
                })}
              </SimpleGrid>
            </Section>
          )}
          {!stats && <Text size="xs" c="dimmed" ta="center" py="xs">No maps parsed yet</Text>}

          <Divider my={4} />
        </div>

        {/* ── Loot Tracker — fills remaining space ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {/* Investment auto-detection banner */}
          {detectedMatches.length > 0 && investmentNeutralization === 0 && (
            <Stack gap={4} mb={6} p="xs"
              style={{ background: 'rgba(255,200,0,0.07)', border: '1px solid rgba(255,200,0,0.25)', borderRadius: 6, flexShrink: 0 }}>
              <Group justify="space-between" align="flex-start">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Text size="xs" fw={600} c="yellow">⚠ Investment detected in baseline diff</Text>
                  <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
                    These items disappeared from your stash and match your investment setup:
                  </Text>
                  {detectedMatches.map((m) => (
                    <Text key={m.name} size="xs" c="dimmed" style={{ fontSize: 10 }}>
                      · {m.name}: <Text span c="red">−{m.value.toFixed(1)}c</Text>
                    </Text>
                  ))}
                  <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
                    If these were in your tracked tabs at baseline time they are double-counted.
                    Neutralising adds <Text span c="teal">+{detectedTotal.toFixed(1)}c</Text> back to loot gain.
                  </Text>
                </Stack>
              </Group>
              <Group gap={4}>
                <Button size="xs" variant="light" color="yellow"
                  onClick={() => setInvestmentNeutralization(detectedTotal)}>
                  Neutralise +{detectedTotal.toFixed(1)}c
                </Button>
                <Button size="xs" variant="subtle" color="gray"
                  onClick={() => setInvestmentNeutralization(-1)}>
                  Dismiss
                </Button>
              </Group>
            </Stack>
          )}
          {investmentNeutralization > 0 && (
            <Group gap={4} mb={4} style={{ flexShrink: 0 }}>
              <Badge color="teal" variant="light" size="xs">
                ✓ +{investmentNeutralization.toFixed(1)}c investment neutralised
              </Badge>
              <Button size="xs" variant="subtle" color="gray" compact
                onClick={() => setInvestmentNeutralization(0)} style={{ fontSize: 9, padding: '0 4px', height: 16 }}>
                undo
              </Button>
            </Group>
          )}
          <Group justify="space-between" mb={4} style={{ flexShrink: 0 }}>
            <Text size="xs" fw={700} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 10 }}>
              Loot Tracker
            </Text>
            <Group gap={4}>
              <Tooltip label="Import baseline">
                <Button size="xs" variant={hasBaseline ? 'filled' : 'default'} color={hasBaseline ? 'yellow' : undefined}
                  onClick={() => triggerImport('baseline')}>
                  📦 {hasBaseline ? 'Re-baseline' : 'Baseline'}
                </Button>
              </Tooltip>
              <Tooltip label="Import return CSV">
                <Button size="xs" variant={hasCurrent ? 'filled' : 'default'} color={hasCurrent ? 'teal' : undefined}
                  leftSection={<FaFileImport size={9} />} onClick={() => triggerImport('current')}>
                  Return
                </Button>
              </Tooltip>
              {(hasCurrent || hasBaseline) && (
                <Tooltip label="Clear all loot data">
                  <ActionIcon size="sm" color="red" variant="subtle" onClick={openClear}>
                    <FaTrash size={10} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          </Group>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {!hasCurrent && !hasBaseline && (
            <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
            <Text size="xs" c="dimmed" ta="center">Import a baseline before your session, then a return CSV to see your gains.</Text>
              <Text size="xs" c="dimmed" ta="center" style={{ fontStyle: 'italic', fontSize: 10 }}>
                  Tip: before importing a baseline, move your investment items (maps, scarabs etc.) out of any WealthyExile-monitored tab into your inventory or an unmonitored tab, then change zones so WealthyExile updates, then refresh and import. Otherwise your investment will be counted twice.
              </Text>
            </Stack>
          )}
            {!hasCurrent && hasBaseline && (
              <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
                <Badge color="yellow" variant="light">Baseline: {baselineTotal.toFixed(1)}c</Badge>
                <Text size="xs" c="dimmed">Go map. Import a return CSV to see your gains.</Text>
                <Button size="xs" variant="light" color="teal" onClick={() => triggerImport('current')}>Import Return CSV</Button>
              </Stack>
            )}

            {(hasCurrent || hasBoth) && (
              <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                <SegmentedControl value={lootView} onChange={(v) => setLootView(v as any)}
                  data={[{ value: 'list', label: 'List' }, { value: 'diff', label: hasBoth ? '🔍 Diff' : 'Diff', disabled: !hasBoth }, { value: 'breakdown', label: '📊' }]}
                  size="xs" fullWidth style={{ flexShrink: 0 }} />

                {/* LIST VIEW — smart load-more */}
                {lootView === 'list' && (
                  <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                    <TextInput size="xs" placeholder="Filter items..." leftSection={<FaSearch size={10} />}
                      value={search} onChange={(e) => setSearch(e.currentTarget.value)}
                      style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Table stickyHeader>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ width: 24 }}>✓</Table.Th>
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
                              <Table.Td><Text size="xs" fw={600} c={item.excluded ? 'dimmed' : 'teal'}>{item.total.toFixed(1)}c</Text></Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                      {/* Load more button inside scroll area */}
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
                        <Badge color="teal" variant="light" size="xs">{inclTotal.toFixed(1)}c</Badge>
                        <Badge color="yellow" variant="light" size="xs">{(inclTotal / divPrice).toFixed(2)}d</Badge>
                      </Group>
                    </Group>
                  </Stack>
                )}

                {/* DIFF VIEW — smart load-more */}
                {hasBoth && lootView === 'diff' && (
                  <Stack gap={4} style={{ flex: 1, minHeight: 0 }}>
                    <Group justify="space-between" style={{ flexShrink: 0 }}>
                      <Text size="xs" c="dimmed">Net Gain</Text>
                      <Text size="sm" fw={700} c={netGain >= 0 ? 'green' : 'red'}>{netGain >= 0 ? '+' : ''}{netGain.toFixed(1)}c</Text>
                    </Group>
                    <SegmentedControl value={diffTab} onChange={(v) => setDiffTab(v as any)}
                      data={[{ value: 'gains', label: `✅ Gained (${gains.length})` }, { value: 'losses', label: `📦 Spent (${losses.length})` }]}
                      size="xs" fullWidth style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <Table stickyHeader>
                        <Table.Thead><Table.Tr><Table.Th>Item</Table.Th><Table.Th>Qty</Table.Th><Table.Th>{diffTab === 'gains' ? 'Gained' : 'Reduced'}</Table.Th></Table.Tr></Table.Thead>
                        <Table.Tbody>
                          {activeDiff.slice(0, visibleDiffRows).map((r) => (
                            <Table.Tr key={r.name}>
                              <Table.Td><Group gap={6} wrap="nowrap"><ItemIcon name={r.name} /><Text size="xs" lineClamp={1}>{r.name}</Text></Group></Table.Td>
                              <Table.Td><Text size="xs" c="dimmed">{r.baseQty} → {r.currQty}</Text></Table.Td>
                              <Table.Td><Text size="xs" fw={600} c={r.delta > 0 ? 'green' : 'red'}>{r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)}c</Text></Table.Td>
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

                {/* BREAKDOWN */}
                {lootView === 'breakdown' && (
                  <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                    <Stack gap={6}>
                      {sortedCats.map(([cat, value]) => (
                        <Stack key={cat} gap={2}>
                          <Group justify="space-between">
                            <Badge color={CAT_COLORS[cat as ItemCategory] ?? 'gray'} size="xs" variant="light">{cat}</Badge>
                            <Text size="xs" fw={600} c="teal">{value.toFixed(1)}c</Text>
                          </Group>
                          <Progress value={(value / maxCat) * 100} size={4} color={CAT_COLORS[cat as ItemCategory] ?? 'gray'} />
                        </Stack>
                      ))}
                    </Stack>
                  </div>
                )}
              </Stack>
            )}
          </div>
        </div>
      </Card>
    </>
  );
};
