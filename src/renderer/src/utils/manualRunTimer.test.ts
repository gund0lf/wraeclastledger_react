import { describe, expect, it } from 'vitest';
import {
  EMPTY_MANUAL_RUN_TIMER,
  finishManualRunTimer,
  formatStopwatch,
  heartbeatManualRunTimer,
  manualRunTimerElapsed,
  normalizeManualRunTimer,
  pauseManualRunTimer,
  recoverManualRunTimer,
  sanitizeManualRunTimer,
  startManualRunTimer,
} from './manualRunTimer';

describe('manual run timer', () => {
  it('accumulates only explicit running intervals across pause and resume', () => {
    const started = startManualRunTimer(EMPTY_MANUAL_RUN_TIMER, 1_000);
    expect(manualRunTimerElapsed(started, 6_000)).toBe(5_000);
    const paused = pauseManualRunTimer(started, 6_000);
    expect(paused).toMatchObject({ accumulatedMs: 5_000, runningSince: null });
    const resumed = startManualRunTimer(paused, 20_000);
    const finished = finishManualRunTimer(resumed, 23_500);
    expect(finished).toEqual({
      accumulatedMs: 8_500,
      runningSince: null,
      lastHeartbeatAt: null,
      finishedAt: 23_500,
    });
  });

  it('recovers through the acknowledged heartbeat and exposes only the uncertain gap', () => {
    const running = heartbeatManualRunTimer(startManualRunTimer({
      accumulatedMs: 10_000,
      runningSince: null,
      lastHeartbeatAt: null,
      finishedAt: null,
    }, 100_000), 130_000);
    expect(recoverManualRunTimer(running, 145_000)).toEqual({
      timer: {
        accumulatedMs: 40_000,
        runningSince: null,
        lastHeartbeatAt: null,
        finishedAt: null,
      },
      recoverableMs: 15_000,
    });
  });

  it('fails malformed saved values closed while older missing values become empty', () => {
    expect(sanitizeManualRunTimer({ accumulatedMs: -1 })).toBeNull();
    expect(sanitizeManualRunTimer({ accumulatedMs: 0, future: true })).toBeNull();
    expect(sanitizeManualRunTimer({ runningSince: 20, lastHeartbeatAt: 10 })).toBeNull();
    expect(normalizeManualRunTimer(undefined)).toEqual(EMPTY_MANUAL_RUN_TIMER);
  });

  it('formats a stable stopwatch clock', () => {
    expect(formatStopwatch(0)).toBe('00:00:00');
    expect(formatStopwatch(3_661_999)).toBe('01:01:01');
  });
});
