import type {
  LootItem,
  ManualLootItem,
  ManualRunTimer,
  ManualSessionStatistics,
  MapData,
  SessionSettings,
} from '../types';
import type { JsonObject } from '../../../shared/sessionRecord';
import { SESSION_PAYLOAD_KEYS, type SessionPayloadKey } from '../../../shared/sessionPayload';
import {
  hasManualStatistics,
  MANUAL_STATISTIC_FIELDS,
  normalizeLocalManualStatistics,
  sanitizeManualStatistics,
} from './manualStatistics';
import { normalizeManualRunTimer, sanitizeManualRunTimer } from './manualRunTimer';

export interface WorkingSessionCandidate {
  activeSessionId: string | null;
  maps: MapData[];
  lootItems: LootItem[];
  baselineItems: LootItem[];
  baselineTotal: number;
  manualLootItems: ManualLootItem[];
  manualStatistics: ManualSessionStatistics;
  manualRunTimer: ManualRunTimer;
  sessionNotes: string;
  investmentNeutralization: number;
  investmentDismissed: boolean;
  loadedStrategyInfo: unknown | null;
  settings: SessionSettings;
  defaultExclusionPreset?: string[];
}

const AUTO_MANAGED_SETTINGS = new Set<keyof SessionSettings>([
  'divinePrice',
  'divinePriceQuotedAt',
  'leagueName',
  // Atlas Bonus is persisted as user-scoped per-league progress and seeded
  // automatically into every fresh session. Replacing the session cannot lose
  // that choice, so the seeded snapshot alone is not working-session content.
  'atlasBonus',
  // Path of Pathing normalises the base URL, reports the current maximum, and
  // derives tags as soon as its webview loads. Those writes are not user work.
  // A genuinely allocated tree is handled explicitly via atlasPoints below.
  'atlasTreeUrl',
  'atlasPoints',
  'atlasPointsMax',
  'atlasDetectedTags',
]);

const valuesEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const SESSION_PAYLOAD_KEY_SET = new Set<string>(SESSION_PAYLOAD_KEYS);

function assertClassifierHandlesSessionPayloadKey(key: SessionPayloadKey): void {
  switch (key) {
    case 'maps':
    case 'lootItems':
    case 'baselineItems':
    case 'baselineTotal':
    case 'manualLootItems':
    case 'manualStatistics':
    case 'manualRunTimer':
    case 'settings':
    case 'sessionNotes':
    case 'investmentNeutralization':
    case 'investmentDismissed':
    case 'strategySourceContext':
      return;
    default: {
      const unhandled: never = key;
      return unhandled;
    }
  }
}

SESSION_PAYLOAD_KEYS.forEach(assertClassifierHandlesSessionPayloadKey);

const isPlainObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MANUAL_STATISTICS_KEYS = new Set<string>([
  ...MANUAL_STATISTIC_FIELDS,
  'infoDismissed',
  'beastInfoDismissed',
  'atlasAnomalies',
  'mercenaries',
]);

function isEmptyManualStatisticsInput(value: JsonObject): boolean {
  return Object.entries(value).every(([key, candidate]) =>
    ((key === 'infoDismissed' || key === 'beastInfoDismissed') && candidate === false)
    || ((key === 'atlasAnomalies' || key === 'mercenaries')
      && Array.isArray(candidate) && candidate.length === 0));
}

function isAutoManagedSettingWellFormed(key: keyof SessionSettings, value: unknown): boolean {
  switch (key) {
    case 'divinePrice':
      return typeof value === 'number' && Number.isFinite(value);
    case 'divinePriceQuotedAt':
      return value === null || typeof value === 'string';
    case 'leagueName':
    case 'atlasTreeUrl':
      return typeof value === 'string';
    case 'atlasBonus':
      return typeof value === 'boolean';
    case 'atlasPoints':
    case 'atlasPointsMax':
      return value === null || (typeof value === 'number' && Number.isFinite(value));
    case 'atlasDetectedTags':
      return Array.isArray(value) && value.every((tag) => typeof tag === 'string');
    default:
      return false;
  }
}

/**
 * A null Select change means Mantine deselected the current option; it is not
 * the explicit New Session row. Keep those two intents distinct.
 */
export function resolveSessionSelectionIntent(value: string | null): string | undefined {
  return value ?? undefined;
}

/** Mantine does not emit onChange when the already-selected New Session row is clicked. */
export function resolveReselectedNewSessionIntent(
  optionValue: string,
  selectedValue: string,
): '__new__' | undefined {
  return optionValue === '__new__' && selectedValue === '__new__'
    ? '__new__'
    : undefined;
}

/**
 * Does the unnamed working session contain state that a replacement would lose?
 * Named sessions are auto-saved and therefore never need this confirmation.
 */
export function isWorkingSessionMeaningful(
  state: WorkingSessionCandidate,
  defaults: SessionSettings,
): boolean {
  if (state.activeSessionId !== null) return false;
  if (
    state.maps.length > 0 ||
    state.lootItems.length > 0 ||
    state.baselineItems.length > 0 ||
    state.manualLootItems.length > 0
  ) return true;
  if (state.baselineTotal !== 0 || state.sessionNotes.trim() !== '') return true;
  if (hasManualStatistics(state.manualStatistics)) return true;
  if (state.manualRunTimer.accumulatedMs > 0 || state.manualRunTimer.runningSince !== null ||
      state.manualRunTimer.finishedAt !== null) return true;
  if (state.investmentNeutralization !== 0 || state.investmentDismissed) return true;
  if (state.loadedStrategyInfo !== null) return true;
  if ((state.settings.atlasPoints ?? 0) > 0) return true;

  const settingKeys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(state.settings),
  ] as (keyof SessionSettings)[]);
  for (const key of settingKeys) {
    if (AUTO_MANAGED_SETTINGS.has(key)) continue;
    if (key === 'regexExclusions' && valuesEqual(
      state.settings.regexExclusions,
      state.defaultExclusionPreset ?? defaults.regexExclusions,
    )) continue;
    if (!valuesEqual(state.settings[key], defaults[key])) return true;
  }
  return false;
}

/**
 * Classify a repository-backed working payload before replacing it. Unknown or
 * malformed fields fail safe as meaningful so an additive future payload can
 * never be discarded merely because this renderer does not understand it.
 */
export function isWorkingPayloadMeaningful(
  payload: JsonObject,
  defaults: SessionSettings,
  defaultExclusionPreset: string[] = [],
): boolean {
  if (Object.keys(payload).some((key) => !SESSION_PAYLOAD_KEY_SET.has(key))) return true;

  for (const key of ['maps', 'lootItems', 'baselineItems', 'manualLootItems'] as const) {
    if (payload[key] !== undefined && !Array.isArray(payload[key])) return true;
  }
  if (payload.baselineTotal !== undefined && typeof payload.baselineTotal !== 'number') return true;
  if (payload.sessionNotes !== undefined && typeof payload.sessionNotes !== 'string') return true;
  if (payload.investmentNeutralization !== undefined &&
      typeof payload.investmentNeutralization !== 'number') return true;
  if (payload.investmentDismissed !== undefined && typeof payload.investmentDismissed !== 'boolean') return true;
  if (payload.manualStatistics !== undefined && !isPlainObject(payload.manualStatistics)) return true;
  if (payload.manualRunTimer !== undefined && !isPlainObject(payload.manualRunTimer)) return true;
  if (payload.manualRunTimer !== undefined && sanitizeManualRunTimer(payload.manualRunTimer) === null) return true;
  if (payload.settings !== undefined && !isPlainObject(payload.settings)) return true;
  if (payload.strategySourceContext !== undefined && payload.strategySourceContext !== null &&
      !isPlainObject(payload.strategySourceContext)) return true;

  const manualStatisticsInput = isPlainObject(payload.manualStatistics)
    ? payload.manualStatistics : undefined;
  if (manualStatisticsInput) {
    if (Object.keys(manualStatisticsInput).some((key) => !MANUAL_STATISTICS_KEYS.has(key))) return true;
    if (sanitizeManualStatistics(manualStatisticsInput) === null &&
        !isEmptyManualStatisticsInput(manualStatisticsInput)) return true;
  }

  const settingsInput = isPlainObject(payload.settings) ? payload.settings : {};
  for (const [rawKey, value] of Object.entries(settingsInput)) {
    const key = rawKey as keyof SessionSettings;
    if (AUTO_MANAGED_SETTINGS.has(key) && !isAutoManagedSettingWellFormed(key, value)) return true;
  }

  return isWorkingSessionMeaningful({
    activeSessionId: null,
    maps: Array.isArray(payload.maps) ? payload.maps as unknown as MapData[] : [],
    lootItems: Array.isArray(payload.lootItems) ? payload.lootItems as unknown as LootItem[] : [],
    baselineItems: Array.isArray(payload.baselineItems)
      ? payload.baselineItems as unknown as LootItem[] : [],
    baselineTotal: typeof payload.baselineTotal === 'number' ? payload.baselineTotal : 0,
    manualLootItems: Array.isArray(payload.manualLootItems)
      ? payload.manualLootItems as unknown as ManualLootItem[] : [],
    manualStatistics: normalizeLocalManualStatistics(manualStatisticsInput),
    manualRunTimer: normalizeManualRunTimer(payload.manualRunTimer),
    settings: {
      ...defaults,
      ...settingsInput as Partial<SessionSettings>,
    },
    sessionNotes: typeof payload.sessionNotes === 'string' ? payload.sessionNotes : '',
    investmentNeutralization: typeof payload.investmentNeutralization === 'number'
      ? payload.investmentNeutralization : 0,
    investmentDismissed: payload.investmentDismissed === true,
    loadedStrategyInfo: isPlainObject(payload.strategySourceContext)
      ? payload.strategySourceContext : null,
    defaultExclusionPreset,
  }, defaults);
}
