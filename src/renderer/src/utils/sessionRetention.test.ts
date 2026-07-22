import { describe, expect, it } from 'vitest';
import {
  MAX_COMPRESSED_VERSION_BYTES_PER_SESSION,
  MAX_PROTECTED_DESTRUCTIVE_VERSIONS_PER_SESSION,
  MAX_RECOVERY_STORAGE_BYTES,
  MAX_VERSIONS_PER_SESSION,
  PERIODIC_CHECKPOINT_INTERVAL_MS,
  TRASH_MAX_BYTES,
  TRASH_MAX_ENTRIES,
  applyGlobalRecoveryRetention,
  applyTrashRetention,
  applyVersionRetention,
  type VersionRetentionEntry,
} from '../../../main/sessionRetention';

const atHour = (hour: number): string => new Date(Date.UTC(2026, 6, 22, hour)).toISOString();

const version = (
  id: string,
  hour: number,
  reason: VersionRetentionEntry['reason'],
  compressedBytes = 50_000,
  isCurrentActivationBaseline = false,
): VersionRetentionEntry => ({
  id,
  createdAt: atHour(hour),
  compressedBytes,
  reason,
  isCurrentActivationBaseline,
});

describe('WP14 per-session retention', () => {
  it('locks the Phase 0 constants', () => {
    expect(MAX_VERSIONS_PER_SESSION).toBe(24);
    expect(MAX_COMPRESSED_VERSION_BYTES_PER_SESSION).toBe(2 * 1024 * 1024);
    expect(MAX_PROTECTED_DESTRUCTIVE_VERSIONS_PER_SESSION).toBe(8);
    expect(PERIODIC_CHECKPOINT_INTERVAL_MS).toBe(30 * 60 * 1000);
  });

  it('cannot evict the Undo baseline after five hours of periodic checkpoints', () => {
    const baseline = version('activation-baseline', 0, 'activation', 50_000, true);
    const protectedVersions = Array.from({ length: 8 }, (_, index) => (
      version(`destructive-${index}`, index + 1, index % 2 ? 'pre-restore' : 'destructive')
    ));
    const periodic = Array.from({ length: 10 }, (_, index) => (
      version(`periodic-${index}`, index + 9, 'periodic')
    ));
    const result = applyVersionRetention([baseline, ...protectedVersions, ...periodic]);
    expect(result.pruned).toHaveLength(0);
    expect(result.kept.find(({ entry }) => entry.id === baseline.id)?.reason)
      .toBe('current-activation-baseline');
  });

  it('prunes oldest periodic checkpoints first under count pressure', () => {
    const pinned = version('pinned', 0, 'activation', 100, true);
    const protectedVersions = Array.from({ length: 10 }, (_, index) => (
      version(`protected-${index}`, index + 1, 'destructive', 100)
    ));
    const ordinary = Array.from({ length: 8 }, (_, index) => (
      version(`activation-${index}`, index + 11, 'activation', 100)
    ));
    const periodic = Array.from({ length: 12 }, (_, index) => (
      version(`periodic-${index}`, index + 19, 'periodic', 100)
    ));
    const result = applyVersionRetention([pinned, ...protectedVersions, ...ordinary, ...periodic]);
    expect(result.kept).toHaveLength(24);
    expect(result.pruned.slice(0, 7).every(({ reason }) => reason.startsWith('periodic-'))).toBe(true);
    expect(result.kept.some(({ entry }) => entry.id === 'pinned')).toBe(true);
    expect(result.kept.filter(({ reason }) => reason === 'protected-destructive')).toHaveLength(8);
  });

  it('uses periodic, ordinary activation, then excess-protected byte priority', () => {
    const entries = [
      version('pinned', 0, 'activation', 300_000, true),
      ...Array.from({ length: 9 }, (_, index) => (
        version(`destructive-${index}`, index + 1, 'destructive', 300_000)
      )),
      version('ordinary', 10, 'activation', 300_000),
      version('periodic', 11, 'periodic', 300_000),
    ];
    const result = applyVersionRetention(entries);
    expect(result.pruned.slice(0, 3).map(({ entry }) => entry.id))
      .toEqual(['periodic', 'ordinary', 'destructive-0']);
    expect(result.storagePressure).toBe(true);
    expect(result.kept.some(({ entry }) => entry.id === 'pinned')).toBe(true);
  });

  it('reports pressure instead of deleting promised recovery records', () => {
    const promised = [
      version('pinned', 0, 'activation', 1_500_000, true),
      version('destructive', 1, 'destructive', 1_500_000),
    ];
    const result = applyVersionRetention(promised);
    expect(result.pruned).toHaveLength(0);
    expect(result.storagePressure).toBe(true);
    expect(result.refuseOptionalCheckpoints).toBe(true);
  });
});

describe('WP14 Recently Deleted retention', () => {
  it('prunes expired entries first, then oldest entries for count pressure', () => {
    const now = new Date('2026-07-22T12:00:00.000Z');
    const entries = [
      { id: 'expired', deletedAt: '2026-06-01T00:00:00.000Z', bytes: 1 },
      ...Array.from({ length: TRASH_MAX_ENTRIES + 1 }, (_, index) => ({
        id: `recent-${index}`,
        deletedAt: new Date(Date.UTC(2026, 6, 1, index)).toISOString(),
        bytes: 1,
      })),
    ];
    const result = applyTrashRetention(entries, now);
    expect(result.pruned[0]).toMatchObject({ entry: { id: 'expired' }, reason: 'expired' });
    expect(result.pruned[1]).toMatchObject({ entry: { id: 'recent-0' }, reason: 'entry-count-pressure' });
    expect(result.kept).toHaveLength(TRASH_MAX_ENTRIES);
  });

  it('prunes oldest entries until the byte budget passes', () => {
    const result = applyTrashRetention([
      { id: 'old', deletedAt: '2026-07-20T00:00:00.000Z', bytes: TRASH_MAX_BYTES },
      { id: 'new', deletedAt: '2026-07-21T00:00:00.000Z', bytes: 1 },
    ], new Date('2026-07-22T00:00:00.000Z'));
    expect(result.pruned).toEqual([expect.objectContaining({ entry: expect.objectContaining({ id: 'old' }), reason: 'byte-pressure' })]);
    expect(result.kept.map(({ entry }) => entry.id)).toEqual(['new']);
  });
});

describe('WP14 global recovery retention', () => {
  it('uses deterministic cross-entry priority and never prunes promised data', () => {
    const chunk = 70 * 1024 * 1024;
    const result = applyGlobalRecoveryRetention([
      { id: 'promised', createdAt: atHour(0), bytes: chunk, classification: 'promised-recovery' },
      { id: 'protected-excess', createdAt: atHour(1), bytes: chunk, classification: 'excess-protected' },
      { id: 'trash', createdAt: atHour(2), bytes: chunk, classification: 'trash' },
      { id: 'activation', createdAt: atHour(3), bytes: chunk, classification: 'ordinary-activation' },
      { id: 'periodic', createdAt: atHour(4), bytes: chunk, classification: 'periodic' },
    ]);
    expect(result.pruned.map(({ entry }) => entry.id)).toEqual(['periodic', 'activation']);
    expect(result.kept.some(({ entry }) => entry.id === 'promised')).toBe(true);
    expect(result.keptBytes).toBeLessThanOrEqual(MAX_RECOVERY_STORAGE_BYTES);
  });

  it('removes globally expired trash even when below the byte cap', () => {
    const result = applyGlobalRecoveryRetention([
      { id: 'expired', createdAt: atHour(0), bytes: 1, classification: 'expired-trash' },
      { id: 'periodic', createdAt: atHour(1), bytes: 1, classification: 'periodic' },
    ]);
    expect(result.pruned.map(({ entry, reason }) => [entry.id, reason]))
      .toEqual([['expired', 'expired-trash']]);
    expect(result.kept.map(({ entry }) => entry.id)).toEqual(['periodic']);
  });

  it('reports global pressure when non-prunable promises alone exceed the cap', () => {
    const result = applyGlobalRecoveryRetention([
      { id: 'current', createdAt: atHour(0), bytes: MAX_RECOVERY_STORAGE_BYTES, classification: 'authoritative' },
      { id: 'baseline', createdAt: atHour(1), bytes: MAX_RECOVERY_STORAGE_BYTES + 1, classification: 'promised-recovery' },
    ]);
    expect(result.pruned).toHaveLength(0);
    expect(result.storagePressure).toBe(true);
    expect(result.refuseOptionalCheckpoints).toBe(true);
    expect(result.kept.find(({ entry }) => entry.id === 'current')?.reason)
      .toBe('authoritative-outside-recovery-cap');
  });
});
