/**
 * useSessionStore.migrate.test.ts — WP2: locks migrateState behavior.
 *
 * Covers:
 *  - v15 -> v16: discordTag + regexSets lifted from settings to top-level;
 *    stored rollingCostPerMap dropped (from current settings AND saved sessions)
 *  - v13 -> v14: mirageBonus -> atlasBonus rename carries the value (previously untested)
 *  - regexExclusions / defaultExclusionPreset sanitization (previously untested)
 *  - v14 -> v15: investmentNeutralization === -1 sentinel -> investmentDismissed
 *  - defaults fill for missing keys, legacy astrolabe key removal
 *
 * NOTE: importing the store module in the node test env triggers zustand
 * persist without localStorage — zustand handles that gracefully (warns,
 * no-op storage), so only migrateState/DEFAULT_SETTINGS are exercised here.
 */
import { describe, it, expect } from 'vitest';
import { migrateState, DEFAULT_SETTINGS, mergePersistedSessionState } from './useSessionStore';

/** Minimal persisted-state factory. Fields mimic real localStorage payloads. */
const persisted = (over: Record<string, any> = {}): Record<string, any> => ({
  settings: { ...DEFAULT_SETTINGS },
  savedSessions: {},
  ...over,
});

describe('runtime-only state hydration', () => {
  it('always starts clipboard capture paused even when persisted active', () => {
    const current = { isWatching: false, maps: [] } as unknown as Parameters<typeof mergePersistedSessionState>[1];
    const merged = mergePersistedSessionState({ isWatching: true, maps: [{ id: 'saved' }] }, current);
    expect(merged.isWatching).toBe(false);
    expect(merged.maps).toEqual([{ id: 'saved' }]);
  });
});

describe('migrateState — v15 -> v16 lift (discordTag / regexSets / rollingCostPerMap)', () => {
  const regexSet = { id: 'rs1', label: 'My run', type: 'run', lines: ['"!vola" "urr.*1.."'] };

  it('lifts settings.discordTag and settings.regexSets to top-level and removes the settings keys', () => {
    const out = migrateState(persisted({
      settings: { ...DEFAULT_SETTINGS, discordTag: 'sad', regexSets: [regexSet], rollingCostPerMap: 2120 },
    }));
    expect(out.discordTag).toBe('sad');
    expect(out.regexSets).toEqual([regexSet]);
    expect(out.settings).not.toHaveProperty('discordTag');
    expect(out.settings).not.toHaveProperty('regexSets');
    expect(out.settings).not.toHaveProperty('rollingCostPerMap');
  });

  it('does not overwrite an already-lifted top-level value (idempotent re-run)', () => {
    const out = migrateState(persisted({
      discordTag: 'current-tag',
      regexSets: [regexSet],
      settings: { ...DEFAULT_SETTINGS, discordTag: 'stale-old-tag', regexSets: [] },
    }));
    expect(out.discordTag).toBe('current-tag');
    expect(out.regexSets).toEqual([regexSet]);
  });

  it('falls back to defaults when neither level has the fields', () => {
    const out = migrateState(persisted());
    expect(out.discordTag).toBe('');
    expect(out.regexSets).toEqual([]);
  });

  it('cleans the lifted keys and rollingCostPerMap out of every saved session', () => {
    const out = migrateState(persisted({
      savedSessions: {
        s1: { id: 's1', name: 'old', settings: { ...DEFAULT_SETTINGS, discordTag: 'historical', regexSets: [regexSet], rollingCostPerMap: 999 } },
      },
    }));
    const ss = out.savedSessions.s1.settings;
    expect(ss).not.toHaveProperty('discordTag');
    expect(ss).not.toHaveProperty('regexSets');
    expect(ss).not.toHaveProperty('rollingCostPerMap');
    // Saved-session historical values must NOT leak into the lifted top-level fields
    expect(out.discordTag).toBe('');
    expect(out.regexSets).toEqual([]);
  });
});

describe('migrateState — v13 -> v14 mirageBonus -> atlasBonus carry', () => {
  it('carries mirageBonus over when atlasBonus is absent, and removes the old key', () => {
    const s: Record<string, any> = { ...DEFAULT_SETTINGS };
    delete s.atlasBonus;
    s.mirageBonus = true;
    const out = migrateState(persisted({ settings: s }));
    expect(out.settings.atlasBonus).toBe(true);
    expect(out.settings).not.toHaveProperty('mirageBonus');
  });

  it('does not let mirageBonus override an existing atlasBonus', () => {
    const out = migrateState(persisted({
      settings: { ...DEFAULT_SETTINGS, atlasBonus: false, mirageBonus: true },
    }));
    expect(out.settings.atlasBonus).toBe(false);
    expect(out.settings).not.toHaveProperty('mirageBonus');
  });

  it('applies the carry inside saved sessions too', () => {
    const ss: Record<string, any> = { ...DEFAULT_SETTINGS };
    delete ss.atlasBonus;
    ss.mirageBonus = true;
    const out = migrateState(persisted({
      savedSessions: { s1: { id: 's1', name: 'old', settings: ss } },
    }));
    expect(out.savedSessions.s1.settings.atlasBonus).toBe(true);
    expect(out.savedSessions.s1.settings).not.toHaveProperty('mirageBonus');
  });
});

describe('migrateState — exclusion sanitization', () => {
  it('strips quotes and leading ! and drops regex-fragment terms in settings.regexExclusions', () => {
    const out = migrateState(persisted({
      settings: { ...DEFAULT_SETTINGS, regexExclusions: ['vola', '"!eche"', 'bad(term', 'st*ar', ''] },
    }));
    expect(out.settings.regexExclusions).toEqual(['vola', 'eche']);
  });

  it('sanitizes defaultExclusionPreset the same way', () => {
    const out = migrateState(persisted({
      defaultExclusionPreset: ['"!nsta"', 'poss', 'brk(en'],
    }));
    expect(out.defaultExclusionPreset).toEqual(['nsta', 'poss']);
  });

  it('sanitizes saved session exclusions', () => {
    const out = migrateState(persisted({
      savedSessions: {
        s1: { id: 's1', name: 'old', settings: { ...DEFAULT_SETTINGS, regexExclusions: ['"!vola"'] } },
      },
    }));
    expect(out.savedSessions.s1.settings.regexExclusions).toEqual(['vola']);
  });
});

describe('migrateState — v14 -> v15 investment sentinel', () => {
  it('converts investmentNeutralization === -1 to 0 + investmentDismissed: true', () => {
    const out = migrateState(persisted({ investmentNeutralization: -1 }));
    expect(out.investmentNeutralization).toBe(0);
    expect(out.investmentDismissed).toBe(true);
  });

  it('defaults investmentDismissed to false when absent, keeping a real neutralization value', () => {
    const out = migrateState(persisted({ investmentNeutralization: 6448.1 }));
    expect(out.investmentNeutralization).toBeCloseTo(6448.1, 4);
    expect(out.investmentDismissed).toBe(false);
  });
});

describe('migrateState — defaults fill and legacy key removal', () => {
  it('fills missing settings keys from DEFAULT_SETTINGS (non-destructive)', () => {
    const partial: Record<string, any> = { divinePrice: 321 }; // ancient payload with almost nothing
    const out = migrateState(persisted({ settings: partial }));
    expect(out.settings.divinePrice).toBe(321);               // existing value kept
    expect(out.settings.advGemName).toBe('');                 // filled
    expect(out.settings.scarabs).toHaveLength(5);             // filled
    expect(out.settings.mapType).toBe('6-mod');               // filled
  });

  it('removes the legacy astrolabe total keys', () => {
    const out = migrateState(persisted({
      settings: { ...DEFAULT_SETTINGS, advAstrolabeTotalCost: 70, advAstrolabeTotalCount: 7 },
    }));
    expect(out.settings).not.toHaveProperty('advAstrolabeTotalCost');
    expect(out.settings).not.toHaveProperty('advAstrolabeTotalCount');
  });
});

describe('migrateState — v16 -> v17 Atlas Bonus per-league seed', () => {
  it('seeds legacy true from a LIVE unsaved session under a known league', () => {
    const out = migrateState(persisted({
      activeSessionId: null,
      settings: { ...DEFAULT_SETTINGS, atlasBonus: true, leagueName: 'Ancestors' },
    }));
    expect(out.atlasBonusByLeague).toEqual({ Ancestors: true });
  });

  it('does NOT seed from a LOADED historical session (activeSessionId set)', () => {
    const out = migrateState(persisted({
      activeSessionId: 'saved-id',
      settings: { ...DEFAULT_SETTINGS, atlasBonus: true, leagueName: 'Ancestors' },
    }));
    expect(out.atlasBonusByLeague).toEqual({});
  });

  it('leaves legacy false absent so the one-time prompt can still appear', () => {
    const out = migrateState(persisted({
      activeSessionId: null,
      settings: { ...DEFAULT_SETTINGS, atlasBonus: false, leagueName: 'Ancestors' },
    }));
    expect(out.atlasBonusByLeague).toEqual({});
  });

  it('does not seed when the active league is unknown/empty', () => {
    const out = migrateState(persisted({
      activeSessionId: null,
      settings: { ...DEFAULT_SETTINGS, atlasBonus: true, leagueName: '' },
    }));
    expect(out.atlasBonusByLeague).toEqual({});
  });

  it('is idempotent — an already-present map is left untouched', () => {
    const out = migrateState(persisted({
      activeSessionId: null,
      atlasBonusByLeague: { Mirage: false },
      settings: { ...DEFAULT_SETTINGS, atlasBonus: true, leagueName: 'Ancestors' },
    }));
    expect(out.atlasBonusByLeague).toEqual({ Mirage: false });
  });

  it('never rewrites saved sessions when seeding the current league', () => {
    const out = migrateState(persisted({
      activeSessionId: null,
      settings: { ...DEFAULT_SETTINGS, atlasBonus: true, leagueName: 'Ancestors' },
      savedSessions: { s1: { id: 's1', name: 'old', settings: { ...DEFAULT_SETTINGS, atlasBonus: false, leagueName: 'Mirage' } } },
    }));
    expect(out.atlasBonusByLeague).toEqual({ Ancestors: true });
    expect(out.savedSessions.s1.settings.atlasBonus).toBe(false);
  });
});
