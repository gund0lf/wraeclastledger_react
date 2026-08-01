import { describe, expect, it } from 'vitest';
import goldenFixture from './fixtures/evidence-identity-v1.json';
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
  ...goldenFixture.setupInput,
  ...overrides,
});

describe('client evidence identity contract', () => {
  it('matches the API golden setup constructor and fingerprint', async () => {
    const snapshot = buildSetupSnapshotV1(setupInput());
    expect(snapshot).toEqual(goldenFixture.expectedSetupSnapshot);
    expect(await fingerprintSetupSnapshot(snapshot)).toBe(goldenFixture.expectedSetupFingerprint);
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
      ...goldenFixture.runInput,
      setupSnapshot,
    });
    expect(identity.runKey).toBe(goldenFixture.expectedRunKey);
  });
});
