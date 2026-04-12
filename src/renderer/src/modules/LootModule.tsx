import {
  Card, Text, Button, Group, ScrollArea, Table, Checkbox,
  Badge, ActionIcon, Stack, Divider, Modal, Pagination, TextInput,
  Image, Skeleton, Tooltip, SegmentedControl, Progress,
} from '@mantine/core';
import { useRef, useState, useMemo, useEffect, useCallback } from 'react';
import { useDisclosure } from '@mantine/hooks';
import { useSessionStore } from '../store/useSessionStore';
import { LootItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { FaTrash, FaFileImport, FaSearch } from 'react-icons/fa';
import { getItemIcons } from '../utils/itemIcons';
import { buildCategoryBreakdown, ItemCategory, CAT_COLORS } from '../utils/lootCategories';

const PAGE_SIZE = 50;
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
    const name = parts[0].trim(), tab = parts[1].trim(),
          quantity = parts[2].trim(), price = parts[3].trim();
    const total = parseFloat(parts[4].trim());
    if (!name || isNaN(total)) continue;
    items.push({ id: uuidv4(), name, tab, quantity, price, total, excluded: false });
  }
  items.sort((a, b) => b.total - a.total);
  return items;
};

interface DiffRow {
  name: string;
  tab: string;
  delta: number;
  baseQty: number;
  currQty: number;
}

function diffItems(baseline: LootItem[], current: LootItem[]): DiffRow[] {
  const baseMap = new Map<string, LootItem>();
  for (const item of baseline) baseMap.set(item.name, item);
  const currMap = new Map<string, LootItem>();
  for (const item of current) currMap.set(item.name, item);

  const allNames = new Set([...baseMap.keys(), ...currMap.keys()]);
  const rows: DiffRow[] = [];

  for (const name of allNames) {
    const b = baseMap.get(name);
    const c = currMap.get(name);
    const delta = (c?.total ?? 0) - (b?.total ?? 0);
    if (Math.abs(delta) < 0.01) continue;
    rows.push({
      name,
      tab: c?.tab ?? b?.tab ?? '',
      delta,
      baseQty: parseInt(b?.quantity ?? '0') || 0,
      currQty: parseInt(c?.quantity ?? '0') || 0,
    });
  }
  return rows.sort((a, b) => b.delta - a.delta);
}

export const LootModule = () => {
  const {
    lootItems, baselineItems, setLootItems, setBaselineItems,
    toggleLootItemExcluded, clearLoot,
    settings, baselineTotal,
  } = useSessionStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRoleRef = useRef<'baseline' | 'current' | null>(null);
  const [pendingItems, setPendingItems] = useState<LootItem[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [baselineOpen, { open: openBaseline, close: closeBaseline }] = useDisclosure(false);
  const [view, setView] = useState<'list' | 'diff' | 'breakdown'>('list');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [resolver, setResolver] = useState<((name: string) => string | undefined) | null>(null);
  const [iconsLoading, setIconsLoading] = useState(false);
  // Diff tab: show gains or losses
  const [diffTab, setDiffTab] = useState<'gains' | 'losses'>('gains');

  const hasBaseline = baselineItems.length > 0 || baselineTotal > 0;
  const hasCurrent  = lootItems.length > 0;
  const hasBoth     = hasBaseline && hasCurrent;
  const divPrice    = settings.divinePrice || 1;

  useEffect(() => {
    if (lootItems.length === 0 && baselineItems.length === 0) return;
    setIconsLoading(true);
    getItemIcons()
      .then((cache) => setResolver(() => cache.resolve))
      .catch(() => {})
      .finally(() => setIconsLoading(false));
  }, [lootItems.length > 0 || baselineItems.length > 0]);

  const allDiffRows = useMemo(() => {
    if (!hasBoth) return [];
    return diffItems(baselineItems, lootItems);
  }, [baselineItems, lootItems]);

  const gains  = allDiffRows.filter((r) => r.delta > 0);
  const losses = allDiffRows.filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta);
  const totalGain = gains.reduce((a, b) => a + b.delta, 0);
  const totalLost = losses.reduce((a, b) => a + b.delta, 0);
  const netGain   = totalGain + totalLost;

  // Active diff rows based on tab
  const activeDiffRows = diffTab === 'gains' ? gains : losses;
  const diffTotalPages = Math.max(1, Math.ceil(activeDiffRows.length / PAGE_SIZE));
  const diffPageRows   = activeDiffRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const categoryBreakdown = useMemo(() => {
    if (!hasBoth) return buildCategoryBreakdown(lootItems);
    const gainItems = gains.map((r) => ({ name: r.name, tab: r.tab, total: r.delta, excluded: false }));
    return buildCategoryBreakdown(gainItems.length > 0 ? gainItems : lootItems);
  }, [gains, lootItems, hasBoth]);

  const sortedCategories = [...categoryBreakdown.entries()]
    .filter(([, v]) => v > 0.1)
    .sort((a, b) => b[1] - a[1]);
  const maxCatValue = sortedCategories[0]?.[1] ?? 1;

  const filteredItems = useMemo(() => {
    const q = search.toLowerCase();
    return q ? lootItems.filter((i) => i.name.toLowerCase().includes(q)) : lootItems;
  }, [lootItems, search]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const pageItems  = filteredItems.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const includedTotal = useMemo(
    () => lootItems.filter((i) => !i.excluded).reduce((a, b) => a + b.total, 0),
    [lootItems]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const items = parseCsv(ev.target?.result as string);
      if (items.length === 0) return;
      const total = items.reduce((a, b) => a + b.total, 0);

      if (pendingRoleRef.current === 'baseline') {
        setBaselineItems(items);
        pendingRoleRef.current = null;
        if (hasCurrent) { setView('diff'); setDiffTab('gains'); setPage(1); }
        return;
      }
      if (pendingRoleRef.current === 'current') {
        setLootItems(items);
        setPage(1);
        pendingRoleRef.current = null;
        if (hasBaseline) { setView('diff'); setDiffTab('gains'); setPage(1); }
        return;
      }

      setPendingItems(items); setPendingTotal(total);
      openBaseline();
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const triggerImport = (role: 'baseline' | 'current' | null = null) => {
    pendingRoleRef.current = role;
    fileInputRef.current?.click();
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

  const listRows = pageItems.map((item) => (
    <Table.Tr key={item.id} style={{ opacity: item.excluded ? 0.4 : 1 }}>
      <Table.Td><Checkbox checked={!item.excluded} onChange={() => toggleLootItemExcluded(item.id)} size="xs" /></Table.Td>
      <Table.Td>
        <Group gap={6} wrap="nowrap">
          <ItemIcon name={item.name} />
          <Text size="xs" lineClamp={1}>{item.name}</Text>
        </Group>
      </Table.Td>
      <Table.Td><Text size="xs" c="dimmed">{item.tab}</Text></Table.Td>
      <Table.Td><Text size="xs">{item.quantity}</Text></Table.Td>
      <Table.Td><Text size="xs" fw={600} c={item.excluded ? 'dimmed' : 'teal'}>{item.total.toFixed(1)}c</Text></Table.Td>
    </Table.Tr>
  ));

  const diffTableRows = diffPageRows.map((row) => {
    const isGain = row.delta > 0;
    const deltaQty = row.currQty - row.baseQty;
    return (
      <Table.Tr key={row.name}>
        <Table.Td>
          <Group gap={6} wrap="nowrap">
            <ItemIcon name={row.name} />
            <Text size="xs" lineClamp={1}>{row.name}</Text>
          </Group>
        </Table.Td>
        <Table.Td><Text size="xs" c="dimmed">{row.tab}</Text></Table.Td>
        <Table.Td>
          <Text size="xs" c="dimmed">
            {deltaQty !== 0
              ? `${row.baseQty} → ${row.currQty} (${deltaQty > 0 ? '+' : ''}${deltaQty})`
              : `${row.currQty}`}
          </Text>
        </Table.Td>
        <Table.Td>
          <Text size="xs" fw={600} c={isGain ? 'green' : 'red'}>
            {isGain ? '+' : ''}{row.delta.toFixed(1)}c
          </Text>
        </Table.Td>
      </Table.Tr>
    );
  });

  return (
    <>
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />

      <Modal opened={baselineOpen} onClose={closeBaseline} title="How should this CSV be used?" size="sm">
        <Stack gap="md">
          <Text size="sm">
            <Text span fw={700}>{pendingItems.length} items</Text> worth{' '}
            <Text span fw={700} c="teal">{pendingTotal.toFixed(1)}c</Text>
          </Text>
          <Text size="sm" c="dimmed">
            <Text span c="yellow" fw={600}>Baseline</Text> — your stash before farming. Import a return CSV afterwards to see exactly what changed.
          </Text>
          <Text size="sm" c="dimmed">
            <Text span c="teal" fw={600}>Session loot</Text> — your stash after farming.
          </Text>
          <Divider />
          <Button variant="light" color="yellow"
            onClick={() => { setBaselineItems(pendingItems); setPendingItems([]); closeBaseline(); }} fullWidth>
            📦 Set as Baseline ({pendingTotal.toFixed(1)}c)
          </Button>
          <Button variant="light" color="teal"
            onClick={() => { setLootItems(pendingItems); setPage(1); setPendingItems([]); closeBaseline(); if (hasBaseline) { setView('diff'); setDiffTab('gains'); } }} fullWidth>
            💰 Use as Session Loot
          </Button>
          <Button variant="subtle" color="gray" onClick={closeBaseline} fullWidth>Cancel</Button>
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        style={{ display: 'flex', flexDirection: 'column' }}>

        <Group justify="space-between" mb="xs">
          <Stack gap={0}>
            <Text fw={700} size="sm">Loot Tracker</Text>
            <Text size="xs" c="dimmed">
              {lootItems.filter((i) => !i.excluded).length}/{lootItems.length} items
              {hasBaseline && <> · baseline {baselineTotal > 0 ? `${baselineTotal.toFixed(0)}c` : 'set'}</>}
            </Text>
          </Stack>
          <Group gap={4}>
            <Tooltip label="Import baseline (before session)">
              <Button size="xs"
                variant={hasBaseline ? 'filled' : 'default'}
                color={hasBaseline ? 'yellow' : undefined}
                onClick={() => triggerImport('baseline')}>
                📦 {hasBaseline ? 'Re-baseline' : 'Baseline'}
              </Button>
            </Tooltip>
            <Tooltip label="Import return (after session)">
              <Button size="xs"
                variant={hasCurrent ? 'filled' : 'default'}
                color={hasCurrent ? 'teal' : undefined}
                leftSection={<FaFileImport size={10} />}
                onClick={() => triggerImport('current')}>
                Return
              </Button>
            </Tooltip>
            {(hasCurrent || hasBaseline) && (
              <ActionIcon size="sm" color="red" variant="subtle"
                onClick={() => { clearLoot(); setSearch(''); setPage(1); setView('list'); }}>
                <FaTrash size={10} />
              </ActionIcon>
            )}
          </Group>
        </Group>

        {(hasCurrent || hasBaseline) && (
          <SegmentedControl
            value={view}
            onChange={(v) => { setView(v as any); setPage(1); }}
            data={[
              { value: 'list', label: 'List' },
              { value: 'diff', label: hasBoth ? '🔍 Diff' : 'Diff', disabled: !hasBoth },
              { value: 'breakdown', label: '📊 Breakdown' },
            ]}
            size="xs" mb="xs" fullWidth
          />
        )}

        {/* ── Empty states ──────────────────────────────────────────────── */}
        {!hasCurrent && !hasBaseline && (
          <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
            <Text size="sm" c="dimmed">No loot loaded</Text>
            <Text size="xs" c="dimmed" ta="center" maw={280}>
              Import a baseline before your session, then a return CSV after to see exactly what you gained.
            </Text>
            <Group gap="xs">
              <Button size="xs" variant="light" color="yellow" onClick={() => triggerImport('baseline')}>📦 Import Baseline</Button>
              <Button size="xs" variant="light" color="teal" onClick={() => triggerImport('current')}>💰 Import Loot</Button>
            </Group>
          </Stack>
        )}

        {!hasCurrent && hasBaseline && (
          <Stack align="center" justify="center" style={{ flex: 1 }} gap="xs">
            <Badge color="yellow" variant="light" size="lg">Baseline: {baselineTotal.toFixed(1)}c</Badge>
            <Text size="xs" c="dimmed" ta="center">Go map. Import a return CSV to see your gains.</Text>
            <Button size="xs" variant="light" color="teal" leftSection={<FaFileImport size={10} />}
              onClick={() => triggerImport('current')}>
              Import Return CSV
            </Button>
          </Stack>
        )}

        {/* ── LIST VIEW ──────────────────────────────────────────────────── */}
        {hasCurrent && view === 'list' && (
          <>
            <TextInput size="xs" placeholder="Filter items..."
              leftSection={<FaSearch size={10} />} value={search}
              onChange={(e) => { setSearch(e.currentTarget.value); setPage(1); }} mb="xs" />
            <ScrollArea style={{ flex: 1 }}>
              <Table stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 28 }}>✓</Table.Th>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Tab</Table.Th>
                    <Table.Th>Qty</Table.Th>
                    <Table.Th>Value</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{listRows}</Table.Tbody>
              </Table>
            </ScrollArea>
            {totalPages > 1 && <Pagination value={page} onChange={setPage} total={totalPages} size="xs" mt="xs" />}
            <Divider my="xs" />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Session loot</Text>
              <Group gap="xs">
                <Badge color="teal" variant="light">{includedTotal.toFixed(1)}c</Badge>
                <Badge color="yellow" variant="light">{(includedTotal / divPrice).toFixed(2)}d</Badge>
              </Group>
            </Group>
          </>
        )}

        {/* ── DIFF VIEW ──────────────────────────────────────────────────── */}
        {hasBoth && view === 'diff' && (
          <>
            <Group justify="space-between" align="flex-end" mb={6}>
              <Text size="sm" fw={700} c={netGain >= 0 ? 'green' : 'red'}>
                Net Gain
              </Text>
              <Stack gap={0} align="flex-end">
                <Text size="lg" fw={800} c={netGain >= 0 ? 'green' : 'red'}>
                  {netGain >= 0 ? '+' : ''}{netGain.toFixed(1)}c
                </Text>
                <Text size="xs" c="dimmed">{(netGain / divPrice).toFixed(2)}d</Text>
              </Stack>
            </Group>

            {/* Gains / Losses tab toggle */}
            <SegmentedControl
              value={diffTab}
              onChange={(v) => { setDiffTab(v as any); setPage(1); }}
              data={[
                { value: 'gains',  label: `✅ Gained (${gains.length})` },
                { value: 'losses', label: `📦 Spent/Reduced (${losses.length})` },
              ]}
              size="xs" mb="xs" fullWidth
            />

            <ScrollArea style={{ flex: 1 }}>
              <Table stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Item</Table.Th>
                    <Table.Th>Tab</Table.Th>
                    <Table.Th>Qty change</Table.Th>
                    <Table.Th>{diffTab === 'gains' ? 'Gained' : 'Reduced'}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>{diffTableRows}</Table.Tbody>
              </Table>
            </ScrollArea>
            {diffTotalPages > 1 && <Pagination value={page} onChange={setPage} total={diffTotalPages} size="xs" mt="xs" />}

            <Divider my="xs" />
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Gained</Text>
              <Text size="xs" c="green">+{totalGain.toFixed(1)}c</Text>
            </Group>
            {losses.length > 0 && (
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Spent/reduced</Text>
                <Text size="xs" c="red">{totalLost.toFixed(1)}c</Text>
              </Group>
            )}
          </>
        )}

        {/* ── BREAKDOWN VIEW ─────────────────────────────────────────────── */}
        {(hasCurrent || hasBaseline) && view === 'breakdown' && (
          <ScrollArea style={{ flex: 1 }}>
            <Stack gap={6}>
              {hasBoth && (
                <Group justify="space-between" mb={4}>
                  <Text size="xs" c="dimmed">Gains by category</Text>
                  <Text size="xs" fw={600} c="green">+{netGain.toFixed(1)}c total</Text>
                </Group>
              )}
              {sortedCategories.map(([cat, value]) => (
                <Stack key={cat} gap={2}>
                  <Group justify="space-between">
                    <Badge color={CAT_COLORS[cat as ItemCategory] ?? 'gray'} size="xs" variant="light">{cat}</Badge>
                    <Group gap={4}>
                      <Text size="xs" fw={600} c="teal">{value.toFixed(1)}c</Text>
                      <Text size="xs" c="dimmed">{(value / divPrice).toFixed(2)}d</Text>
                    </Group>
                  </Group>
                  <Progress
                    value={(value / maxCatValue) * 100}
                    size={4}
                    color={CAT_COLORS[cat as ItemCategory] ?? 'gray'}
                  />
                </Stack>
              ))}
              {sortedCategories.length === 0 && (
                <Text size="xs" c="dimmed" ta="center" mt="md">No data yet.</Text>
              )}
            </Stack>
          </ScrollArea>
        )}
      </Card>
    </>
  );
};
