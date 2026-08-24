import { useEffect } from 'react';
import type { OverlayAction, OverlaySnapshot } from '../../../shared/overlay';
import { useSessionStore, type SessionStoreState } from '../store/useSessionStore';
import { manualRunTimerElapsed } from '../utils/manualRunTimer';
import { overlayCounterSnapshot, parseOverlayCounterId } from '../utils/overlayCounters';

function publishSnapshot(state: SessionStoreState): void {
  const capturedAt = Date.now();
  const snapshot: OverlaySnapshot = {
    sessionLabel: state.activeSessionName ?? 'New Session',
    lifecycle: state.sessionLifecycle,
    timer: {
      elapsedMs: manualRunTimerElapsed(state.manualRunTimer, capturedAt),
      running: state.manualRunTimer.runningSince !== null,
      finished: state.manualRunTimer.finishedAt !== null,
      capturedAt,
    },
    counters: state.overlayPreferences.counterIds
      .map((id) => overlayCounterSnapshot(id, state.manualStatistics))
      .filter((entry) => entry !== null),
    preferences: {
      mode: state.overlayPreferences.mode,
      locked: state.overlayPreferences.locked,
      clickThrough: state.overlayPreferences.clickThrough,
    },
  };
  window.api.publishOverlaySnapshot(snapshot);
}

function applyCounterDelta(state: SessionStoreState, counterId: string, delta: -1 | 1): void {
  if (state.sessionLifecycle !== 'live') return;
  const parsed = parseOverlayCounterId(counterId);
  if (!parsed) return;
  if (parsed.kind === 'stat') {
    state.setManualStatistic(parsed.name, Math.max(0, (state.manualStatistics[parsed.name] ?? 0) + delta));
    return;
  }
  if (parsed.kind === 'anomaly') {
    const current = state.manualStatistics.atlasAnomalies?.find(({ name }) => name === parsed.name)?.count ?? 0;
    const next = Math.max(0, current + delta);
    state.setManualAtlasAnomalyCount(parsed.name, next > 0 ? next : null);
    return;
  }
  const current = state.manualStatistics.mercenaries?.find(({ archetype }) =>
    archetype === parsed.name)?.count ?? 0;
  const next = Math.max(0, current + delta);
  state.setManualMercenaryCount(parsed.name, next > 0 ? next : null);
}

function applyOverlayAction(action: OverlayAction): void {
  const state = useSessionStore.getState();
  if (action.type === 'timer-toggle') {
    if (state.manualRunTimer.runningSince !== null) state.pauseManualTimer();
    else state.startManualTimer();
  } else if (action.type === 'timer-pause') {
    state.pauseManualTimer();
  } else if (action.type === 'timer-finish') {
    state.finishManualTimer();
  } else if (action.type === 'counter-delta') {
    applyCounterDelta(state, action.counterId, action.delta);
  } else if (action.type === 'toggle-lock') {
    state.setOverlayPreferences({ locked: !state.overlayPreferences.locked });
  } else if (action.type === 'close') {
    state.setOverlayPreferences({ visible: false, clickThrough: false });
  }
}

export function OverlayController(): null {
  useEffect(() => {
    let lastPreferences = useSessionStore.getState().overlayPreferences;
    const syncPreferences = (): void => {
      const current = useSessionStore.getState().overlayPreferences;
      lastPreferences = current;
      void window.api.syncOverlayPreferences(current)
        .then((status) => useSessionStore.getState().setOverlayShortcutStatus(status))
        .catch((error) => useSessionStore.getState().setOverlayShortcutStatus({
          timer: current.timerShortcut ? {
            accelerator: current.timerShortcut,
            registered: false,
            error: error instanceof Error ? error.message : String(error),
          } : null,
          counters: {},
        }));
    };
    syncPreferences();
    publishSnapshot(useSessionStore.getState());
    const unsubscribeStore = useSessionStore.subscribe((state) => {
      if (state.overlayPreferences !== lastPreferences) syncPreferences();
      publishSnapshot(state);
    });
    const removeAction = window.api.onOverlayAction(applyOverlayAction);
    const removeBounds = window.api.onOverlayBounds((bounds) => {
      const state = useSessionStore.getState();
      const previous = state.overlayPreferences.bounds;
      if (!previous || previous.x !== bounds.x || previous.y !== bounds.y ||
          previous.width !== bounds.width || previous.height !== bounds.height) {
        state.setOverlayPreferences({ bounds });
      }
    });
    const heartbeat = window.setInterval(() => {
      const state = useSessionStore.getState();
      if (state.manualRunTimer.runningSince !== null) state.heartbeatManualTimer();
    }, 30_000);
    return () => {
      window.clearInterval(heartbeat);
      unsubscribeStore();
      removeAction();
      removeBounds();
    };
  }, []);
  return null;
}
