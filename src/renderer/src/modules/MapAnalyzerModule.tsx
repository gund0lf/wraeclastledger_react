import {
  Card, Text, Textarea, Button, Group, Stack, Badge, Divider,
  ScrollArea, Alert, SegmentedControl, Tooltip,
} from '@mantine/core';
import { useState, useMemo } from 'react';
import { analyzeMap } from '../utils/uberMapMods';
import { parseMapClipboard } from '../utils/mapParser';
import { useSessionStore } from '../store/useSessionStore';

const COLS      = 12;
const ROWS      = 6;
const TOTAL     = COLS * ROWS;
const CELL_SIZE = 44;

const REC = {
  sinistral:    { color: '#9c6fc5', label: '🟣 SINISTRAL',   bg: '#2d1f3d' },
  dextral:      { color: '#4dabf7', label: '🔵 DEXTRAL',     bg: '#1a2a3d' },
  'both-viable':{ color: '#ffd700', label: '🟡 BOTH VIABLE', bg: '#2d2a10' },
  neither:      { color: '#868e96', label: '⚪ NEITHER',      bg: '#1e1f22' },
} as const;
type RecKey = keyof typeof REC;

// ─── Paste Analyzer ───────────────────────────────────────────────────────────
const PasteAnalyzer = () => {
  const [clipText, setClipText] = useState('');
  const [result,   setResult]   = useState<ReturnType<typeof analyzeMap> | null>(null);
  const [parsed,   setParsed]   = useState<ReturnType<typeof parseMapClipboard> | null>(null);

  const run = (text: string) => {
    setClipText(text);
    if (text.trim()) {
      setResult(analyzeMap(text));
      setParsed(parseMapClipboard(text));
    } else {
      setResult(null);
      setParsed(null);
    }
  };

  const handlePaste = async () => {
    try { run(await navigator.clipboard.readText()); } catch { /* ignore */ }
  };

  const rec = result ? (REC[result.recommendation as RecKey] ?? REC.neither) : null;

  return (
    <ScrollArea style={{ flex: 1 }} offsetScrollbars>
      <Stack gap="sm" pb="md">
        <Group gap="xs">
          <Button size="xs" variant="default" onClick={handlePaste}>Paste from clipboard</Button>
          <Button size="xs" variant="subtle" color="gray"
            onClick={() => run('')}>Clear</Button>
        </Group>

        {/* Auto-analyzes on change — no separate Analyze button needed */}
        <Textarea size="xs" placeholder="Paste a Tier 16.5 Originator map tooltip — auto-analyzes as you type..."
          value={clipText}
          onChange={(e) => run(e.currentTarget.value)}
          autosize minRows={3} maxRows={8}
          styles={{ input: { fontFamily: 'monospace', fontSize: 11 } }} />

        {result && rec && (
          <Stack gap="xs">
            {parsed && (
              <Group gap={4} wrap="wrap">
                {parsed.quantity     > 0 && <Badge color="blue"   variant="light">Q: {parsed.quantity}%</Badge>}
                {parsed.rarity       > 0 && <Badge color="violet" variant="light">R: {parsed.rarity}%</Badge>}
                {parsed.packSize     > 0 && <Badge color="teal"   variant="light">P: {parsed.packSize}%</Badge>}
                {parsed.moreCurrency > 0 && <Badge color="yellow" variant="light">Curr: +{parsed.moreCurrency}%</Badge>}
                {parsed.moreMaps     > 0 && <Badge color="cyan"   variant="light">Maps: +{parsed.moreMaps}%</Badge>}
                {parsed.moreScarabs  > 0 && <Badge color="orange" variant="light">Scarabs: +{parsed.moreScarabs}%</Badge>}
              </Group>
            )}
            <Divider label="Recommendation" labelPosition="left" />
            <div style={{ background: rec.bg, border: `1px solid ${rec.color}`, borderRadius: 6, padding: '8px 12px' }}>
              <Text size="sm" fw={800} style={{ color: rec.color }}>{rec.label}</Text>
              <Text size="xs" c="dimmed" mt={2}>
                Prefix score: {result.prefixScore} ({result.goodPrefixes.length} good) ·
                Suffix score: {result.suffixScore} ({result.goodSuffixes.length} good)
              </Text>
            </div>
            <Group gap="xs" align="flex-start">
              <Badge color="yellow" variant="light" size="sm">Chisel: {result.chiselRec}</Badge>
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>{result.chiselReason}</Text>
            </Group>
            {result.prefixes.length > 0 && (
              <Stack gap={3}>
                <Text size="xs" fw={700} c="violet">Prefixes ({result.prefixes.length}) — {result.goodPrefixes.length} good for Sinistral</Text>
                {result.prefixes.map((m) => (
                  <Group key={m.name} gap={4} wrap="nowrap">
                    <Badge color={{ S: 'red', A: 'orange', B: 'gray' }[m.tier]} size="xs" variant="filled">{m.tier}</Badge>
                    <Text size="xs" fw={600}>{m.name}</Text>
                    {m.bonus && <Text size="xs" c="teal">({m.bonus})</Text>}
                  </Group>
                ))}
              </Stack>
            )}
            {result.suffixes.length > 0 && (
              <Stack gap={3}>
                <Text size="xs" fw={700} c="cyan">Suffixes ({result.suffixes.length}) — {result.goodSuffixes.length} good for Dextral</Text>
                {result.suffixes.map((m) => (
                  <Group key={m.name} gap={4} wrap="nowrap">
                    <Badge color={{ S: 'red', A: 'orange', B: 'gray' }[m.tier]} size="xs" variant="filled">{m.tier}</Badge>
                    <Text size="xs" fw={600}>{m.name}</Text>
                    {m.bonus && <Text size="xs" c="teal">({m.bonus})</Text>}
                  </Group>
                ))}
              </Stack>
            )}
            {result.detected.length === 0 && (
              <Text size="xs" c="dimmed">No uber mods detected. Is this a T16.5 Originator map?</Text>
            )}
            <Divider />
            <Text size="xs" c="dimmed">
              <Text span fw={600} c="violet">Sinistral</Text> doubles prefix effects, voids suffixes.
              <Text span fw={600} c="cyan"> Dextral</Text> doubles suffix effects, voids prefixes.
            </Text>
          </Stack>
        )}
        {!result && (
          <Alert color="blue" variant="light" p="xs">
            <Text size="xs">Paste a map tooltip — recommendation appears instantly.</Text>
          </Alert>
        )}
      </Stack>
    </ScrollArea>
  );
};

// ─── Stash Grid ───────────────────────────────────────────────────────────────
const StashGrid = () => {
  const { maps } = useSessionStore();
  const [hovered, setHovered] = useState<number | null>(null);

  const analyses = useMemo(() =>
    maps.map((m) => m.rawText ? analyzeMap(m.rawText) : null),
  [maps]);

  const hoveredMap      = hovered !== null && hovered < maps.length ? maps[hovered] : null;
  const hoveredAnalysis = hovered !== null ? analyses[hovered] : null;
  const hoveredRec      = hoveredAnalysis ? (REC[hoveredAnalysis.recommendation as RecKey] ?? REC.neither) : null;

  // Column-first grid: slot i → row = i % ROWS, col = floor(i / ROWS)
  const gridCells = useMemo(() => {
    const cells: { slotIndex: number }[][] = [];
    for (let r = 0; r < ROWS; r++) {
      cells[r] = [];
      for (let c = 0; c < COLS; c++) {
        cells[r][c] = { slotIndex: c * ROWS + r };
      }
    }
    return cells;
  }, []);

  return (
    <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          Parse order: top→bottom per column, left→right.{' '}
          <Text span fw={600}>{maps.length}/{TOTAL}</Text> parsed.
        </Text>
      </Group>

      <Group gap={6} wrap="wrap">
        {(Object.entries(REC) as [RecKey, typeof REC[RecKey]][]).map(([key, val]) => (
          <Group key={key} gap={3}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: val.color }} />
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>{val.label}</Text>
          </Group>
        ))}
      </Group>

      <ScrollArea style={{ flex: 1 }} offsetScrollbars>
        <div style={{ display: 'inline-block', paddingBottom: 4 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
            <tbody>
              {gridCells.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map(({ slotIndex }, cIdx) => {
                    const map      = slotIndex < maps.length ? maps[slotIndex] : null;
                    const analysis = slotIndex < analyses.length ? analyses[slotIndex] : null;
                    const rec      = analysis ? (REC[analysis.recommendation as RecKey] ?? REC.neither) : null;
                    const isHov    = hovered === slotIndex;
                    return (
                      <td key={cIdx} style={{ padding: 0 }}>
                        <Tooltip withinPortal disabled={!map} position="top"
                          label={map ? (
                            <Stack gap={2} p={2}>
                              <Text size="xs" fw={700}>{map.name}</Text>
                              <Group gap={4}>
                                <Text size="xs">{map.quantity}%Q</Text>
                                <Text size="xs">{map.rarity}%R</Text>
                                <Text size="xs">{map.packSize}%P</Text>
                                {map.moreCurrency > 0 && <Text size="xs" c="yellow">+{map.moreCurrency}% Curr</Text>}
                              </Group>
                              {analysis && <Text size="xs" style={{ color: rec?.color }}>{rec?.label} · Chisel: {analysis.chiselRec}</Text>}
                              <Text size="xs" c="dimmed">Slot #{slotIndex + 1}</Text>
                            </Stack>
                          ) : ''}>
                          <div
                            onMouseEnter={() => setHovered(slotIndex)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                              width: CELL_SIZE, height: CELL_SIZE, borderRadius: 4,
                              background: rec ? rec.bg : (map ? '#1e1f22' : '#16171a'),
                              border: `2px solid ${isHov ? '#fff' : (rec ? rec.color : '#333')}`,
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                              cursor: map ? 'pointer' : 'default',
                              opacity: map ? 1 : 0.3, flexShrink: 0, position: 'relative',
                            }}>
                            {map ? (
                              <>
                                <Text style={{ color: rec?.color ?? '#aaa', fontSize: 9, lineHeight: 1, fontWeight: 700 }}>XVI</Text>
                                <Text style={{ color: '#888', fontSize: 8, lineHeight: 1, marginTop: 2 }}>{map.quantity}%</Text>
                                {analysis && analysis.chiselRec !== 'none' && (
                                  <div style={{ position: 'absolute', bottom: 2, right: 2, width: 5, height: 5, borderRadius: '50%', background: analysis.chiselRec === 'Avarice' ? '#ffd700' : '#4dabf7' }} />
                                )}
                              </>
                            ) : (
                              <Text style={{ fontSize: 8, color: '#444' }}>{slotIndex + 1}</Text>
                            )}
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
      </ScrollArea>

      {/* Fixed-height detail bar */}
      <div style={{
        flexShrink: 0, minHeight: 60,
        background: hoveredRec ? hoveredRec.bg : '#1a1b1e',
        border: `1px solid ${hoveredRec ? hoveredRec.color : '#333'}`,
        borderRadius: 6, padding: '8px 10px',
      }}>
        {hoveredMap && hoveredAnalysis && hoveredRec ? (
          <>
            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text size="xs" fw={700}>{hoveredMap.name}</Text>
                <Group gap={4} wrap="wrap">
                  <Badge size="xs" variant="light" color="blue">Q: {hoveredMap.quantity}%</Badge>
                  <Badge size="xs" variant="light" color="violet">R: {hoveredMap.rarity}%</Badge>
                  <Badge size="xs" variant="light" color="teal">P: {hoveredMap.packSize}%</Badge>
                  {hoveredMap.moreCurrency > 0 && <Badge size="xs" variant="light" color="yellow">+{hoveredMap.moreCurrency}% Curr</Badge>}
                </Group>
              </Stack>
              <Stack gap={2} align="flex-end">
                <Text size="xs" fw={700} style={{ color: hoveredRec.color }}>{hoveredRec.label}</Text>
                <Text size="xs" c="dimmed">Chisel: {hoveredAnalysis.chiselRec}</Text>
              </Stack>
            </Group>
            <Group gap="xs" mt={4} wrap="wrap">
              {hoveredAnalysis.goodPrefixes.length > 0 && <Text size="xs" c="violet">Pfx: {hoveredAnalysis.goodPrefixes.map((m) => m.name).join(', ')}</Text>}
              {hoveredAnalysis.goodSuffixes.length > 0 && <Text size="xs" c="cyan">Sfx: {hoveredAnalysis.goodSuffixes.map((m) => m.name).join(', ')}</Text>}
            </Group>
          </>
        ) : (
          <Text size="xs" c="dimmed">Hover a parsed map for details</Text>
        )}
      </div>

      {maps.length > 0 && (
        <Group gap="xs" wrap="wrap" style={{ flexShrink: 0 }}>
          {(Object.entries(REC) as [RecKey, typeof REC[RecKey]][]).map(([key, val]) => {
            const count = analyses.filter((a) => a?.recommendation === key).length;
            if (count === 0) return null;
            return <Badge key={key} size="sm" style={{ background: val.bg, color: val.color, border: `1px solid ${val.color}` }}>{val.label}: {count}</Badge>;
          })}
          <Badge color="gray" variant="light" size="sm">No uber mods: {analyses.filter((a) => a && a.detected.length === 0).length}</Badge>
        </Group>
      )}

      {maps.length === 0 && (
        <Alert color="blue" variant="light" p="xs" style={{ flexShrink: 0 }}>
          <Text size="xs">Enable <Text span fw={600}>Live</Text> in Map Log, Ctrl+C each map. Start top-left, go <Text span fw={600}>down</Text> each column, then right.</Text>
        </Alert>
      )}
    </Stack>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
export const MapAnalyzerModule = () => {
  const [view, setView] = useState<'grid' | 'paste'>('grid');
  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="xs" style={{ flexShrink: 0 }}>
        <Text fw={700} size="sm">Map Analyzer</Text>
        <Text size="xs" c="dimmed">Tier 16.5 Originator maps</Text>
      </Group>
      <SegmentedControl value={view} onChange={(v) => setView(v as any)}
        data={[{ value: 'grid', label: '🗺 Stash Grid' }, { value: 'paste', label: '📋 Paste Analyzer' }]}
        size="xs" mb="xs" fullWidth style={{ flexShrink: 0 }} />
      {view === 'grid'  && <StashGrid />}
      {view === 'paste' && <PasteAnalyzer />}
    </Card>
  );
};
