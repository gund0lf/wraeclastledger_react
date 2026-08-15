/**
 * Client mirror of the evidence-pooling identity contract.
 *
 * The API is authoritative. This module deliberately mirrors its canonical
 * snapshot and hashing rules so ShareModal can fail early and emit the exact
 * identity that the bot and API will independently reconstruct. Keep
 * both evidence-identity fixture files byte-identical to the server copies;
 * each repository pins those shared inputs and their expected hashes locally.
 */
import type { DiscordImport } from './parseDiscordExport';
import type { EvidenceCostBreakdown } from './evidenceApi';
import { normalizeLeagueKey } from './retrospectives';

export const EVIDENCE_IDENTITY_KIND = 'sha256-v1' as const;
export const SETUP_SCHEMA_VERSION = 1 as const;
export const SETUP_SCHEMA_VERSION_V2 = 2 as const;

export interface EvidenceSetupSnapshotV1 {
  schemaVersion: 1;
  leagueKey: string;
  mapType: string | null;
  partySize: number | null;
  chiselType: string | null;
  scarabs: string[];
  delirium: { type: string | null; countPerMap: number };
  astrolabeType: string | null;
  atlasAllocationHash: string | null;
  multiplierMilli: number;
  gameDataRevision: number | null;
  gameDataPatchVersion: string | null;
}

export interface EvidenceSetupSnapshotV2 extends Omit<EvidenceSetupSnapshotV1, 'schemaVersion'> {
  schemaVersion: 2;
  multiplyingModifiers: {
    allocated: boolean;
    fragmentCount: number;
  };
}

export type EvidenceSetupSnapshot = EvidenceSetupSnapshotV1 | EvidenceSetupSnapshotV2;

export interface SetupSnapshotInput {
  league: string;
  mapType: string;
  groupSize: number | null;
  isGroupPlay: boolean;
  chiselType: string;
  scarabs: Array<string | { name: string }>;
  deliriumType: string;
  deliriumCountPerMap: number;
  astrolabeType: string;
  atlasTreeUrl: string;
  multiplier: number;
  gameDataRevision: number | null;
  gameDataPatchVersion: string | null;
  multiplyingModifiersAllocated?: boolean | null;
  multiplyingModifiersFragmentCount?: number | null;
}

export interface EvidenceAuthoredRollupV1 {
  mapCount: number;
  avgQuant: number;
  avgRarity: number;
  avgPack: number;
  avgCurrency: number;
  observedModAverage: number | null;
  observedModSampleSize: number | null;
  multiplier: number;
  perMapCost: number;
  totalInvest: number;
  netProfit: number;
  divPerMap: number;
  divinePrice: number;
  sessionMinutes: number | null;
  costBreakdown: EvidenceCostBreakdown;
}

export interface EvidenceRunIdentityV1 {
  value: {
    schemaVersion: 1;
    runStartedAt: string;
    runEndedAt: string;
    authoredRollup: EvidenceAuthoredRollupV1;
    setupSnapshot: EvidenceSetupSnapshot;
  };
  runKey: string;
}

type HardSetupField = keyof Pick<
  EvidenceSetupSnapshotV1,
  | 'leagueKey'
  | 'mapType'
  | 'partySize'
  | 'chiselType'
  | 'scarabs'
  | 'delirium'
  | 'astrolabeType'
  | 'atlasAllocationHash'
>;

export interface SetupMismatch {
  field: HardSetupField | 'multiplyingModifiers';
  expected: unknown;
  actual: unknown;
}

const HARD_SETUP_FIELDS: HardSetupField[] = [
  'leagueKey',
  'mapType',
  'partySize',
  'chiselType',
  'scarabs',
  'delirium',
  'astrolabeType',
  'atlasAllocationHash',
];

function canonicalText(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value)
    .replace(/[ \t\n\f\r]+/g, ' ')
    .replace(/^ | $/g, '')
    .toLowerCase();
  return normalized || null;
}

function canonicalPartySize(groupSize: number | null, isGroupPlay: boolean): number | null {
  return Number.isInteger(groupSize) && groupSize! >= 1 && groupSize! <= 6
    ? groupSize
    : isGroupPlay ? null : 1;
}

export function atlasAllocationHash(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex < 0) return null;
  const fragment = url.slice(hashIndex + 1).trim();
  const viewVersionIndex = fragment.toLowerCase().indexOf('?v=');
  const hash = (viewVersionIndex < 0
    ? fragment
    : fragment.slice(0, viewVersionIndex)).trim();
  return hash || null;
}

export function canonicalMultiplierMilli(multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier < 0) {
    throw new TypeError('multiplier must be a finite non-negative number');
  }
  return Math.round(multiplier * 1000);
}

export function buildSetupSnapshotV1(input: SetupSnapshotInput): EvidenceSetupSnapshotV1 {
  if (!Number.isInteger(input.deliriumCountPerMap) || input.deliriumCountPerMap < 0) {
    throw new TypeError('deliriumCountPerMap must be a non-negative integer');
  }
  const scarabs = input.scarabs
    .map((entry) => canonicalText(typeof entry === 'string' ? entry : entry.name))
    .filter((entry): entry is string => entry !== null)
    .sort();
  return {
    schemaVersion: SETUP_SCHEMA_VERSION,
    leagueKey: normalizeLeagueKey(input.league),
    mapType: canonicalText(input.mapType),
    partySize: canonicalPartySize(input.groupSize, input.isGroupPlay),
    chiselType: canonicalText(input.chiselType),
    scarabs,
    delirium: {
      type: input.deliriumCountPerMap > 0 ? canonicalText(input.deliriumType) : null,
      countPerMap: input.deliriumCountPerMap,
    },
    astrolabeType: canonicalText(input.astrolabeType),
    atlasAllocationHash: atlasAllocationHash(input.atlasTreeUrl),
    multiplierMilli: canonicalMultiplierMilli(input.multiplier),
    gameDataRevision: Number.isInteger(input.gameDataRevision) ? input.gameDataRevision : null,
    gameDataPatchVersion: input.gameDataPatchVersion == null
      ? null
      : String(input.gameDataPatchVersion),
  };
}

export function buildSetupSnapshotV2(input: SetupSnapshotInput): EvidenceSetupSnapshotV2 {
  if (typeof input.multiplyingModifiersAllocated !== 'boolean') {
    throw new TypeError('multiplyingModifiersAllocated must be a boolean');
  }
  if (
    !Number.isInteger(input.multiplyingModifiersFragmentCount)
    || input.multiplyingModifiersFragmentCount! < 0
  ) {
    throw new TypeError('multiplyingModifiersFragmentCount must be a non-negative integer');
  }
  return {
    ...buildSetupSnapshotV1(input),
    schemaVersion: SETUP_SCHEMA_VERSION_V2,
    multiplyingModifiers: {
      allocated: input.multiplyingModifiersAllocated,
      fragmentCount: input.multiplyingModifiersAllocated
        ? input.multiplyingModifiersFragmentCount!
        : 0,
    },
  };
}

export function buildSetupSnapshot(input: SetupSnapshotInput): EvidenceSetupSnapshot {
  return typeof input.multiplyingModifiersAllocated === 'boolean'
    ? buildSetupSnapshotV2(input)
    : buildSetupSnapshotV1(input);
}

/** Build from the exact values reconstructed from the Discord wire. */
export function setupSnapshotFromDiscordImport(parsed: DiscordImport): EvidenceSetupSnapshot {
  return buildSetupSnapshot({
    league: parsed.league,
    mapType: parsed.mapType,
    groupSize: parsed.groupSize,
    isGroupPlay: parsed.isGroupPlay,
    chiselType: parsed.chisel,
    scarabs: parsed.scarabs,
    deliriumType: parsed.deliOrbType,
    deliriumCountPerMap: parsed.deliOrbQty,
    astrolabeType: parsed.astroType,
    atlasTreeUrl: parsed.atlasTreeUrl,
    multiplier: parsed.multiplier,
    gameDataRevision: parsed.gameDataRevision,
    gameDataPatchVersion: parsed.gameDataPatchVersion,
    multiplyingModifiersAllocated: parsed.multiplyingModifiersAllocated,
    multiplyingModifiersFragmentCount: parsed.multiplyingModifiersFragmentCount,
  });
}

export function authoredRollupFromDiscordImport(parsed: DiscordImport): EvidenceAuthoredRollupV1 {
  return {
    mapCount: parsed.mapCount,
    avgQuant: parsed.avgQuant,
    avgRarity: parsed.avgRarity,
    avgPack: parsed.avgPack,
    avgCurrency: parsed.avgCurr,
    observedModAverage: parsed.observedModAverage,
    observedModSampleSize: parsed.observedModSampleSize,
    multiplier: parsed.multiplier,
    perMapCost: parsed.perMapCost,
    totalInvest: parsed.totalInvest,
    netProfit: parsed.netProfit,
    divPerMap: parsed.divPerMap,
    divinePrice: parsed.divPrice,
    sessionMinutes: parsed.sessionMinutes,
    costBreakdown: {
      chisel: parsed.chisel && parsed.chisel !== 'None'
        ? { name: parsed.chisel, priceEach: parsed.chiselPrice ?? 0 }
        : null,
      scarabs: parsed.scarabs.map((name, index) => ({
        name,
        priceEach: parsed.scarabCosts[index] ?? 0,
      })),
      delirium: parsed.deliOrbQty > 0 && parsed.deliOrbType
        ? {
            type: parsed.deliOrbType,
            countPerMap: parsed.deliOrbQty,
            priceEach: parsed.deliOrbPrice ?? 0,
          }
        : null,
      astrolabe: parsed.astroType
        ? {
            type: parsed.astroType,
            count: parsed.astroCount ?? 0,
            priceEach: parsed.astroPrice ?? 0,
          }
        : null,
    },
  };
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

export function assertSetupSnapshotDomain(value: unknown, path = '$'): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!/^[\x00-\x7f]*$/.test(value)) {
      throw new TypeError(`setup snapshot requires ASCII text at ${path}`);
    }
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`setup snapshot requires integer numbers at ${path}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSetupSnapshotDomain(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      if (!/^[\x00-\x7f]+$/.test(key)) {
        throw new TypeError(`setup snapshot requires ASCII keys at ${path}`);
      }
      assertSetupSnapshotDomain(entry, `${path}.${key}`);
    }
    return;
  }
  throw new TypeError(`setup snapshot rejects ${typeof value} at ${path}`);
}

async function sha256V1(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${EVIDENCE_IDENTITY_KIND}:${hex}`;
}

export async function fingerprintSetupSnapshot(snapshot: EvidenceSetupSnapshot): Promise<string> {
  assertSetupSnapshotDomain(snapshot);
  return sha256V1(canonicalJson(snapshot));
}

export async function buildEvidenceRunIdentityV1(input: {
  runStartedAt: string;
  runEndedAt: string;
  authoredRollup: EvidenceAuthoredRollupV1;
  setupSnapshot: EvidenceSetupSnapshot;
}): Promise<EvidenceRunIdentityV1> {
  const start = new Date(input.runStartedAt);
  const end = new Date(input.runEndedAt);
  if (
    Number.isNaN(start.getTime())
    || Number.isNaN(end.getTime())
    || !input.runStartedAt.endsWith('Z')
    || !input.runEndedAt.endsWith('Z')
    || start > end
  ) {
    throw new TypeError('evidence identity requires an ordered UTC run window');
  }
  const value = {
    schemaVersion: 1 as const,
    runStartedAt: start.toISOString(),
    runEndedAt: end.toISOString(),
    authoredRollup: input.authoredRollup,
    setupSnapshot: input.setupSnapshot,
  };
  return { value, runKey: await sha256V1(canonicalJson(value)) };
}

export function compareSetupSnapshots(
  expected: EvidenceSetupSnapshot,
  actual: EvidenceSetupSnapshot,
): SetupMismatch[] {
  const mismatches: SetupMismatch[] = [];
  for (const field of HARD_SETUP_FIELDS) {
    if (canonicalJson(expected[field]) !== canonicalJson(actual[field])) {
      mismatches.push({ field, expected: expected[field], actual: actual[field] });
    }
  }
  // Compatibility is directional: the published target pool is authoritative.
  // A v1 target never recorded Multiplying Modifiers and accepts either schema;
  // a v2 target requires an explicit, identical v2 field.
  if (expected.schemaVersion === SETUP_SCHEMA_VERSION_V2) {
    const expectedValue = expected.multiplyingModifiers;
    const actualValue = actual.schemaVersion === SETUP_SCHEMA_VERSION_V2
      ? actual.multiplyingModifiers
      : undefined;
    if (actualValue === undefined || canonicalJson(expectedValue) !== canonicalJson(actualValue)) {
      mismatches.push({
        field: 'multiplyingModifiers',
        expected: expectedValue,
        actual: actualValue,
      });
    }
  }
  return mismatches;
}
