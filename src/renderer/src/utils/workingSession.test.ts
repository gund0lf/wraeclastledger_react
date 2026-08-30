import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import {
  isWorkingPayloadMeaningful,
  isWorkingSessionMeaningful,
  resolveReselectedNewSessionIntent,
  resolveSessionSelectionIntent,
  type WorkingSessionCandidate,
} from './workingSession';
import { EMPTY_MANUAL_RUN_TIMER } from './manualRunTimer';

const candidate = (patch: Partial<WorkingSessionCandidate> = {}): WorkingSessionCandidate => ({
  activeSessionId: null,
  maps: [],
  lootItems: [],
  baselineItems: [],
  baselineTotal: 0,
  manualLootItems: [],
  manualStatistics: {},
  manualRunTimer: { ...EMPTY_MANUAL_RUN_TIMER },
  sessionNotes: '',
  investmentNeutralization: 0,
  investmentDismissed: false,
  loadedStrategyInfo: null,
  settings: { ...DEFAULT_SETTINGS, scarabs: DEFAULT_SETTINGS.scarabs.map((s) => ({ ...s })) },
  ...patch,
});

describe('isWorkingSessionMeaningful', () => {
  it('does not guard an untouched unnamed session', () => {
    expect(isWorkingSessionMeaningful(candidate(), DEFAULT_SETTINGS)).toBe(false);
  });

  it('ignores automatically managed league, price, and seeded Atlas Bonus', () => {
    const state = candidate({
      settings: {
        ...DEFAULT_SETTINGS,
        leagueName: 'Mirage',
        divinePrice: 250,
        divinePriceQuotedAt: '2026-08-23T12:00:00.000Z',
        atlasBonus: true,
      },
    });
    expect(isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)).toBe(false);
  });

  it('does not translate deselecting the current session into New Session', () => {
    expect(resolveSessionSelectionIntent(null)).toBeUndefined();
    expect(resolveSessionSelectionIntent('__new__')).toBe('__new__');
    expect(resolveSessionSelectionIntent('session-1')).toBe('session-1');
  });

  it('recognises an explicit click on the already-selected New Session row', () => {
    expect(resolveReselectedNewSessionIntent('__new__', '__new__')).toBe('__new__');
    expect(resolveReselectedNewSessionIntent('session-1', '__new__')).toBeUndefined();
    expect(resolveReselectedNewSessionIntent('__new__', 'session-1')).toBeUndefined();
  });

  it('ignores metadata written automatically by an untouched Atlas Tree webview', () => {
    const state = candidate({
      settings: {
        ...DEFAULT_SETTINGS,
        atlasTreeUrl: 'https://pathofpathing.com/?v=3.28.0-atlas-league#',
        atlasPoints: 0,
        atlasPointsMax: 138,
        atlasDetectedTags: ['scarabs'],
      },
    });
    expect(isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)).toBe(false);
  });

  it('ignores the user preference seeded into a fresh sessions regex exclusions', () => {
    const state = candidate({
      settings: { ...DEFAULT_SETTINGS, regexExclusions: ['reflect', 'no regen'] },
      defaultExclusionPreset: ['reflect', 'no regen'],
    });
    expect(isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)).toBe(false);
  });

  it('guards an Atlas Tree with allocated points', () => {
    const state = candidate({
      settings: { ...DEFAULT_SETTINGS, atlasPoints: 1, atlasPointsMax: 138 },
    });
    expect(isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)).toBe(true);
  });

  it.each([
    ['maps', { maps: [{ id: 'map-1' }] }],
    ['loot', { lootItems: [{ id: 'loot-1' }] }],
    ['baseline items', { baselineItems: [{ id: 'baseline-1' }] }],
    ['baseline total', { baselineTotal: 100 }],
    ['manual loot', { manualLootItems: [{ id: 'manual-1' }] }],
    ['notes', { sessionNotes: 'keep this' }],
    ['strategy preview', { loadedStrategyInfo: { authorName: 'Sad' } }],
    ['investment correction', { investmentNeutralization: 10 }],
    ['manual statistics', { manualStatistics: { starfallCraters: 0 } }],
    ['manual timer', { manualRunTimer: { ...EMPTY_MANUAL_RUN_TIMER, accumulatedMs: 1 } }],
    ['dismissed investment warning', { investmentDismissed: true }],
  ])('guards meaningful %s work', (_label, patch) => {
    expect(isWorkingSessionMeaningful(candidate(patch as Partial<WorkingSessionCandidate>), DEFAULT_SETTINGS)).toBe(true);
  });

  it.each([
    ['map setup', { mapType: '8-mod' as const }],
    ['atlas calculation', { fragmentsUsed: 2 }],
    ['investment', { baseMapCost: 20 }],
    ['regex exclusions', { regexExclusions: ['reflect'] }],
    ['regex inclusions', { regexInclusions: ['brick:increased_rare_monsters'] }],
    ['strategy update target', { updateTargetStrategyId: 'strategy-1' }],
  ])('guards changed %s settings even without maps', (_label, settingsPatch) => {
    expect(isWorkingSessionMeaningful(candidate({
      settings: { ...DEFAULT_SETTINGS, ...settingsPatch },
    }), DEFAULT_SETTINGS)).toBe(true);
  });

  it('guards a future/defaultless setting instead of silently ignoring it', () => {
    const state = candidate({
      settings: {
        ...DEFAULT_SETTINGS,
        futureUserSetting: 'keep-me',
      } as SessionSettings,
    });
    expect(isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)).toBe(true);
  });

  it('does not guard a named auto-saved session', () => {
    expect(isWorkingSessionMeaningful(candidate({
      activeSessionId: 'saved-1',
      sessionNotes: 'already auto-saved',
    }), DEFAULT_SETTINGS)).toBe(false);
  });
});

describe('isWorkingPayloadMeaningful', () => {
  it('recognises an older unmarked empty payload after automatic metadata writes', () => {
    expect(isWorkingPayloadMeaningful({
      maps: [],
      lootItems: [],
      baselineItems: [],
      baselineTotal: 0,
      manualLootItems: [],
      manualStatistics: {},
      manualRunTimer: {},
      settings: {
        ...DEFAULT_SETTINGS,
        leagueName: 'Allflame',
        divinePrice: 208,
        divinePriceQuotedAt: '2026-08-23T13:16:00.000Z',
        regexExclusions: ['reflect'],
        regexInclusions: ['brick:increased_rare_monsters'],
        atlasTreeUrl: 'https://pathofpathing.com/?v=3.28.0-atlas-league#',
        atlasPoints: 0,
        atlasPointsMax: 138,
      },
      sessionNotes: '',
      investmentNeutralization: 0,
      investmentDismissed: false,
      strategySourceContext: null,
    }, DEFAULT_SETTINGS, ['reflect'], ['brick:increased_rare_monsters'])).toBe(false);
  });

  it('fails safe for meaningful, unknown, or malformed payload data', () => {
    expect(isWorkingPayloadMeaningful({ maps: [{ id: 'keep-me' }] }, DEFAULT_SETTINGS)).toBe(true);
    expect(isWorkingPayloadMeaningful({ futureAuthoredField: 'keep-me' }, DEFAULT_SETTINGS)).toBe(true);
    expect(isWorkingPayloadMeaningful({ maps: 'not-an-array' }, DEFAULT_SETTINGS)).toBe(true);
    expect(isWorkingPayloadMeaningful({
      settings: { ...DEFAULT_SETTINGS, divinePrice: 'not-a-number' },
    }, DEFAULT_SETTINGS)).toBe(true);
    expect(isWorkingPayloadMeaningful({
      manualStatistics: { futureStatistic: 1 },
    }, DEFAULT_SETTINGS)).toBe(true);
    expect(isWorkingPayloadMeaningful({ manualRunTimer: 'not-an-object' }, DEFAULT_SETTINGS)).toBe(true);
  });
});
