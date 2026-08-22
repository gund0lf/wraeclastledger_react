import type { JsonObject, SessionBodyV1 } from './sessionRecord';

export const LEGACY_STORE_STORAGE_KEY = 'map-tracker-storage';
export const LEGACY_LAYOUT_STORAGE_KEY = 'wraeclast-layout-v1';
export const LEGACY_CHANGELOG_STORAGE_KEY = 'wraeclast-seen-version';
export const LEGACY_STORE_VERSION = 18;
export const LEGACY_MIGRATION_SCHEMA = 1;
export const SESSION_REPOSITORY_VERSION = 1;
export const SESSION_CONTENT_VERSION = 1;

export interface LegacyStorageValue {
  key: string;
  rawValue: string | null;
}

export interface LegacyStorageSnapshot {
  store: LegacyStorageValue;
  layout: LegacyStorageValue;
  changelog: LegacyStorageValue;
}

export interface LegacyMigrationSession {
  target: { kind: 'working' } | { kind: 'session'; sessionId: string };
  current: SessionBodyV1;
  checkpoint?: SessionBodyV1;
}

export interface LegacyMigrationPlanV1 {
  schema: typeof LEGACY_MIGRATION_SCHEMA;
  repositoryVersion: typeof SESSION_REPOSITORY_VERSION;
  repositoryId: string;
  operationId: string;
  createdAt: string;
  sourceStoreVersion: number;
  sourceHash: string;
  sourceValues: LegacyStorageValue[];
  sessions: LegacyMigrationSession[];
  preferences: JsonObject;
  layout: JsonObject;
  bootstrap: JsonObject;
  catalog: JsonObject;
  expectedSessionIds: string[];
}

export type LegacyMigrationStage =
  | 'owner-written'
  | 'legacy-backed-up'
  | 'records-written'
  | 'records-verified'
  | 'ready-written'
  | 'root-promoted'
  | 'complete-written';

export interface RepositoryMigrationMetadataV1 {
  operationId: string;
  sourceHash: string;
  sourceStoreVersion: number;
  state: 'ready' | 'complete';
  createdAt: string;
  verifiedAt: string;
  completedAt?: string;
}

export interface RepositoryStorageV1 {
  repositoryVersion: typeof SESSION_REPOSITORY_VERSION;
  repositoryId: string;
  migration: RepositoryMigrationMetadataV1;
}
