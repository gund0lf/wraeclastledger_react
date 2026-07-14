/**
 * useSessionStore.updateTarget.test.ts — strategy-versioning client half:
 * the REQUIRED 4-case persistence matrix for updateTargetStrategyId
 * (design v3.1 §2, round-2 point 3):
 *   (a) update session → save → load → target survives
 *   (b) a genuinely new session has NO target
 *   (c) "share as new" clears the target (no later silent updates)
 *   (d) importing someone else's export never adopts its marker
 *
 * The field lives in SessionSettings on purpose: save/load snapshot it,
 * newSession resets it, and no import path writes it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSessionStore, DEFAULT_SETTINGS } from './useSessionStore';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { buildDiscordExport } from '../utils/discordExport';
import { setLeagueOverrideValue, clearLeagueCache } from '../utils/league';

const UUID = 'be00f19f-b74c-4c4f-9a1c-ee54d2ffaabc';

const resetStore = (): void => {
  useSessionStore.setState({
    maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
    settings: { ...DEFAULT_SETTINGS },
    savedSessions: {}, activeSessionId: null, activeSessionName: null,
    sessionNotes: '',
  });
};

const setTarget = (): void => {
  useSessionStore.getState().updateSetting('updateTargetStrategyId', UUID);
  useSessionStore.getState().updateSetting('updateTargetStrategyName', 'Testytest');
};

describe('updateTargetStrategyId persistence matrix', () => {
  beforeEach(resetStore);

  it('(a) survives save -> switch away -> load', () => {
    setTarget();
    useSessionStore.getState().saveAsNewSession('update run');
    const id = useSessionStore.getState().activeSessionId!;
    expect(id).toBeTruthy();

    // Switch away (new session wipes the live settings)…
    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBeNull();

    // …and load restores the target with the session.
    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBe(UUID);
    expect(useSessionStore.getState().settings.updateTargetStrategyName).toBe('Testytest');
  });

  it('(a2) loading a PRE-VERSIONING saved session fills null, not undefined', () => {
    setTarget();
    useSessionStore.getState().saveAsNewSession('legacy');
    const id = useSessionStore.getState().activeSessionId!;
    // Simulate a session saved by an older build: the keys are absent.
    const s = useSessionStore.getState().savedSessions[id];
    const legacySettings = { ...s.settings } as Record<string, unknown>;
    delete legacySettings['updateTargetStrategyId'];
    delete legacySettings['updateTargetStrategyName'];
    useSessionStore.setState({
      savedSessions: { [id]: { ...s, settings: legacySettings as unknown as typeof s.settings } },
    });
    useSessionStore.getState().loadSession(id);
    // loadSession spreads DEFAULT_SETTINGS under the saved blob -> null fill.
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBeNull();
  });

  it('(b) a genuinely new session has NO target', () => {
    setTarget();
    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBeNull();
    expect(useSessionStore.getState().settings.updateTargetStrategyName).toBeNull();
  });

  it('(c) clearing the target (share-as-new) sticks, including through save/load', () => {
    setTarget();
    useSessionStore.getState().updateSetting('updateTargetStrategyId', null);
    useSessionStore.getState().updateSetting('updateTargetStrategyName', null);
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBeNull();

    useSessionStore.getState().saveAsNewSession('shared as new');
    const id = useSessionStore.getState().activeSessionId!;
    useSessionStore.getState().newSession();
    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBeNull();
  });

  it('(d) an imported export exposes the marker for provenance but the store never adopts it', () => {
    // Someone ELSE's update export lands in Import Strategy.
    const exported = buildDiscordExport({
      maps: [{ quantity: 80, rarity: 60, packSize: 40, moreCurrency: 100, moreScarabs: 0 }],
      settings: { ...DEFAULT_SETTINGS, divinePrice: 300 },
      lootItems: [], baselineTotal: 0, investmentNeutralization: 0,
      stratName: 'Not mine', updateStrategyId: UUID,
    });
    const parsed = parseDiscordExport(exported);
    expect(parsed).not.toBeNull();
    expect(parsed!.updateStrategyId).toBe(UUID); // provenance IS exposed…

    // …but the load-from-import path only writes chisel/scarabs/atlas/deli/astro
    // (StrategyBrowserModule.handleLoadFromImport). Store-level truth: nothing
    // in the DiscordImport application path touches updateTargetStrategyId.
    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().settings.updateTargetStrategyId).toBeNull();
  });
});

describe('Atlas Bonus per-league model', () => {
  const st = () => useSessionStore.getState();
  beforeEach(() => {
    resetStore();
    useSessionStore.setState({ atlasBonusByLeague: {}, pendingAtlasBonusSeed: false, pendingAtlasBonusValue: null, activeSessionId: null });
    setLeagueOverrideValue(null);
    clearLeagueCache();
  });
  afterEach(() => { setLeagueOverrideValue(null); clearLeagueCache(); });

  it('records per-league progress for a live session under a KNOWN league', () => {
    setLeagueOverrideValue('LeagueA'); // currentLeagueSync() -> 'LeagueA'
    st().setAtlasBonus(true);
    expect(st().settings.atlasBonus).toBe(true);
    expect(st().atlasBonusByLeague['LeagueA']).toBe(true);
  });

  it('a new live session seeds atlasBonus from the ACTIVE league (default false when absent)', () => {
    setLeagueOverrideValue('LeagueA');
    useSessionStore.setState({ atlasBonusByLeague: { LeagueA: true } });
    st().newSession();
    expect(st().settings.atlasBonus).toBe(true);
    expect(st().pendingAtlasBonusSeed).toBe(false);

    setLeagueOverrideValue('LeagueB'); // no entry for B
    st().newSession();
    expect(st().settings.atlasBonus).toBe(false);
  });

  it('A on -> new session in B is off -> back to A restores on (acceptance case)', () => {
    setLeagueOverrideValue('LeagueA');
    st().setAtlasBonus(true);
    setLeagueOverrideValue('LeagueB');
    st().newSession();
    expect(st().settings.atlasBonus).toBe(false);
    setLeagueOverrideValue('LeagueA');
    st().newSession();
    expect(st().settings.atlasBonus).toBe(true);
  });

  it('a deliberate off/dismiss records false (present, not absent) so the nudge stays silent', () => {
    setLeagueOverrideValue('LeagueA');
    st().setAtlasBonus(false);
    expect(st().atlasBonusByLeague['LeagueA']).toBe(false);
  });

  it('unknown active league: new session is off + pending; a control HOLDS the choice, writes NO map entry yet', () => {
    // no override, cache cleared -> confirmedLeagueSync() === null
    st().newSession();
    expect(st().settings.atlasBonus).toBe(false);
    expect(st().pendingAtlasBonusSeed).toBe(true);
    expect(st().pendingAtlasBonusValue).toBeNull();
    st().setAtlasBonus(true); // user acts before league known
    expect(st().settings.atlasBonus).toBe(true);       // session value set…
    expect(Object.keys(st().atlasBonusByLeague)).toHaveLength(0); // …but no premature map write
    expect(st().pendingAtlasBonusSeed).toBe(false);    // auto-seed cancelled (user chose)
    expect(st().pendingAtlasBonusValue).toBe(true);    // …and the choice is HELD to persist on confirmation
  });

  it('a LOADED historical session never defines the current league’s progress', () => {
    setLeagueOverrideValue('LeagueA');
    useSessionStore.setState({ activeSessionId: 'saved-id' }); // simulate a loaded session
    st().setAtlasBonus(true);
    expect(st().settings.atlasBonus).toBe(true);              // its own snapshot may change
    expect(st().atlasBonusByLeague['LeagueA']).toBeUndefined(); // map untouched
  });

  it('loadSession clears a pending seed (loaded sessions keep their own snapshot)', () => {
    setLeagueOverrideValue('LeagueA');
    st().saveAsNewSession('s');
    const id = st().activeSessionId!;
    useSessionStore.setState({ pendingAtlasBonusSeed: true, activeSessionId: null });
    st().loadSession(id);
    expect(st().pendingAtlasBonusSeed).toBe(false);
  });
});
