/**
 * gameData.test.ts — manifest invariants + loader behaviour + derived views
 * (rollover Phase 1 step 2).
 *
 * The invariant tests are the migration's safety net: they lock the bundled
 * manifest to the exact shapes/counts the legacy constants.ts arrays had, so
 * the constants -> manifest move is provably 1:1.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { slugifyEntityId, GameEntity } from '../../../shared/gameData/types';
import {
  getManifest, initGameData, isValidManifest, __resetGameDataForTests,
  activeScarabNames, activeDeliriumOrbList, activeAstrolabeList, activeChiselTypes,
  mechanicStatus, isMechanicActive,
} from './gameData';
import { SCARAB_LIST, DELIRIUM_ORB_LIST, ASTROLABE_LIST, CHISEL_TYPES, CHISEL_SELECT_DATA } from './constants';

afterEach(() => {
  vi.unstubAllGlobals();
  __resetGameDataForTests();
});

describe('bundled manifest invariants', () => {
  it('carries the migrated entity counts (123 scarabs / 17 deli / 10 astrolabes / 6 chisels)', () => {
    // 123 is deliberate — see the DATA NOTE in manifest.ts (111-vs-123 history).
    expect(BUNDLED_MANIFEST.scarabs).toHaveLength(123);
    expect(BUNDLED_MANIFEST.deliriumOrbs).toHaveLength(17);
    expect(BUNDLED_MANIFEST.astrolabes).toHaveLength(10);
    expect(BUNDLED_MANIFEST.chisels).toHaveLength(6);
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
});

describe('legacy constants are 1:1 derived views (migration lock)', () => {
  it('SCARAB_LIST matches the active manifest scarab names, order preserved', () => {
    expect(SCARAB_LIST).toEqual(BUNDLED_MANIFEST.scarabs.filter((e) => e.status === 'active').map((e) => e.name));
    expect(SCARAB_LIST).toContain('Horned Scarab of Preservation'); // profit math special-cases it
  });

  it('DELIRIUM_ORB_LIST / ASTROLABE_LIST keep the legacy select shapes', () => {
    expect(DELIRIUM_ORB_LIST[0]).toEqual({ value: 'Abyssal', label: 'Abyssal (Abyss)' });
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
    const newer = { ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 1 };
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
    const newer = { ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 5 };
    const write = vi.fn(async () => ({ ok: true, error: null }));
    vi.stubGlobal('window', { api: apiWith({
      writeGameDataCache: write,
      fetchGameDataLatest: vi.fn(async () => ({ payload: { revision: newer.revision, manifest: newer }, error: null })),
    }) });
    const m = await initGameData();
    expect(m.revision).toBe(newer.revision);
    expect(write).toHaveBeenCalledWith(newer);
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
    const lying = { ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 2 };
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
  });

  it('server beats cache only by revision: cache r+1 adopted, server r+2 wins over it', async () => {
    const cached = { ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 1 };
    const served = { ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 2 };
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
      ...BUNDLED_MANIFEST,
      revision: BUNDLED_MANIFEST.revision + 1,
      scarabs: BUNDLED_MANIFEST.scarabs.map((s, i) =>
        i === 0 ? { ...s, status: 'removed' as const } : s),
    };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: modified, error: null })) },
    });
    await initGameData();
    expect(activeScarabNames()).toHaveLength(122);
    expect(activeScarabNames()).not.toContain(BUNDLED_MANIFEST.scarabs[0].name);
    // The entity is still IN the manifest for read-time resolution:
    expect(getManifest().scarabs.find((s) => s.id === BUNDLED_MANIFEST.scarabs[0].id)?.status).toBe('removed');
  });
});

describe('mechanic flags (step 5, §5.3)', () => {
  it('bundled manifest: scarabs/delirium/astrolabe all active', () => {
    expect(mechanicStatus('scarabs')).toBe('active');
    expect(mechanicStatus('delirium')).toBe('active');
    expect(mechanicStatus('astrolabe')).toBe('active');
    expect(isMechanicActive('astrolabe')).toBe(true);
  });

  it('an OMITTED mechanic defaults to active (fail-open, no silent hide)', async () => {
    const noMech = { ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 1, mechanics: {} };
    vi.stubGlobal('window', {
      api: { readGameDataCache: vi.fn(async () => ({ manifest: noMech, error: null })) },
    });
    await initGameData();
    expect(mechanicStatus('astrolabe')).toBe('active');
    expect(isMechanicActive('astrolabe')).toBe(true);
  });

  it('a removed mechanic reports removed + inactive (3.29-style)', async () => {
    const removed = {
      ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 1,
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
      ...BUNDLED_MANIFEST, revision: BUNDLED_MANIFEST.revision + 1,
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
