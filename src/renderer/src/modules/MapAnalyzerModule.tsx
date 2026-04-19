import {
  Card, Text, Button, Group, Stack, Badge,
  ScrollArea, Alert, Tooltip, Select,
} from '@mantine/core';
import { useState, useMemo, useEffect } from 'react';
import { analyzeMap } from '../utils/uberMapMods';
import { analyzeRegularMap } from '../utils/regularMapMods';
import { useSessionStore } from '../store/useSessionStore';

type TabLayout = 'map-tab' | 'regular' | 'quad' | 'map-device';

const LAYOUTS: Record<TabLayout, { label: string; cols: number; rows: number; cellSize: number; desc: string }> = {
  'map-tab':    { label: 'Map Tab (6×12)',      cols: 12, rows: 6,  cellSize: 44, desc: '72 slots'  },
  'regular':    { label: 'Regular Tab (12×12)', cols: 12, rows: 12, cellSize: 28, desc: '144 slots' },
  'quad':       { label: 'Quad Tab (24×24)',     cols: 24, rows: 24, cellSize: 16, desc: '576 slots' },
  'map-device': { label: 'Map Device (4×5)',     cols: 4,  rows: 5,  cellSize: 56, desc: '20 slots'  },
};

// ─── Quality tiers (based on combined S+A mod count) ─────────────────────────
const QUAL = {
  excellent: { color: '#ffd700', label: 'Excellent (4+ top mods)', bg: '#2d2a10' },
  good:      { color: '#51cf66', label: 'Good (2 top mods)',       bg: '#1a2d1a' },
  decent:    { color: '#74c0fc', label: 'Decent (1 top mod)',      bg: '#1a2a3d' },
  standard:  { color: '#555',    label: 'Standard',                bg: '#1a1b1e' },
} as const;
type QualKey = keyof typeof QUAL;

// ─── Stash Grid ───────────────────────────────────────────────────────────────
const StashGrid = ({ layout }: { layout: TabLayout }) => {
  const { maps } = useSessionStore();
  const [hovered,    setHovered]    = useState<number | null>(null);
  const [currentTab, setCurrentTab] = useState(0);

  const { cols, rows, cellSize } = LAYOUTS[layout];
  const total    = cols * rows;
  const maxTabs  = Math.max(1, Math.ceil(maps.length / total));
  const tabOffset = Math.min(currentTab, maxTabs - 1) * total;

  // Reset to first tab when layout changes
  useEffect(() => { setCurrentTab(0); setHovered(null); }, [total]);
  // Clamp currentTab if maps shrink
  useEffect(() => {
    if (currentTab >= maxTabs) { setCurrentTab(0); setHovered(null); }
  }, [maxTabs, currentTab]);

  // Full analyses array — computed once for ALL maps
  const analyses = useMemo(() =>
    maps.map((m) => m.rawText
      ? (m.isOriginator ? analyzeMap(m.rawText) : analyzeRegularMap(m.rawText))
      : null),
  [maps]);

  // Hovered map uses tab offset so slot indices map to the right global map
  const hoveredMapIdx  = hovered !== null ? tabOffset + hovered : null;
  const hoveredMap     = hoveredMapIdx !== null && hoveredMapIdx < maps.length    ? maps[hoveredMapIdx]     : null;
  const hoveredAnalysis= hoveredMapIdx !== null && hoveredMapIdx < analyses.length ? analyses[hoveredMapIdx] : null;
  const hoveredQual    = hoveredAnalysis ? (QUAL[hoveredAnalysis.recommendation as QualKey] ?? QUAL.standard) : null;

  // Column-first grid layout (slot indices within this tab's page)
  const gridCells = useMemo(() => {
    const cells: { slotIndex: number }[][] = [];
    for (let r = 0; r < rows; r++) {
      cells[r] = [];
      for (let c = 0; c < cols; c++) {
        cells[r][c] = { slotIndex: c * rows + r };
      }
    }
    return cells;
  }, [cols, rows]);

  const isCompact = cellSize <= 20;

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>

      {/* Header: count + tab selector */}
      <Group justify="space-between" align="center" style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed" style={{ flex: 1, textAlign: 'center' }}>
          Column-first fill ·{' '}
          <Text span fw={600}>{maps.length}</Text>
          {maxTabs > 1 && <Text span c="dimmed"> maps across {maxTabs} tabs</Text>}
          {maxTabs === 1 && <Text span c="dimmed">/{total} parsed</Text>}
        </Text>
      </Group>

      {/* Tab selector — only shown when maps overflow a single tab */}
      {maxTabs > 1 && (
        <Group gap={4} justify="center" style={{ flexShrink: 0 }}>
          {Array.from({ length: maxTabs }, (_, i) => {
            const tabStart = i * total;
            const tabEnd   = Math.min((i + 1) * total, maps.length);
            const count    = tabEnd - tabStart;
            return (
              <Button
                key={i}
                size="xs"
                variant={currentTab === i ? 'filled' : 'default'}
                color={currentTab === i ? 'orange' : 'gray'}
                onClick={() => { setCurrentTab(i); setHovered(null); }}
                style={{ minWidth: 70 }}
              >
                Tab {i + 1} ({count})
              </Button>
            );
          })}
        </Group>
      )}

      {/* Legend */}
      <Group gap={8} wrap="wrap" justify="center" style={{ flexShrink: 0 }}>
        {(Object.entries(QUAL) as [QualKey, typeof QUAL[QualKey]][]).map(([key, val]) => (
          <Group key={key} gap={4}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: val.color }} />
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>{val.label}</Text>
          </Group>
        ))}
        <Group gap={4}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffd700' }} />
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Avarice chisel</Text>
        </Group>
        <Group gap={4}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#74c0fc' }} />
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Proliferation chisel</Text>
        </Group>
      </Group>

      {/* Grid */}
      <ScrollArea style={{ flex: 1 }} offsetScrollbars>
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 4 }}>
          <div style={{ display: 'inline-block' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: isCompact ? 1 : 3 }}>
              <tbody>
                {gridCells.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {row.map(({ slotIndex }, cIdx) => {
                      const globalIdx = tabOffset + slotIndex;
                      const map       = globalIdx < maps.length     ? maps[globalIdx]     : null;
                      const analysis  = globalIdx < analyses.length ? analyses[globalIdx] : null;
                      const qual      = analysis ? (QUAL[analysis.recommendation as QualKey] ?? QUAL.standard) : null;
                      const isHov     = hovered === slotIndex;
                      return (
                        <td key={cIdx} style={{ padding: 0 }}>
                          <Tooltip withinPortal disabled={!map || isCompact} position="top"
                            styles={{ tooltip: { background: '#0e0f11', border: '1px solid #333', color: '#c9cace' } }}
                            label={map ? (
                              <Stack gap={2} p={2}>
                                <Group gap={4}>
                                  <Text size="xs" fw={700}>{map.name}</Text>
                                  <Badge size="xs" color={map.isOriginator ? 'orange' : 'blue'} variant="dot" style={{ fontSize: 7 }}>
                                    {map.isOriginator ? 'Orig' : 'T16'}
                                  </Badge>
                                </Group>
                                <Group gap={4}>
                                  <Text size="xs">{map.quantity}%Q</Text>
                                  <Text size="xs">{map.rarity}%R</Text>
                                  <Text size="xs">{map.packSize}%P</Text>
                                  {map.moreCurrency > 0 && (
                                    <Text size="xs" style={{ color: '#fbbf24', fontWeight: 600 }}>
                                      +{map.moreCurrency}% Curr
                                    </Text>
                                  )}
                                </Group>
                                {analysis && (
                                  <Group gap={4}>
                                    <Text size="xs" style={{ color: qual?.color }}>{qual?.label}</Text>
                                    <Text size="xs" c="dimmed">· Chisel: {analysis.chiselRec}</Text>
                                  </Group>
                                )}
                                <Text size="xs" c="dimmed">Slot #{globalIdx + 1}</Text>
                              </Stack>
                            ) : ''}>
                            <div
                              onMouseEnter={() => setHovered(slotIndex)}
                              onMouseLeave={() => setHovered(null)}
                              style={{
                                width: cellSize, height: cellSize, borderRadius: isCompact ? 2 : 4,
                                background: qual ? qual.bg : (map ? '#1e1f22' : '#16171a'),
                                border: `${isCompact ? 1 : 2}px solid ${isHov ? '#fff' : (qual ? qual.color : '#333')}`,
                                display: 'flex', flexDirection: 'column',
                                alignItems: 'center', justifyContent: 'center',
                                cursor: map ? 'pointer' : 'default',
                                opacity: map ? 1 : 0.3, flexShrink: 0, position: 'relative',
                              }}>
                              {map && !isCompact ? (
                                <>
                                  <Text style={{ color: qual?.color ?? '#aaa', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>XVI</Text>
                                  <Text style={{ color: '#888', fontSize: 8, lineHeight: 1, marginTop: 2 }}>{map.quantity}%Q</Text>
                                  {analysis && analysis.chiselRec !== 'none' && (
                                    <div style={{
                                      position: 'absolute', bottom: 2, right: 2, width: 5, height: 5,
                                      borderRadius: '50%',
                                      background: analysis.chiselRec === 'Avarice' ? '#ffd700' : '#74c0fc',
                                    }} />
                                  )}
                                </>
                              ) : map && isCompact ? (
                                <div style={{ width: cellSize - 4, height: cellSize - 4, borderRadius: 1, background: qual?.color ?? '#888', opacity: 0.7 }} />
                              ) : !isCompact ? (
                                <Text style={{ fontSize: 8, color: '#444' }}>{globalIdx + 1}</Text>
                              ) : null}
                            </div>
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </ScrollArea>

      {/* Detail bar */}
      <div style={{
        flexShrink: 0, minHeight: 60,
        background: hoveredQual ? hoveredQual.bg : '#1a1b1e',
        border: `1px solid ${hoveredQual ? hoveredQual.color : '#333'}`,
        borderRadius: 6, padding: '8px 10px',
      }}>
        {hoveredMap && hoveredAnalysis && hoveredQual ? (
          <>
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Group gap={6}>
                  <Text size="xs" fw={700}>{hoveredMap.name}</Text>
                  <Badge size="xs" color={hoveredMap.isOriginator ? 'orange' : 'blue'} variant="dot">
                    {hoveredMap.isOriginator ? 'Originator' : 'Regular T16'}
                  </Badge>
                </Group>
                <Group gap={4} wrap="wrap">
                  <Badge size="xs" variant="light" color="blue">Q: {hoveredMap.quantity}%</Badge>
                  <Badge size="xs" variant="light" color="violet">R: {hoveredMap.rarity}%</Badge>
                  <Badge size="xs" variant="light" color="teal">P: {hoveredMap.packSize}%</Badge>
                  {hoveredMap.moreCurrency > 0 && (
                    <Badge size="xs" variant="light" color="green">+{hoveredMap.moreCurrency}% Curr</Badge>
                  )}
                </Group>
              </Stack>
              <Stack gap={2} align="flex-end">
                <Text size="xs" fw={700} style={{ color: hoveredQual.color }}>{hoveredQual.label}</Text>
                <Text size="xs" c="dimmed">Chisel: {hoveredAnalysis.chiselRec} — {hoveredAnalysis.chiselReason}</Text>
              </Stack>
            </Group>
            <Group gap="xs" mt={4} wrap="wrap">
              {hoveredAnalysis.goodPrefixes.length > 0 && (
                <Text size="xs" c="violet">
                  Top pfx: {hoveredAnalysis.goodPrefixes.map((m) => `${m.name} [${m.tier}]`).join(', ')}
                </Text>
              )}
              {hoveredAnalysis.goodSuffixes.length > 0 && (
                <Text size="xs" c="cyan">
                  Top sfx: {hoveredAnalysis.goodSuffixes.map((m) => `${m.name} [${m.tier}]`).join(', ')}
                </Text>
              )}
            </Group>
          </>
        ) : (
          <Text size="xs" c="dimmed">Hover a parsed map for details · Dot = chisel rec (gold = Avarice, blue = Proliferation)</Text>
        )}
      </div>

      {/* Summary badges — always show counts across ALL maps, not just current tab */}
      {maps.length > 0 && (
        <Group gap="xs" wrap="wrap" justify="center" style={{ flexShrink: 0 }}>
          {(Object.entries(QUAL) as [QualKey, typeof QUAL[QualKey]][]).map(([key, val]) => {
            const count = analyses.filter((a) => a?.recommendation === key).length;
            if (count === 0) return null;
            return (
              <Badge key={key} size="sm" style={{ background: val.bg, color: val.color, border: `1px solid ${val.color}` }}>
                {val.label.split(' (')[0]}: {count}
              </Badge>
            );
          })}
          <Badge color="yellow" variant="light" size="sm">
            Avarice: {analyses.filter((a) => a?.chiselRec === 'Avarice').length}
          </Badge>
          <Badge color="cyan" variant="light" size="sm">
            Proliferation: {analyses.filter((a) => a?.chiselRec === 'Proliferation').length}
          </Badge>
        </Group>
      )}

      {maps.length === 0 && (
        <Alert color="blue" variant="light" p="xs" style={{ flexShrink: 0 }}>
          <Text size="xs">
            Enable <Text span fw={600}>Live</Text> in Map Log, Ctrl+C each map.
            Go <Text span fw={600}>down</Text> each column, then right.
          </Text>
        </Alert>
      )}
    </Stack>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const MapAnalyzerModule = () => {
  const [layout, setLayout] = useState<TabLayout>('map-tab');
  const { maps } = useSessionStore();

  // Build layout options — disable Map Device when more than 20 maps are parsed
  const layoutSelectData = useMemo(() =>
    Object.entries(LAYOUTS).map(([k, v]) => ({
      value: k,
      label: k === 'map-device' && maps.length > 20
        ? `${v.label} — ${v.desc} (max 20 maps)`
        : `${v.label} — ${v.desc}`,
      disabled: k === 'map-device' && maps.length > 20,
    })),
  [maps.length]);

  // Auto-switch away from Map Device if maps exceed 20
  useEffect(() => {
    if (layout === 'map-device' && maps.length > 20) setLayout('map-tab');
  }, [maps.length, layout]);

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="xs" style={{ flexShrink: 0 }}>
        <Text fw={700} size="sm">Map Analyzer</Text>
        <Text size="xs" c="dimmed">Map quality &amp; chisel guide</Text>
      </Group>

      <Group gap="xs" mb="xs" style={{ flexShrink: 0 }}>
        <Select
          data={layoutSelectData}
          value={layout}
          onChange={(v) => setLayout((v ?? 'map-tab') as TabLayout)}
          size="xs"
          style={{ flex: 1 }}
        />
      </Group>

      <StashGrid layout={layout} />
    </Card>
  );
};
