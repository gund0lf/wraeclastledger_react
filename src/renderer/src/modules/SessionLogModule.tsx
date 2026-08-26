import {
  Alert, Card, ScrollArea, Table, Text, ActionIcon, Group, Button, Switch,
  Tooltip, TextInput, Modal, Stack, Badge, Popover, Divider, ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { useEffect, useState, useMemo } from 'react';
import type { ClipboardBridgeStatus } from '../../../shared/protonClipboardBridge';
import { useSessionKeys } from '../store/useSessionStore';
import {
  IconTrash, IconClipboard, IconArrowBackUp, IconSearch, IconX,
  IconPlayerPlayFilled, IconPlayerPauseFilled, IconClock, IconInfoCircle,
  IconArrowRight,
} from '@tabler/icons-react';
import { parseMapClipboard } from '../utils/mapParser';
import { markPossibleDuplicates } from '../utils/mapDuplicates';
import { usePanelMaximized } from '../layout/panelLayoutContext';
import { formatDeliriumRewards, useDedicatedDeliriumColumn } from '../utils/deliriumMetadata';
import {
  computeTimeEstimate,
  formatActiveTime,
  MIN_ACTIVE_MS,
  MIN_TIMESTAMPED_MAPS,
} from '../utils/timeEstimate';
import type { MapData } from '../types';
import './SessionLogModule.css';

const DeliriumMetadata = ({ map }: { map: MapData }) => {
  const rewards = map.deliriumRewardTypes ?? [];
  const rewardSummary = formatDeliriumRewards(rewards);
  if (map.deliriousPct === undefined && rewardSummary === '') return null;

  const orderedRewards = rewards.join(' · ');
  const rewardText = (
    <Text component="span" size="xs" c="dimmed" truncate="end" style={{ minWidth: 0 }}>
      {rewardSummary}
    </Text>
  );

  return (
    <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
      {map.deliriousPct !== undefined && (
        <Badge size="xs" color="grape" variant="light" style={{ flexShrink: 0 }}>
          {map.deliriousPct}% deli
        </Badge>
      )}
      {rewardSummary && (
        <Tooltip multiline w={260} label={`Reward tracks in map order: ${orderedRewards}`}>
          {rewardText}
        </Tooltip>
      )}
    </Group>
  );
};

const MetricValue = ({ value }: { value: string | null }) => (
  <Text
    component="span"
    className={`session-log-metric${value === null ? ' is-empty' : ''}`}
  >
    {value ?? '-'}
  </Text>
);

const AutomaticPaceGuide = ({ maps }: { maps: MapData[] }) => {
  const pace = useMemo(() => computeTimeEstimate(maps), [maps]);
  const timestampedMaps = useMemo(
    () => maps.filter((map) => typeof map.parsedAt === 'number' && Number.isFinite(map.parsedAt)).length,
    [maps],
  );

  const status = pace
    ? {
        badge: 'Estimating',
        color: 'blue',
        detail: `${pace.mapsPerHour.toFixed(1)} maps/h · ${formatActiveTime(pace.activeMs)} active${
          pace.excludedGaps > 0
            ? ` · ${pace.excludedGaps} break${pace.excludedGaps === 1 ? '' : 's'} excluded`
            : ''
        }`,
      }
    : timestampedMaps === 0
      ? {
          badge: 'Ready',
          color: 'gray',
          detail: 'Copy a map before entering; the next capture completes its timer.',
        }
      : timestampedMaps < MIN_TIMESTAMPED_MAPS
        ? {
            badge: `${timestampedMaps}/${MIN_TIMESTAMPED_MAPS} captures`,
            color: 'yellow',
            detail: 'Timing started — keep capturing once before each map.',
          }
        : {
            badge: 'Sampling',
            color: 'yellow',
            detail: `Keep capturing until at least ${MIN_ACTIVE_MS / 60_000} minutes of usable activity are measured.`,
          };

  return (
    <Group className="session-log-pace-guide" justify="space-between" gap="sm" wrap="nowrap">
      <Group className="session-log-pace-summary" gap={7} wrap="nowrap">
        <ThemeIcon size={26} radius="sm" variant="light" color={pace ? 'blue' : 'gray'}>
          <IconClock size={15} />
        </ThemeIcon>
        <Stack gap={0} style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text size="xs" fw={700}>Automatic pace</Text>
            <Badge size="xs" variant="outline" color={status.color}>{status.badge}</Badge>
          </Group>
          <Text className="session-log-pace-detail" size="xs" c="dimmed" truncate="end">
            {status.detail}
          </Text>
        </Stack>
      </Group>

      <Popover width={360} position="bottom-end" shadow="md" withArrow>
        <Popover.Target>
          <UnstyledButton className="session-log-pace-help">
            <IconInfoCircle size={14} />
            <span>How timing works</span>
          </UnstyledButton>
        </Popover.Target>
        <Popover.Dropdown className="session-log-pace-popover">
          <Stack gap="xs">
            <div>
              <Text size="sm" fw={700}>One capture-to-capture cycle</Text>
              <Text size="xs" c="dimmed">
                The next capture closes the previous map&apos;s timer and starts the next one.
              </Text>
            </div>
            <Group className="session-log-pace-flow" gap={5} wrap="nowrap">
              <div className="session-log-pace-step"><b>1</b><span>Copy map</span></div>
              <IconArrowRight size={13} />
              <div className="session-log-pace-step"><b>2</b><span>Run, loot &amp; prepare</span></div>
              <IconArrowRight size={13} />
              <div className="session-log-pace-step"><b>3</b><span>Copy next</span></div>
            </Group>
            <Text size="xs">
              This measures the complete cycle: running the map, collecting loot, stashing it,
              and getting ready for the next map.
            </Text>
            <Divider />
            <Text size="xs" c="dimmed">
              Clearly abnormal gaps longer than 3× your session&apos;s median capture interval are
              excluded as breaks. Normal hideout time stays included. Pace needs at least five
              timed maps and ten minutes of usable activity.
            </Text>
            <Text size="xs" c="dimmed">
              Pre-imported batches cannot reconstruct elapsed time; use the optional manual timer
              in Run Statistics for those sessions.
            </Text>
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
};

export const SessionLogModule = () => {
  const isMaximized = usePanelMaximized('session-log');
  const { ref: panelRef, width: panelWidth } = useElementSize();
  const showDeliriumColumn = useDedicatedDeliriumColumn(panelWidth);
  const {
    maps, removeMap, addMap, undoLastMap, clearMaps,
    isWatching, toggleWatch, sessionLifecycle,
  } = useSessionKeys(
    'maps', 'removeMap', 'addMap', 'undoLastMap', 'clearMaps',
    'isWatching', 'toggleWatch', 'sessionLifecycle',
  );

  const [search, setSearch] = useState('');
  const [clearOpen, { open: openClear, close: closeClear }] = useDisclosure(false);
  const [clipboardBridgeStatus, setClipboardBridgeStatus] = useState<ClipboardBridgeStatus>({ state: 'idle' });

  useEffect(() => {
    void window.api.getClipboardBridgeStatus().then(setClipboardBridgeStatus);
    const removeListener = window.api.onClipboardBridgeStatus(setClipboardBridgeStatus);
    return removeListener;
  }, []);

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
    <Table.Tr key={map.id}>
      <Table.Td className="session-log-index">{index + 1}</Table.Td>
      <Table.Td className="session-log-name" style={{
        width: isMaximized ? '28%' : undefined,
        minWidth: isMaximized ? 240 : undefined,
        maxWidth: isMaximized ? undefined : 140,
        overflow: 'hidden',
      }}
        title={map.name || undefined}>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Group gap={4} wrap="nowrap" style={{ minWidth: 0 }}>
            {dupIds.has(map.id) && (
              <Tooltip multiline w={240} label="Exactly matches an earlier map in this session — possible accidental repeat. Delete it if so; a genuinely identical map can keep the marker.">
                <Badge size="xs" variant="light" color="yellow" style={{ flexShrink: 0, cursor: 'help' }}>dup?</Badge>
              </Tooltip>
            )}
            <Text component="span" inherit truncate="end" style={{ minWidth: 0 }}>
              {map.name || '-'}
            </Text>
          </Group>
          {!showDeliriumColumn && <DeliriumMetadata map={map} />}
        </Stack>
      </Table.Td>
      <Table.Td className="session-log-tier"><MetricValue value={map.tier ? `T${map.tier}` : null} /></Table.Td>
      {showDeliriumColumn && (
        <Table.Td className="session-log-delirium" style={{ minWidth: 230 }}>
          {map.deliriousPct !== undefined || (map.deliriumRewardTypes?.length ?? 0) > 0
            ? <DeliriumMetadata map={map} />
            : <MetricValue value={null} />}
        </Table.Td>
      )}
      <Table.Td className="session-log-number"><MetricValue value={map.explicitModCount?.toString() ?? null} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={`${map.quantity}%`} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={map.rarity > 0 ? `${map.rarity}%` : null} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={`${map.packSize}%`} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={(map.moreCurrency ?? 0) > 0 ? `${map.moreCurrency}%` : null} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={(map.moreMaps ?? 0) > 0 ? `+${map.moreMaps}%` : null} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={(map.moreScarabs ?? 0) > 0 ? `+${map.moreScarabs}%` : null} /></Table.Td>
      <Table.Td className="session-log-number"><MetricValue value={(map.moreDivCards ?? 0) > 0 ? `+${map.moreDivCards}%` : null} /></Table.Td>
      <Table.Td className="session-log-row-action">
        <ActionIcon className="session-log-delete" size="md" variant="default" aria-label="Remove map"
          onClick={() => removeMap(map.id)}>
          <IconTrash size={15} />
        </ActionIcon>
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Card ref={panelRef} className="session-log-card session-log-refined" shadow="sm" padding="sm" radius="md" withBorder h="100%"
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
      <Group className="session-log-toolbar" justify="space-between" gap="sm" wrap="nowrap">
        <Group className="session-log-primary-controls" gap="xs" wrap="nowrap">
          <div className="session-log-capture-control" data-active={isWatching || undefined}>
            <Tooltip multiline w={260} label={sessionLifecycle === 'historical'
              ? 'Capture is paused while viewing a historical session. Resume its live context or start a new session first.'
              : isWatching
                ? 'Capturing — copy a map with Ctrl+C; 3.29 records exact modifier counts automatically.'
                : 'Paused — turn on Capture, then copy a map with Ctrl+C.'}>
              <Switch checked={isWatching} onChange={toggleWatch}
                disabled={sessionLifecycle === 'historical'}
                color="green" size="sm" labelPosition="left"
                label={isWatching ? 'Capture: Active' : 'Capture: Paused'}
                thumbIcon={isWatching
                  ? <IconPlayerPlayFilled size={10} />
                  : <IconPlayerPauseFilled size={10} />} />
            </Tooltip>
          </div>
          <Badge className="session-log-map-count" color="gray" variant="outline" size="sm">
            {maps.length} map{maps.length !== 1 ? 's' : ''}
            {search.trim() && filtered.length !== maps.length ? ` · ${filtered.length} shown` : ''}
          </Badge>
          {clipboardBridgeStatus.state === 'connecting' && (
            <Badge size="xs" color="yellow" variant="light">Proton connecting</Badge>
          )}
          {clipboardBridgeStatus.state === 'ready' && (
            <Badge size="xs" color="green" variant="light">Proton capture</Badge>
          )}
        </Group>

        <Group className="session-log-actions" gap={5} wrap="nowrap">
          <TextInput
            className="session-log-search"
            size="xs" placeholder="Filter maps…" value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={11} />}
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
          <Button className="session-log-clear" size="xs" variant="default" leftSection={<IconTrash size={12} />}
            disabled={maps.length === 0}
            onClick={openClear}>Clear</Button>
        </Group>
      </Group>

      {clipboardBridgeStatus.state === 'error' && (
        <Alert color="red" mb="xs" py="xs">
          {clipboardBridgeStatus.message}
        </Alert>
      )}

      <AutomaticPaceGuide maps={maps} />

      <div className="session-log-table-shell">
        <ScrollArea className="session-log-table-scroll" style={{ flex: 1 }}>
        <Table
          className={`session-log-table${showDeliriumColumn ? ' has-delirium-column' : ''}`}
          stickyHeader
          highlightOnHover
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th className="session-log-index">#</Table.Th>
              <Table.Th className="session-log-name" style={isMaximized ? { width: '28%', minWidth: 240 } : undefined}>Name</Table.Th>
              <Table.Th className="session-log-tier">Tier</Table.Th>
              {showDeliriumColumn && <Table.Th className="session-log-delirium">Delirium</Table.Th>}
              <Table.Th className="session-log-number">
                <Tooltip label="Exact explicit modifiers from advanced copies; dash means a legacy headerless copy">
                  <span style={{ cursor: 'help' }}>Mods</span>
                </Tooltip>
              </Table.Th>
              <Table.Th className="session-log-number">Quant</Table.Th>
              <Table.Th className="session-log-number">Rarity</Table.Th>
              <Table.Th className="session-log-number">Pack</Table.Th>
              <Table.Th className="session-log-number">Curr</Table.Th>
              <Table.Th className="session-log-number">Maps</Table.Th>
              <Table.Th className="session-log-number">Scarabs</Table.Th>
              <Table.Th className="session-log-number">Div</Table.Th>
              <Table.Th className="session-log-row-action"></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>{rows}</Table.Tbody>
        </Table>
        </ScrollArea>

        {rows.length === 0 && (
          <div className="session-log-empty-layer">
            {maps.length === 0 ? (
              <Stack className="session-log-empty" gap={5} align="center">
                <ThemeIcon size={36} radius="xl" variant="light" color="gray">
                  <IconClipboard size={19} />
                </ThemeIcon>
                <Text size="sm" fw={700}>Ready to capture your first map</Text>
                <Text size="xs" c="dimmed" ta="center">
                  Turn on Capture, then press Ctrl+C on a map before you enter.
                </Text>
                <Text size="xs" c="dimmed" ta="center">
                  Your next capture logs the completed map&apos;s full run-to-ready interval.
                </Text>
                <Badge size="xs" variant="outline" color="gray">
                  Ctrl+C records exact modifiers · Ctrl+Alt+C remains supported
                </Badge>
              </Stack>
            ) : (
              <Stack className="session-log-empty" gap={4} align="center">
                <IconSearch size={20} />
                <Text size="sm" fw={600}>No maps match &ldquo;{search.trim()}&rdquo;</Text>
                <Button size="compact-xs" variant="subtle" onClick={() => setSearch('')}>Clear filter</Button>
              </Stack>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
