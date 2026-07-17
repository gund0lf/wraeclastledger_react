/**
 * aliasResolver.test.ts — read-time historical-name resolution (rollover step 3).
 *
 * Revision 2 carries real 3.29 rename edges. Synthetic manifests still cover
 * removed/reworked states and malformed chains independently.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';
import { GameDataManifest } from '../../../shared/gameData/types';
import { initGameData, __resetGameDataForTests } from './gameData';
import { resolveEntity, currentName, isCurrentlyUsable } from './aliasResolver';

/** Swap in a manifest by routing it through the loader's disk-cache adopt path. */
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

describe('resolver on the bundled revision-2 manifest', () => {
  it('resolves a current scarab name to itself, not via alias', () => {
    const r = resolveEntity('scarabs', 'Abyss Scarab');
    expect(r.entity?.name).toBe('Abyss Scarab');
    expect(r.viaAlias).toBe(false);
  });

  it('is case / punctuation / spacing insensitive', () => {
    expect(resolveEntity('scarabs', '  abyss   scarab ').entity?.name).toBe('Abyss Scarab');
    expect(resolveEntity('deliriumOrbs', 'abyssal').entity?.name).toBe('Abyssal');
    expect(resolveEntity('chisels', 'CARTOGRAPHER').entity?.name).toBe('Cartographer');
  });

  it('returns null entity for an unknown name (never throws)', () => {
    expect(resolveEntity('scarabs', 'Nonexistent Scarab of Nothing').entity).toBeNull();
  });

  it('currentName passes unknown names through unchanged (never blanks user data)', () => {
    expect(currentName('scarabs', 'Some Removed Legacy Scarab')).toBe('Some Removed Legacy Scarab');
    expect(currentName('scarabs', 'Abyss Scarab')).toBe('Abyss Scarab');
  });

  it('isCurrentlyUsable is true for active bundled entities, false for unknown', () => {
    expect(isCurrentlyUsable('scarabs', 'Abyss Scarab')).toBe(true);
    expect(isCurrentlyUsable('scarabs', 'Ghost Scarab')).toBe(false);
  });

  it('upgrades both renamed Abyss scarabs and the renamed astrolabe', () => {
    expect(currentName('scarabs', 'Abyss Scarab of Edifice')).toBe('Abyss Scarab of Crystals');
    expect(currentName('scarabs', 'Abyss Scarab of Profound Depth')).toBe('Abyssal Scarab of the Consort');
    expect(currentName('astrolabes', 'Enshrouded Astrolabe')).toBe('Deceptive Astrolabe');
    expect(resolveEntity('scarabs', 'Abyss Scarab of Edifice').viaAlias).toBe(true);
    expect(isCurrentlyUsable('scarabs', 'Abyss Scarab of Edifice')).toBe(true);
  });
});

describe('resolver across a renamed alias edge (synthetic 3.29-style manifest)', () => {
  // "Old Name Scarab" (renamed) -> "New Name Scarab" (active).
  const renamed: GameDataManifest = {
    ...BUNDLED_MANIFEST,
    schemaVersion: 1,
    contextKey: 'poe1-challenge',
    revision: BUNDLED_MANIFEST.revision + 1,
    scarabs: [
      { id: 'new-name-scarab', name: 'New Name Scarab', status: 'active' },
      { id: 'old-name-scarab', name: 'Old Name Scarab', status: 'renamed', aliasOf: 'new-name-scarab' },
      { id: 'gone-scarab', name: 'Gone Scarab', status: 'removed' },
      { id: 'tweaked-scarab', name: 'Tweaked Scarab', status: 'reworked', note: 'now drops less' },
    ],
  };

  it('resolves the OLD name to the surviving entity, flagged viaAlias', async () => {
    await useManifest(renamed);
    const r = resolveEntity('scarabs', 'Old Name Scarab');
    expect(r.entity?.id).toBe('new-name-scarab');
    expect(r.entity?.name).toBe('New Name Scarab');
    expect(r.viaAlias).toBe(true);
  });

  it('currentName upgrades a stored old name to the current one', async () => {
    await useManifest(renamed);
    expect(currentName('scarabs', 'Old Name Scarab')).toBe('New Name Scarab');
  });

  it('an old (renamed) name is still usable — it points at an active entity', async () => {
    await useManifest(renamed);
    expect(isCurrentlyUsable('scarabs', 'Old Name Scarab')).toBe(true);
  });

  it('a removed entity is NOT usable but stays resolvable (history intact)', async () => {
    await useManifest(renamed);
    expect(isCurrentlyUsable('scarabs', 'Gone Scarab')).toBe(false);
    expect(resolveEntity('scarabs', 'Gone Scarab').entity?.status).toBe('removed');
  });

  it('a reworked entity is still usable (exists, just changed)', async () => {
    await useManifest(renamed);
    expect(isCurrentlyUsable('scarabs', 'Tweaked Scarab')).toBe(true);
  });

  it('rebuilds its index after a revision swap (no stale cache across manifests)', async () => {
    // Bundled first: the synthetic old name is unknown.
    expect(resolveEntity('scarabs', 'Old Name Scarab').entity).toBeNull();
    // Swap: now it resolves.
    await useManifest(renamed);
    expect(resolveEntity('scarabs', 'Old Name Scarab').entity?.id).toBe('new-name-scarab');
  });
});

describe('resolver guards against a malformed alias chain', () => {
  it('a dangling aliasOf resolves to the renamed node itself, not a crash', async () => {
    const bad: GameDataManifest = {
      ...BUNDLED_MANIFEST,
      schemaVersion: 1,
      contextKey: 'poe1-challenge',
      revision: BUNDLED_MANIFEST.revision + 1,
      scarabs: [
        { id: 'orphan-scarab', name: 'Orphan Scarab', status: 'renamed', aliasOf: 'does-not-exist' },
      ],
    };
    await useManifest(bad);
    const r = resolveEntity('scarabs', 'Orphan Scarab');
    expect(r.entity?.id).toBe('orphan-scarab'); // stops at the dangling node
  });
});
