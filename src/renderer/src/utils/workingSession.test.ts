import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { isWorkingSessionMeaningful, type WorkingSessionCandidate } from './workingSession';

const candidate = (patch: Partial<WorkingSessionCandidate> = {}): WorkingSessionCandidate => ({
  activeSessionId: null,
  maps: [],
  lootItems: [],
  baselineItems: [],
  baselineTotal: 0,
  manualStatistics: {},
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
      settings: { ...DEFAULT_SETTINGS, leagueName: 'Mirage', divinePrice: 250, atlasBonus: true },
    });
    expect(isWorkingSessionMeaningful(state, DEFAULT_SETTINGS)).toBe(false);
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
    ['notes', { sessionNotes: 'keep this' }],
    ['strategy preview', { loadedStrategyInfo: { authorName: 'Sad' } }],
    ['investment correction', { investmentNeutralization: 10 }],
    ['manual statistics', { manualStatistics: { starfallCraters: 0 } }],
    ['dismissed investment warning', { investmentDismissed: true }],
  ])('guards meaningful %s work', (_label, patch) => {
    expect(isWorkingSessionMeaningful(candidate(patch as Partial<WorkingSessionCandidate>), DEFAULT_SETTINGS)).toBe(true);
  });

  it.each([
    ['map setup', { mapType: '8-mod' as const }],
    ['atlas calculation', { fragmentsUsed: 2 }],
    ['investment', { baseMapCost: 20 }],
    ['regex exclusions', { regexExclusions: ['reflect'] }],
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
