import type { CheckpointReason } from '../shared/sessionRecord';

export const MAX_VERSIONS_PER_SESSION = 24;
export const MAX_COMPRESSED_VERSION_BYTES_PER_SESSION = 2 * 1024 * 1024;
export const MAX_PROTECTED_DESTRUCTIVE_VERSIONS_PER_SESSION = 8;
export const PERIODIC_CHECKPOINT_INTERVAL_MS = 30 * 60 * 1000;
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_MAX_ENTRIES = 20;
export const TRASH_MAX_BYTES = 32 * 1024 * 1024;
export const MAX_RECOVERY_STORAGE_BYTES = 256 * 1024 * 1024;

export interface VersionRetentionEntry {
  id: string;
  createdAt: string;
  compressedBytes: number;
  reason: CheckpointReason;
  isCurrentActivationBaseline?: boolean;
}

export type VersionKeepReason =
  | 'current-activation-baseline'
  | 'protected-destructive'
  | 'within-session-budget'
  | 'recovery-promise-over-budget';

export type VersionPruneReason =
  | 'periodic-count-pressure'
  | 'periodic-byte-pressure'
  | 'periodic-count-and-byte-pressure'
  | 'ordinary-activation-count-pressure'
  | 'ordinary-activation-byte-pressure'
  | 'ordinary-activation-count-and-byte-pressure'
  | 'excess-protected-count-pressure'
  | 'excess-protected-byte-pressure'
  | 'excess-protected-count-and-byte-pressure';

export interface RetentionDecision<Entry, Reason extends string> {
  entry: Entry;
  reason: Reason;
}

export interface VersionRetentionResult {
  kept: Array<RetentionDecision<VersionRetentionEntry, VersionKeepReason>>;
  pruned: Array<RetentionDecision<VersionRetentionEntry, VersionPruneReason>>;
  storagePressure: boolean;
  refuseOptionalCheckpoints: boolean;
  keptBytes: number;
}

function assertRetentionEntry(id: string, createdAt: string, bytes: number): void {
  if (!id) throw new Error('Retention entry id must not be empty');
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(`Retention entry ${id} has invalid byte size`);
  }
  if (!Number.isFinite(Date.parse(createdAt))) {
    throw new Error(`Retention entry ${id} has invalid timestamp`);
  }
}

function assertUniqueIds(entries: readonly { id: string }[]): void {
  if (new Set(entries.map(({ id }) => id)).size !== entries.length) {
    throw new Error('Retention entries require unique ids');
  }
}

function oldestFirst<Entry extends { id: string; createdAt: string }>(left: Entry, right: Entry): number {
  return Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id);
}

function newestFirst<Entry extends { id: string; createdAt: string }>(left: Entry, right: Entry): number {
  return -oldestFirst(left, right);
}

export function applyVersionRetention(
  entries: readonly VersionRetentionEntry[],
): VersionRetentionResult {
  entries.forEach((entry) => assertRetentionEntry(entry.id, entry.createdAt, entry.compressedBytes));
  assertUniqueIds(entries);
  const ordered = [...entries].sort(newestFirst);
  const pinned = new Set(ordered.filter((entry) => entry.isCurrentActivationBaseline).map(({ id }) => id));
  const destructive = ordered.filter((entry) => (
    entry.reason === 'destructive' || entry.reason === 'pre-restore'
  ) && !pinned.has(entry.id));
  const protectedIds = new Set(destructive
    .slice(0, MAX_PROTECTED_DESTRUCTIVE_VERSIONS_PER_SESSION)
    .map(({ id }) => id));
  const excessProtectedIds = new Set(destructive
    .slice(MAX_PROTECTED_DESTRUCTIVE_VERSIONS_PER_SESSION)
    .map(({ id }) => id));
  const keptIds = new Set(ordered.map(({ id }) => id));
  let keptBytes = ordered.reduce((total, entry) => total + entry.compressedBytes, 0);
  const pruned: VersionRetentionResult['pruned'] = [];

  const candidates = [
    ...ordered.filter((entry) => entry.reason === 'periodic' && !pinned.has(entry.id)).sort(oldestFirst),
    ...ordered.filter((entry) => entry.reason === 'activation' && !pinned.has(entry.id)).sort(oldestFirst),
    ...ordered.filter((entry) => excessProtectedIds.has(entry.id)).sort(oldestFirst),
  ];
  for (const entry of candidates) {
    const countPressure = keptIds.size > MAX_VERSIONS_PER_SESSION;
    const bytePressure = keptBytes > MAX_COMPRESSED_VERSION_BYTES_PER_SESSION;
    if (!countPressure && !bytePressure) break;
    keptIds.delete(entry.id);
    keptBytes -= entry.compressedBytes;
    const category = entry.reason === 'periodic'
      ? 'periodic'
      : entry.reason === 'activation' ? 'ordinary-activation' : 'excess-protected';
    const pressure = countPressure && bytePressure
      ? 'count-and-byte'
      : countPressure ? 'count' : 'byte';
    pruned.push({
      entry,
      reason: `${category}-${pressure}-pressure` as VersionPruneReason,
    });
  }

  const storagePressure = keptIds.size > MAX_VERSIONS_PER_SESSION ||
    keptBytes > MAX_COMPRESSED_VERSION_BYTES_PER_SESSION;
  const kept = ordered.filter((entry) => keptIds.has(entry.id)).map((entry) => {
    let reason: VersionKeepReason = 'within-session-budget';
    if (pinned.has(entry.id)) reason = 'current-activation-baseline';
    else if (protectedIds.has(entry.id)) reason = 'protected-destructive';
    if (storagePressure && (pinned.has(entry.id) || protectedIds.has(entry.id))) {
      reason = 'recovery-promise-over-budget';
    }
    return { entry, reason };
  });
  return { kept, pruned, storagePressure, refuseOptionalCheckpoints: storagePressure, keptBytes };
}

export interface TrashRetentionEntry {
  id: string;
  deletedAt: string;
  bytes: number;
}

export type TrashPruneReason = 'expired' | 'entry-count-pressure' | 'byte-pressure';
export type TrashKeepReason = 'within-trash-policy';

export interface TrashRetentionResult {
  kept: Array<RetentionDecision<TrashRetentionEntry, TrashKeepReason>>;
  pruned: Array<RetentionDecision<TrashRetentionEntry, TrashPruneReason>>;
  keptBytes: number;
}

export function applyTrashRetention(
  entries: readonly TrashRetentionEntry[],
  now: Date,
): TrashRetentionResult {
  if (!Number.isFinite(now.getTime())) throw new Error('Trash retention requires a valid current time');
  entries.forEach((entry) => assertRetentionEntry(entry.id, entry.deletedAt, entry.bytes));
  assertUniqueIds(entries);
  const ordered = [...entries].sort((left, right) => oldestFirst(
    { ...left, createdAt: left.deletedAt },
    { ...right, createdAt: right.deletedAt },
  ));
  const keptIds = new Set(ordered.map(({ id }) => id));
  let keptBytes = ordered.reduce((total, entry) => total + entry.bytes, 0);
  const pruned: TrashRetentionResult['pruned'] = [];
  const expiryBoundary = now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  for (const entry of ordered) {
    if (Date.parse(entry.deletedAt) > expiryBoundary) continue;
    keptIds.delete(entry.id);
    keptBytes -= entry.bytes;
    pruned.push({ entry, reason: 'expired' });
  }
  for (const entry of ordered) {
    if (!keptIds.has(entry.id)) continue;
    const countPressure = keptIds.size > TRASH_MAX_ENTRIES;
    const bytePressure = keptBytes > TRASH_MAX_BYTES;
    if (!countPressure && !bytePressure) break;
    keptIds.delete(entry.id);
    keptBytes -= entry.bytes;
    pruned.push({ entry, reason: countPressure ? 'entry-count-pressure' : 'byte-pressure' });
  }
  return {
    kept: ordered.filter((entry) => keptIds.has(entry.id))
      .map((entry) => ({ entry, reason: 'within-trash-policy' })),
    pruned,
    keptBytes,
  };
}

export type GlobalRecoveryClass =
  | 'expired-trash'
  | 'periodic'
  | 'ordinary-activation'
  | 'trash'
  | 'excess-protected'
  | 'promised-recovery'
  | 'authoritative';

export interface GlobalRecoveryEntry {
  id: string;
  createdAt: string;
  bytes: number;
  classification: GlobalRecoveryClass;
}

export type GlobalPruneReason = Exclude<GlobalRecoveryClass, 'promised-recovery' | 'authoritative'>;
export type GlobalKeepReason =
  | 'within-global-budget'
  | 'promised-recovery'
  | 'authoritative-outside-recovery-cap'
  | 'recovery-promise-over-budget';

export interface GlobalRetentionResult {
  kept: Array<RetentionDecision<GlobalRecoveryEntry, GlobalKeepReason>>;
  pruned: Array<RetentionDecision<GlobalRecoveryEntry, GlobalPruneReason>>;
  storagePressure: boolean;
  refuseOptionalCheckpoints: boolean;
  keptBytes: number;
}

const globalPriority: GlobalPruneReason[] = [
  'expired-trash',
  'periodic',
  'ordinary-activation',
  'trash',
  'excess-protected',
];

export function applyGlobalRecoveryRetention(
  entries: readonly GlobalRecoveryEntry[],
): GlobalRetentionResult {
  entries.forEach((entry) => assertRetentionEntry(entry.id, entry.createdAt, entry.bytes));
  assertUniqueIds(entries);
  const ordered = [...entries].sort(oldestFirst);
  const keptIds = new Set(ordered.map(({ id }) => id));
  let keptBytes = ordered.reduce((total, entry) => (
    entry.classification === 'authoritative' ? total : total + entry.bytes
  ), 0);
  const pruned: GlobalRetentionResult['pruned'] = [];
  for (const classification of globalPriority) {
    for (const entry of ordered.filter((candidate) => candidate.classification === classification)) {
      if (classification !== 'expired-trash' && keptBytes <= MAX_RECOVERY_STORAGE_BYTES) break;
      keptIds.delete(entry.id);
      keptBytes -= entry.bytes;
      pruned.push({ entry, reason: classification });
    }
  }
  const storagePressure = keptBytes > MAX_RECOVERY_STORAGE_BYTES;
  const keptEntries = ordered.filter((entry) => keptIds.has(entry.id));
  return {
    kept: keptEntries.map((entry) => {
      let reason: GlobalKeepReason = 'within-global-budget';
      if (entry.classification === 'authoritative') reason = 'authoritative-outside-recovery-cap';
      else if (entry.classification === 'promised-recovery') {
        reason = storagePressure ? 'recovery-promise-over-budget' : 'promised-recovery';
      }
      return { entry, reason };
    }),
    pruned,
    storagePressure,
    refuseOptionalCheckpoints: storagePressure,
    keptBytes,
  };
}
