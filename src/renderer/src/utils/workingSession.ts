import type { LootItem, ManualSessionStatistics, MapData, SessionSettings } from '../types';
import { hasManualStatistics } from './manualStatistics';

export interface WorkingSessionCandidate {
  activeSessionId: string | null;
  maps: MapData[];
  lootItems: LootItem[];
  baselineItems: LootItem[];
  baselineTotal: number;
  manualStatistics: ManualSessionStatistics;
  sessionNotes: string;
  investmentNeutralization: number;
  investmentDismissed: boolean;
  loadedStrategyInfo: unknown | null;
  settings: SessionSettings;
}

const AUTO_MANAGED_SETTINGS = new Set<keyof SessionSettings>([
  'divinePrice',
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

/**
 * Does the unnamed working session contain state that a replacement would lose?
 * Named sessions are auto-saved and therefore never need this confirmation.
 */
export function isWorkingSessionMeaningful(
  state: WorkingSessionCandidate,
  defaults: SessionSettings,
): boolean {
  if (state.activeSessionId !== null) return false;
  if (state.maps.length > 0 || state.lootItems.length > 0 || state.baselineItems.length > 0) return true;
  if (state.baselineTotal !== 0 || state.sessionNotes.trim() !== '') return true;
  if (hasManualStatistics(state.manualStatistics)) return true;
  if (state.investmentNeutralization !== 0 || state.investmentDismissed) return true;
  if (state.loadedStrategyInfo !== null) return true;
  if ((state.settings.atlasPoints ?? 0) > 0) return true;

  const settingKeys = new Set([
    ...Object.keys(defaults),
    ...Object.keys(state.settings),
  ] as (keyof SessionSettings)[]);
  for (const key of settingKeys) {
    if (AUTO_MANAGED_SETTINGS.has(key)) continue;
    if (!valuesEqual(state.settings[key], defaults[key])) return true;
  }
  return false;
}
