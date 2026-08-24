import type { ManualRunTimer } from '../types';

export const EMPTY_MANUAL_RUN_TIMER: ManualRunTimer = {
  accumulatedMs: 0,
  runningSince: null,
  lastHeartbeatAt: null,
  finishedAt: null,
};

const timestamp = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;

export function sanitizeManualRunTimer(value: unknown): ManualRunTimer | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => ![
    'accumulatedMs', 'runningSince', 'lastHeartbeatAt', 'finishedAt',
  ].includes(key))) return null;
  for (const key of ['accumulatedMs', 'runningSince', 'lastHeartbeatAt', 'finishedAt'] as const) {
    if (input[key] !== undefined && input[key] !== null && timestamp(input[key]) === null) return null;
  }
  const accumulatedMs = timestamp(input.accumulatedMs) ?? 0;
  const runningSince = timestamp(input.runningSince);
  const lastHeartbeatAt = timestamp(input.lastHeartbeatAt);
  const finishedAt = timestamp(input.finishedAt);
  if (runningSince !== null && (lastHeartbeatAt === null || lastHeartbeatAt < runningSince)) {
    return null;
  }
  if (runningSince !== null && finishedAt !== null) return null;
  return {
    accumulatedMs,
    runningSince,
    lastHeartbeatAt: runningSince === null ? null : lastHeartbeatAt,
    finishedAt: runningSince === null ? finishedAt : null,
  };
}

export function normalizeManualRunTimer(value: unknown): ManualRunTimer {
  return sanitizeManualRunTimer(value) ?? { ...EMPTY_MANUAL_RUN_TIMER };
}

export function manualRunTimerElapsed(timer: ManualRunTimer, now = Date.now()): number {
  if (timer.runningSince === null) return timer.accumulatedMs;
  return timer.accumulatedMs + Math.max(0, now - timer.runningSince);
}

export function formatStopwatch(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export function startManualRunTimer(timer: ManualRunTimer, now = Date.now()): ManualRunTimer {
  if (timer.runningSince !== null) return timer;
  return { ...timer, runningSince: now, lastHeartbeatAt: now, finishedAt: null };
}

export function pauseManualRunTimer(timer: ManualRunTimer, now = Date.now()): ManualRunTimer {
  if (timer.runningSince === null) return timer;
  return {
    accumulatedMs: manualRunTimerElapsed(timer, now),
    runningSince: null,
    lastHeartbeatAt: null,
    finishedAt: null,
  };
}

export function finishManualRunTimer(timer: ManualRunTimer, now = Date.now()): ManualRunTimer {
  const paused = pauseManualRunTimer(timer, now);
  return { ...paused, finishedAt: now };
}

export function heartbeatManualRunTimer(timer: ManualRunTimer, now = Date.now()): ManualRunTimer {
  if (timer.runningSince === null || now <= (timer.lastHeartbeatAt ?? timer.runningSince)) return timer;
  return { ...timer, lastHeartbeatAt: now };
}

export interface RecoveredManualRunTimer {
  timer: ManualRunTimer;
  recoverableMs: number | null;
}

export function recoverManualRunTimer(timer: ManualRunTimer, now = Date.now()): RecoveredManualRunTimer {
  if (timer.runningSince === null) return { timer, recoverableMs: null };
  const safeEnd = Math.min(now, Math.max(timer.runningSince, timer.lastHeartbeatAt ?? timer.runningSince));
  return {
    timer: {
      accumulatedMs: timer.accumulatedMs + (safeEnd - timer.runningSince),
      runningSince: null,
      lastHeartbeatAt: null,
      finishedAt: null,
    },
    recoverableMs: Math.max(0, now - safeEnd),
  };
}
