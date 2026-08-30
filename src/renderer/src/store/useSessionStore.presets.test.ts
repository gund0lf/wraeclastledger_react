/**
 * useSessionStore.presets.test.ts — named exclusion presets (session 18)
 * + the default-exclusion-preset actions.
 *
 * Covers:
 *  - saveExclusionPreset stores a SANITIZED copy of the current session
 *    exclusions (quotes/leading-! stripped; terms with " ( * dropped)
 *  - saved terms are an independent copy (later settings edits don't leak in)
 *  - loadExclusionPreset replaces settings.regexExclusions with a copy of the
 *    preset's terms (and mutating settings afterwards leaves the preset intact)
 *  - loadExclusionPreset with an unknown id is a no-op
 *  - deleteExclusionPreset removes exactly that preset
 *  - setDefaultPreset copies current exclusions; clearDefaultPreset empties;
 *    setLoadedStrategyInfo applies the default to the session on strategy load
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore, DEFAULT_SETTINGS } from './useSessionStore';

/** Reset the slices these tests touch to a clean baseline. */
const resetStore = (): void => {
  useSessionStore.setState({
    settings: { ...DEFAULT_SETTINGS, regexExclusions: [], regexInclusions: [] },
    exclusionPresets: [],
    defaultExclusionPreset: [],
    defaultInclusionPreset: [],
    activeSessionId: null,
    activeSessionName: null,
    loadedStrategyInfo: null,
  });
};

const setExclusions = (terms: string[]): void => {
  useSessionStore.setState((s) => ({
    settings: { ...s.settings, regexExclusions: terms },
  }));
};

const setInclusions = (terms: string[]): void => {
  useSessionStore.setState((s) => ({
    settings: { ...s.settings, regexInclusions: terms },
  }));
};

const state = () => useSessionStore.getState();

describe('named exclusion presets', () => {
  beforeEach(resetStore);

  it('saveExclusionPreset stores a named, sanitized copy of the current exclusions', () => {
    setExclusions(['"deto"', '!burn', ' refl ', 'bad(term', 'wild*card', '']);
    state().saveExclusionPreset('rotation A');

    const presets = state().exclusionPresets;
    expect(presets).toHaveLength(1);
    expect(presets[0].name).toBe('rotation A');
    expect(presets[0].id).toBeTruthy();
    // quotes and leading ! stripped, whitespace trimmed, junk terms dropped
    expect(presets[0].terms).toEqual(['deto', 'burn', 'refl']);
  });

  it('stores a complete literal regex without mixing it into structured exclusions', () => {
    state().saveExclusionPreset('trade buy', '"!reg" "ack.*([4-9].|\\d..)%"');
    const preset = state().exclusionPresets[0];
    expect(preset).toMatchObject({
      name: 'trade buy',
      kind: 'literal',
      terms: [],
      literalRegex: '"!reg" "ack.*([4-9].|\\d..)%"',
    });
    state().loadExclusionPreset(preset.id);
    expect(state().settings.regexExclusions).toEqual([]);
  });

  it('can rename and explicitly replace a literal preset with current structured terms', () => {
    state().saveExclusionPreset('old', '"literal"');
    const id = state().exclusionPresets[0].id;
    setExclusions(['reg']);
    state().updateExclusionPreset(id, 'structured');
    expect(state().exclusionPresets[0]).toMatchObject({
      id,
      name: 'structured',
      kind: 'structured',
      terms: ['reg'],
    });
    expect(state().exclusionPresets[0].literalRegex).toBeUndefined();
  });

  it('saved terms are a copy — later settings edits do not leak into the preset', () => {
    setExclusions(['deto']);
    state().saveExclusionPreset('frozen');
    setExclusions(['deto', 'burn']);
    expect(state().exclusionPresets[0].terms).toEqual(['deto']);
  });

  it('loadExclusionPreset replaces session exclusions with a copy of the preset', () => {
    setExclusions(['deto', 'burn']);
    setInclusions(['brick:increased_rare_monsters']);
    state().saveExclusionPreset('rotation A');
    const id = state().exclusionPresets[0].id;

    setExclusions(['something-else']);
    setInclusions([]);
    state().loadExclusionPreset(id);
    expect(state().settings.regexExclusions).toEqual(['deto', 'burn']);
    expect(state().settings.regexInclusions).toEqual(['brick:increased_rare_monsters']);
    expect(state().exclusionPresets[0].inclusions).toEqual(['brick:increased_rare_monsters']);

    // mutating the session afterwards must not mutate the stored preset
    setExclusions([...state().settings.regexExclusions, 'extra']);
    expect(state().exclusionPresets[0].terms).toEqual(['deto', 'burn']);
  });

  it('loadExclusionPreset with an unknown id is a no-op', () => {
    setExclusions(['deto']);
    state().loadExclusionPreset('does-not-exist');
    expect(state().settings.regexExclusions).toEqual(['deto']);
  });

  it('deleteExclusionPreset removes exactly the targeted preset', () => {
    setExclusions(['a']);
    state().saveExclusionPreset('one');
    setExclusions(['b']);
    state().saveExclusionPreset('two');
    const [p1, p2] = state().exclusionPresets;

    state().deleteExclusionPreset(p1.id);
    expect(state().exclusionPresets).toHaveLength(1);
    expect(state().exclusionPresets[0].id).toBe(p2.id);
    expect(state().exclusionPresets[0].terms).toEqual(['b']);
  });
});

describe('default exclusion preset', () => {
  beforeEach(resetStore);

  it('applies the default preset to a new session before any maps exist', () => {
    setExclusions(['deto', 'burn']);
    setInclusions(['brick:increased_magic_monsters']);
    state().setDefaultPreset();
    setExclusions(['unrelated']);
    setInclusions([]);

    state().newSession();

    expect(state().maps).toEqual([]);
    expect(state().settings.regexExclusions).toEqual(['deto', 'burn']);
    expect(state().settings.regexInclusions).toEqual(['brick:increased_magic_monsters']);

    setExclusions([...state().settings.regexExclusions, 'extra']);
    expect(state().defaultExclusionPreset).toEqual(['deto', 'burn']);
  });

  it('setDefaultPreset copies the current exclusions; clearDefaultPreset empties it', () => {
    setExclusions(['deto', 'burn']);
    setInclusions(['brick:uber_rare_monsters_fracture_on_death']);
    state().setDefaultPreset();
    expect(state().defaultExclusionPreset).toEqual(['deto', 'burn']);
    expect(state().defaultInclusionPreset).toEqual(['brick:uber_rare_monsters_fracture_on_death']);

    // it is a copy, not a reference
    setExclusions(['deto', 'burn', 'extra']);
    expect(state().defaultExclusionPreset).toEqual(['deto', 'burn']);

    state().clearDefaultPreset();
    expect(state().defaultExclusionPreset).toEqual([]);
    expect(state().defaultInclusionPreset).toEqual([]);
  });

  it('allows only a structured named preset to become the default', () => {
    state().saveExclusionPreset('literal', '"literal"');
    setExclusions(['reg']);
    state().saveExclusionPreset('structured');
    const [literal, structured] = state().exclusionPresets;
    state().setExclusionPresetDefault(literal.id);
    expect(state().defaultExclusionPreset).toEqual([]);
    state().setExclusionPresetDefault(structured.id);
    expect(state().defaultExclusionPreset).toEqual(['reg']);
  });

  it('setLoadedStrategyInfo applies the default preset to the session exclusions', () => {
    setExclusions(['deto']);
    setInclusions(['brick:increased_rare_monsters']);
    state().setDefaultPreset();
    setExclusions(['unrelated']);
    setInclusions([]);

    state().setLoadedStrategyInfo({
      authorName: 'tester', mapCount: 10,
      avgQuant: 0, avgRarity: 0, avgPack: 0, avgCurr: 0,
      runRegex: 'quan',
    } as any);

    expect(state().settings.regexExclusions).toEqual(['deto']);
    expect(state().settings.regexInclusions).toEqual(['brick:increased_rare_monsters']);
    // clearing the loaded strategy (null) leaves settings untouched
    state().setLoadedStrategyInfo(null);
    expect(state().settings.regexExclusions).toEqual(['deto']);
  });
});
