import {
  Card, ScrollArea, Table, Text, ActionIcon, Group, Button, Switch,
  Tooltip, CopyButton, Stack, Collapse,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useSessionStore } from '../store/useSessionStore';
import { FaTrash, FaClipboard, FaUndo, FaDiscord } from 'react-icons/fa';
import { parseMapClipboard } from '../utils/mapParser';
import { generateRunRegex, generateSlamRegex, trimmedMean } from '../utils/priceUtils';
import { useMemo } from 'react';

export const SessionLogModule = () => {
  const {
    maps, removeMap, addMap, undoLastMap, clearMaps,
    isWatching, toggleWatch, settings, lootItems,
  } = useSessionStore();

  const [exportOpen, { toggle: toggleExport }] = useDisclosure(false);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseMapClipboard(text);
      if (parsed) addMap(parsed);
    } catch (err) { console.error('Clipboard error', err); }
  };

  const discordExport = useMemo(() => {
    const chiselCost = settings.chiselUsed ? settings.chiselPrice : 0;
    const scarabCost = settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
    let perMap = settings.baseMapCost + chiselCost + scarabCost;
    if (settings.isSplitSession) perMap = (settings.baseMapCost + chiselCost) / 2 + scarabCost;
    const n               = maps.length;
    const totalInvestment = perMap * n + settings.rollingCostPerMap;
    const totalReturn     = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
    const netProfit       = totalReturn - totalInvestment;
    const divPrice        = settings.divinePrice || 1;
    const divPerMap       = n > 0 ? (netProfit / divPrice) / n : 0;

    const scarabOfRiskCount = settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2;
    const baseModCount      = settings.mapType === '8-mod' ? 8 : 6;
    const effectiveMods     = baseModCount + scarabOfRiskCount;
    const mountBonus        = settings.mountingModifiers ? effectiveMods * 2 : 0;
    const multiplier        = 1 + (settings.fragmentsUsed * 3 + settings.smallNodesAllocated * 2 + mountBonus) / 100;

    const avgQuant   = trimmedMean(maps.map((m) => m.quantity));
    const avgPack    = trimmedMean(maps.map((m) => m.packSize));
    const avgCurr    = trimmedMean(maps.map((m) => m.moreCurrency));
    const avgRarity  = trimmedMean(maps.map((m) => m.rarity));
    const avgScarabs = trimmedMean(maps.map((m) => m.moreScarabs));

    const chiselLine  = settings.chiselUsed
      ? `Chisel: ${settings.chiselType} (${settings.chiselPrice}c)`
      : `Chisel: None`;

    const scarabList = settings.scarabs.filter((s) => s.name)
      .map((s) => `  - ${s.name} (${s.cost}c)`).join('\n');

    // Atlas tree URL — only include if user has a real tree loaded
    const atlasUrl   = settings.atlasTreeUrl?.includes('#') ? settings.atlasTreeUrl : null;

    let regexBlock = '';
    if (n > 0) {
      const avg = { avgQuant, avgPack, avgCurr, avgRarity, avgScarabs };
      const runR  = generateRunRegex(avg);
      const slamR = generateSlamRegex(avg);
      regexBlock = [
        '',
        `[Regex - ${n} maps, trimmed avg]`,
        `Avg: ${avgQuant.toFixed(0)}%Q  ${avgRarity.toFixed(0)}%R  ${avgPack.toFixed(0)}%P  ${avgCurr.toFixed(0)}% Curr`,
        `Note: brick exclusion is build-dependent — adjust !vola|eche|... to your needs`,
        `Run:  ${runR}`,
        `Slam: ${slamR}`,
      ].join('\n');
    }

    const body = [
      `[WraeclastLedger Session]`,
      `Maps: ${n}  Type: ${settings.mapType}  Multiplier: ${multiplier.toFixed(2)}x`,
      `Avg Quant: ${avgQuant.toFixed(0)}%  Avg Rarity: ${avgRarity.toFixed(0)}%  Avg Pack: ${avgPack.toFixed(0)}%  Avg Currency: ${avgCurr.toFixed(0)}%`,
      `Per Map Cost: ${perMap.toFixed(1)}c  Total Invest: ${totalInvestment.toFixed(1)}c`,
      `Total Return: ${totalReturn.toFixed(1)}c  Net Profit: ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(1)}c`,
      `Div / Map: ${divPerMap.toFixed(3)}d  Divine Price: ${divPrice}c`,
      chiselLine,
      ...(scarabList ? [`Scarabs:\n${scarabList}`] : []),
      ...(atlasUrl   ? [`Atlas Tree: ${atlasUrl}`] : []),
      ...(regexBlock ? [regexBlock] : []),
    ].join('\n');

    return '```\n' + body + '\n```';
  }, [maps, settings, lootItems]);

  const rows = maps.map((map, index) => (
    <Table.Tr key={map.id}>
      <Table.Td>{index + 1}</Table.Td>
      <Table.Td>{map.quantity}%</Table.Td>
      <Table.Td>{map.rarity > 0 ? `${map.rarity}%` : '-'}</Table.Td>
      <Table.Td>{map.packSize}%</Table.Td>
      <Table.Td>{(map.moreCurrency ?? 0) > 0 ? `${map.moreCurrency}%` : '-'}</Table.Td>
      <Table.Td>{(map.moreMaps ?? 0) > 0 ? `+${map.moreMaps}%` : '-'}</Table.Td>
      <Table.Td>{(map.moreScarabs ?? 0) > 0 ? `+${map.moreScarabs}%` : '-'}</Table.Td>
      <Table.Td>
        <ActionIcon color="red" variant="subtle" size="sm" onClick={() => removeMap(map.id)}>
          <FaTrash size={10} />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="xs">
        <Group gap="xs">
          <Text fw={700} size="sm">Map Log ({maps.length})</Text>
          <Tooltip label={isWatching ? 'Live: Ctrl+C in game' : 'Paused'}>
            <Switch checked={isWatching} onChange={toggleWatch}
              color="green" size="sm" label={isWatching ? 'Live' : 'Paused'} labelPosition="left" />
          </Tooltip>
        </Group>
        <Group gap={5}>
          <Tooltip label="Undo last map">
            <ActionIcon variant="default" size="sm" onClick={undoLastMap} disabled={maps.length === 0}>
              <FaUndo size={10} />
            </ActionIcon>
          </Tooltip>
          <Button size="xs" variant="default" leftSection={<FaClipboard size={10} />} onClick={handlePaste}>Paste</Button>
          <Button size="xs" color="red" variant="light" onClick={clearMaps}>Clear</Button>
        </Group>
      </Group>

      <Group gap={5} mb="xs">
        <Button size="xs" variant="subtle" onClick={toggleExport}>
          {exportOpen ? '▲' : '▼'} Discord Export
        </Button>
      </Group>
      <Collapse in={exportOpen}>
        <Stack gap="xs" mb="xs">
          <Text size="xs" c="dimmed">
            Paste into Discord as-is — the code block preserves all content for re-import.
            Navigate to your atlas tree in the Atlas Tree tab first to include it.
          </Text>
          <CopyButton value={discordExport}>
            {({ copied, copy }) => (
              <Button size="xs" leftSection={<FaDiscord size={12} />} onClick={copy}
                color={copied ? 'teal' : 'indigo'} variant="light">
                {copied ? 'Copied!' : 'Copy to Discord'}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Collapse>

      <ScrollArea style={{ flex: 1 }}>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Quant</Table.Th>
              <Table.Th>Rarity</Table.Th>
              <Table.Th>Pack</Table.Th>
              <Table.Th>Curr</Table.Th>
              <Table.Th>Maps</Table.Th>
              <Table.Th>Scarabs</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
};
