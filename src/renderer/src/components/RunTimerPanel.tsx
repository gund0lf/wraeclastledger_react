import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  SegmentedControl,
  Slider,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAdjustments, IconClock, IconPlayerPause, IconPlayerPlay, IconSquare, IconTrash } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { computeTimeEstimate, formatActiveTime } from '../utils/timeEstimate';
import { formatStopwatch, manualRunTimerElapsed } from '../utils/manualRunTimer';
import { OVERLAY_COUNTER_OPTIONS, overlayCounterSnapshot } from '../utils/overlayCounters';
import { FONT } from '../utils/uiTokens';

export function RunTimerPanel() {
  const {
    maps,
    manualStatistics,
    manualRunTimer,
    manualTimerRecoveryMs,
    sessionLifecycle,
    overlayPreferences,
    overlayShortcutStatus,
    startManualTimer,
    pauseManualTimer,
    finishManualTimer,
    resetManualTimer,
    setManualTimerElapsed,
    resolveManualTimerRecovery,
    setOverlayPreferences,
  } = useSessionKeys(
    'maps',
    'manualStatistics',
    'manualRunTimer',
    'manualTimerRecoveryMs',
    'sessionLifecycle',
    'overlayPreferences',
    'overlayShortcutStatus',
    'startManualTimer',
    'pauseManualTimer',
    'finishManualTimer',
    'resetManualTimer',
    'setManualTimerElapsed',
    'resolveManualTimerRecovery',
    'setOverlayPreferences',
  );
  const [, setTick] = useState(0);
  const [settingsOpen, settingsDisclosure] = useDisclosure(false);
  const [resetOpen, resetDisclosure] = useDisclosure(false);
  const [adjustOpen, adjustDisclosure] = useDisclosure(false);
  const [adjustMinutes, setAdjustMinutes] = useState<number | string>(0);
  const clipboardTime = useMemo(() => computeTimeEstimate(maps), [maps]);
  const running = manualRunTimer.runningSince !== null;

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(timer);
  }, [running]);

  const elapsedMs = manualRunTimerElapsed(manualRunTimer);
  const live = sessionLifecycle === 'live';
  const selectedCounters = overlayPreferences.counterIds
    .map((id) => overlayCounterSnapshot(id, manualStatistics))
    .filter((entry) => entry !== null);
  const timerShortcut = overlayShortcutStatus?.timer;

  return (
    <>
      <Paper className="run-timer-panel" withBorder p="sm">
        <div className="run-timer-layout">
          <Group className="run-timer-heading" gap="xs" wrap="nowrap">
            <IconClock size={18} />
            <div>
              <Group gap={6}>
                <Text size="sm" fw={700}>Manual timer</Text>
                {manualRunTimer.finishedAt !== null && <Badge size="xs" color="teal">Finished</Badge>}
                {running && <Badge size="xs" color="blue">Running</Badge>}
              </Group>
              <Text size="xs" c="dimmed">
                For pre-imported runs; automatic clipboard Pace remains the default.
              </Text>
            </div>
          </Group>

          <Text
            className="run-timer-value"
            fw={800}
            ta="center"
            style={{ fontSize: FONT.xl, fontVariantNumeric: 'tabular-nums', letterSpacing: 1 }}
          >
            {formatStopwatch(elapsedMs)}
          </Text>

          <Group className="run-timer-controls" justify="center" gap={5}>
            <Button
              size="xs"
              disabled={!live}
              leftSection={running ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
              onClick={running ? pauseManualTimer : startManualTimer}
            >
              {running ? 'Pause' : elapsedMs > 0 ? 'Resume' : 'Start'}
            </Button>
            <Button
              size="xs"
              variant="default"
              disabled={!live || elapsedMs <= 0}
              leftSection={<IconSquare size={12} />}
              onClick={finishManualTimer}
            >
              Finish
            </Button>
            <Button
              size="xs"
              variant="subtle"
              disabled={running}
              onClick={() => {
                setAdjustMinutes(Math.round(elapsedMs / 60_000));
                adjustDisclosure.open();
              }}
            >
              Adjust
            </Button>
            <Button
              className="run-statistics-destructive"
              size="xs"
              variant="subtle"
              disabled={running || elapsedMs <= 0}
              leftSection={<IconTrash size={13} />}
              onClick={resetDisclosure.open}
            >
              Reset
            </Button>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconAdjustments size={13} />}
              onClick={settingsDisclosure.open}
            >
              Overlay
            </Button>
          </Group>

          <Group className="run-timer-meta" justify="space-between" gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Clipboard estimate: {clipboardTime ? formatActiveTime(clipboardTime.activeMs) : 'not available'}
            </Text>
            <Text size="xs" c="dimmed">Manual: {formatStopwatch(elapsedMs)}</Text>
          </Group>
          {!live && (
            <Text className="run-timer-history-note" size="xs" c="dimmed">
              Historical sessions retain and allow adjustment of recorded time, but active tracking can only run on the live session.
            </Text>
          )}
        </div>
      </Paper>

      {manualTimerRecoveryMs !== null && (
        <Alert color="yellow" title="Manual timer recovered in a paused state">
          <Stack gap="xs">
            <Text size="xs">
              Time through the last saved heartbeat was retained. Another {formatStopwatch(manualTimerRecoveryMs)} elapsed before recovery and may include app downtime.
            </Text>
            <Group gap="xs">
              <Button size="compact-xs" onClick={() => resolveManualTimerRecovery(true)}>Include gap</Button>
              <Button size="compact-xs" variant="default" onClick={() => resolveManualTimerRecovery(false)}>Keep safe time</Button>
            </Group>
          </Stack>
        </Alert>
      )}

      <Modal opened={adjustOpen} onClose={adjustDisclosure.close} title="Adjust manual timer" size="sm">
        <Stack>
          <NumberInput
            label="Recorded active minutes"
            min={0}
            step={1}
            allowDecimal={false}
            allowNegative={false}
            value={adjustMinutes}
            onChange={setAdjustMinutes}
          />
          <Text size="xs" c="dimmed">This edits only the optional manual timer. Clipboard Pace is unchanged.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={adjustDisclosure.close}>Cancel</Button>
            <Button
              disabled={typeof adjustMinutes !== 'number' || !Number.isSafeInteger(adjustMinutes)}
              onClick={() => {
                if (typeof adjustMinutes === 'number' && Number.isSafeInteger(adjustMinutes)) {
                  setManualTimerElapsed(adjustMinutes * 60_000);
                  adjustDisclosure.close();
                }
              }}
            >
              Save time
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={resetOpen} onClose={resetDisclosure.close} title="Reset manual timer?" size="sm">
        <Stack>
          <Text size="sm" c="dimmed">This removes the session&apos;s recorded manual active time. Clipboard Pace is unaffected.</Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={resetDisclosure.close}>Cancel</Button>
            <Button color="red" onClick={() => { resetManualTimer(); resetDisclosure.close(); }}>Reset timer</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={settingsOpen} onClose={settingsDisclosure.close} title="Pinned overlay" size="lg">
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            The overlay is a separate, subtle window. Its buttons update the current live session through the main app; it never opens a second repository.
          </Text>
          <Group justify="space-between">
            <Button
              variant={overlayPreferences.visible ? 'default' : 'filled'}
              onClick={() => setOverlayPreferences({
                visible: !overlayPreferences.visible,
                ...(!overlayPreferences.visible ? {} : { clickThrough: false }),
              })}
            >
              {overlayPreferences.visible ? 'Hide overlay' : 'Show overlay'}
            </Button>
            <SegmentedControl
              size="xs"
              value={overlayPreferences.mode}
              data={[
                { value: 'timer', label: 'Timer' },
                { value: 'counters', label: 'Counters' },
                { value: 'both', label: 'Both' },
              ]}
              onChange={(mode) => setOverlayPreferences({ mode: mode as typeof overlayPreferences.mode })}
            />
          </Group>

          <MultiSelect
            label="Counters"
            description="Choose up to eight raw counters. Percentages remain in the full Run Statistics panel."
            searchable
            clearable
            maxValues={8}
            data={OVERLAY_COUNTER_OPTIONS}
            value={overlayPreferences.counterIds}
            onChange={(counterIds) => setOverlayPreferences({ counterIds })}
          />

          <div>
            <Text size="sm" fw={500}>Opacity</Text>
            <Slider
              min={40}
              max={100}
              step={5}
              label={(value) => `${value}%`}
              value={Math.round(overlayPreferences.opacity * 100)}
              onChange={(value) => setOverlayPreferences({ opacity: value / 100 })}
            />
          </div>

          <Group grow align="start">
            <Switch
              label="Lock position and size"
              description="Disables both header dragging and edge resizing."
              checked={overlayPreferences.locked}
              onChange={(event) => setOverlayPreferences({ locked: event.currentTarget.checked })}
            />
            <Switch
              label="Click-through"
              description="Disable this here to regain mouse controls."
              checked={overlayPreferences.clickThrough}
              onChange={(event) => setOverlayPreferences({ clickThrough: event.currentTarget.checked })}
            />
          </Group>

          <TextInput
            label="Start / Pause shortcut"
            description="Optional Electron accelerator, for example CommandOrControl+Shift+T"
            value={overlayPreferences.timerShortcut}
            onChange={(event) => setOverlayPreferences({ timerShortcut: event.currentTarget.value })}
            error={timerShortcut && !timerShortcut.registered ? timerShortcut.error : undefined}
          />

          {selectedCounters.length > 0 && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>Optional +1 shortcuts</Text>
              {selectedCounters.map((counter) => {
                const status = overlayShortcutStatus?.counters[counter.id];
                return (
                  <TextInput
                    key={counter.id}
                    size="xs"
                    label={counter.label}
                    placeholder="e.g. CommandOrControl+Shift+1"
                    value={overlayPreferences.counterShortcuts[counter.id] ?? ''}
                    onChange={(event) => setOverlayPreferences({
                      counterShortcuts: {
                        ...overlayPreferences.counterShortcuts,
                        [counter.id]: event.currentTarget.value,
                      },
                    })}
                    error={status && !status.registered ? status.error : undefined}
                  />
                );
              })}
            </Stack>
          )}
          <Text c="dimmed" style={{ fontSize: FONT.small }}>
            Shortcuts are optional and fail visibly when the desktop environment or another application owns them. There is deliberately no Reset shortcut.
          </Text>
        </Stack>
      </Modal>
    </>
  );
}
