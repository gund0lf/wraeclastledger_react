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
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { OverlayBoundsInteraction, OverlaySnapshot } from '../../shared/overlay';
import { formatStopwatch } from './utils/manualRunTimer';
import { COLOR, FONT } from './utils/uiTokens';

const dragStyle = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDragStyle = { WebkitAppRegion: 'no-drag' } as CSSProperties;

export default function OverlayApp() {
  const [snapshot, setSnapshot] = useState<OverlaySnapshot | null>(null);
  const [, setTick] = useState(0);
  const boundsInteraction = useRef<{
    pointerId: number;
    kind: OverlayBoundsInteraction['kind'];
  } | null>(null);

  const beginBoundsInteraction = (
    kind: OverlayBoundsInteraction['kind'],
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (!window.api.usesManagedOverlayBounds || snapshot?.preferences.locked ||
        snapshot?.preferences.clickThrough || event.button !== 0 ||
        (event.target instanceof Element && event.target.closest('[data-overlay-control]'))) return;
    event.preventDefault();
    boundsInteraction.current = { pointerId: event.pointerId, kind };
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* capture is best effort */ }
    window.api.sendOverlayBoundsInteraction({
      phase: 'start', kind, screenX: event.screenX, screenY: event.screenY,
    });
  };

  const updateBoundsInteraction = (event: ReactPointerEvent<HTMLElement>): void => {
    const active = boundsInteraction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    window.api.sendOverlayBoundsInteraction({
      phase: 'update',
      kind: active.kind,
      screenX: event.screenX,
      screenY: event.screenY,
    });
  };

  const endBoundsInteraction = (event: ReactPointerEvent<HTMLElement>): void => {
    const active = boundsInteraction.current;
    if (!active || active.pointerId !== event.pointerId) return;
    boundsInteraction.current = null;
    window.api.sendOverlayBoundsInteraction({ phase: 'end', kind: active.kind });
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* already released */ }
  };

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
        position: 'relative',
        height: '100vh',
        overflow: 'hidden',
        background: COLOR.bgPanel,
        borderColor: snapshot.timer.running ? COLOR.accentStrong : COLOR.border,
        opacity: window.api.usesManagedOverlayBounds ? snapshot.preferences.opacity : undefined,
      }}
    >
      <Stack gap="xs" h="100%">
        <Group
          justify="space-between"
          wrap="nowrap"
          gap={4}
          onPointerDown={(event) => beginBoundsInteraction('move', event)}
          onPointerMove={updateBoundsInteraction}
          onPointerUp={endBoundsInteraction}
          onPointerCancel={endBoundsInteraction}
          style={snapshot.preferences.locked
            ? noDragStyle
            : window.api.usesManagedOverlayBounds
              ? { ...noDragStyle, cursor: 'move', userSelect: 'none' }
              : dragStyle}
        >
          <Box style={{ minWidth: 0 }}>
            <Text size="xs" fw={700} truncate>{snapshot.sessionLabel}</Text>
            <Text style={{ color: COLOR.textFaint, fontSize: FONT.tiny }}>
              {live ? 'LIVE SESSION' : 'HISTORICAL · CONTROLS PAUSED'}
            </Text>
          </Box>
          <Group gap={2} wrap="nowrap" style={noDragStyle} data-overlay-control>
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
      {window.api.usesManagedOverlayBounds && !snapshot.preferences.locked &&
        !snapshot.preferences.clickThrough && (
        <Box
          role="separator"
          aria-label="Resize overlay"
          data-overlay-control
          onPointerDown={(event) => beginBoundsInteraction('resize', event)}
          onPointerMove={updateBoundsInteraction}
          onPointerUp={endBoundsInteraction}
          onPointerCancel={endBoundsInteraction}
          style={{
            ...noDragStyle,
            position: 'absolute',
            right: 3,
            bottom: 3,
            width: 12,
            height: 12,
            cursor: 'nwse-resize',
            borderRight: `2px solid ${COLOR.textFaint}`,
            borderBottom: `2px solid ${COLOR.textFaint}`,
            touchAction: 'none',
          }}
        />
      )}
    </Paper>
  );
}
