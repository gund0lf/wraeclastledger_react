import { Card, Text, Stack, Group, Divider, Badge } from '@mantine/core';
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
    const chiselInfo = settings.chiselType ? CHISEL_TYPES[settings.chiselType] : null;
    const chiselExpected: Record<string, number> = {};
    if (chiselInfo && settings.chiselPrice > 0) {
      const unChiseled = maps.filter((m) => m.quality === 0).length;
      if (unChiseled > 0) chiselExpected[chiselInfo.statKey] = (unChiseled / count) * chiselInfo.bonusAt20;
    }
    const result: Record<string, { avg: number; proj: number; hasChisel: boolean }> = {};
    for (const key of STAT_KEYS) {
      const avg       = maps.reduce((acc, m) => acc + ((m[key] as number) ?? 0), 0) / count;
      const qualBonus = ((totalQualityBonuses[key as string] ?? 0) / count) + (chiselExpected[key as string] ?? 0);
      const proj      = (avg - qualBonus) * multiplier + qualBonus;
      result[key as string] = { avg, proj, hasChisel: !!(chiselInfo?.statKey === key as string) };
    }
    return { count, multiplier, stats: result, effectiveMods, mountBonus };
  }, [maps, settings]);

  const profit = useMemo(() => {
    const chiselCost = settings.chiselType && settings.chiselPrice > 0 ? settings.chiselPrice : 0;
    const scarabCost = settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
    const mapCount   = stats?.count ?? 0;
    let perMap = settings.baseMapCost + chiselCost + scarabCost;
    if (settings.advSplitPrice > 0) {
      perMap = (settings.baseMapCost + chiselCost + settings.advSplitPrice) / 2 + scarabCost;
    }
    const totalInvestment = perMap * mapCount + settings.rollingCostPerMap;
    const rawReturn   = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
    const hasReturn   = lootItems.length > 0;
    const hasBaseline = baselineTotal > 0 && hasReturn;
    const lootGain    = hasReturn ? (hasBaseline ? rawReturn - baselineTotal : rawReturn) : 0;
    const netProfit   = lootGain - totalInvestment;
    const divPrice    = settings.divinePrice || 1;
    return {
      totalInvestment, rawReturn, lootGain, netProfit,
      divPerMap: mapCount > 0 ? (netProfit / divPrice) / mapCount : 0,
      chaosPerMap: mapCount > 0 ? netProfit / mapCount : 0,
      divPrice, hasReturn, hasBaseline, baselineTotal,
    };
  }, [stats, settings, lootItems, baselineTotal]);

  if (!stats) {
    return (
      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <Text size="sm" c="dimmed">No maps loaded.</Text>
        <Text size="xs" c="dimmed" mt={4}>Enable Live and Ctrl+C, or use Paste.</Text>
      </Card>
    );
  }

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>

      {/* ── Header ── */}
      <Group justify="space-between" mb={4}>
        <Text fw={700} size="sm">Statistics</Text>
        <Group gap={4}>
          <Badge variant="light" size="sm">{stats.count} maps</Badge>
          <Badge color="blue" variant="outline" size="sm">{stats.multiplier.toFixed(3)}×</Badge>
        </Group>
      </Group>

      {/* ── Active modifier pills ── */}
      <Group gap={4} mb={8} wrap="wrap">
        <Text size="xs" c="dimmed">Base → Projected</Text>
        {settings.mountingModifiers && (
          <Badge size="xs" color="orange" variant="light">{stats.effectiveMods} mods ×2%</Badge>
        )}
        {settings.chiselType && (
          <Badge size="xs" color="yellow" variant="light">🪨 {settings.chiselType}</Badge>
        )}
      </Group>

      {/* ── Stat table: Label | Base | → | Projected ── */}
      <Stack gap={0} mb={10}>
        {STAT_KEYS.map((key) => {
          const data = stats.stats[key as string];
          if (!data || (data.avg === 0 && data.proj === 0)) return null;
          return (
            <Group key={key as string} gap={0} wrap="nowrap"
              style={{ paddingTop: 4, paddingBottom: 4, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              {/* Label */}
              <Text size="xs" c="dimmed" style={{ width: 58, flexShrink: 0 }}>
                {STAT_LABELS[key as string]}
              </Text>
              {/* Base */}
              <Text size="xs" style={{ width: 50, textAlign: 'right', flexShrink: 0, color: '#868e96' }}>
                {data.avg.toFixed(1)}%
              </Text>
              {/* Arrow */}
              <Text size="xs" c="dimmed" style={{ width: 24, textAlign: 'center', flexShrink: 0 }}>→</Text>
              {/* Projected — prominent */}
              <Text size="sm" fw={700}
                style={{ flex: 1, color: data.hasChisel ? '#ffd43b' : '#74c0fc' }}>
                {data.proj.toFixed(1)}%{data.hasChisel ? ' 🪨' : ''}
              </Text>
            </Group>
          );
        })}
      </Stack>

      {/* ── Profit section ── */}
      <Divider mb={6} />
      <Stack gap={4}>

        <Group justify="space-between">
          <Text size="xs" c="dimmed">Investment</Text>
          <Text size="xs">{profit.totalInvestment.toFixed(0)}c</Text>
        </Group>

        {profit.hasReturn && profit.hasBaseline && (
          <>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Return</Text>
              <Text size="xs">{profit.rawReturn.toFixed(0)}c</Text>
            </Group>
            <Group justify="space-between">
              <Text size="xs" c="dimmed">− Baseline ({profit.baselineTotal.toFixed(0)}c)</Text>
              <Text size="xs" c={profit.lootGain >= 0 ? 'teal' : 'red'}>
                {profit.lootGain >= 0 ? '+' : ''}{profit.lootGain.toFixed(0)}c
              </Text>
            </Group>
          </>
        )}
        {profit.hasReturn && !profit.hasBaseline && (
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Loot</Text>
            <Text size="xs" c="teal">{profit.rawReturn.toFixed(0)}c</Text>
          </Group>
        )}
        {!profit.hasReturn && (
          <Text size="xs" c="dimmed" fs="italic">No return CSV — loot not in profit</Text>
        )}

        <Divider my={2} />

        {/* Net Profit */}
        <Group justify="space-between" align="flex-end">
          <Text size="xs" c="dimmed" fw={600}>Net Profit</Text>
          <Stack gap={0} align="flex-end">
            <Text fw={800} lh={1}
              style={{ fontSize: 20, color: profit.netProfit >= 0 ? '#51cf66' : '#ff6b6b', fontVariantNumeric: 'tabular-nums' }}>
              {profit.netProfit >= 0 ? '+' : ''}{profit.netProfit.toFixed(0)}c
            </Text>
            <Text size="xs" c="dimmed">{(profit.netProfit / profit.divPrice).toFixed(2)}d</Text>
          </Stack>
        </Group>

        {/* Per Map */}
        <Group justify="space-between" align="center"
          style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '4px 8px' }}>
          <Text size="xs" c="dimmed">Per Map</Text>
          <Group gap={8}>
            <Text size="sm" fw={700}
              c={profit.chaosPerMap >= 0 ? 'teal' : 'red'}
              style={{ fontVariantNumeric: 'tabular-nums' }}>
              {profit.chaosPerMap >= 0 ? '+' : ''}{profit.chaosPerMap.toFixed(0)}c
            </Text>
            <Text size="xs" c="dimmed">{profit.divPerMap.toFixed(3)}d</Text>
          </Group>
        </Group>

      </Stack>
    </Card>
  );
};
