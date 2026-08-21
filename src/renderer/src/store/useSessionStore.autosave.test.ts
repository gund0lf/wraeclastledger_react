/**
 * useSessionStore.autosave.test.ts — WP10: auto-save the active session.
 *
 * Covers:
 *  - edits while a saved session is active persist into savedSessions[id]
 *    after the debounce window (maps / settings / notes)
 *  - burst of edits collapses into one debounced write window
 *  - edits on an UNSAVED session (activeSessionId null) never write
 *  - loadSession itself does not schedule an auto-save (load != edit)
 *  - pending edits are flushed into the OLD session when switching via
 *    loadSession / newSession (no silent loss inside the debounce window)
 *  - flushActiveSessionAutoSave is a no-op when nothing is dirty
 *
 * The auto-save subscriber is registered at module import; fake timers are
 * installed per-test before any edit so the debounce is controllable.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSessionStore, flushActiveSessionAutoSave, DEFAULT_SETTINGS } from './useSessionStore';
import type { MapData } from '../types';

const DEBOUNCE = 800;

const mapFixture = (over: Partial<Omit<MapData, 'id'>> = {}): Omit<MapData, 'id'> => ({
  name: 'Crimson Temple Map', tier: 16, quantity: 92, rarity: 55, packSize: 31,
  moreCurrency: 0, moreMaps: 0, moreScarabs: 0, modCount: 6,
  isCorrupted: false, isNightmare: false, isOriginator: false, isEmpoweredMirage: false,
  ...over,
} as unknown as Omit<MapData, 'id'>);

/** Reset store to a clean baseline between tests. */
const resetStore = (): void => {
  // Clear any timer left over from a previous test before wiping state.
  flushActiveSessionAutoSave();
  useSessionStore.setState({
    maps: [], lootItems: [], baselineItems: [], baselineTotal: 0, manualStatistics: {},
    settings: { ...DEFAULT_SETTINGS },
    savedSessions: {}, activeSessionId: null, activeSessionName: null,
    sessionNotes: '', investmentNeutralization: 0, investmentDismissed: false,
  });
};

/** Save the current state as a session named `name`, return its id. */
const saveActive = (name: string): string => {
  useSessionStore.getState().saveAsNewSession(name);
  return useSessionStore.getState().activeSessionId as string;
};

describe('WP10 auto-save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists an added map into the active saved session after the debounce', () => {
    const id = saveActive('A');
    useSessionStore.getState().addMap(mapFixture());
    expect(useSessionStore.getState().savedSessions[id].maps).toHaveLength(0); // not yet
    vi.advanceTimersByTime(DEBOUNCE);
    expect(useSessionStore.getState().savedSessions[id].maps).toHaveLength(1);
  });

  it('keeps ordered Delirium metadata while stripping raw clipboard text', () => {
    const id = saveActive('Deli');
    useSessionStore.getState().addMap(mapFixture({
      deliriousPct: 100,
      deliriumRewardTypes: ['Jewellery', 'Jewellery', 'Armour', 'Armour', 'Currency'],
      rawText: 'Players in Area are 100% Delirious (enchant)',
    }));
    vi.advanceTimersByTime(DEBOUNCE);

    const savedMap = useSessionStore.getState().savedSessions[id].maps[0];
    expect(savedMap.rawText).toBeUndefined();
    expect(savedMap.deliriousPct).toBe(100);
    expect(savedMap.deliriumRewardTypes).toEqual([
      'Jewellery', 'Jewellery', 'Armour', 'Armour', 'Currency',
    ]);

    useSessionStore.getState().newSession();
    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().maps[0].deliriumRewardTypes).toEqual([
      'Jewellery', 'Jewellery', 'Armour', 'Armour', 'Currency',
    ]);
  });

  it('persists settings and notes edits', () => {
    const id = saveActive('A');
    useSessionStore.getState().updateSetting('baseMapCost', 12);
    useSessionStore.getState().setSessionNotes('juiced deli');
    vi.advanceTimersByTime(DEBOUNCE);
    const saved = useSessionStore.getState().savedSessions[id];
    expect(saved.settings.baseMapCost).toBe(12);
    expect(saved.notes).toBe('juiced deli');
  });

  it('auto-saves and restores manual statistics without bleeding into a new session', () => {
    const id = saveActive('A');
    useSessionStore.getState().setManualStatistic('starfallCraters', 0);
    useSessionStore.getState().setManualStatistic('svalinnDrops', 1);
    useSessionStore.getState().setRunStatisticsInfoDismissed(true);
    useSessionStore.getState().setBeastStatisticsInfoDismissed(true);
    useSessionStore.getState().addManualAtlasAnomalyCount('The Manor Foyer', 3);
    useSessionStore.getState().addManualMercenaryCount('Kineticist', 2);
    vi.advanceTimersByTime(DEBOUNCE);

    expect(useSessionStore.getState().savedSessions[id].manualStatistics).toEqual({
      infoDismissed: true,
      beastInfoDismissed: true,
      starfallCraters: 0,
      svalinnDrops: 1,
      atlasAnomalies: [{ name: 'The Manor Foyer', count: 3 }],
      mercenaries: [{ archetype: 'Kineticist', count: 2 }],
    });

    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().manualStatistics).toEqual({});
    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().manualStatistics).toEqual({
      infoDismissed: true,
      beastInfoDismissed: true,
      starfallCraters: 0,
      svalinnDrops: 1,
      atlasAnomalies: [{ name: 'The Manor Foyer', count: 3 }],
      mercenaries: [{ archetype: 'Kineticist', count: 2 }],
    });

    useSessionStore.getState().clearManualStatistics();
    expect(useSessionStore.getState().manualStatistics).toEqual({
      infoDismissed: true,
      beastInfoDismissed: true,
    });
    vi.advanceTimersByTime(DEBOUNCE);
    expect(useSessionStore.getState().savedSessions[id].manualStatistics).toEqual({
      infoDismissed: true,
      beastInfoDismissed: true,
    });
  });

  it('snapshots Atlas-derived rate inputs and invalidates them when the tree URL changes', () => {
    useSessionStore.getState().updateSetting('bestiaryAtlasSetup', {
      additionalEinharChancePct: 104,
      additionalRedChancePct: 30,
      additionalYellowBeasts: 2,
      yellowToRedChancePct: 15,
      pairChancePct: 8,
      capturedBeastCopyChancePct: 0,
    });
    useSessionStore.getState().updateSetting('mercenaryAtlasSetup', {
      additionalEncounterChancePct: 50,
      lessStrengthAlignedChancePct: 75,
      lessDexterityAlignedChancePct: 75,
      lessIntelligenceAlignedChancePct: 75,
      increasedAzadiChancePct: 100,
      increasedKeitaChancePct: 100,
      increasedCyaxanChancePct: 100,
      increasedInfamousChancePct: 50,
    });
    const id = saveActive('Atlas setup');
    expect(useSessionStore.getState().savedSessions[id].settings.bestiaryAtlasSetup?.pairChancePct).toBe(8);

    useSessionStore.getState().newSession();
    useSessionStore.getState().updateSetting('bestiaryAtlasSetup', {
      additionalEinharChancePct: 104,
      additionalRedChancePct: 30,
      additionalYellowBeasts: 2,
      yellowToRedChancePct: 15,
      pairChancePct: 8,
      capturedBeastCopyChancePct: 0,
    });
    useSessionStore.getState().updateSetting('mercenaryAtlasSetup', {
      additionalEncounterChancePct: 50,
      lessStrengthAlignedChancePct: 75,
      lessDexterityAlignedChancePct: 75,
      lessIntelligenceAlignedChancePct: 75,
      increasedAzadiChancePct: 100,
      increasedKeitaChancePct: 100,
      increasedCyaxanChancePct: 100,
      increasedInfamousChancePct: 50,
    });
    useSessionStore.getState().updateSetting('atlasTreeUrl', 'https://pathofpathing.com/?v=changed');
    expect(useSessionStore.getState().settings.bestiaryAtlasSetup).toBeUndefined();
    expect(useSessionStore.getState().settings.mercenaryAtlasSetup).toBeUndefined();

    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().settings.bestiaryAtlasSetup?.pairChancePct).toBe(8);
    expect(useSessionStore.getState().settings.mercenaryAtlasSetup?.increasedInfamousChancePct).toBe(50);
  });

  it('a burst of edits inside the window ends with everything persisted', () => {
    const id = saveActive('A');
    for (let i = 0; i < 5; i++) {
      useSessionStore.getState().addMap(mapFixture());
      vi.advanceTimersByTime(DEBOUNCE / 2); // keeps resetting the window
    }
    vi.advanceTimersByTime(DEBOUNCE);
    expect(useSessionStore.getState().savedSessions[id].maps).toHaveLength(5);
  });

  it('does nothing on an unsaved session', () => {
    useSessionStore.getState().addMap(mapFixture());
    vi.advanceTimersByTime(DEBOUNCE * 2);
    expect(Object.keys(useSessionStore.getState().savedSessions)).toHaveLength(0);
  });

  it('loadSession itself does not schedule an auto-save', () => {
    const id = saveActive('A');
    // Make the saved copy distinguishable: mutate savedSessions directly so
    // a spurious auto-save (which would write CURRENT state) would clobber it.
    useSessionStore.setState((s) => ({
      savedSessions: { ...s.savedSessions, [id]: { ...s.savedSessions[id], notes: 'sentinel' } },
    }));
    useSessionStore.getState().newSession();
    vi.advanceTimersByTime(DEBOUNCE * 2);
    useSessionStore.getState().loadSession(id);
    vi.advanceTimersByTime(DEBOUNCE * 2);
    // load copied the sentinel INTO current state; saved copy is untouched
    expect(useSessionStore.getState().sessionNotes).toBe('sentinel');
    expect(useSessionStore.getState().savedSessions[id].notes).toBe('sentinel');
  });

  it('clears strategy preview metadata when loading a saved session', () => {
    const id = saveActive('Unrelated session');
    useSessionStore.getState().setLoadedStrategyInfo({
      authorName: 'Strategy X', mapCount: 10,
      avgQuant: 100, avgRarity: 50, avgPack: 30, avgCurr: 0,
      runRegex: 'strategy-x',
    });

    useSessionStore.getState().loadSession(id);

    // SavedSession does not currently persist this provenance. Clearing is
    // truthful; WP14 owns restoring session-scoped provenance round-trips.
    expect(useSessionStore.getState().loadedStrategyInfo).toBeNull();
  });

  it('explicitly assigns a missing saved-session league and persists it immediately', () => {
    const id = saveActive('Missing league');
    expect(useSessionStore.getState().savedSessions[id].settings.leagueName).toBe('');

    useSessionStore.getState().assignMissingSessionLeague('Allflame');

    expect(useSessionStore.getState().settings.leagueName).toBe('Allflame');
    expect(useSessionStore.getState().savedSessions[id].settings.leagueName).toBe('Allflame');
  });

  it('never reassigns existing saved-session league provenance', () => {
    useSessionStore.setState((state) => ({
      settings: { ...state.settings, leagueName: 'Mirage' },
    }));
    const id = saveActive('Mirage session');

    useSessionStore.getState().assignMissingSessionLeague('Allflame');

    expect(useSessionStore.getState().settings.leagueName).toBe('Mirage');
    expect(useSessionStore.getState().savedSessions[id].settings.leagueName).toBe('Mirage');
  });

  it('rejects invalid league provenance repair values', () => {
    const id = saveActive('Missing league');

    useSessionStore.getState().assignMissingSessionLeague('Standard');

    expect(useSessionStore.getState().settings.leagueName).toBe('');
    expect(useSessionStore.getState().savedSessions[id].settings.leagueName).toBe('');
  });

  it('flushes pending edits into the old session when loading another', () => {
    const idA = saveActive('A');
    useSessionStore.getState().newSession();
    // saveAsNewSession uses new Date().toISOString() as the id; fake timers
    // freeze Date, so advance the clock or A and B would share one id.
    vi.advanceTimersByTime(1000);
    const idB = saveActive('B');
    expect(idB).not.toBe(idA);
    useSessionStore.getState().loadSession(idA);
    useSessionStore.getState().addMap(mapFixture()); // pending, inside debounce window
    useSessionStore.getState().loadSession(idB);     // switch BEFORE debounce fires
    expect(useSessionStore.getState().savedSessions[idA].maps).toHaveLength(1); // flushed
    vi.advanceTimersByTime(DEBOUNCE * 2);
    expect(useSessionStore.getState().savedSessions[idB].maps).toHaveLength(0); // B untouched
  });

  it('flushes pending edits when starting a new session', () => {
    const id = saveActive('A');
    useSessionStore.getState().setSessionNotes('last words');
    useSessionStore.getState().newSession(); // inside debounce window
    expect(useSessionStore.getState().savedSessions[id].notes).toBe('last words');
    expect(useSessionStore.getState().activeSessionId).toBeNull();
  });

  it('flushActiveSessionAutoSave is a no-op when nothing is pending', () => {
    const id = saveActive('A');
    vi.advanceTimersByTime(DEBOUNCE * 2); // ensure no timer pending
    const before = useSessionStore.getState().savedSessions[id];
    flushActiveSessionAutoSave();
    expect(useSessionStore.getState().savedSessions[id]).toBe(before); // same object, no rewrite
  });
});

describe('WP11/C double-count correction persistence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('snapshots the correction + dismissed flag on saveAsNewSession', () => {
    useSessionStore.getState().setInvestmentNeutralization(300);
    useSessionStore.getState().setInvestmentDismissed(true);
    const id = saveActive('A');
    const saved = useSessionStore.getState().savedSessions[id];
    expect(saved.investmentNeutralization).toBe(300);
    expect(saved.investmentDismissed).toBe(true);
  });

  it('auto-saves a correction made after the session was saved', () => {
    const id = saveActive('A'); // saved with 0
    useSessionStore.getState().setInvestmentNeutralization(500);
    vi.advanceTimersByTime(DEBOUNCE);
    expect(useSessionStore.getState().savedSessions[id].investmentNeutralization).toBe(500);
  });

  it('restores on load and never bleeds across sessions', () => {
    const idA = saveActive('A');
    useSessionStore.getState().setInvestmentNeutralization(500);
    vi.advanceTimersByTime(DEBOUNCE); // persist into A

    useSessionStore.getState().newSession(); // flushes A, resets live value to 0
    expect(useSessionStore.getState().investmentNeutralization).toBe(0);
    vi.advanceTimersByTime(1000); // frozen-clock id uniqueness
    const idB = saveActive('B');
    expect(useSessionStore.getState().savedSessions[idB].investmentNeutralization).toBe(0);

    // loading B must NOT carry A's +500 (the pre-C bleed bug)
    useSessionStore.getState().loadSession(idB);
    expect(useSessionStore.getState().investmentNeutralization).toBe(0);
    // loading A restores its own correction
    useSessionStore.getState().loadSession(idA);
    expect(useSessionStore.getState().investmentNeutralization).toBe(500);
  });
});
