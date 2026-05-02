import {
  Modal, Stack, Text, Alert, Textarea, Group, Badge,
  Divider, Button, NumberInput, ScrollArea,
} from '@mantine/core';
import { useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import type { DiscordImport } from '../utils/parseDiscordExport';
import { CopyRegex } from './StrategyCard';

interface Props {
  opened: boolean;
  onClose: () => void;
  onLoadBuild: (parsed: DiscordImport) => void;
}

export const ImportModal = ({ opened, onClose, onLoadBuild }: Props) => {
  const { settings } = useSessionStore();

  const [importText,     setImportText]     = useState('');
  const [importResult,   setImportResult]   = useState<DiscordImport | null>(null);
  const [parseError,     setParseError]     = useState(false);
  const [importDivPrice, setImportDivPrice] = useState(settings.divinePrice || 300);

  const handleClose = () => {
    onClose();
    setImportText(''); setImportResult(null); setParseError(false);
  };

  const handleTextChange = (text: string) => {
    setImportText(text);
    if (text.trim().length > 50) {
      const r = parseDiscordExport(text);
      setImportResult(r);
      setParseError(!r && text.trim().length > 100);
    } else { setImportResult(null); setParseError(false); }
  };

  const repriced = importResult ? (() => {
    const orig = importResult.divPrice > 0 ? importResult.divPrice
      : importResult.divPerMap > 0 && importResult.mapCount > 0
        ? Math.round(Math.abs(importResult.netProfit) / (importResult.divPerMap * importResult.mapCount))
        : importDivPrice;
    const curr = importDivPrice || 1;
    return {
      netProfitDivNow: importResult.netProfit / curr,
      divPerMapNow:    importResult.divPerMap * (orig / curr),
      impliedDivPrice: orig,
    };
  })() : null;

  return (
    <Modal opened={opened} onClose={handleClose} title="Analyse a Discord Export"
      size="lg" scrollAreaComponent={ScrollArea.Autosize}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">Paste any WraeclastLedger export to see how it performs at your current divine price.</Text>
        <Textarea placeholder="Paste export here — auto-parses as you type..."
          value={importText} onChange={(e) => handleTextChange(e.currentTarget.value)}
          autosize minRows={4} maxRows={8} styles={{ input: { fontFamily: 'monospace', fontSize: 11 } }} />
        {parseError && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">Could not parse — paste the full export including the [WraeclastLedger Session] line.</Text>
          </Alert>
        )}
        {importResult && repriced && (
          <Stack gap="xs">
            <Divider label="Parsed" labelPosition="left" />
            <Group gap="xs" wrap="wrap">
              <Badge variant="light">{importResult.mapCount} maps</Badge>
              {importResult.mapType && <Badge variant="light" color="blue">{importResult.mapType}</Badge>}
              <Badge variant="light" color="blue">{importResult.multiplier.toFixed(2)}×</Badge>
              {importResult.chisel && importResult.chisel !== 'None' && (
                <Badge variant="light" color="yellow">🪨 {importResult.chisel}</Badge>
              )}
              {importResult.deliOrbType && (
                <Badge variant="light" color="grape">🌫️ {importResult.deliOrbQty}x {importResult.deliOrbType} ({importResult.deliOrbQty * 20}%)</Badge>
              )}
              {importResult.astroType && (
                <Badge variant="light" color="teal">🌍 {importResult.astroType}</Badge>
              )}
            </Group>
            <Group gap="xs" wrap="wrap">
              <Badge variant="dot" color="teal">Q: {importResult.avgQuant}%</Badge>
              <Badge variant="dot" color="violet">R: {importResult.avgRarity}%</Badge>
              <Badge variant="dot" color="cyan">P: {importResult.avgPack}%</Badge>
              <Badge variant="dot" color="yellow">Curr: {importResult.avgCurr}%</Badge>
            </Group>
            {importResult.scarabs.length > 0 && (
              <Text size="xs" c="dimmed">Scarabs: {importResult.scarabs.join(', ')}</Text>
            )}
            {importResult.strategyNotes && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
                <Text size="xs" c="dimmed" mb={2} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>Notes from author</Text>
                <Text size="xs" style={{ color: '#aaa', lineHeight: 1.5 }}>{importResult.strategyNotes}</Text>
              </div>
            )}
            {importResult.excludedDrops.length > 0 && (
              <div style={{ background: 'rgba(255,107,107,0.04)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,107,107,0.3)' }}>
                <Text size="xs" c="dimmed" mb={2} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>Excluded drops ({importResult.excludedDrops.length})</Text>
                <Text size="xs" style={{ color: '#aaa', lineHeight: 1.5 }}>
                  {importResult.excludedDrops.map((d) => `${d.name} (${d.value.toFixed(0)}c)`).join(', ')}
                </Text>
              </div>
            )}
            {importResult.gemInfo && (
              <Group gap={4}>
                <Text size="xs" c="dimmed">Gem leveling:</Text>
                <Text size="xs">{importResult.gemInfo.count} gems · buy {importResult.gemInfo.buy}c · sell {importResult.gemInfo.sell}c ·</Text>
                <Text size="xs" fw={600} c={importResult.gemInfo.net >= 0 ? 'teal' : 'red'}>
                  {importResult.gemInfo.net >= 0 ? '+' : ''}{importResult.gemInfo.net}c net
                </Text>
              </Group>
            )}
            <Group gap="lg" wrap="wrap">
              <Stack gap={0}><Text size="xs" c="dimmed">Per map cost</Text><Text size="sm" fw={600}>{importResult.perMapCost.toFixed(1)}c</Text></Stack>
              <Stack gap={0}><Text size="xs" c="dimmed">Total invest</Text><Text size="sm" fw={600}>{importResult.totalInvest.toFixed(1)}c</Text></Stack>
              <Stack gap={0}><Text size="xs" c="dimmed">Net profit</Text>
                <Text size="sm" fw={600} c={importResult.netProfit >= 0 ? 'green' : 'red'}>
                  {importResult.netProfit >= 0 ? '+' : ''}{importResult.netProfit.toFixed(1)}c
                </Text>
              </Stack>
              <Stack gap={0}><Text size="xs" c="dimmed">Divine at time</Text><Text size="sm" fw={600}>~{repriced.impliedDivPrice}c</Text></Stack>
            </Group>

            <Divider label="At Your Divine Price" labelPosition="left" />
            <Group gap="xs" align="flex-end">
              <NumberInput label="Current divine price" value={importDivPrice}
                onChange={(v) => setImportDivPrice(Number(v))} suffix="c" size="xs" w={140} />
              <Text size="xs" c="dimmed" mb={4}>Your panel: {settings.divinePrice}c</Text>
            </Group>
            <Group gap="lg" wrap="wrap">
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Net profit in divs now</Text>
                <Text size="lg" fw={800} c={repriced.netProfitDivNow >= 0 ? 'green' : 'red'}>
                  {repriced.netProfitDivNow >= 0 ? '+' : ''}{repriced.netProfitDivNow.toFixed(2)}d
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Div/map now</Text>
                <Text size="lg" fw={800} c={repriced.divPerMapNow >= 0 ? 'teal' : 'red'}>
                  {repriced.divPerMapNow.toFixed(3)}d
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">Originally</Text>
                <Text size="sm" c="dimmed">{importResult.divPerMap.toFixed(3)}d/map at {repriced.impliedDivPrice}c div</Text>
              </Stack>
            </Group>
            <Alert color="blue" variant="light" p="xs">
              <Text size="xs">Chaos values are fixed. Only div-denominated values scale with divine price.</Text>
            </Alert>

            {(importResult.runRegex || importResult.slamRegex) && (
              <>
                <Divider label="Their Regex" labelPosition="left" />
                {importResult.runRegex && (
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>🟢</Text>
                    <Text size="xs" c="teal" style={{ fontFamily: 'monospace', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{importResult.runRegex}</Text>
                    <CopyRegex value={importResult.runRegex} label="run" />
                  </Group>
                )}
                {importResult.slamRegex && (
                  <Group gap={4} wrap="nowrap">
                    <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>🟠</Text>
                    <Text size="xs" c="orange" style={{ fontFamily: 'monospace', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{importResult.slamRegex}</Text>
                    <CopyRegex value={importResult.slamRegex} label="slam" />
                  </Group>
                )}
              </>
            )}

            <Button variant="light" color="blue" size="xs"
              onClick={() => { onLoadBuild(importResult); handleClose(); }}>
              Load Build Settings
            </Button>
          </Stack>
        )}
      </Stack>
    </Modal>
  );
};
