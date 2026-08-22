import type { SessionState } from './useSessionStore';

export type FieldOwnershipBucket =
  | 'session-payload'
  | 'user-preference-cache'
  | 'bootstrap-workflow'
  | 'runtime-derived'
  | 'legacy-migration';

type FunctionKey<T> = {
  [K in keyof T]-?: T[K] extends (...args: infer _Args) => infer _Return ? K : never;
}[keyof T];

export type SessionStateDataKey = Exclude<keyof SessionState, FunctionKey<SessionState>>;

/**
 * Phase 0 characterization gate. Every current non-function SessionState key
 * must belong to exactly one ownership bucket before storage extraction starts.
 */
export const FIELD_OWNERSHIP = {
  maps: 'session-payload',
  lootItems: 'session-payload',
  baselineItems: 'session-payload',
  baselineTotal: 'session-payload',
  manualLootItems: 'session-payload',
  manualStatistics: 'session-payload',
  settings: 'session-payload',
  sessionNotes: 'session-payload',
  investmentNeutralization: 'session-payload',
  investmentDismissed: 'session-payload',
  loadedStrategyInfo: 'session-payload',

  discordTag: 'user-preference-cache',
  regexSets: 'user-preference-cache',
  leagueOverride: 'user-preference-cache',
  atlasBonusByLeague: 'user-preference-cache',
  retrospectiveCloseouts: 'user-preference-cache',
  regexBuilderGroups: 'user-preference-cache',
  scarabPresets: 'user-preference-cache',
  onboardingDismissed: 'user-preference-cache',
  defaultExclusionPreset: 'user-preference-cache',
  exclusionPresets: 'user-preference-cache',
  divinePriceFetchedAt: 'user-preference-cache',

  pendingAtlasBonusSeed: 'bootstrap-workflow',
  pendingAtlasBonusValue: 'bootstrap-workflow',
  activeSessionId: 'bootstrap-workflow',

  isWatching: 'runtime-derived',
  activeSessionName: 'runtime-derived',
  sessionNonce: 'runtime-derived',

  savedSessions: 'legacy-migration',
} as const satisfies Record<SessionStateDataKey, FieldOwnershipBucket>;
