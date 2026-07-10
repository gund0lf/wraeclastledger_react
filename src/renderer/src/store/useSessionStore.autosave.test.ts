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

const mapFixture = (): Omit<MapData, 'id'> => ({
  name: 'Crimson Temple Map', tier: 16, quantity: 92, rarity: 55, packSize: 31,
  moreCurrency: 0, moreMaps: 0, moreScarabs: 0, modCount: 6,
  isCorrupted: false, isNightmare: false, isOriginator: false, isEmpoweredMirage: false,
} as unknown as Omit<MapData, 'id'>);

/** Reset store to a clean baseline between tests. */
const resetStore = (): void => {
  // Clear any timer left over from a previous test before wiping state.
  flushActiveSessionAutoSave();
  useSessionStore.setState({
    maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
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

  it('persists settings and notes edits', () => {
    const id = saveActive('A');
    useSessionStore.getState().updateSetting('baseMapCost', 12);
    useSessionStore.getState().setSessionNotes('juiced deli');
    vi.advanceTimersByTime(DEBOUNCE);
    const saved = useSessionStore.getState().savedSessions[id];
    expect(saved.settings.baseMapCost).toBe(12);
    expect(saved.notes).toBe('juiced deli');
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
