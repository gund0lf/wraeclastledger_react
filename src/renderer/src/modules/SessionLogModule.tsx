import {
  Card, ScrollArea, Table, Text, ActionIcon, Group, Button, Switch,
  Tooltip,
} from '@mantine/core';
import { useSessionStore } from '../store/useSessionStore';
import { FaTrash, FaClipboard, FaUndo } from 'react-icons/fa';
import { parseMapClipboard } from '../utils/mapParser';

export const SessionLogModule = () => {
  const {
    maps, removeMap, addMap, undoLastMap, clearMaps,
    isWatching, toggleWatch,
  } = useSessionStore();

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseMapClipboard(text);
      if (parsed) addMap(parsed);
    } catch (err) { console.error('Clipboard error', err); }
  };

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
          <Tooltip label="Manually parse current clipboard (use for duplicate maps — live watcher skips identical content)">
            <Button size="xs" variant="default" leftSection={<FaClipboard size={10} />} onClick={handlePaste}>Paste</Button>
          </Tooltip>
          <Button size="xs" color="red" variant="light" onClick={clearMaps}>Clear</Button>
        </Group>
      </Group>

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
