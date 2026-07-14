import {
  Card, ScrollArea, Table, Text, ActionIcon, Group, Button, Switch,
  Tooltip, TextInput, Modal, Stack, Badge,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { IconTrash, IconClipboard, IconArrowBackUp, IconSearch, IconX, IconPlayerPlayFilled, IconPlayerPauseFilled } from '@tabler/icons-react';
import { ModuleHeader } from '../components/ui/ModuleHeader';
import { parseMapClipboard } from '../utils/mapParser';
import { markPossibleDuplicates } from '../utils/mapDuplicates';

export const SessionLogModule = () => {
  const {
    maps, removeMap, addMap, undoLastMap, clearMaps,
    isWatching, toggleWatch,
  } = useSessionKeys('maps', 'removeMap', 'addMap', 'undoLastMap', 'clearMaps', 'isWatching', 'toggleWatch');

  const [search, setSearch] = useState('');
  const [clearOpen, { open: openClear, close: closeClear }] = useDisclosure(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null); // row hover for delete reveal (Sessions pattern)
  const [hoveredTrashId, setHoveredTrashId] = useState<string | null>(null); // delete icon red hover
  const [hoveredClear, setHoveredClear] = useState(false); // Clear button red hover

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseMapClipboard(text);
      if (parsed) addMap(parsed);
    } catch (err) { console.error('Clipboard error', err); }
  };

  const filtered = search.trim()
    ? maps.filter((m) => m.name?.toLowerCase().includes(search.trim().toLowerCase()))
    : maps;

  // Later rows parse-identical to any earlier row (accidental double-paste
  // candidates) get a subtle marker. Computed over the FULL log, not the
  // filtered view.
  const dupIds = useMemo(() => markPossibleDuplicates(maps), [maps]);

  const rows = filtered.map((map, index) => (
    <Table.Tr key={map.id}
      onMouseEnter={() => setHoveredRowId(map.id)}
      onMouseLeave={() => setHoveredRowId(null)}>
      <Table.Td>{index + 1}</Table.Td>
      <Table.Td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={map.name || undefined}>
        {dupIds.has(map.id) && (
          <Tooltip multiline w={240} label="Exactly matches an earlier map in this session — possible accidental repeat. Delete it if so; a genuinely identical map can keep the marker.">
            <Badge size="xs" variant="light" color="yellow" mr={4} style={{ verticalAlign: 'middle', cursor: 'help' }}>dup?</Badge>
          </Tooltip>
        )}
        {map.name || '-'}
      </Table.Td>
      <Table.Td>{map.tier ? `T${map.tier}` : '-'}</Table.Td>
      <Table.Td>{map.explicitModCount ?? '-'}</Table.Td>
      <Table.Td>{map.quantity}%</Table.Td>
      <Table.Td>{map.rarity > 0 ? `${map.rarity}%` : '-'}</Table.Td>
      <Table.Td>{map.packSize}%</Table.Td>
      <Table.Td>{(map.moreCurrency ?? 0) > 0 ? `${map.moreCurrency}%` : '-'}</Table.Td>
      <Table.Td>{(map.moreMaps ?? 0) > 0 ? `+${map.moreMaps}%` : '-'}</Table.Td>
      <Table.Td>{(map.moreScarabs ?? 0) > 0 ? `+${map.moreScarabs}%` : '-'}</Table.Td>
      <Table.Td>{(map.moreDivCards ?? 0) > 0 ? `+${map.moreDivCards}%` : '-'}</Table.Td>
      <Table.Td>
        <ActionIcon size="md" variant="default" aria-label="Remove map"
          onMouseEnter={() => setHoveredTrashId(map.id)}
          onMouseLeave={() => setHoveredTrashId(null)}
          onFocus={() => { setHoveredRowId(map.id); setHoveredTrashId(map.id); }}
          onBlur={() => { setHoveredRowId(null); setHoveredTrashId(null); }}
          style={{
            opacity: hoveredRowId === map.id ? 1 : 0,
            transition: 'opacity 120ms ease',
            color: hoveredTrashId === map.id ? 'var(--mantine-color-red-4)' : undefined,
            borderColor: hoveredTrashId === map.id ? 'var(--mantine-color-red-7)' : undefined,
          }}
          onClick={() => { setHoveredTrashId(null); removeMap(map.id); }}>
          <IconTrash size={15} />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Clear-all confirmation (session-15 decision; WP5 modal pattern) */}
      <Modal opened={clearOpen} onClose={closeClear} title="Clear Map Log" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Remove <Text span fw={700}>all {maps.length} logged map{maps.length !== 1 ? 's' : ''}</Text> from
            this session? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeClear}>Cancel</Button>
            <Button color="red" onClick={() => { clearMaps(); closeClear(); }}>Clear all</Button>
          </Group>
        </Stack>
      </Modal>
      <ModuleHeader
        mb="xs"
        title={
          /* session-16: "Map Log" title dropped (redundant with the tab label);
             the capture switch leads, the count keeps its place. */
          <Group gap="xs">
            <Tooltip multiline w={260} label={isWatching
              ? 'Capturing — Ctrl+Alt+C is preferred for an exact modifier count; Ctrl+C also works.'
              : 'Paused — turn on Capture, then copy a map. Ctrl+Alt+C is preferred for exact modifiers.'}>
              <Switch checked={isWatching} onChange={toggleWatch}
                color="green" size="sm" labelPosition="left"
                label={isWatching ? 'Capture: Active' : 'Capture: Paused'}
                thumbIcon={isWatching
                  ? <IconPlayerPlayFilled size={10} />
                  : <IconPlayerPauseFilled size={10} />} />
            </Tooltip>
            <Text fw={700} size="sm">{maps.length} map{maps.length !== 1 ? 's' : ''}{search.trim() && filtered.length !== maps.length ? ` · ${filtered.length} shown` : ''}</Text>
            <Tooltip label="Preferred capture: Ctrl+Alt+C records the exact explicit-mod count. Normal Ctrl+C remains supported.">
              <Badge size="xs" color="blue" variant="light" style={{ cursor: 'help' }}>Ctrl+Alt+C: exact</Badge>
            </Tooltip>
          </Group>
        }
        right={
          <Group gap={5}>
            <TextInput
              size="xs" placeholder="Filter maps…" value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              leftSection={<IconSearch size={11} />}
              style={{ width: 120 }}
              rightSection={search ? (
                <ActionIcon size="xs" variant="transparent" c="dimmed" onClick={() => setSearch('')}>
                  <IconX size={10} />
                </ActionIcon>
              ) : null}
            />
            <Tooltip label="Undo last map">
              <ActionIcon variant="default" size="md" onClick={undoLastMap} disabled={maps.length === 0}
                aria-label="Undo last map">
                <IconArrowBackUp size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Manually parse the clipboard — use when running the same map twice in a row (identical copies don't re-trigger capture)">
              <Button size="xs" variant="default" leftSection={<IconClipboard size={12} />} onClick={handlePaste}>Paste</Button>
            </Tooltip>
            <Button size="xs" variant="default" leftSection={<IconTrash size={12} />}
              onMouseEnter={() => setHoveredClear(true)}
              onMouseLeave={() => setHoveredClear(false)}
              style={hoveredClear ? { borderColor: 'var(--mantine-color-red-7)', color: 'var(--mantine-color-red-4)' } : undefined}
              disabled={maps.length === 0}
              onClick={() => { setHoveredClear(false); openClear(); }}>Clear</Button>
          </Group>
        }
      />

      <ScrollArea style={{ flex: 1 }}>
        <Table stickyHeader striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>#</Table.Th>
              <Table.Th>Name</Table.Th>
              <Table.Th>Tier</Table.Th>
              <Table.Th>
                <Tooltip label="Exact explicit modifiers from Ctrl+Alt+C; dash means a normal Ctrl+C copy">
                  <span style={{ cursor: 'help' }}>Mods</span>
                </Tooltip>
              </Table.Th>
              <Table.Th>Quant</Table.Th>
              <Table.Th>Rarity</Table.Th>
              <Table.Th>Pack</Table.Th>
              <Table.Th>Curr</Table.Th>
              <Table.Th>Maps</Table.Th>
              <Table.Th>Scarabs</Table.Th>
              <Table.Th>Div</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.length > 0 ? rows : (
              <Table.Tr>
                <Table.Td colSpan={12}>
                  {maps.length === 0 ? (
                    <Stack gap={3} align="center" py="md">
                      <Text size="xs" c="dimmed" ta="center">
                        No maps logged yet — turn on Capture above, then press Ctrl+C on a map in-game to log it here.
                      </Text>
                      <Text size="xs" c="dimmed" ta="center">
                        For Pace estimates, copy each map before running it; copy the next after finishing. Pasting an old batch cannot reconstruct playtime.
                      </Text>
                      <Text size="xs" c="dimmed" ta="center">
                        Optional: Ctrl+Alt+C also logs the map and records its exact explicit-mod count from the advanced tooltip.
                      </Text>
                    </Stack>
                  ) : (
                    <Text size="xs" c="dimmed" ta="center" py="md">No maps match &ldquo;{search.trim()}&rdquo;.</Text>
                  )}
                </Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Card>
  );
};
