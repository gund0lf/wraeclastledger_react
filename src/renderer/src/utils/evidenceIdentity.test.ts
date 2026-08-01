import { describe, expect, it } from 'vitest';
import {
  atlasAllocationHash,
  buildEvidenceRunIdentityV1,
  buildSetupSnapshotV1,
  canonicalJson,
  canonicalMultiplierMilli,
  compareSetupSnapshots,
  fingerprintSetupSnapshot,
} from './evidenceIdentity';

const setupInput = (overrides: Record<string, unknown> = {}) => ({
  league: ' Allflame ',
  mapType: '8-mod',
  groupSize: 3,
  isGroupPlay: true,
  chiselType: 'Chisel of Procurement',
  scarabs: [
    { name: 'Trarthan Scarab' },
    { name: 'Scarab of Wisps' },
    { name: 'Trarthan Scarab' },
  ],
  deliriumType: 'Skittering',
  deliriumCountPerMap: 2,
  astrolabeType: 'Deceptive',
  atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#BBBB?v=old',
  multiplier: 1.2345,
  gameDataRevision: 3,
  gameDataPatchVersion: '3.29',
  ...overrides,
});

describe('client evidence identity contract', () => {
  it('matches the API golden setup constructor and fingerprint', async () => {
    const snapshot = buildSetupSnapshotV1(setupInput());
    expect(snapshot).toEqual({
      schemaVersion: 1,
      leagueKey: 'allflame',
      mapType: '8-mod',
      partySize: 3,
      chiselType: 'chisel of procurement',
      scarabs: ['scarab of wisps', 'trarthan scarab', 'trarthan scarab'],
      delirium: { type: 'skittering', countPerMap: 2 },
      astrolabeType: 'deceptive',
      atlasAllocationHash: 'BBBB',
      multiplierMilli: 1235,
      gameDataRevision: 3,
      gameDataPatchVersion: '3.29',
    });
    expect(await fingerprintSetupSnapshot(snapshot)).toBe(
      'sha256-v1:329d6862a8ea4336bdc65eda1b38c67c793f21784d2dbb808b71e061e1be277a',
    );
  });

  it('pins multiplier thousandths and atlas view-version removal', () => {
    expect(canonicalMultiplierMilli(1.2344)).toBe(1234);
    expect(canonicalMultiplierMilli(1.2345)).toBe(1235);
    expect(atlasAllocationHash('https://pathofpathing.com/#BBBB?v=old')).toBe('BBBB');
  });

  it('canonicalizes object key order and rejects non-ASCII setup values', async () => {
    expect(canonicalJson({ z: [2, 1], a: { b: true, a: null } })).toBe(
      canonicalJson({ a: { a: null, b: true }, z: [2, 1] }),
    );
    const snapshot = buildSetupSnapshotV1(setupInput({ league: 'Allflam\u00e9' }));
    await expect(fingerprintSetupSnapshot(snapshot)).rejects.toThrow(/ASCII text/);
  });

  it('treats game-data revision as provenance while hard fields block', () => {
    const expected = buildSetupSnapshotV1(setupInput());
    const revisionOnly = buildSetupSnapshotV1(setupInput({
      gameDataRevision: 4,
      gameDataPatchVersion: '3.29.1',
    }));
    expect(compareSetupSnapshots(expected, revisionOnly)).toEqual([]);

    const changed = buildSetupSnapshotV1(setupInput({ multiplier: 1.2355 }));
    expect(compareSetupSnapshots(expected, changed).map((entry) => entry.field)).toEqual([
      'multiplierMilli',
    ]);
  });

  it('matches the API golden run identity', async () => {
    const setupSnapshot = buildSetupSnapshotV1(setupInput());
    const identity = await buildEvidenceRunIdentityV1({
      runStartedAt: '2026-07-29T18:00:00.000Z',
      runEndedAt: '2026-07-29T18:30:00.000Z',
      authoredRollup: {
        mapCount: 10,
        avgQuant: 100,
        avgRarity: 60,
        avgPack: 40,
        avgCurrency: 20,
        observedModAverage: 8,
        observedModSampleSize: 10,
        multiplier: 1.23,
        perMapCost: 50,
        totalInvest: 500,
        netProfit: 200,
        divPerMap: 0.5,
        divinePrice: 100,
        sessionMinutes: 30,
      },
      setupSnapshot,
    });
    expect(identity.runKey).toBe(
      'sha256-v1:0d92566f793efaf5cf274940b62967b9610f230d2c574962f50e4d06779a8492',
    );
  });
});
