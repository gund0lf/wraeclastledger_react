import {
  createSessionPayload,
  type SessionPayloadKey,
  type SessionPayloadFields,
} from '../../../shared/sessionPayload';
import { assertJsonValue, type JsonObject, type JsonValue } from '../../../shared/sessionRecord';
import type { SessionSettings } from '../types';
import { normalizeLocalManualStatistics } from '../utils/manualStatistics';
import { normalizeManualRunTimer } from '../utils/manualRunTimer';
import { recoverExactModifierCount } from '../utils/mapParser';
import type { SessionState } from '../store/useSessionStore';

export type SessionPayloadSource = Pick<
  SessionState,
  | 'maps'
  | 'lootItems'
  | 'baselineItems'
  | 'baselineTotal'
  | 'manualLootItems'
  | 'manualStatistics'
  | 'manualRunTimer'
  | 'settings'
  | 'sessionNotes'
  | 'investmentNeutralization'
  | 'investmentDismissed'
  | 'loadedStrategyInfo'
>;

export type DecodedSessionPayload = SessionPayloadSource;

export const SESSION_PAYLOAD_STATE_KEY_BY_PAYLOAD_KEY = {
  maps: 'maps',
  lootItems: 'lootItems',
  baselineItems: 'baselineItems',
  baselineTotal: 'baselineTotal',
  manualLootItems: 'manualLootItems',
  manualStatistics: 'manualStatistics',
  manualRunTimer: 'manualRunTimer',
  settings: 'settings',
  sessionNotes: 'sessionNotes',
  investmentNeutralization: 'investmentNeutralization',
  investmentDismissed: 'investmentDismissed',
  strategySourceContext: 'loadedStrategyInfo',
} as const satisfies Record<SessionPayloadKey, keyof SessionPayloadSource>;

export const SESSION_PAYLOAD_STATE_KEYS = Object.values(
  SESSION_PAYLOAD_STATE_KEY_BY_PAYLOAD_KEY,
) as Array<keyof SessionPayloadSource>;

export function toJsonValue(value: unknown, path = '$'): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} contains a non-finite number`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((child, index) => {
      if (child === undefined) throw new Error(`${path}[${index}] is undefined`);
      return toJsonValue(child, `${path}[${index}]`);
    });
  }
  if (typeof value !== 'object') throw new Error(`${path} contains an unsupported value`);
  const output: JsonObject = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child !== undefined) output[key] = toJsonValue(child, `${path}.${key}`);
  }
  return output;
}

export function toJsonObject(value: unknown): JsonObject {
  const normalized = toJsonValue(value);
  if (normalized === null || Array.isArray(normalized) || typeof normalized !== 'object') {
    throw new Error('Repository payload must be an object');
  }
  assertJsonValue(normalized);
  return normalized;
}

export function encodeSessionPayload(source: SessionPayloadSource): JsonObject {
  const fields = Object.fromEntries(Object.entries(SESSION_PAYLOAD_STATE_KEY_BY_PAYLOAD_KEY)
    .map(([payloadKey, stateKey]) => [
      payloadKey,
      toJsonValue(source[stateKey], `$.${payloadKey}`),
    ])) as SessionPayloadFields;
  return createSessionPayload(fields);
}

export function decodeSessionPayload(
  payload: JsonObject,
  defaultSettings: SessionSettings,
): DecodedSessionPayload {
  const settings = typeof payload.settings === 'object' && payload.settings !== null &&
    !Array.isArray(payload.settings)
    ? payload.settings as unknown as Partial<SessionSettings> : {};
  return {
    maps: Array.isArray(payload.maps)
      ? (payload.maps as unknown as SessionState['maps']).map(recoverExactModifierCount)
      : [],
    lootItems: Array.isArray(payload.lootItems) ? payload.lootItems as unknown as SessionState['lootItems'] : [],
    baselineItems: Array.isArray(payload.baselineItems)
      ? payload.baselineItems as unknown as SessionState['baselineItems'] : [],
    baselineTotal: typeof payload.baselineTotal === 'number' ? payload.baselineTotal : 0,
    manualLootItems: Array.isArray(payload.manualLootItems)
      ? payload.manualLootItems as unknown as SessionState['manualLootItems'] : [],
    manualStatistics: normalizeLocalManualStatistics(payload.manualStatistics),
    manualRunTimer: normalizeManualRunTimer(payload.manualRunTimer),
    settings: { ...defaultSettings, ...settings },
    sessionNotes: typeof payload.sessionNotes === 'string' ? payload.sessionNotes : '',
    investmentNeutralization: typeof payload.investmentNeutralization === 'number'
      ? payload.investmentNeutralization : 0,
    investmentDismissed: payload.investmentDismissed === true,
    loadedStrategyInfo: payload.strategySourceContext && typeof payload.strategySourceContext === 'object' &&
      !Array.isArray(payload.strategySourceContext)
      ? payload.strategySourceContext as SessionState['loadedStrategyInfo'] : null,
  };
}
