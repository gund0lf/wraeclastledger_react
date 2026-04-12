import { Card, Text, Grid, Stack, Group, Divider, Badge, Tooltip } from '@mantine/core';
import { useSessionStore } from '../store/useSessionStore';
import { useMemo } from 'react';
import { QUALITY_STAT_EFFECTS, CHISEL_TYPES } from '../utils/constants';
import { MapData } from '../types';

const STAT_KEYS: (keyof MapData)[] = [
  'quantity', 'rarity', 'packSize', 'moreCurrency', 'moreMaps', 'moreScarabs',
];
const STAT_LABELS: Record<string, string> = {
  quantity: 'Quantity', rarity: 'Rarity', packSize: 'Pack',
  moreCurrency: 'Currency', moreMaps: 'Maps', moreScarabs: 'Scarabs',
};

export const StatisticsModule = () => {
  const { maps, settings, lootItems, baselineTotal } = useSessionStore();

  const stats = useMemo(() => {
    const count = maps.length;
    if (count === 0) return null;

    const fragmentEffect  = settings.fragmentsUsed * 3;
    const smallNodeEffect = settings.smallNodesAllocated * 2;
    const scarabOfRiskCount = settings.scarabs
      .filter((s) => s.name.toLowerCase().includes('of risk')).length * 2;
    const baseModCount  = settings.mapType === '8-mod' ? 8 : 6;
    const effectiveMods = baseModCount + scarabOfRiskCount;
    const mountBonus    = settings.mountingModifiers ? effectiveMods * 2 : 0;
    const multiplier    = 1 + (fragmentEffect + smallNodeEffect + mountBonus) / 100;

    const totalQualityBonuses: Record<string, number> = {};
    for (const map of maps) {
      const effect = QUALITY_STAT_EFFECTS[map.qualityType];
      if (effect && map.quality > 0)
        totalQualityBonuses[effect.statKey] = (totalQualityBonuses[effect.statKey] ?? 0) + map.quality * effect.multiplier;
    }
    const chiselInfo = settings.chiselUsed ? CHISEL_TYPES[settings.chiselType] : null;
    const chiselExpected: Record<string, number> = {};
    if (chiselInfo) {
      const unChiseled = maps.filter((m) => m.quality === 0).length;
      if (unChiseled > 0) chiselExpected[chiselInfo.statKey] = (unChiseled / count) * chiselInfo.bonusAt20;
    }
    const result: Record<string, { avg: number; proj: number; hasChisel: boolean }> = {};
    for (const key of STAT_KEYS) {
      const avg      = maps.reduce((acc, m) => acc + ((m[key] as number) ?? 0), 0) / count;
      const qualBonus = ((totalQualityBonuses[key as string] ?? 0) / count) + (chiselExpected[key as string] ?? 0);
      const proj     = (avg - qualBonus) * multiplier + qualBonus;
      result[key as string] = { avg, proj, hasChisel: !!(chiselInfo?.statKey === key as string) };
    }
    return { count, multiplier, stats: result, fragmentEffect, smallNodeEffect, mountBonus, effectiveMods };
  }, [maps, settings]);

  const profit = useMemo(() => {
    const chiselCost = settings.chiselUsed ? settings.chiselPrice : 0;
    const scarabCost = settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
    const mapCount   = stats?.count ?? 0;
    let perMap = settings.baseMapCost + chiselCost + scarabCost;
    if (settings.isSplitSession) perMap = (settings.baseMapCost + chiselCost) / 2 + scarabCost;
    const totalInvestment = perMap * mapCount + settings.rollingCostPerMap;

    const rawReturn  = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
    const hasReturn  = lootItems.length > 0;
    const hasBaseline = baselineTotal > 0 && hasReturn;

    // KEY FIX: only subtract baseline when a RETURN csv has also been loaded.
    // Importing only a baseline should never put you in negative profit —
    // it's just a reference point waiting for the return CSV.
    const lootGain = hasReturn
      ? (hasBaseline ? rawReturn - baselineTotal : rawReturn)
      : 0;

    const netProfit  = lootGain - totalInvestment;
    const divPrice   = settings.divinePrice || 1;

    return {
      totalInvestment, rawReturn, lootGain, netProfit,
      divPerMap: mapCount > 0 ? (netProfit / divPrice) / mapCount : 0,
      chaosPerMap: mapCount > 0 ? netProfit / mapCount : 0,
      divPrice, hasReturn, hasBaseline,
      baselineTotal,
    };
  }, [stats, settings, lootItems, baselineTotal]);

  if (!stats) {
    return (
      <Card shadow="sm" padding="md" radius="md" withBorder h="100%">
        <Text size="sm" c="dimmed">No maps loaded.</Text>
        <Text size="xs" c="dimmed" mt={4}>Enable Live and Ctrl+C over a map, or use Paste.</Text>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
      <Group justify="space-between" mb={6}>
        <Text fw={700} size="sm">Statistics</Text>
        <Group gap={4}>
          <Badge variant="light">{stats.count} maps</Badge>
          <Badge color="blue" variant="outline">{stats.multiplier.toFixed(3)}×</Badge>
        </Group>
      </Group>

      <Text size="xs" c="dimmed" mb={8}>
        Base → Projected
        {settings.mountingModifiers && <Text span c="orange"> · {stats.effectiveMods} mods mounting</Text>}
        {settings.chiselUsed && <Text span c="yellow"> · 🪨 {settings.chiselType}</Text>}
      </Text>

      <Grid gutter={6} mb={8}>
        {STAT_KEYS.map((key) => {
          const data = stats.stats[key as string];
          if (!data || (data.avg === 0 && data.proj === 0)) return null;
          return (
            <Grid.Col key={key as string} span={4}>
              <Stack gap={0}>
                <Text size="xs" c="dimmed" lh={1.2}>{STAT_LABELS[key as string]}</Text>
                <Text fw={700} size="md" lh={1.1}>{data.avg.toFixed(1)}%</Text>
                <Text size="xs" c={data.hasChisel ? 'yellow' : 'blue'} lh={1.2}>
                  → {data.proj.toFixed(1)}%{data.hasChisel ? ' 🪨' : ''}
                </Text>
              </Stack>
            </Grid.Col>
          );
        })}
      </Grid>

      <Divider mb={6} />

      <Stack gap={4}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">Investment</Text>
          <Text size="xs">{profit.totalInvestment.toFixed(1)}c</Text>
        </Group>

        {/* Only show loot/baseline rows when a return CSV is loaded */}
        {profit.hasReturn && profit.hasBaseline && (
          <>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Return CSV</Text>
              <Text size="xs" c="dimmed">{profit.rawReturn.toFixed(1)}c</Text>
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">− Baseline ({profit.baselineTotal.toFixed(0)}c)</Text>
              <Text size="xs" c={profit.lootGain >= 0 ? 'teal' : 'red'}>
                {profit.lootGain >= 0 ? '+' : ''}{profit.lootGain.toFixed(1)}c
              </Text>
            </Group>
          </>
        )}
        {profit.hasReturn && !profit.hasBaseline && (
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Loot</Text>
            <Text size="xs" c="teal">{profit.rawReturn.toFixed(1)}c</Text>
          </Group>
        )}
        {!profit.hasReturn && (
          <Text size="xs" c="dimmed" fs="italic">No return CSV loaded — loot not included in profit.</Text>
        )}

        <Divider my={2} />
        <Group justify="space-between" align="flex-end">
          <Text size="sm" fw={700}>Net Profit</Text>
          <Stack gap={0} align="flex-end">
            <Text size="xl" fw={800} lh={1} c={profit.netProfit >= 0 ? 'green' : 'red'}>
              {profit.netProfit >= 0 ? '+' : ''}{profit.netProfit.toFixed(1)}c
            </Text>
            <Text size="xs" c="dimmed">{(profit.netProfit / profit.divPrice).toFixed(2)}d</Text>
          </Stack>
        </Group>
        <Group justify="space-between" align="flex-end">
          <Text size="xs" c="dimmed">Per Map</Text>
          <Stack gap={0} align="flex-end">
            <Text size="md" fw={700} c={profit.chaosPerMap >= 0 ? 'teal' : 'red'}>
              {profit.chaosPerMap >= 0 ? '+' : ''}{profit.chaosPerMap.toFixed(1)}c
            </Text>
            <Text size="xs" c="dimmed">{profit.divPerMap.toFixed(3)} div/map</Text>
          </Stack>
        </Group>
      </Stack>
    </Card>
  );
};
