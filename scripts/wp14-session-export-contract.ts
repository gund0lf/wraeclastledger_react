import { isDeepStrictEqual } from 'node:util';
import type { PortableSessionPayloadFields, SessionPayloadFields } from '../src/shared/sessionPayload';
import type { JsonObject, JsonValue } from '../src/shared/sessionRecord';

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(session: JsonObject, key: string): string {
  const value = session[key];
  if (typeof value !== 'string' || !value) throw new Error(`${key} must be a non-empty string`);
  return value;
}

function requiredArray(session: JsonObject, key: string): JsonValue[] {
  const value = session[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be an array`);
  return value;
}

/** Independent verification oracle, deliberately not the production adapter.
 * Exhaustive types and parity tests prevent new session fields being ignored.
 * Preserve timer objects exactly: validation must never normalize away lost time.
 */
export function portableSession(session: JsonObject): JsonObject & PortableSessionPayloadFields {
  if (!isObject(session.settings)) throw new Error('settings must be an object');
  const fields: PortableSessionPayloadFields = {
    maps: requiredArray(session, 'maps'),
    lootItems: requiredArray(session, 'lootItems'),
    baselineItems: Array.isArray(session.baselineItems) ? session.baselineItems : [],
    baselineTotal: typeof session.baselineTotal === 'number' && Number.isFinite(session.baselineTotal)
      ? session.baselineTotal : 0,
    manualLootItems: Array.isArray(session.manualLootItems) ? session.manualLootItems : [],
    manualStatistics: isObject(session.manualStatistics) ? session.manualStatistics : {},
    manualRunTimer: isObject(session.manualRunTimer) ? session.manualRunTimer : {},
    settings: session.settings,
    notes: typeof session.notes === 'string' ? session.notes : '',
    investmentNeutralization: typeof session.investmentNeutralization === 'number' &&
      Number.isFinite(session.investmentNeutralization) ? session.investmentNeutralization : 0,
    investmentDismissed: session.investmentDismissed === true,
    strategySourceContext: isObject(session.strategySourceContext) ? session.strategySourceContext : null,
  };
  return JSON.parse(JSON.stringify({
    id: requiredString(session, 'id'),
    name: requiredString(session, 'name'),
    createdAt: requiredString(session, 'createdAt'),
    ...fields,
  })) as JsonObject & PortableSessionPayloadFields;
}

export function payloadFromPortable(session: JsonObject): JsonObject {
  const normalized = portableSession(session);
  const fields: SessionPayloadFields = {
    maps: normalized.maps,
    lootItems: normalized.lootItems,
    baselineItems: normalized.baselineItems,
    baselineTotal: normalized.baselineTotal,
    manualLootItems: normalized.manualLootItems,
    manualStatistics: normalized.manualStatistics,
    manualRunTimer: normalized.manualRunTimer,
    settings: normalized.settings,
    sessionNotes: normalized.notes,
    investmentNeutralization: normalized.investmentNeutralization,
    investmentDismissed: normalized.investmentDismissed,
    strategySourceContext: normalized.strategySourceContext,
  };
  return fields;
}

/** Report differing fields, never dump the user's complete maps/loot/notes. */
export function assertSessionFieldsEqual(actual: JsonObject, expected: JsonObject, label: string): void {
  const keys = [...new Set([...Object.keys(actual), ...Object.keys(expected)])];
  const differences = keys.filter((key) =>
    Object.hasOwn(actual, key) !== Object.hasOwn(expected, key) ||
    !isDeepStrictEqual(actual[key], expected[key]));
  if (differences.length > 0) {
    throw new Error(`${label}: session fields differ: ${differences.join(', ')}`);
  }
}
