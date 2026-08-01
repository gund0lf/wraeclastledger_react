/**
 * Client mirror of the evidence-pooling identity contract.
 *
 * The API is authoritative. This module deliberately mirrors its canonical
 * snapshot and hashing rules so ShareModal can fail early and emit the exact
 * identity that the bot and API will independently reconstruct. Keep the
 * golden fixtures in evidenceIdentity.test.ts aligned with api/evidenceCore.js.
 */
import type { DiscordImport } from './parseDiscordExport';
import { normalizeLeagueKey } from './retrospectives';

export const EVIDENCE_IDENTITY_KIND = 'sha256-v1' as const;
export const SETUP_SCHEMA_VERSION = 1 as const;

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
}

export interface EvidenceRunIdentityV1 {
  value: {
    schemaVersion: 1;
    runStartedAt: string;
    runEndedAt: string;
    authoredRollup: EvidenceAuthoredRollupV1;
    setupSnapshot: EvidenceSetupSnapshotV1;
  };
  runKey: string;
}

export interface SetupMismatch {
  field: keyof Pick<
    EvidenceSetupSnapshotV1,
    | 'leagueKey'
    | 'mapType'
    | 'partySize'
    | 'chiselType'
    | 'scarabs'
    | 'delirium'
    | 'astrolabeType'
    | 'atlasAllocationHash'
    | 'multiplierMilli'
  >;
  expected: unknown;
  actual: unknown;
}

const HARD_SETUP_FIELDS: SetupMismatch['field'][] = [
  'leagueKey',
  'mapType',
  'partySize',
  'chiselType',
  'scarabs',
  'delirium',
  'astrolabeType',
  'atlasAllocationHash',
  'multiplierMilli',
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

export function buildSetupSnapshotV1(input: {
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
}): EvidenceSetupSnapshotV1 {
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

/** Build from the exact values reconstructed from the Discord wire. */
export function setupSnapshotFromDiscordImport(parsed: DiscordImport): EvidenceSetupSnapshotV1 {
  return buildSetupSnapshotV1({
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

export async function fingerprintSetupSnapshot(snapshot: EvidenceSetupSnapshotV1): Promise<string> {
  assertSetupSnapshotDomain(snapshot);
  return sha256V1(canonicalJson(snapshot));
}

export async function buildEvidenceRunIdentityV1(input: {
  runStartedAt: string;
  runEndedAt: string;
  authoredRollup: EvidenceAuthoredRollupV1;
  setupSnapshot: EvidenceSetupSnapshotV1;
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
  expected: EvidenceSetupSnapshotV1,
  actual: EvidenceSetupSnapshotV1,
): SetupMismatch[] {
  const mismatches: SetupMismatch[] = [];
  for (const field of HARD_SETUP_FIELDS) {
    if (canonicalJson(expected[field]) !== canonicalJson(actual[field])) {
      mismatches.push({ field, expected: expected[field], actual: actual[field] });
    }
  }
  return mismatches;
}
