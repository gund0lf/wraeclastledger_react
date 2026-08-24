import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconLock, IconLockOpen, IconMinus, IconPlayerPause, IconPlayerPlay, IconSquare, IconX } from '@tabler/icons-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { OverlaySnapshot } from '../../shared/overlay';
import { formatStopwatch } from './utils/manualRunTimer';
import { COLOR, FONT } from './utils/uiTokens';

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export default function OverlayApp() {
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    const remove = window.api.onOverlaySnapshot(setSnapshot);
    const timer = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => {
      remove();
      window.clearInterval(timer);
    };
  }, []);

  if (!snapshot) return null;
  const elapsed = snapshot.timer.elapsedMs + (snapshot.timer.running
    ? Math.max(0, Date.now() - snapshot.timer.capturedAt) : 0);
  const live = snapshot.lifecycle === 'live';
  const showTimer = snapshot.preferences.mode !== 'counters';
  const showCounters = snapshot.preferences.mode !== 'timer';

  return (
    <Paper
      withBorder
      radius="md"
      p="xs"
      style={{
        height: '100vh',
        overflow: 'hidden',
        background: COLOR.bgPanel,
        borderColor: snapshot.timer.running ? COLOR.accentStrong : COLOR.border,
      }}
    >
      <Stack gap="xs" h="100%">
        <Group
          justify="space-between"
          wrap="nowrap"
          gap={4}
          style={snapshot.preferences.locked ? noDragStyle : dragStyle}
        >
          <Box style={{ minWidth: 0 }}>
            <Text size="xs" fw={700} truncate>{snapshot.sessionLabel}</Text>
            <Text style={{ color: COLOR.textFaint, fontSize: FONT.tiny }}>
              {live ? 'LIVE SESSION' : 'HISTORICAL · CONTROLS PAUSED'}
            </Text>
          </Box>
          <Group gap={2} wrap="nowrap" style={noDragStyle}>
            <Tooltip label={snapshot.preferences.locked ? 'Unlock position and size' : 'Lock position and size'}>
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label={snapshot.preferences.locked
                  ? 'Unlock overlay position and size'
                  : 'Lock overlay position and size'}
                onClick={() => window.api.sendOverlayAction({ type: 'toggle-lock' })}
              >
                {snapshot.preferences.locked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Close overlay">
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                aria-label="Close overlay"
                onClick={() => window.api.sendOverlayAction({ type: 'close' })}
              >
                <IconX size={14} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {showTimer && (
          <Box style={noDragStyle}>
            <Text
              ta="center"
              fw={800}
              style={{
                color: snapshot.timer.running ? COLOR.accent : COLOR.text,
                fontSize: FONT.xl,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: 1,
              }}
            >
              {formatStopwatch(elapsed)}
            </Text>
            <Group justify="center" gap={4} mt={4}>
              <Button
                size="compact-xs"
                variant={snapshot.timer.running ? 'light' : 'filled'}
                disabled={!live}
                leftSection={snapshot.timer.running ? <IconPlayerPause size={13} /> : <IconPlayerPlay size={13} />}
                onClick={() => window.api.sendOverlayAction({ type: 'timer-toggle' })}
              >
                {snapshot.timer.running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
              </Button>
              <Button
                size="compact-xs"
                variant="default"
                disabled={!live || elapsed <= 0}
                leftSection={<IconSquare size={11} />}
                onClick={() => window.api.sendOverlayAction({ type: 'timer-finish' })}
              >
                Finish
              </Button>
            </Group>
          </Box>
        )}

        {showTimer && showCounters && <Box style={{ borderTop: `1px solid ${COLOR.border}` }} />}

        {showCounters && (
          <Stack
            className="overlay-counter-list"
            gap={4}
            style={{
              ...noDragStyle,
              minHeight: 0,
              overflowY: 'auto',
            }}
          >
            {snapshot.counters.map((counter) => (
              <Box
                key={counter.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) 104px',
                  alignItems: 'center',
                  columnGap: 'var(--mantine-spacing-xs)',
                }}
              >
                <Text size="xs" truncate>{counter.label}</Text>
                <Box
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '22px 56px 22px',
                    alignItems: 'center',
                    columnGap: 2,
                  }}
                >
                  <ActionIcon
                    size="sm"
                    variant="default"
                    disabled={!live || counter.value <= 0}
                    aria-label={`Decrease ${counter.label}`}
                    onClick={() => window.api.sendOverlayAction({
                      type: 'counter-delta', counterId: counter.id, delta: -1,
                    })}
                  >
                    <IconMinus size={12} />
                  </ActionIcon>
                  <Text
                    ta="center"
                    fw={700}
                    truncate
                    title={counter.value.toLocaleString()}
                    style={{
                      width: 56,
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: FONT.body,
                    }}
                  >
                    {counter.value.toLocaleString()}
                  </Text>
                  <ActionIcon
                    size="sm"
                    variant="filled"
                    disabled={!live}
                    aria-label={`Increase ${counter.label}`}
                    onClick={() => window.api.sendOverlayAction({
                      type: 'counter-delta', counterId: counter.id, delta: 1,
                    })}
                  >
                    +
                  </ActionIcon>
                </Box>
              </Box>
            ))}
            {snapshot.counters.length === 0 && (
              <Text size="xs" c="dimmed" ta="center">Choose counters in Run Statistics.</Text>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
