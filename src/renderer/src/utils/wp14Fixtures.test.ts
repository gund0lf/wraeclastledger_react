import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIELD_OWNERSHIP } from '../store/fieldOwnership';
import {
  WP14_FIXTURE_SEED,
  WP14_LEGACY_V17_STORE_VERSION,
  WP14_NEWER_STORE_VERSION,
  WP14_STORE_VERSION,
  WP14_TEN_MIB,
  anonymizeProfileExport,
  generateProfileWp14Fixtures,
  generateSmallWp14Fixtures,
  type PersistEnvelope,
  type SessionExportEnvelope,
} from './__fixtures__/wp14Fixtures';

const parse = <T>(content: string): T => JSON.parse(content) as T;

const POST_CUTOVER_ONLY_KEYS = new Set([
  'repositoryStatus', 'repositoryError', 'repositorySessions', 'repositorySizeBytes',
  'currentGeneration', 'preferencesGeneration', 'layoutGeneration', 'saveStatus',
  'saveError', 'sessionLifecycle', 'liveSessionId', 'activationCheckpointNotice',
  'historyStoragePressure', 'manualRunTimer', 'manualTimerRecoveryMs',
  'overlayPreferences', 'overlayShortcutStatus',
]);
const LEGACY_V18_DATA_KEYS = Object.keys(FIELD_OWNERSHIP)
  .filter((key) => !POST_CUTOVER_ONLY_KEYS.has(key))
  .sort();

const sampleExport = (): SessionExportEnvelope => ({
  version: '1.0',
  exportedAt: '2026-07-06T00:00:00.000Z',
  sessions: [{
    id: 'source-session',
    name: '3333',
    createdAt: '2026-07-05T00:00:00.000Z',
    maps: [{ id: 'map', name: 'Real Map', rawText: undefined }],
    lootItems: [{ id: 'loot', name: 'Divine Orb' }],
    baselineItems: [{ id: 'base', name: 'Chaos Orb' }],
    baselineTotal: 10,
    settings: { discordTag: 'source-discord' },
    discordTag: 'outer-discord',
    notes: 'private notes',
  }],
});

describe('WP14 Phase 0 deterministic fixture generation', () => {
  it('produces byte-identical small fixtures for the same fixed seed', () => {
    expect(generateSmallWp14Fixtures(WP14_FIXTURE_SEED))
      .toEqual(generateSmallWp14Fixtures(WP14_FIXTURE_SEED));
  });

  it('keeps every tracked JSON artifact byte-identical to its generator output', () => {
    for (const fixture of generateSmallWp14Fixtures()) {
      const onDisk = readFileSync(
        new URL(`./__fixtures__/wp14/${fixture.fileName}`, import.meta.url),
        'utf8',
      );
      expect(onDisk, fixture.fileName).toBe(fixture.content);
    }
  });

  it('uses full persist envelopes for lifecycle fixtures', () => {
    const fixtures = generateSmallWp14Fixtures();
    const names = [
      'legacy-v13-envelope.json',
      'legacy-v17-envelope.json',
      'legacy-v18-envelope.json',
      'active-named-dirty-envelope.json',
      'unnamed-working-envelope.json',
    ];
    for (const name of names) {
      const envelope = parse<PersistEnvelope>(
        fixtures.find((fixture) => fixture.fileName === name)!.content,
      );
      expect(envelope).toHaveProperty('state');
      expect(envelope).toHaveProperty('version');
      expect(envelope).not.toHaveProperty('sessions');
    }
  });

  it('keeps every current v18 data field in full current envelopes', () => {
    const fixtures = generateSmallWp14Fixtures();
    for (const name of [
      'active-named-dirty-envelope.json',
      'unnamed-working-envelope.json',
    ]) {
      const envelope = parse<PersistEnvelope>(
        fixtures.find((fixture) => fixture.fileName === name)!.content,
      );
      expect(envelope.version).toBe(WP14_STORE_VERSION);
      expect(Object.keys(envelope.state).sort()).toEqual(LEGACY_V18_DATA_KEYS);
    }
  });

  it('preserves the pre-retrospective historical v17 wire shape', () => {
    const fixture = generateSmallWp14Fixtures()
      .find((item) => item.fileName === 'legacy-v17-envelope.json')!;
    const envelope = parse<PersistEnvelope>(fixture.content);
    expect(envelope.version).toBe(WP14_LEGACY_V17_STORE_VERSION);
    expect(envelope.state).not.toHaveProperty('retrospectiveCloseouts');
    expect(envelope.state).not.toHaveProperty('manualLootItems');
    expect(envelope.state).not.toHaveProperty('manualStatistics');
    const saved = Object.values(
      envelope.state.savedSessions as Record<string, Record<string, unknown>>,
    )[0];
    expect(saved).not.toHaveProperty('manualLootItems');
    expect(saved).not.toHaveProperty('manualStatistics');
  });

  it('captures current v18 manual loot and statistics in migration fixtures', () => {
    const fixture = generateSmallWp14Fixtures()
      .find((item) => item.fileName === 'legacy-v18-envelope.json')!;
    const envelope = parse<PersistEnvelope>(fixture.content);
    expect(envelope.version).toBe(WP14_STORE_VERSION);
    expect(envelope.state.manualLootItems).not.toEqual([]);
    expect(envelope.state.manualStatistics).toMatchObject({ starfallCraters: 0 });
  });

  it('models current rawText but preserves the rawText-free saved-session behavior', () => {
    const fixture = generateSmallWp14Fixtures()
      .find((item) => item.fileName === 'active-named-dirty-envelope.json')!;
    const envelope = parse<PersistEnvelope>(fixture.content);
    const activeMaps = envelope.state.maps as Array<Record<string, unknown>>;
    const saved = Object.values(
      envelope.state.savedSessions as Record<string, Record<string, unknown>>,
    )[0];
    const savedMaps = saved.maps as Array<Record<string, unknown>>;
    expect(activeMaps.some((map) => typeof map.rawText === 'string')).toBe(true);
    expect(savedMaps.every((map) => !Object.hasOwn(map, 'rawText'))).toBe(true);
  });

  it('keeps the duplicate fixture in the genuine session-export wire format only', () => {
    const fixtures = generateSmallWp14Fixtures();
    const fixture = fixtures.find((item) => item.fileName === 'duplicate-import.json')!;
    const exported = parse<SessionExportEnvelope>(fixture.content);
    const active = parse<PersistEnvelope>(
      fixtures.find((item) => item.fileName === 'active-named-dirty-envelope.json')!.content,
    );
    const existingId = Object.keys(active.state.savedSessions as Record<string, unknown>)[0];
    expect(exported.version).toBe('1.0');
    expect(exported.sessions).toHaveLength(2);
    expect(exported.sessions[0].id).toBe(existingId);
    expect(exported).not.toHaveProperty('state');
  });

  it('covers empty, malformed, truncated, inconsistent, and newer-schema corruption', () => {
    const fixtures = new Map(generateSmallWp14Fixtures().map((item) => [item.fileName, item]));
    expect(fixtures.get('corrupt-empty.json')!.content).toBe('');
    expect(() => parse(fixtures.get('corrupt-malformed.json')!.content)).toThrow();
    expect(() => parse(fixtures.get('corrupt-truncated.json')!.content)).toThrow();

    const inconsistent = parse<PersistEnvelope>(
      fixtures.get('corrupt-inconsistent-envelope.json')!.content,
    );
    expect(inconsistent.state.maps).toBe('not-an-array');
    expect(inconsistent.state.settings).toBeNull();

    const newer = parse<PersistEnvelope>(
      fixtures.get('corrupt-newer-version-envelope.json')!.content,
    );
    expect(newer.version).toBe(WP14_NEWER_STORE_VERSION);
    expect(newer.version).toBeGreaterThan(WP14_STORE_VERSION);
  });

  it('scrubs notes and Discord identifiers without changing map or item data', () => {
    const source = sampleExport();
    const anonymized = anonymizeProfileExport(source);
    const before = source.sessions[0];
    const after = anonymized.sessions[0];
    expect(after.notes).not.toBe(before.notes);
    expect(new TextEncoder().encode(after.notes as string)).toHaveLength(
      new TextEncoder().encode(before.notes as string).length,
    );
    expect(after.discordTag).not.toBe(before.discordTag);
    expect((after.settings as Record<string, unknown>).discordTag)
      .not.toBe((before.settings as Record<string, unknown>).discordTag);
    expect(after.maps).toEqual(before.maps);
    expect(after.lootItems).toEqual(before.lootItems);
    expect(after.baselineItems).toEqual(before.baselineItems);
  });

  it('builds profile artifacts deterministically and defines an explicit 10 MiB class', () => {
    const source = sampleExport();
    const first = generateProfileWp14Fixtures(source, WP14_FIXTURE_SEED, 64 * 1024);
    const second = generateProfileWp14Fixtures(source, WP14_FIXTURE_SEED, 64 * 1024);
    expect(first).toEqual(second);
    expect(WP14_TEN_MIB).toBe(10 * 1024 * 1024);

    const profileSource = parse<SessionExportEnvelope>(
      first.find((fixture) => fixture.fileName === 'anonymized-session-export.json')!.content,
    );
    expect(profileSource).toHaveProperty('sessions');
    expect(profileSource).not.toHaveProperty('state');

    for (const fileName of [
      'large-session-envelope.json',
      'rawtext-heavy-10mib-envelope.json',
      'many-session-envelope.json',
    ]) {
      const generated = parse<PersistEnvelope>(
        first.find((fixture) => fixture.fileName === fileName)!.content,
      );
      expect(generated.version).toBe(WP14_STORE_VERSION);
      expect(Object.keys(generated.state).sort()).toEqual(LEGACY_V18_DATA_KEYS);
    }

    const rawTextFixture = first.find(
      (fixture) => fixture.fileName === 'rawtext-heavy-10mib-envelope.json',
    )!;
    expect(new TextEncoder().encode(rawTextFixture.content).length).toBeGreaterThanOrEqual(64 * 1024);
    const envelope = parse<PersistEnvelope>(rawTextFixture.content);
    expect((envelope.state.maps as Array<Record<string, unknown>>)
      .every((map) => typeof map.rawText === 'string')).toBe(true);
  });

  it('builds a deterministic 100-session catalogue', () => {
    const fixture = generateProfileWp14Fixtures(sampleExport(), WP14_FIXTURE_SEED, 16 * 1024)
      .find((item) => item.fileName === 'many-session-envelope.json')!;
    const envelope = parse<PersistEnvelope>(fixture.content);
    expect(Object.keys(envelope.state.savedSessions as Record<string, unknown>)).toHaveLength(100);
  });
});
