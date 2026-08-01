import { parseDiscordExport } from './parseDiscordExport';
import {
  authoredRollupFromDiscordImport,
  buildEvidenceRunIdentityV1,
  compareSetupSnapshots,
  fingerprintSetupSnapshot,
  setupSnapshotFromDiscordImport,
  type SetupMismatch,
} from './evidenceIdentity';

export type EvidencePreflightErrorCode =
  | 'target_unreadable'
  | 'local_unreadable'
  | 'revision_conflict'
  | 'target_changed'
  | 'setup_mismatch'
  | 'missing_timestamps';

export class EvidencePreflightError extends Error {
  readonly code: EvidencePreflightErrorCode;
  readonly mismatches: SetupMismatch[];

  constructor(code: EvidencePreflightErrorCode, message: string, mismatches: SetupMismatch[] = []) {
    super(message);
    this.name = 'EvidencePreflightError';
    this.code = code;
    this.mismatches = mismatches;
  }
}

export interface EvidenceSubmissionProof {
  runKey: string;
  runStartedAt: string;
  runEndedAt: string;
  setupFingerprint: string;
  mapCount: number;
}

/**
 * Re-prove an evidence run immediately before export. The server remains the
 * authority and independently reconstructs the same identities; this client
 * check prevents a stale or contaminated run from reaching Discord at all.
 */
export async function prepareEvidenceSubmission(input: {
  targetRawExport: string;
  targetCurrentRevision: number;
  expectedRevision: number;
  persistedTargetFingerprint: string;
  localRawExport: string;
  mapParsedAt: Array<number | undefined>;
}): Promise<EvidenceSubmissionProof> {
  if (input.targetCurrentRevision !== input.expectedRevision) {
    throw new EvidencePreflightError(
      'revision_conflict',
      `The published strategy changed from revision ${input.expectedRevision} to ${input.targetCurrentRevision}.`,
    );
  }

  const target = parseDiscordExport(input.targetRawExport);
  if (!target || target.operationError) {
    throw new EvidencePreflightError(
      'target_unreadable',
      'The current published strategy export cannot be verified.',
    );
  }
  const local = parseDiscordExport(input.localRawExport);
  if (!local || local.operationError) {
    throw new EvidencePreflightError(
      'local_unreadable',
      'This run cannot be reconstructed from its generated export.',
    );
  }

  const targetSnapshot = setupSnapshotFromDiscordImport(target);
  const currentTargetFingerprint = await fingerprintSetupSnapshot(targetSnapshot);
  if (currentTargetFingerprint !== input.persistedTargetFingerprint) {
    throw new EvidencePreflightError(
      'target_changed',
      'The published setup no longer matches the setup this evidence run started from.',
    );
  }

  const localSnapshot = setupSnapshotFromDiscordImport(local);
  const mismatches = compareSetupSnapshots(targetSnapshot, localSnapshot);
  if (mismatches.length > 0) {
    throw new EvidencePreflightError(
      'setup_mismatch',
      'This run no longer matches the published strategy setup.',
      mismatches,
    );
  }

  if (
    local.mapCount < 1
    || input.mapParsedAt.length !== local.mapCount
    || input.mapParsedAt.some((value) => !Number.isFinite(value))
  ) {
    throw new EvidencePreflightError(
      'missing_timestamps',
      'Every map in an evidence run needs its original capture timestamp.',
    );
  }
  const timestamps = input.mapParsedAt as number[];
  const runStartedAt = new Date(Math.min(...timestamps)).toISOString();
  const runEndedAt = new Date(Math.max(...timestamps)).toISOString();
  const setupFingerprint = await fingerprintSetupSnapshot(localSnapshot);
  const identity = await buildEvidenceRunIdentityV1({
    runStartedAt,
    runEndedAt,
    authoredRollup: authoredRollupFromDiscordImport(local),
    setupSnapshot: localSnapshot,
  });

  return {
    runKey: identity.runKey,
    runStartedAt,
    runEndedAt,
    setupFingerprint,
    mapCount: local.mapCount,
  };
}
