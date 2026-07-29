/**
 * gameData.test.ts — manifest invariants + loader behaviour + derived views
 * (rollover Phase 1 step 2).
 *
 * The invariant tests are the rollover safety net: they lock revision metadata,
 * entity counts, lifecycle changes, aliases, picker behavior, and the legacy
 * derived shapes that must remain compatible.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { slugifyEntityId, GameEntity } from '../../../shared/gameData/types';
import {
  getGameDataStatus, getManifest, initGameData, isApplicableManifest, isValidManifest, __resetGameDataForTests,
  activeScarabNames, activeDeliriumOrbList, activeAstrolabeList, activeChiselTypes,
  mechanicStatus, isMechanicActive, entityLifecycleStatus, selectableScarabOptions,
  selectableDeliriumOrbList, selectableAstrolabeList, shouldShowMechanicInput,
  preserveHistoricalSelection,
} from './gameData';
import { SCARAB_LIST, DELIRIUM_ORB_LIST, ASTROLABE_LIST, CHISEL_TYPES, CHISEL_SELECT_DATA } from './constants';

afterEach(() => {
  vi.unstubAllGlobals();
  __resetGameDataForTests();
});

describe('bundled manifest invariants', () => {
  it('reports the bundled revision in the title-bar status before and after initialization', async () => {
    __resetGameDataForTests();
    expect(getGameDataStatus()).toMatchObject({
      revision: BUNDLED_MANIFEST.revision,
      patchVersion: BUNDLED_MANIFEST.patchVersion,
      source: 'bundled',
    });

    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: null, error: null })) },
    });
    await initGameData();
    expect(getGameDataStatus().revision).toBe(BUNDLED_MANIFEST.revision);
  });

  it('carries the revision-3 entity counts (129 scarabs / 17 deli / 11 astrolabes / 6 chisels)', () => {
    expect(BUNDLED_MANIFEST.scarabs).toHaveLength(129);
    expect(BUNDLED_MANIFEST.deliriumOrbs).toHaveLength(17);
    expect(BUNDLED_MANIFEST.astrolabes).toHaveLength(11);
    expect(BUNDLED_MANIFEST.chisels).toHaveLength(6);
  });

  it('classifies the confirmed 3.29 entity changes without deleting history', () => {
    const scarab = (name: string) => BUNDLED_MANIFEST.scarabs.find((e) => e.name === name);
    const deli = (name: string) => BUNDLED_MANIFEST.deliriumOrbs.find((e) => e.name === name);
    const astro = (name: string) => BUNDLED_MANIFEST.astrolabes.find((e) => e.name === name);

    expect(scarab('Abyss Scarab of Edifice')).toMatchObject({
      status: 'renamed', aliasOf: 'abyss-scarab-of-crystals',
    });
    expect(scarab('Abyss Scarab of Profound Depth')).toMatchObject({
      status: 'renamed', aliasOf: 'abyss-scarab-of-the-consort',
    });
    expect(scarab('Abyss Scarab of Crystals')?.status).toBe('reworked');
    expect(scarab('Abyss Scarab of the Consort')?.status).toBe('reworked');
    expect(scarab('Abyss Scarab')?.status).toBe('reworked');
    expect(scarab('Abyss Scarab of Multitudes')?.status).toBe('reworked');

    for (const name of [
      'Trarthan Scarab', 'Trarthan Scarab of Infamy', 'Trarthan Scarab of Renown',
      'Trarthan Scarab of Surprising Alliances',
    ]) expect(scarab(name)?.status, name).toBe('active');

    for (const name of [
      'Heist Scarab', 'Heist Scarab of Lockpicking', 'Heist Scarab of Many Clients',
      'Heist Scarab of the Wealthy', 'Metamorph Scarab', 'Metamorph Scarab of Catalogue',
      'Metamorph Scarab of Curiosity', 'Metamorph Scarab of Specimen',
      'Harbinger Scarab', 'Harbinger Scarab of Obelisks',
      'Harbinger Scarab of Regency', 'Harbinger Scarab of Warhoards',
    ]) expect(scarab(name)?.status, name).toBe('removed');

    for (const name of ['Abyssal', 'Fossilised', 'Kalguuran', 'Obscured', 'Timeless']) {
      expect(deli(name)?.status, name).toBe('removed');
    }
    expect(deli('Primal')).toBeUndefined();

    expect(astro('Enshrouded Astrolabe')).toMatchObject({
      status: 'renamed', aliasOf: 'deceptive-astrolabe',
    });
    expect(astro('Deceptive Astrolabe')?.status).toBe('active');
  });

  it('offers only current/reworked revision-3 products in new-input pickers', () => {
    const scarabs = selectableScarabOptions();
    expect(scarabs).toContainEqual({
      value: 'Abyss Scarab of Crystals', label: 'Abyss Scarab of Crystals',
    });
    expect(scarabs).toContainEqual({
      value: 'Abyss Scarab of the Consort', label: 'Abyss Scarab of the Consort',
    });
    expect(scarabs.some((e) => e.value === 'Trarthan Scarab')).toBe(true);
    expect(scarabs.some((e) => e.value === 'Abyss Scarab of Edifice')).toBe(false);
    expect(scarabs.some((e) => e.value === 'Heist Scarab')).toBe(false);
    expect(scarabs.some((e) => e.value === 'Harbinger Scarab')).toBe(false);

    const deli = selectableDeliriumOrbList();
    expect(deli.some((e) => e.value === 'Fossilised')).toBe(false);
    expect(deli.some((e) => e.value === 'Obscured')).toBe(false);

    const astrolabes = selectableAstrolabeList();
    expect(astrolabes.some((e) => e.value === 'Deceptive Astrolabe')).toBe(true);
    expect(astrolabes.some((e) => e.value === 'Enshrouded Astrolabe')).toBe(false);

    expect(preserveHistoricalSelection(astrolabes, 'Enshrouded Astrolabe')).toContainEqual({
      value: 'Enshrouded Astrolabe', label: 'Enshrouded Astrolabe — Historical',
    });
    expect(preserveHistoricalSelection(deli, 'Fossilised')).toContainEqual({
      value: 'Fossilised', label: 'Fossilised — Historical',
    });
    expect(preserveHistoricalSelection(deli, 'Obscured')).toContainEqual({
      value: 'Obscured', label: 'Obscured — Historical',
    });
    expect(preserveHistoricalSelection(scarabs, 'Harbinger Scarab')).toContainEqual({
      value: 'Harbinger Scarab', label: 'Harbinger Scarab — Historical',
    });
  });

  it('all ids are unique across every entity list', () => {
    const all: GameEntity[] = [
      ...BUNDLED_MANIFEST.scarabs, ...BUNDLED_MANIFEST.deliriumOrbs,
      ...BUNDLED_MANIFEST.astrolabes, ...BUNDLED_MANIFEST.chisels,
    ];
    const ids = all.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all names are unique within each list', () => {
    for (const list of [BUNDLED_MANIFEST.scarabs, BUNDLED_MANIFEST.deliriumOrbs,
      BUNDLED_MANIFEST.astrolabes, BUNDLED_MANIFEST.chisels] as GameEntity[][]) {
      const names = list.map((e) => e.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it('scarab/astrolabe ids are exactly the slug of their name (D6); deli/chisel are kind-prefixed slugs', () => {
    for (const e of [...BUNDLED_MANIFEST.scarabs, ...BUNDLED_MANIFEST.astrolabes]) {
      expect(e.id).toBe(slugifyEntityId(e.name));
    }
    for (const e of BUNDLED_MANIFEST.deliriumOrbs) expect(e.id).toBe(`deli-${slugifyEntityId(e.name)}`);
    for (const e of BUNDLED_MANIFEST.chisels) expect(e.id).toBe(`chisel-${slugifyEntityId(e.name)}`);
  });

  it('renamed entities point at an existing surviving id', () => {
    const all: GameEntity[] = [
      ...BUNDLED_MANIFEST.scarabs, ...BUNDLED_MANIFEST.deliriumOrbs,
      ...BUNDLED_MANIFEST.astrolabes, ...BUNDLED_MANIFEST.chisels,
    ];
    const ids = new Set(all.map((e) => e.id));
    for (const e of all) {
      if (e.status === 'renamed') {
        expect(e.aliasOf, `${e.id} is renamed but has no aliasOf`).toBeTruthy();
        expect(ids.has(e.aliasOf!), `${e.id} aliasOf -> missing id ${e.aliasOf}`).toBe(true);
      }
    }
  });

  it('passes its own validity check', () => {
    expect(isValidManifest(BUNDLED_MANIFEST)).toBe(true);
    expect(isValidManifest(null)).toBe(false);
    expect(isValidManifest({ revision: 'x' })).toBe(false);
  });

  it('accepts immutable legacy revision 1 but requires declared compatibility after it', () => {
    expect(isApplicableManifest(BUNDLED_MANIFEST)).toBe(true);
    const legacy = {
      ...BUNDLED_MANIFEST, revision: 1, schemaVersion: undefined, contextKey: undefined,
    };
    expect(isApplicableManifest(legacy)).toBe(true);
    expect(isApplicableManifest({ ...legacy, revision: 2 })).toBe(false);
    expect(isApplicableManifest({
      ...legacy, revision: 2, schemaVersion: 1, contextKey: 'poe1-challenge',
    })).toBe(true);
  });
});

describe('legacy constants are 1:1 derived views (migration lock)', () => {
  it('SCARAB_LIST matches the active manifest scarab names, order preserved', () => {
    expect(SCARAB_LIST).toEqual(BUNDLED_MANIFEST.scarabs.filter((e) => e.status === 'active').map((e) => e.name));
    expect(SCARAB_LIST).toContain('Horned Scarab of Preservation'); // profit math special-cases it
  });

  it('DELIRIUM_ORB_LIST / ASTROLABE_LIST keep the legacy select shapes', () => {
    expect(DELIRIUM_ORB_LIST).not.toContainEqual({ value: 'Abyssal', label: 'Abyssal (Abyss)' });
    expect(ASTROLABE_LIST[0]).toEqual({ value: '', label: '— None —' }); // None row preserved
    expect(ASTROLABE_LIST).toHaveLength(11); // 10 entities + None
  });

  it('CHISEL_TYPES keeps stored keys + math fields; CHISEL_SELECT_DATA keeps the None row', () => {
    expect(Object.keys(CHISEL_TYPES)).toEqual(
      ['Cartographer', 'Avarice', 'Procurement', 'Proliferation', 'Scarabs', 'Divination']);
    expect(CHISEL_TYPES['Avarice']).toEqual({ label: 'Avarice — +50% more Currency', statKey: 'moreCurrency', bonusAt20: 50 });
    expect(CHISEL_SELECT_DATA[0]).toEqual({ value: '', label: '— None —' });
  });
});

describe('loader (initGameData)', () => {
  it('stays on bundled when there is no cache (fresh install)', async () => {
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: null, error: null })) },
    });
    const m = await initGameData();
    expect(m.revision).toBe(BUNDLED_MANIFEST.revision);
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
  });

  it('adopts a cached manifest with a HIGHER revision', async () => {
    const newer = { ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 1 };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: newer, error: null })) },
    });
    const m = await initGameData();
    expect(m.revision).toBe(BUNDLED_MANIFEST.revision + 1);
    expect(getManifest().revision).toBe(BUNDLED_MANIFEST.revision + 1);
  });

  it('ignores a cached manifest with an equal/lower revision', async () => {
    const same = { ...BUNDLED_MANIFEST };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: same, error: null })) },
    });
    await initGameData();
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
  });

  it('rejects an invalid cached manifest (loudly) and stays on bundled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: { revision: 999 }, error: null })) },
    });
    await initGameData();
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('survives a missing window.api (test/node env) on the bundled floor', async () => {
    vi.stubGlobal('window', {});
    const m = await initGameData();
    expect(m).toBe(BUNDLED_MANIFEST);
  });

  it('is idempotent — the cache is read once across calls', async () => {
    const read = vi.fn(async () => ({ manifest: null, error: null }));
    vi.stubGlobal('window', { api: { readGameDataCache: read } });
    await initGameData();
    await initGameData();
    expect(read).toHaveBeenCalledTimes(1);
  });

  // ── Server fetch (hook went live 2026-07-11) ────────────────────────────

  const apiWith = (overrides: Record<string, unknown>) => ({
    readGameDataCache:  vi.fn(async () => ({ manifest: null, error: null })),
    writeGameDataCache: vi.fn(async () => ({ ok: true, error: null })),
    ...overrides,
  });

  it('adopts a NEWER server manifest and persists it to the cache', async () => {
    const newer = { ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 5 };
    const write = vi.fn(async () => ({ ok: true, error: null }));
    vi.stubGlobal('window', { api: apiWith({
      writeGameDataCache: write,
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: newer.revision, manifest: newer }, error: null })),
    }) });
    const m = await initGameData();
    expect(m.revision).toBe(newer.revision);
    expect(write).toHaveBeenCalledWith(newer);
    expect(getGameDataStatus()).toMatchObject({ source: 'server', warning: null, revision: newer.revision });
  });

  it('rejects an incompatible newer server manifest and exposes the warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const incompatible = { ...BUNDLED_MANIFEST, revision: 8, schemaVersion: 2, contextKey: 'poe1-challenge' };
    vi.stubGlobal('window', { api: apiWith({
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: 8, manifest: incompatible }, error: null })),
    }) });
    await initGameData();
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
    expect(getGameDataStatus().warning).toContain('incompatible');
    warn.mockRestore();
  });

  it('ignores a server manifest that is not newer (no write)', async () => {
    const write = vi.fn(async () => ({ ok: true, error: null }));
    vi.stubGlobal('window', { api: apiWith({
      writeGameDataCache: write,
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: BUNDLED_MANIFEST.revision, manifest: { ...BUNDLED_MANIFEST } }, error: null })),
    }) });
    await initGameData();
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects a server payload whose top-level revision disagrees with the manifest field', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const lying = { ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 2 };
    vi.stubGlobal('window', { api: apiWith({
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: lying.revision + 9, manifest: lying }, error: null })),
    }) });
    await initGameData();
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects an INVALID server manifest and stays on the active revision', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('window', { api: apiWith({
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: 99, manifest: { revision: 99 } }, error: null })),
    }) });
    await initGameData();
    expect(getManifest()).toBe(BUNDLED_MANIFEST);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('treats a server error as non-fatal (endpoint not deployed / server down)', async () => {
    vi.stubGlobal('window', { api: apiWith({
      fetchGameDataLatest: vi.fn(async () => ({ payload: null, error: 'game-data 404' })),
    }) });
    const m = await initGameData();
    expect(m).toBe(BUNDLED_MANIFEST);
    expect(getGameDataStatus()).toMatchObject({ source: 'bundled', warning: expect.stringContaining('unavailable') });
  });

  it('server beats cache only by revision: cache r+1 adopted, server r+2 wins over it', async () => {
    const cached = { ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 1 };
    const served = { ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 2 };
    vi.stubGlobal('window', { api: apiWith({
      readGameDataCache: vi.fn(async () => ({ manifest: cached, error: null })),
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: served.revision, manifest: served }, error: null })),
    }) });
    const m = await initGameData();
    expect(m.revision).toBe(served.revision);
  });
});

describe('derived view helpers (call-time, revision-aware)', () => {
  it('match the legacy static exports on the bundled manifest', () => {
    expect(activeScarabNames()).toEqual(SCARAB_LIST);
    expect(activeDeliriumOrbList()).toEqual(DELIRIUM_ORB_LIST);
    expect(activeAstrolabeList()).toEqual(ASTROLABE_LIST);
    expect(activeChiselTypes()).toEqual(CHISEL_TYPES);
  });

  it('exclude non-active entities (removed/renamed stay resolvable but unpickable)', async () => {
    const modified = {
      ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge',
      revision: BUNDLED_MANIFEST.revision + 1,
      scarabs: BUNDLED_MANIFEST.scarabs.map((s, i) =>
        i === 0 ? { ...s, status: 'removed' as const } : s),
    };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: modified, error: null })) },
    });
    await initGameData();
    expect(activeScarabNames()).toHaveLength(SCARAB_LIST.length - 1);
    expect(activeScarabNames()).not.toContain(BUNDLED_MANIFEST.scarabs[0].name);
    // The entity is still IN the manifest for read-time resolution:
    expect(getManifest().scarabs.find((s) => s.id === BUNDLED_MANIFEST.scarabs[0].id)?.status).toBe('removed');
  });

  it('round-trips reworked picker values as clean stored names while removed products stay unpickable', async () => {
    const first = BUNDLED_MANIFEST.scarabs[0];
    const second = BUNDLED_MANIFEST.scarabs[1];
    const modified = {
      ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge',
      revision: BUNDLED_MANIFEST.revision + 1,
      scarabs: BUNDLED_MANIFEST.scarabs.map((s, i) =>
        i === 0 ? { ...s, status: 'reworked' as const, note: 'Changed effect' }
          : i === 1 ? { ...s, status: 'removed' as const }
            : s),
    };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: modified, error: null })) },
    });
    await initGameData();

    const option = selectableScarabOptions().find((candidate) => candidate.value === first.name);
    expect(option).toEqual({ value: first.name, label: first.name });
    expect(option?.value).not.toContain('Reworked');
    expect(option?.label).not.toContain('Reworked');
    expect(selectableScarabOptions().some((option) => option.value === second.name)).toBe(false);
    expect(entityLifecycleStatus('scarabs', first.name)).toBe('reworked');
    expect(entityLifecycleStatus('scarabs', second.name)).toBe('removed');
    expect(entityLifecycleStatus('scarabs', 'User-entered unknown scarab')).toBeNull();
  });
});

describe('mechanic flags (step 5, §5.3)', () => {
  it('bundled revision 3 keeps live mechanics active and explicitly removes split input', () => {
    expect(mechanicStatus('scarabs')).toBe('active');
    expect(mechanicStatus('delirium')).toBe('active');
    expect(mechanicStatus('astrolabe')).toBe('active');
    expect(mechanicStatus('split')).toBe('removed');
    expect(isMechanicActive('astrolabe')).toBe(true);
    expect(isMechanicActive('split')).toBe(false);
    expect(shouldShowMechanicInput('split', false)).toBe(false);
    expect(shouldShowMechanicInput('split', true)).toBe(true);
  });

  it('an OMITTED mechanic defaults to active (fail-open, no silent hide)', async () => {
    const noMech = { ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 1, mechanics: {} };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: noMech, error: null })) },
    });
    await initGameData();
    expect(mechanicStatus('astrolabe')).toBe('active');
    expect(isMechanicActive('astrolabe')).toBe(true);
  });

  it('a removed mechanic reports removed + inactive (3.29-style)', async () => {
    const removed = {
      ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 1,
      mechanics: { ...BUNDLED_MANIFEST.mechanics, astrolabe: 'removed' as const },
    };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: removed, error: null })) },
    });
    await initGameData();
    expect(mechanicStatus('astrolabe')).toBe('removed');
    expect(isMechanicActive('astrolabe')).toBe(false);
  });

  it('a reworked mechanic stays active/visible but reports reworked', async () => {
    const reworked = {
      ...BUNDLED_MANIFEST, schemaVersion: 1, contextKey: 'poe1-challenge', revision: BUNDLED_MANIFEST.revision + 1,
      mechanics: { ...BUNDLED_MANIFEST.mechanics, astrolabe: 'reworked' as const },
    };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: reworked, error: null })) },
    });
    await initGameData();
    expect(mechanicStatus('astrolabe')).toBe('reworked');
    expect(isMechanicActive('astrolabe')).toBe(true); // reworked != hidden
  });
});
