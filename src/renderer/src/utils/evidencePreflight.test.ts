import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { buildDiscordExport } from './discordExport';
import {
  authoredRollupFromDiscordImport,
  fingerprintSetupSnapshot,
  setupSnapshotFromDiscordImport,
} from './evidenceIdentity';
import { EvidencePreflightError, prepareEvidenceSubmission } from './evidencePreflight';
import { parseDiscordExport } from './parseDiscordExport';
import type { SessionSettings } from '../types';

const maps = [
  { quantity: 100, rarity: 60, packSize: 40, moreCurrency: 20, moreScarabs: 10, explicitModCount: 6 },
  { quantity: 110, rarity: 70, packSize: 45, moreCurrency: 25, moreScarabs: 15, explicitModCount: 6 },
];

function makeSettings(overrides: Partial<SessionSettings> = {}): SessionSettings {
  return {
    ...DEFAULT_SETTINGS,
    leagueName: 'Allflame',
    mapType: '6-mod',
    chiselUsed: true,
    chiselType: 'Currency',
    chiselPrice: 2,
    scarabs: [
      { name: 'Trarthan Scarab', cost: 2 },
      { name: '', cost: 0 },
      { name: '', cost: 0 },
      { name: '', cost: 0 },
      { name: '', cost: 0 },
    ],
    atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#ABC123',
    mountingModifiers: true,
    smallNodesAllocated: 7,
    atlasBonus: true,
    ...overrides,
  };
}

function makeExport(
  settings: SessionSettings,
  revision = 3,
  runMaps = maps,
): string {
  return buildDiscordExport({
    maps: runMaps,
    settings,
    lootItems: [],
    baselineTotal: 0,
    investmentNeutralization: 0,
    stratName: 'Evidence fixture',
    shareTags: ['regular'],
    isGroupPlay: false,
    sessionMinutes: 10,
    gameDataRevision: revision,
    gameDataPatchVersion: '3.29.0',
  });
}

function asLegacyWire(raw: string): string {
  return raw.replace(/^\*\*Multiplying Modifiers:\*\*.*(?:\r?\n|$)/m, '');
}

async function targetFingerprint(raw: string): Promise<string> {
  const parsed = parseDiscordExport(raw);
  if (!parsed) throw new Error('fixture did not parse');
  return fingerprintSetupSnapshot(setupSnapshotFromDiscordImport(parsed));
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error('expected preflight to reject');
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(EvidencePreflightError);
    expect((error as EvidencePreflightError).code).toBe(code);
  }
}

describe('evidence submission preflight', () => {
  it('includes authored setup costs in the run identity rollup', () => {
    const raw = makeExport(makeSettings({
      advDeliOrbType: 'Fine',
      advDeliOrbQtyPerMap: 2,
      advDeliOrbPriceEach: 5,
      advAstrolabeType: 'Deceptive Astrolabe',
      advAstrolabeCount: 3,
      advAstrolabePrice: 4,
    }));
    const parsed = parseDiscordExport(raw);
    if (!parsed) throw new Error('fixture did not parse');
    expect(authoredRollupFromDiscordImport(parsed).costBreakdown).toEqual({
      chisel: { name: 'Currency', priceEach: 2 },
      scarabs: [{ name: 'Trarthan Scarab', priceEach: 2 }],
      delirium: { type: 'Fine', countPerMap: 2, priceEach: 5 },
      astrolabe: { type: 'Deceptive Astrolabe', count: 3, priceEach: 4 },
    });
  });

  it('builds a deterministic proof for a compatible timestamped run', async () => {
    const raw = makeExport(makeSettings());
    const proof = await prepareEvidenceSubmission({
      targetRawExport: raw,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(raw),
      localRawExport: raw,
      mapParsedAt: [1_000, 2_000],
    });
    expect(proof).toEqual({
      runKey: 'sha256-v1:9c5dd3fd7d830678cfe695aa9d2c7c2059e8a597135a208fcb0a7110cbb70e61',
      runStartedAt: '1970-01-01T00:00:01.000Z',
      runEndedAt: '1970-01-01T00:00:02.000Z',
      setupFingerprint: await targetFingerprint(raw),
      mapCount: 2,
    });
  });

  it('blocks stale revisions before accepting evidence', async () => {
    const raw = makeExport(makeSettings());
    await expectCode(prepareEvidenceSubmission({
      targetRawExport: raw,
      targetCurrentRevision: 5,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(raw),
      localRawExport: raw,
      mapParsedAt: [1_000, 2_000],
    }), 'revision_conflict');
  });

  it('blocks a changed target and a locally incompatible setup', async () => {
    const targetRaw = makeExport(makeSettings());
    const changedTarget = makeExport(makeSettings({ chiselType: 'Scarab' }));
    await expectCode(prepareEvidenceSubmission({
      targetRawExport: changedTarget,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(targetRaw),
      localRawExport: changedTarget,
      mapParsedAt: [1_000, 2_000],
    }), 'target_changed');

    await expectCode(prepareEvidenceSubmission({
      targetRawExport: targetRaw,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(targetRaw),
      localRawExport: makeExport(makeSettings({ mapType: '8-mod' })),
      mapParsedAt: [1_000, 2_000],
    }), 'setup_mismatch');
  });

  it('blocks old maps without timestamps', async () => {
    const raw = makeExport(makeSettings());
    await expectCode(prepareEvidenceSubmission({
      targetRawExport: raw,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(raw),
      localRawExport: raw,
      mapParsedAt: [1_000, undefined],
    }), 'missing_timestamps');
  });

  it('allows game-data revision provenance to differ when the setup still matches', async () => {
    const targetRaw = makeExport(makeSettings(), 2);
    const localRaw = makeExport(makeSettings(), 3);
    await expect(prepareEvidenceSubmission({
      targetRawExport: targetRaw,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(targetRaw),
      localRawExport: localRaw,
      mapParsedAt: [1_000, 2_000],
    })).resolves.toMatchObject({ mapCount: 2 });
  });

  it('applies target-authoritative Multiplying Modifiers compatibility', async () => {
    const currentTarget = makeExport(makeSettings({
      multiplyingModifiersAllocated: true,
      fragmentCountOverride: 4,
    }));
    const legacyTarget = asLegacyWire(currentTarget);

    await expect(prepareEvidenceSubmission({
      targetRawExport: legacyTarget,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(legacyTarget),
      localRawExport: currentTarget,
      mapParsedAt: [1_000, 2_000],
    })).resolves.toMatchObject({ mapCount: 2 });

    await expectCode(prepareEvidenceSubmission({
      targetRawExport: currentTarget,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(currentTarget),
      localRawExport: legacyTarget,
      mapParsedAt: [1_000, 2_000],
    }), 'setup_mismatch');

    const changedCount = makeExport(makeSettings({
      multiplyingModifiersAllocated: true,
      fragmentCountOverride: 3,
    }));
    await expectCode(prepareEvidenceSubmission({
      targetRawExport: currentTarget,
      targetCurrentRevision: 4,
      expectedRevision: 4,
      persistedTargetFingerprint: await targetFingerprint(currentTarget),
      localRawExport: changedCount,
      mapParsedAt: [1_000, 2_000],
    }), 'setup_mismatch');
  });

  it('accepts the live published 1.51 and evidence 1.49 observed-multiplier case', async () => {
    const settings = makeSettings({
      multiplyingModifiersAllocated: true,
      fragmentCountOverride: 5,
      smallNodesAllocated: 16,
      mountingModifiers: true,
    });
    const targetMaps = Array.from({ length: 6 }, () => ({
      quantity: 100,
      rarity: 60,
      packSize: 40,
      moreCurrency: 20,
      moreScarabs: 10,
      explicitModCount: 2,
    }));
    const localMaps = Array.from({ length: 9 }, () => ({
      quantity: 100,
      rarity: 60,
      packSize: 40,
      moreCurrency: 20,
      moreScarabs: 10,
      explicitModCount: 1,
    }));
    const targetRaw = makeExport(settings, 3, targetMaps);
    const localRaw = makeExport(settings, 3, localMaps);
    expect(parseDiscordExport(targetRaw)?.multiplier).toBe(1.51);
    expect(parseDiscordExport(localRaw)?.multiplier).toBe(1.49);

    await expect(prepareEvidenceSubmission({
      targetRawExport: targetRaw,
      targetCurrentRevision: 1,
      expectedRevision: 1,
      persistedTargetFingerprint: await targetFingerprint(targetRaw),
      localRawExport: localRaw,
      mapParsedAt: localMaps.map((_, index) => 1_000 + index),
    })).resolves.toMatchObject({ mapCount: 9 });
  });
});
