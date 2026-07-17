/**
 * strategyCompat.test.ts — strategy-vs-manifest compatibility (rollover step 4).
 *
 * Revision 2 contains real lifecycle changes. The bundled cases distinguish
 * unchanged products from those changes; synthetic cases isolate every
 * compatibility level and atlas-version behavior.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { GameDataManifest } from '../../../shared/gameData/types';
import { initGameData, __resetGameDataForTests } from './gameData';
import { checkStrategyCompat, atlasVersionOf } from './strategyCompat';
import { Strategy } from './strategyConstants';

function strat(partial: Partial<Strategy>): Strategy {
  return { id: 's1', discord_username: 'tester', posted_at: '2026-07-01', ...partial } as Strategy;
}

async function useManifest(m: GameDataManifest): Promise<void> {
  __resetGameDataForTests();
  vi.stubGlobal('window', {
    api: { readGameDataCache: vi.fn(async () => ({ manifest: m, error: null })) },
  });
  await initGameData();
}

afterEach(() => {
  vi.unstubAllGlobals();
  __resetGameDataForTests();
});

describe('atlasVersionOf', () => {
  it('pulls ?v= from a pathofpathing url', () => {
    expect(atlasVersionOf('https://pathofpathing.com/?v=3.28a#abc')).toBe('3.28a');
  });
  it('handles &v= and returns empty for none/null', () => {
    expect(atlasVersionOf('https://x/?foo=1&v=abc')).toBe('abc');
    expect(atlasVersionOf('https://x/#tree')).toBe('');
    expect(atlasVersionOf(null)).toBe('');
  });
});

describe('compat on the bundled manifest', () => {
  it('a strategy of unchanged scarabs + chisel is ok', () => {
    const r = checkStrategyCompat(strat({
      scarabs: [{ name: 'Abyss Scarab of Descending', cost: 5 }, { name: 'Titanic Scarab', cost: 10 }],
      chisel: 'Cartographer',
    }));
    expect(r.level).toBe('ok');
    expect(r.issues).toHaveLength(0);
  });

  it('an unknown scarab name is treated as compatible (under-warn)', () => {
    const r = checkStrategyCompat(strat({ scarabs: [{ name: 'Totally Made Up Scarab', cost: 1 }] }));
    expect(r.level).toBe('ok');
  });

  it('chisel "None" and empty are ignored', () => {
    expect(checkStrategyCompat(strat({ chisel: 'None' })).level).toBe('ok');
    expect(checkStrategyCompat(strat({ chisel: '' })).level).toBe('ok');
  });

  it('does not flag atlas when the manifest version is unobserved', () => {
    // bundled atlasTreeVersion is '' -> never cry outdated
    const r = checkStrategyCompat(strat({ atlas_tree_url: 'https://pathofpathing.com/?v=anything#x' }));
    expect(r.atlasOutdated).toBe(false);
    expect(r.level).toBe('ok');
  });
});

describe('compat against a synthetic 3.29-style manifest', () => {
  const m: GameDataManifest = {
    ...BUNDLED_MANIFEST,
    schemaVersion: 1,
    contextKey: 'poe1-challenge',
    revision: BUNDLED_MANIFEST.revision + 1,
    atlasTreeVersion: '3.29',
    scarabs: [
      { id: 'new-name-scarab', name: 'New Name Scarab', status: 'active' },
      { id: 'old-name-scarab', name: 'Old Name Scarab', status: 'renamed', aliasOf: 'new-name-scarab' },
      { id: 'gone-scarab', name: 'Gone Scarab', status: 'removed' },
      { id: 'tweaked-scarab', name: 'Tweaked Scarab', status: 'reworked', note: 'drops halved' },
      { id: 'abyss-scarab', name: 'Abyss Scarab', status: 'active' },
    ],
  };

  it('flags a removed scarab at level removed, struck by name', async () => {
    await useManifest(m);
    const r = checkStrategyCompat(strat({ scarabs: [{ name: 'Gone Scarab', cost: 3 }] }));
    expect(r.level).toBe('removed');
    expect(r.issues[0]).toMatchObject({ kind: 'scarab', storedName: 'Gone Scarab', level: 'removed' });
  });

  it('flags a renamed scarab at level changed, carrying the current name', async () => {
    await useManifest(m);
    const r = checkStrategyCompat(strat({ scarabs: [{ name: 'Old Name Scarab', cost: 3 }] }));
    expect(r.level).toBe('changed');
    expect(r.issues[0]).toMatchObject({ storedName: 'Old Name Scarab', currentName: 'New Name Scarab', level: 'changed' });
  });

  it('flags a reworked scarab at changed with its note', async () => {
    await useManifest(m);
    const r = checkStrategyCompat(strat({ scarabs: [{ name: 'Tweaked Scarab', cost: 3 }] }));
    expect(r.level).toBe('changed');
    expect(r.issues[0].detail).toContain('drops halved');
  });

  it('worst-level wins: removed dominates a mixed strategy', async () => {
    await useManifest(m);
    const r = checkStrategyCompat(strat({
      scarabs: [{ name: 'Old Name Scarab', cost: 1 }, { name: 'Gone Scarab', cost: 1 }, { name: 'Abyss Scarab', cost: 1 }],
    }));
    expect(r.level).toBe('removed');
    expect(r.issues).toHaveLength(2); // Abyss is fine
  });

  it('flags an outdated atlas tree version when both sides are known', async () => {
    await useManifest(m);
    const r = checkStrategyCompat(strat({ atlas_tree_url: 'https://pathofpathing.com/?v=3.28#x' }));
    expect(r.atlasOutdated).toBe(true);
    expect(r.issues.some((i) => i.kind === 'atlas')).toBe(true);
  });

  it('a matching atlas version does not flag', async () => {
    await useManifest(m);
    const r = checkStrategyCompat(strat({ atlas_tree_url: 'https://pathofpathing.com/?v=3.29#x' }));
    expect(r.atlasOutdated).toBe(false);
  });

  it('a dangling-aliasOf renamed entity does not produce a self-referential "X is now X"', async () => {
    // aliasOf points nowhere -> resolver returns the renamed node itself. The
    // name-differs guard must suppress the rename issue rather than emit noise.
    const dangling: GameDataManifest = {
      ...BUNDLED_MANIFEST,
      schemaVersion: 1,
      contextKey: 'poe1-challenge',
      revision: BUNDLED_MANIFEST.revision + 1,
      scarabs: [{ id: 'orphan-scarab', name: 'Orphan Scarab', status: 'renamed', aliasOf: 'does-not-exist' }],
    };
    await useManifest(dangling);
    const r = checkStrategyCompat(strat({ scarabs: [{ name: 'Orphan Scarab', cost: 1 }] }));
    expect(r.level).toBe('ok');
    expect(r.issues).toHaveLength(0);
  });
});
