import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertSessionFieldsEqual,
  payloadFromPortable,
  portableSession,
} from '../../../../scripts/wp14-session-export-contract';
import { FileSessionRepository } from '../../../main/sessionRepository';
import { SESSION_PAYLOAD_KEYS, SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY } from '../../../shared/sessionPayload';
import type { JsonObject } from '../../../shared/sessionRecord';
import {
  LEGACY_CHANGELOG_STORAGE_KEY,
  LEGACY_LAYOUT_STORAGE_KEY,
  LEGACY_STORE_STORAGE_KEY,
} from '../../../shared/sessionMigration';
import { migrateSessionEnvelope } from '../repository/legacySessionMigration';
import { decodeSessionPayload, encodeSessionPayload } from '../repository/sessionPayloadCodec';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { EMPTY_MANUAL_RUN_TIMER } from './manualRunTimer';

const timerCases: Array<[string, JsonObject | undefined]> = [
  ['omitted legacy field', undefined],
  ['empty object', {}],
  ['explicit zero', { ...EMPTY_MANUAL_RUN_TIMER }],
  ['paused', { ...EMPTY_MANUAL_RUN_TIMER, accumulatedMs: 12_345 }],
  ['running', { accumulatedMs: 12_345, runningSince: 100_000, lastHeartbeatAt: 130_000, finishedAt: null }],
  ['finished', { ...EMPTY_MANUAL_RUN_TIMER, accumulatedMs: 33_245, finishedAt: 1787600168333 }],
];
const roots: string[] = [];
const repositories: FileSessionRepository[] = [];
afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.releaseLock()));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function session(timer: JsonObject | undefined, id = 'timer-regression'): JsonObject {
  return JSON.parse(JSON.stringify({
    id, name: 'Portable regression', createdAt: '2026-08-22T15:00:00.000Z',
    maps: [{ id: 'map-1', tier: 16, explicitModCount: 8, rawText: 'retained clipboard' }],
    lootItems: [{ id: 'loot-1', name: 'Chaos Orb', total: 29 }],
    baselineItems: [{ id: 'baseline-1', total: 17 }], baselineTotal: 17,
    manualLootItems: [{ id: 'manual-1', name: 'Chart', total: 120 }],
    manualStatistics: { wildwoodEncounters: 0 },
    ...(timer !== undefined ? { manualRunTimer: timer } : {}),
    settings: { ...DEFAULT_SETTINGS, atlasTreeUrl: 'https://pathofpathing.com/?v=3.29.0-atlas#retained', atlasPoints: 138 },
    notes: 'private fixture note', investmentNeutralization: 7, investmentDismissed: true,
    strategySourceContext: null,
  })) as JsonObject;
}

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'wl-portable-timer-test-'));
  roots.push(root);
  return root;
}

describe('portable-session verification contract', () => {
  it('covers every portable and repository field without ignoring timers', () => {
    const input = session({ ...EMPTY_MANUAL_RUN_TIMER, accumulatedMs: 123 });
    expect(Object.keys(payloadFromPortable(input)).sort()).toEqual([...SESSION_PAYLOAD_KEYS].sort());
    expect(Object.keys(portableSession(input)).sort()).toEqual([
      'id', 'name', 'createdAt', ...Object.values(SESSION_PAYLOAD_PORTABLE_KEY_BY_PAYLOAD_KEY),
    ].sort());
    const expected = payloadFromPortable(input);
    for (const key of SESSION_PAYLOAD_KEYS) {
      const changed = { ...expected, [key]: 'unexpected replacement' };
      expect(() => assertSessionFieldsEqual(changed, expected, 'Regression')).toThrow(key);
      const missing = { ...expected };
      delete missing[key];
      expect(() => assertSessionFieldsEqual(missing, expected, 'Regression')).toThrow(key);
    }
  });

  it('reports a timer loss without dumping user content or normalizing it away', () => {
    const expected = payloadFromPortable(session({ ...EMPTY_MANUAL_RUN_TIMER, accumulatedMs: 33_245 }));
    const actual = { ...expected, manualRunTimer: { ...EMPTY_MANUAL_RUN_TIMER } };
    expect(() => assertSessionFieldsEqual(actual, expected, 'Imported payload'))
      .toThrow('Imported payload: session fields differ: manualRunTimer');
    const unusual = session({ accumulatedMs: -1, futureField: 99 });
    expect(payloadFromPortable(unusual).manualRunTimer).toEqual(unusual.manualRunTimer);
    // An object-preserving verifier must not hide malformed/unknown timer data either.
    expect(() => assertSessionFieldsEqual(
      { ...payloadFromPortable(unusual), manualRunTimer: {} }, payloadFromPortable(unusual), 'Payload',
    )).toThrow('manualRunTimer');
  });

  it.each(timerCases)('preserves %s through import, inspection, export and re-import', async (_name, timer) => {
    const repository = new FileSessionRepository({ userDataPath: await tempRoot(), openPath: async () => '' });
    repositories.push(repository);
    const plan = await migrateSessionEnvelope({
      store: { key: LEGACY_STORE_STORAGE_KEY, rawValue: await readFile(new URL(
        './__fixtures__/wp14/unnamed-working-envelope.json', import.meta.url,
      ), 'utf8') },
      layout: { key: LEGACY_LAYOUT_STORAGE_KEY, rawValue: null },
      changelog: { key: LEGACY_CHANGELOG_STORAGE_KEY, rawValue: null },
    }, { repositoryId: 'timer-test', operationId: 'timer-test', now: new Date('2026-08-22T20:00:00.000Z') });
    await repository.bootstrap({ operation: 'bootstrap', migrationPlan: plan });
    const input = session(timer);
    const source = JSON.stringify({ version: '1.0', sessions: [input] });
    await repository.importDocument({ operation: 'import', document: source, conflictMode: 'skip' });
    const loaded = await repository.load({ operation: 'load', target: { kind: 'session', sessionId: String(input.id) }, mode: 'inspect' });
    expect(loaded.payload.manualRunTimer).toEqual(timer ?? {});
    assertSessionFieldsEqual(loaded.payload, payloadFromPortable(input), 'Imported payload');

    const decoded = decodeSessionPayload(loaded.payload, DEFAULT_SETTINGS);
    const runtimeTimer = timer && Object.keys(timer).length > 0 ? timer : EMPTY_MANUAL_RUN_TIMER;
    expect(decoded.manualRunTimer).toEqual(runtimeTimer);
    // Decode is not lifecycle recovery: running timestamps are not advanced or paused.
    assertSessionFieldsEqual(encodeSessionPayload(decoded), {
      ...loaded.payload, manualRunTimer: runtimeTimer,
    }, 'Renderer codec');

    const first = await repository.exportDocument({ operation: 'export', sessionIds: [String(input.id)] });
    const exported = JSON.parse(first.document).sessions[0];
    assertSessionFieldsEqual(exported, portableSession(input), 'Exported session');
    await repository.importDocument({ operation: 'import', document: first.document, conflictMode: 'overwrite' });
    const second = await repository.exportDocument({ operation: 'export', sessionIds: [String(input.id)] });
    expect(JSON.parse(second.document).sessions).toEqual(JSON.parse(first.document).sessions);
    expect(JSON.stringify({ version: '1.0', sessions: [input] })).toBe(source);
  });

  it.each(['portable-round-trip-only', 'full-acceptance'])(
    'runs the actual %s CLI against all timer states with byte-identical inputs', async (mode) => {
    const file = join(await tempRoot(), 'timers.json');
    const sessions = timerCases.map(([, timer], index) => session(timer, `timer-${index}`));
    // The default acceptance suite must still exercise its original scenario gates.
    sessions[0].settings = {
      ...(sessions[0].settings as JsonObject), leagueName: 'Ancestors',
      scarabs: [{ name: 'Horned Scarab of Bloodlines', cost: 100 }],
    };
    const source = JSON.stringify({ version: '1.0', sessions });
    await writeFile(file, source, 'utf8');
    const { stdout } = await promisify(execFile)(process.execPath, [
      'scripts/run-vite-script.mjs', 'scripts/verify-wp14-session-exports.ts',
      ...(mode === 'portable-round-trip-only' ? ['--round-trip-only'] : []), file,
    ], { cwd: resolve('.'), timeout: 30_000 });
    const report = JSON.parse(stdout);
    expect(report.mode).toBe(mode);
    expect(report.suppliedSessions).toBe(6);
    expect(report.checks.map((check: { name: string }) => check.name)).toContain('portable export round-trip');
    expect(report.phase5Recovery.status).toBe(mode === 'portable-round-trip-only' ? 'not-run' : 'passed');
    if (mode === 'full-acceptance') {
      expect(report.checks.map((check: { name: string }) => check.name))
        .toContain('cross-league fork leaves source byte-semantics intact');
    }
    expect(report.sourceFilesModified).toBe(false);
    expect(report.inputs[0].sha256).toBe(createHash('sha256').update(source).digest('hex'));
    expect(await readFile(file, 'utf8')).toBe(source);
  }, 30_000);
});
