import type { JsonObject, JsonValue } from './sessionRecord';

/**
 * The complete version-1 session payload contract. Writers must construct the
 * payload through this list so adding a session-owned field becomes a compile-
 * time and parity-test change instead of another hand-copied adapter edit.
 */
export const SESSION_PAYLOAD_KEYS = [
  'maps',
  'lootItems',
  'baselineItems',
  'baselineTotal',
  'manualLootItems',
  'manualStatistics',
  'settings',
  'sessionNotes',
  'investmentNeutralization',
  'investmentDismissed',
  'strategySourceContext',
] as const;

export type SessionPayloadKey = typeof SESSION_PAYLOAD_KEYS[number];
export type SessionPayloadFields = { [Key in SessionPayloadKey]: JsonValue };

export const SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY = {
  maps: 'maps',
  lootItems: 'lootItems',
  baselineItems: 'baselineItems',
  baselineTotal: 'baselineTotal',
  manualLootItems: 'manualLootItems',
  manualStatistics: 'manualStatistics',
  settings: 'settings',
  sessionNotes: 'notes',
  investmentNeutralization: 'investmentNeutralization',
  investmentDismissed: 'investmentDismissed',
  strategySourceContext: 'strategySourceContext',
} as const satisfies Record<SessionPayloadKey, string>;

export type PortableSessionPayloadKey =
  typeof SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY[SessionPayloadKey];
export type PortableSessionPayloadFields = { [Key in PortableSessionPayloadKey]: JsonValue };

export function createSessionPayload(fields: SessionPayloadFields): JsonObject {
  return Object.fromEntries(SESSION_PAYLOAD_KEYS.map((key) => [key, fields[key]])) as JsonObject;
}

export function hasExactSessionPayloadKeys(value: JsonObject): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...SESSION_PAYLOAD_KEYS].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isPlainObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sessionPayloadFromPortableFields(portable: JsonObject): JsonObject {
  return createSessionPayload({
    maps: Array.isArray(portable.maps) ? portable.maps : [],
    lootItems: Array.isArray(portable.lootItems) ? portable.lootItems : [],
    baselineItems: Array.isArray(portable.baselineItems) ? portable.baselineItems : [],
    baselineTotal: typeof portable.baselineTotal === 'number' && Number.isFinite(portable.baselineTotal)
      ? portable.baselineTotal : 0,
    manualLootItems: Array.isArray(portable.manualLootItems) ? portable.manualLootItems : [],
    manualStatistics: isPlainObject(portable.manualStatistics) ? portable.manualStatistics : {},
    settings: isPlainObject(portable.settings) ? portable.settings : {},
    sessionNotes: typeof portable.notes === 'string' ? portable.notes : '',
    investmentNeutralization: typeof portable.investmentNeutralization === 'number' &&
      Number.isFinite(portable.investmentNeutralization)
      ? portable.investmentNeutralization : 0,
    investmentDismissed: portable.investmentDismissed === true,
    strategySourceContext: isPlainObject(portable.strategySourceContext)
      ? portable.strategySourceContext : null,
  });
}

export function portableFieldsFromSessionPayload(payload: JsonObject): PortableSessionPayloadFields {
  return {
    maps: Array.isArray(payload.maps) ? payload.maps : [],
    lootItems: Array.isArray(payload.lootItems) ? payload.lootItems : [],
    baselineItems: Array.isArray(payload.baselineItems) ? payload.baselineItems : [],
    baselineTotal: typeof payload.baselineTotal === 'number' && Number.isFinite(payload.baselineTotal)
      ? payload.baselineTotal : 0,
    manualLootItems: Array.isArray(payload.manualLootItems) ? payload.manualLootItems : [],
    manualStatistics: isPlainObject(payload.manualStatistics) ? payload.manualStatistics : {},
    settings: isPlainObject(payload.settings) ? payload.settings : {},
    notes: typeof payload.sessionNotes === 'string' ? payload.sessionNotes : '',
    investmentNeutralization: typeof payload.investmentNeutralization === 'number' &&
      Number.isFinite(payload.investmentNeutralization)
      ? payload.investmentNeutralization : 0,
    investmentDismissed: payload.investmentDismissed === true,
    strategySourceContext: isPlainObject(payload.strategySourceContext)
      ? payload.strategySourceContext : null,
  };
}
