import {
  Card, Text, Button, Group, Stack, Select, TextInput, ActionIcon,
  Badge, Modal, Divider, Textarea, Alert, NumberInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { FaTrash, FaPen, FaSave, FaPlus, FaDiscord } from 'react-icons/fa';

// ─── Discord export parser ─────────────────────────────────────────────────────
// Handles both formats:
//   New: plain text inside ``` fences (no markdown rendering by Discord)
//   Old: **bold** markdown (rendered away by Discord — best-effort parse)
interface DiscordImport {
  mapCount: number; mapType: string; multiplier: number;
  avgQuant: number; avgRarity: number; avgPack: number; avgCurr: number;
  perMapCost: number; totalInvest: number; totalReturn: number;
  netProfit: number; divPerMap: number; divPrice: number;
  chisel: string; runRegex: string; slamRegex: string; scarabs: string[];
}

function parseDiscordExport(raw: string): DiscordImport | null {
  try {
    // Strip code fences if present
    const text = raw.replace(/^```\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    // Must contain a WraeclastLedger marker
    const isNew = text.includes('[WraeclastLedger Session]');
    const isOld = text.includes('WraeclastLedger');
    if (!isNew && !isOld) return null;

    // Flexible number extractor: handles both "Maps: 26" and "Maps:** 26"
    const num = (patterns: RegExp[]): number => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return parseFloat(m[1].replace(/,/g, ''));
      }
      return 0;
    };
    const str = (patterns: RegExp[]): string => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return m[1].trim();
      }
      return '';
    };

    const mapCount   = num([/Maps:\s*(\d+)/, /Maps:\*\*\s*(\d+)/]);
    const multiplier = num([/Multiplier:\s*([\d.]+)x/, /Multiplier:\*\*\s*([\d.]+)[x×]/]);
    const avgQuant   = num([/Avg Quant:\s*(\d+)%/, /Avg Quant:\*\*\s*(\d+)%/]);
    const avgRarity  = num([/Avg Rarity:\s*(\d+)%/, /Avg Rarity:\*\*\s*(\d+)%/]);
    const avgPack    = num([/Avg Pack:\s*(\d+)%/, /Avg Pack:\*\*\s*(\d+)%/]);
    const avgCurr    = num([/Avg Currency:\s*(\d+)%/, /Avg Currency:\*\*\s*(\d+)%/]);
    const perMapCost = num([/Per Map Cost:\s*([\d.]+)c/, /Per Map Cost:\*\*\s*([\d.]+)c/]);
    const totalInvest = num([/Total Invest:\s*([\d.]+)c/, /Total Invest:\*\*\s*([\d.]+)c/]);
    const totalReturn = num([/Total Return:\s*([\d.]+)c/, /Total Return:\*\*\s*([\d.]+)c/]);
    const divPerMap  = num([/Div \/ Map:\s*([\d.]+)d/, /Div \/ Map:\*\*\s*([\d.]+)d/]);
    const divPrice   = num([/Divine Price:\s*([\d.]+)c/]); // only in new format

    const profitMatch = text.match(/Net Profit:\s*([+-]?[\d.]+)c/) ||
                        text.match(/Net Profit:\*\*\s*([+-]?[\d.]+)c/);
    const netProfit = profitMatch ? parseFloat(profitMatch[1]) : 0;

    const mapType = str([/Type:\s*([68]-mod)/, /Type:\*\*\s*([68]-mod)/]);
    const chisel  = str([/Chisel:\s*([^\n(]+)/, /Chisel:\*\*\s*([^\n(]+)/]);

    // Regex extraction — works for both formats since Run/Slam labels are on their own lines
    const runMatch  = text.match(/Run:\s+(.+)/);
    const slamMatch = text.match(/Slam:\s+(.+?)(?:\s*\(open|$)/m);
    const runRegex  = runMatch?.[1]?.trim().replace(/^`|`$/g, '') ?? '';
    const slamRegex = slamMatch?.[1]?.trim().replace(/^`|`$/g, '') ?? '';

    // Scarabs — "  - Name (cost)" format
    const scarabs: string[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*-\s+(.+?)\s+\(/);
      if (m) scarabs.push(m[1].trim());
    }

    if (mapCount === 0) return null;
    return { mapCount, mapType, multiplier, avgQuant, avgRarity, avgPack, avgCurr, perMapCost, totalInvest, totalReturn, netProfit, divPerMap, divPrice, chisel, runRegex, slamRegex, scarabs };
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export const SessionManagerModule = () => {
  const {
    maps, lootItems, savedSessions, activeSessionId, activeSessionName,
    saveAsNewSession, updateCurrentSession, loadSession, deleteSession, renameSession, newSession,
    settings,
  } = useSessionStore();

  const [saveOpen,   { open: openSave,   close: closeSave   }] = useDisclosure(false);
  const [renameOpen, { open: openRename, close: closeRename }] = useDisclosure(false);
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);
  const [nameInput,   setNameInput]   = useState('');
  const [importText,  setImportText]  = useState('');
  const [importResult, setImportResult] = useState<DiscordImport | null>(null);
  const [parseError,  setParseError]  = useState(false);
  const [currentDivPrice, setCurrentDivPrice] = useState(settings.divinePrice || 300);

  const sessionEntries = Object.values(savedSessions).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleSessionSelect = (val: string | null) => {
    if (!val || val === '__new__') newSession();
    else loadSession(val);
  };

  // Auto-parse as user types / pastes
  const handleImportTextChange = (text: string) => {
    setImportText(text);
    if (text.trim().length > 50) {
      const r = parseDiscordExport(text);
      setImportResult(r);
      setParseError(!r && text.trim().length > 100);
    } else {
      setImportResult(null);
      setParseError(false);
    }
  };

  const repriced = importResult ? (() => {
    const orig = importResult.divPrice > 0 ? importResult.divPrice
      : importResult.divPerMap > 0 && importResult.mapCount > 0
        ? Math.round(Math.abs(importResult.netProfit) / (importResult.divPerMap * importResult.mapCount))
        : currentDivPrice;
    const curr = currentDivPrice || 1;
    return {
      netProfitDivNow: importResult.netProfit / curr,
      divPerMapNow:    importResult.divPerMap * (orig / curr),
      impliedDivPrice: orig,
    };
  })() : null;

  const isUnsaved = !activeSessionId;
  const hasData   = maps.length > 0 || lootItems.length > 0;

  return (
    <>
      <Modal opened={saveOpen} onClose={closeSave} title="Save Session" size="sm">
        <Stack gap="sm">
          <TextInput label="Session Name" placeholder="e.g. T16 Deli — 72 maps"
            value={nameInput} onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && (saveAsNewSession(nameInput.trim()), setNameInput(''), closeSave())}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSave}>Cancel</Button>
            <Button onClick={() => { saveAsNewSession(nameInput.trim()); setNameInput(''); closeSave(); }}
              disabled={!nameInput.trim()}>Save</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={renameOpen} onClose={closeRename} title="Rename Session" size="sm">
        <Stack gap="sm">
          <TextInput label="New Name" value={nameInput}
            onChange={(e) => setNameInput(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && nameInput.trim() && activeSessionId && (renameSession(activeSessionId, nameInput.trim()), setNameInput(''), closeRename())}
            autoFocus />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeRename}>Cancel</Button>
            <Button onClick={() => { if (activeSessionId) renameSession(activeSessionId, nameInput.trim()); setNameInput(''); closeRename(); }}
              disabled={!nameInput.trim()}>Rename</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={importOpen} onClose={() => { closeImport(); setImportText(''); setImportResult(null); setParseError(false); }}
        title="Import Discord Export" size="lg" scrollAreaComponent="div">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Paste a WraeclastLedger Discord export. Parses automatically.
            Use to compare a shared strategy at current divine prices.
          </Text>

          <Textarea placeholder="Paste export here — auto-parses as you type..."
            value={importText}
            onChange={(e) => handleImportTextChange(e.currentTarget.value)}
            autosize minRows={4} maxRows={8}
            styles={{ input: { fontFamily: 'monospace', fontSize: 11 } }}
          />

          {parseError && (
            <Alert color="red" variant="light" p="xs">
              <Text size="xs">Could not parse — make sure it is a WraeclastLedger export (code block or old markdown format).</Text>
            </Alert>
          )}

          {importResult && repriced && (
            <Stack gap="xs">
              <Divider label="Parsed" labelPosition="left" />
              <Group gap="xs" wrap="wrap">
                <Badge variant="light">{importResult.mapCount} maps</Badge>
                {importResult.mapType && <Badge variant="light" color="blue">{importResult.mapType}</Badge>}
                <Badge variant="light" color="blue">{importResult.multiplier.toFixed(2)}×</Badge>
                {importResult.chisel && <Badge variant="light" color="yellow">🪨 {importResult.chisel.trim()}</Badge>}
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
              <Group gap="lg" wrap="wrap">
                <Stack gap={0}><Text size="xs" c="dimmed">Per map cost</Text><Text size="sm" fw={600}>{importResult.perMapCost.toFixed(1)}c</Text></Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Total invest</Text><Text size="sm" fw={600}>{importResult.totalInvest.toFixed(1)}c</Text></Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Net profit</Text><Text size="sm" fw={600} c={importResult.netProfit >= 0 ? 'green' : 'red'}>{importResult.netProfit >= 0 ? '+' : ''}{importResult.netProfit.toFixed(1)}c</Text></Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Divine at time</Text><Text size="sm" fw={600}>~{repriced.impliedDivPrice}c</Text></Stack>
              </Group>

              <Divider label="At Current Divine Price" labelPosition="left" />
              <Group gap="xs" align="flex-end">
                <NumberInput label="Current divine price" value={currentDivPrice}
                  onChange={(v) => setCurrentDivPrice(Number(v))} suffix="c" size="xs" w={140} />
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
                  <Text size="sm" c="dimmed">{importResult.divPerMap.toFixed(3)}d/map</Text>
                </Stack>
              </Group>
              <Alert color="blue" variant="light" p="xs">
                <Text size="xs">Chaos profits are fixed. Divine price only affects div-denominated values.</Text>
              </Alert>
              {importResult.runRegex && (
                <>
                  <Divider label="Their Regex" labelPosition="left" />
                  <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all' }}>Run: {importResult.runRegex}</Text>
                  {importResult.slamRegex && <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all' }}>Slam: {importResult.slamRegex}</Text>}
                </>
              )}
            </Stack>
          )}
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%">
        <Stack gap={6}>
          <Select
            label="Load Session"
            data={[
              { value: '__new__', label: '— New Session —' },
              ...sessionEntries.map((s) => ({
                value: s.id,
                label: `${s.name} (${s.maps.length} maps, ${new Date(s.createdAt).toLocaleDateString()})`,
              })),
            ]}
            value={activeSessionId ?? '__new__'}
            onChange={handleSessionSelect}
            searchable size="sm"
          />
          <Group gap={4} grow>
            <Button size="xs" leftSection={<FaSave size={10} />} variant="light" color="blue"
              onClick={() => { setNameInput(''); openSave(); }} disabled={!hasData}>
              Save as New
            </Button>
            {!isUnsaved && (
              <Button size="xs" leftSection={<FaSave size={10} />} variant="light" color="teal"
                onClick={updateCurrentSession}>Update</Button>
            )}
          </Group>
          {!isUnsaved && (
            <Group gap={4} grow>
              <Button size="xs" leftSection={<FaPen size={10} />} variant="subtle"
                onClick={() => { setNameInput(activeSessionName ?? ''); openRename(); }}>Rename</Button>
              <Button size="xs" leftSection={<FaTrash size={10} />} variant="subtle" color="red"
                onClick={() => activeSessionId && deleteSession(activeSessionId)}>Delete</Button>
              <Button size="xs" leftSection={<FaPlus size={10} />} variant="subtle" color="gray"
                onClick={newSession}>New</Button>
            </Group>
          )}
          <Divider />
          <Button size="xs" variant="subtle" color="indigo"
            leftSection={<FaDiscord size={12} />}
            onClick={() => { setImportText(''); setImportResult(null); setParseError(false); openImport(); }}>
            Import Discord Export
          </Button>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Status</Text>
            {isUnsaved
              ? <Badge color="orange" variant="dot" size="sm">Unsaved</Badge>
              : <Badge color="green"  variant="dot" size="sm">{activeSessionName}</Badge>
            }
          </Group>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Maps / Saved</Text>
            <Text size="xs">{maps.length} / {sessionEntries.length}</Text>
          </Group>
          {sessionEntries.length > 0 && (
            <>
              <Divider label="History" labelPosition="left" />
              <Stack gap={3} style={{ maxHeight: 180, overflow: 'auto' }}>
                {sessionEntries.map((s) => (
                  <Group key={s.id} justify="space-between" wrap="nowrap">
                    <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
                      <Text size="xs" fw={600} lineClamp={1}>{s.name}</Text>
                      <Text size="xs" c="dimmed">{s.maps.length} maps · {new Date(s.createdAt).toLocaleDateString()}</Text>
                    </Stack>
                    <Group gap={4} wrap="nowrap">
                      <Button size="xs" variant="subtle" onClick={() => loadSession(s.id)}>Load</Button>
                      <ActionIcon size="xs" color="red" variant="subtle" onClick={() => deleteSession(s.id)}>
                        <FaTrash size={8} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </Card>
    </>
  );
};
