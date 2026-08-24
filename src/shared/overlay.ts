export type OverlayMode = 'timer' | 'counters' | 'both';

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlayPreferences {
  visible: boolean;
  mode: OverlayMode;
  opacity: number;
  locked: boolean;
  clickThrough: boolean;
  counterIds: string[];
  timerShortcut: string;
  counterShortcuts: Record<string, string>;
  bounds: OverlayBounds | null;
}

export interface OverlayCounterSnapshot {
  id: string;
  label: string;
  value: number;
}

export interface OverlaySnapshot {
  sessionLabel: string;
  lifecycle: 'live' | 'historical';
  timer: {
    elapsedMs: number;
    running: boolean;
    finished: boolean;
    capturedAt: number;
  };
  counters: OverlayCounterSnapshot[];
  preferences: Pick<OverlayPreferences, 'mode' | 'locked' | 'clickThrough'>;
}

export type OverlayAction =
  | { type: 'timer-toggle' }
  | { type: 'timer-pause' }
  | { type: 'timer-finish' }
  | { type: 'counter-delta'; counterId: string; delta: -1 | 1 }
  | { type: 'toggle-lock' }
  | { type: 'close' };

export interface OverlayShortcutStatus {
  timer: { accelerator: string; registered: boolean; error: string | null } | null;
  counters: Record<string, { accelerator: string; registered: boolean; error: string | null }>;
}

export const DEFAULT_OVERLAY_COUNTER_IDS = [
  'stat:starfallCraters',
  'stat:svalinnDrops',
  'stat:wildwoodEncounters',
] as const;

export const DEFAULT_OVERLAY_PREFERENCES: OverlayPreferences = {
  visible: false,
  mode: 'both',
  opacity: 0.92,
  locked: false,
  clickThrough: false,
  counterIds: [...DEFAULT_OVERLAY_COUNTER_IDS],
  timerShortcut: '',
  counterShortcuts: {},
  bounds: null,
};

const boundedNumber = (value: unknown, minimum: number, maximum: number): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : null;

const shortcut = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80) : '';

export function normalizeOverlayPreferences(value: unknown): OverlayPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_OVERLAY_PREFERENCES, counterIds: [...DEFAULT_OVERLAY_COUNTER_IDS] };
  }
  const input = value as Record<string, unknown>;
  const counterIds = Array.isArray(input.counterIds)
    ? [...new Set(input.counterIds.filter((id): id is string =>
      typeof id === 'string' && id.length > 0 && id.length <= 140))].slice(0, 8)
    : [...DEFAULT_OVERLAY_COUNTER_IDS];
  const rawShortcuts = input.counterShortcuts && typeof input.counterShortcuts === 'object' &&
    !Array.isArray(input.counterShortcuts)
    ? input.counterShortcuts as Record<string, unknown> : {};
  const counterShortcuts = Object.fromEntries(counterIds
    .map((id) => [id, shortcut(rawShortcuts[id])])
    .filter((entry) => entry[1] !== ''));
  const rawBounds = input.bounds && typeof input.bounds === 'object' && !Array.isArray(input.bounds)
    ? input.bounds as Record<string, unknown> : null;
  const x = rawBounds ? boundedNumber(rawBounds.x, -100_000, 100_000) : null;
  const y = rawBounds ? boundedNumber(rawBounds.y, -100_000, 100_000) : null;
  const width = rawBounds ? boundedNumber(rawBounds.width, 220, 800) : null;
  const height = rawBounds ? boundedNumber(rawBounds.height, 90, 900) : null;
  return {
    visible: input.visible === true,
    mode: input.mode === 'timer' || input.mode === 'counters' || input.mode === 'both'
      ? input.mode : DEFAULT_OVERLAY_PREFERENCES.mode,
    opacity: boundedNumber(input.opacity, 0.4, 1) ?? DEFAULT_OVERLAY_PREFERENCES.opacity,
    locked: input.locked === true,
    clickThrough: input.clickThrough === true,
    counterIds,
    timerShortcut: shortcut(input.timerShortcut),
    counterShortcuts,
    bounds: x !== null && y !== null && width !== null && height !== null
      ? { x, y, width, height } : null,
  };
}
