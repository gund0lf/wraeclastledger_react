import { describe, expect, it } from 'vitest';
import goldenFixture from './fixtures/evidence-identity-v1.json';
import goldenFixtureV2 from './fixtures/evidence-identity-v2.json';
import {
  atlasAllocationHash,
  buildEvidenceRunIdentityV1,
  buildSetupSnapshotV1,
  buildSetupSnapshotV2,
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

  it('keeps revision and observed multiplier as provenance while hard fields block', () => {
    const expected = buildSetupSnapshotV1(setupInput());
    const provenanceOnly = buildSetupSnapshotV1(setupInput({
      gameDataRevision: 4,
      gameDataPatchVersion: '3.29.1',
      multiplier: 1.51,
    }));
    expect(provenanceOnly.multiplierMilli).toBe(1510);
    expect(compareSetupSnapshots(expected, provenanceOnly)).toEqual([]);

    const changed = buildSetupSnapshotV1(setupInput({ mapType: '6-mod' }));
    expect(compareSetupSnapshots(expected, changed).map((entry) => entry.field)).toEqual([
      'mapType',
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

  it('matches the API schema-v2 golden setup and run identities', async () => {
    const snapshot = buildSetupSnapshotV2(goldenFixtureV2.setupInput);
    expect(snapshot).toEqual(goldenFixtureV2.expectedSetupSnapshot);
    expect(await fingerprintSetupSnapshot(snapshot)).toBe(goldenFixtureV2.expectedSetupFingerprint);
    const identity = await buildEvidenceRunIdentityV1({
      ...goldenFixtureV2.runInput,
      setupSnapshot: snapshot,
    });
    expect(identity.runKey).toBe(goldenFixtureV2.expectedRunKey);
  });

  it('uses target-authoritative directional Multiplying Modifiers compatibility', () => {
    const legacyTarget = buildSetupSnapshotV1(setupInput());
    const current = buildSetupSnapshotV2(setupInput({
      multiplyingModifiersAllocated: true,
      multiplyingModifiersFragmentCount: 4,
    }));
    expect(compareSetupSnapshots(legacyTarget, current)).toEqual([]);
    expect(compareSetupSnapshots(current, legacyTarget)).toEqual([
      {
        field: 'multiplyingModifiers',
        expected: { allocated: true, fragmentCount: 4 },
        actual: undefined,
      },
    ]);
    const changed = buildSetupSnapshotV2(setupInput({
      multiplyingModifiersAllocated: true,
      multiplyingModifiersFragmentCount: 3,
    }));
    expect(compareSetupSnapshots(current, changed).map((entry) => entry.field)).toEqual([
      'multiplyingModifiers',
    ]);
  });
});
