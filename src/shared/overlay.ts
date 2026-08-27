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
  minimal: boolean;
  opacity: number;
  locked: boolean;
  clickThrough: boolean;
  counterIds: string[];
  timerShortcut: string;
  counterShortcuts: Record<string, string>;
  bounds: OverlayBounds | null;
  placementRevision: number;
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
  preferences: Pick<OverlayPreferences, 'mode' | 'minimal' | 'opacity' | 'locked' | 'clickThrough'>;
}

export type OverlayAction =
  | { type: 'timer-toggle' }
  | { type: 'timer-pause' }
  | { type: 'timer-finish' }
  | { type: 'counter-delta'; counterId: string; delta: -1 | 1 }
  | { type: 'toggle-lock' }
  | { type: 'close' };

export type OverlayBoundsInteraction =
  | {
    phase: 'start' | 'update';
    kind: 'move' | 'resize';
    screenX: number;
    screenY: number;
  }
  | { phase: 'end'; kind: 'move' | 'resize' };

export interface OverlayShortcutStatus {
  timer: { accelerator: string; registered: boolean; error: string | null } | null;
  counters: Record<string, { accelerator: string; registered: boolean; error: string | null }>;
}

export const DEFAULT_OVERLAY_COUNTER_IDS = [
  'stat:starfallCraters',
  'stat:svalinnDrops',
  'stat:wildwoodEncounters',
] as const;

export const OVERLAY_PLACEMENT_REVISION = 2;
export const OVERLAY_MIN_WIDTH = 220;
export const OVERLAY_MIN_HEIGHT = 90;
export const OVERLAY_MINIMAL_WIDTH = 180;
export const OVERLAY_MINIMAL_HEIGHT = 72;

export const DEFAULT_OVERLAY_PREFERENCES: OverlayPreferences = {
  visible: false,
  mode: 'both',
  minimal: false,
  opacity: 0.92,
  locked: false,
  clickThrough: false,
  counterIds: [...DEFAULT_OVERLAY_COUNTER_IDS],
  timerShortcut: '',
  counterShortcuts: {},
  bounds: null,
  placementRevision: OVERLAY_PLACEMENT_REVISION,
};

const boundedNumber = (value: unknown, minimum: number, maximum: number): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : null;

const shortcut = (value: unknown): string =>
  typeof value === 'string' ? value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80) : '';

export function normalizeOverlayBoundsInteraction(value: unknown): OverlayBoundsInteraction | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.kind !== 'move' && input.kind !== 'resize') return null;
  if (input.phase === 'end') return { phase: 'end', kind: input.kind };
  if (input.phase !== 'start' && input.phase !== 'update') return null;
  const screenX = boundedNumber(input.screenX, -100_000, 100_000);
  const screenY = boundedNumber(input.screenY, -100_000, 100_000);
  if (screenX === null || screenY === null) return null;
  return { phase: input.phase, kind: input.kind, screenX, screenY };
}

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
  const minimal = input.minimal === true;
  const width = rawBounds
    ? boundedNumber(rawBounds.width, minimal ? OVERLAY_MINIMAL_WIDTH : OVERLAY_MIN_WIDTH, 800)
    : null;
  const height = rawBounds
    ? boundedNumber(rawBounds.height, minimal ? OVERLAY_MINIMAL_HEIGHT : OVERLAY_MIN_HEIGHT, 900)
    : null;
  return {
    visible: input.visible === true,
    mode: input.mode === 'timer' || input.mode === 'counters' || input.mode === 'both'
      ? input.mode : DEFAULT_OVERLAY_PREFERENCES.mode,
    minimal,
    opacity: boundedNumber(input.opacity, 0.4, 1) ?? DEFAULT_OVERLAY_PREFERENCES.opacity,
    locked: input.locked === true,
    clickThrough: input.clickThrough === true,
    counterIds,
    timerShortcut: shortcut(input.timerShortcut),
    counterShortcuts,
    bounds: x !== null && y !== null && width !== null && height !== null
      ? { x, y, width, height } : null,
    placementRevision: typeof input.placementRevision === 'number' &&
      Number.isInteger(input.placementRevision)
      ? Math.min(OVERLAY_PLACEMENT_REVISION, Math.max(1, input.placementRevision))
      : 1,
  };
}
