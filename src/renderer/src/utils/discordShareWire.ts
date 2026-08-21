/**
 * Compact Discord submission wire.
 *
 * The public bot card and the database continue to use the canonical human
 * export. Only the author's temporary Discord paste is compact. The bot
 * mirrors this positional schema, reconstructs the human export, and then
 * invokes its existing parser/validation path.
 */
import { strFromU8, strToU8, unzlibSync, zlibSync } from 'fflate';
import type { DiscordImport } from './parseDiscordExport';
import type { ObservedDeliriumSummary } from './deliriumMetadata';
import {
  compactLootSummary,
  expandCompactLootSummary,
  type CompactLootSummary,
} from './lootSummary';

export const DISCORD_SHARE_WIRE_PREFIX = 'wl2.';
export const DISCORD_SHARE_WIRE_VERSION = 3 as const;
const LEGACY_DISCORD_SHARE_WIRE_VERSION = 2 as const;
export const DISCORD_SHARE_WIRE_MAX = 2000;
const DISCORD_SHARE_OUTPUT_MAX = 128 * 1024;

type OperationWire =
  | 0
  | [1, string]
  | [2, string, number, string, string, string, string];

type ObservedDeliriumWire = [
  number,
  [number, number][],
  [string, number][],
];

type DiscordShareWireV3 = [
  typeof DISCORD_SHARE_WIRE_VERSION,
  OperationWire,
  [number, 6 | 8, number, number | null, number, number, number, number],
  [number, number, number, number, number, number],
  [string, number, [string, number][], number, string, number, string, number, number],
  [string, number | null, number | null],
  [string, number | null, string, 0 | 1 | null, number | null],
  [string, string, string[]],
  [number, number | null, [string, number][], [number, number, number, number] | null],
  [string],
  CompactLootSummary | null,
  string | null,
  ObservedDeliriumWire | null,
];

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlToBytes = (encoded: string): Uint8Array => {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const finiteOrNull = (value: unknown): value is number | null => value === null || finite(value);
const text = (value: unknown, maximum: number): value is string =>
  typeof value === 'string' && value.length <= maximum && !/[\r\n]/.test(value);
const tuple = (value: unknown, length: number): value is unknown[] =>
  Array.isArray(value) && value.length === length;
const uuid = (value: unknown): value is string =>
  typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const sha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^sha256-v1:[0-9a-f]{64}$/.test(value);

function encodeOperation(parsed: DiscordImport): OperationWire {
  if (parsed.operationError || !parsed.operation) {
    throw new TypeError('Cannot encode invalid Discord operation markers');
  }
  if (parsed.operation === 'update') {
    if (!uuid(parsed.updateStrategyId)) throw new TypeError('Compact update is missing its strategy id');
    return [1, parsed.updateStrategyId];
  }
  if (parsed.operation === 'evidence') {
    if (
      !uuid(parsed.evidenceTargetStrategyId)
      || !Number.isInteger(parsed.evidenceExpectedRevision)
      || parsed.evidenceExpectedRevision! < 1
      || !sha256(parsed.evidenceRunKey)
      || !text(parsed.evidenceRunStartedAt, 64)
      || !text(parsed.evidenceRunEndedAt, 64)
      || !sha256(parsed.setupFingerprint)
    ) throw new TypeError('Compact evidence operation is incomplete');
    return [
      2,
      parsed.evidenceTargetStrategyId,
      parsed.evidenceExpectedRevision!,
      parsed.evidenceRunKey,
      parsed.evidenceRunStartedAt,
      parsed.evidenceRunEndedAt,
      parsed.setupFingerprint,
    ];
  }
  return 0;
}

/** Encode an already-validated canonical export parse. Schema v3 appends
 * observed map Delirium independently from configured Orb setup/cost. */
export function encodeDiscordShareWire(parsed: DiscordImport): string {
  if (parsed.lootSummaryInvalid) throw new TypeError('Cannot encode invalid loot evidence');
  const partyCode = parsed.isGroupPlay ? (parsed.groupSize ?? 1) : 0;
  const payload: DiscordShareWireV3 = [
    DISCORD_SHARE_WIRE_VERSION,
    encodeOperation(parsed),
    [
      parsed.mapCount,
      parsed.mapType === '8-mod' ? 8 : 6,
      parsed.multiplier,
      parsed.observedModSampleSize === parsed.mapCount ? parsed.observedModAverage : null,
      parsed.avgQuant,
      parsed.avgRarity,
      parsed.avgPack,
      parsed.avgCurr,
    ],
    [
      parsed.perMapCost,
      parsed.totalInvest,
      parsed.totalReturn,
      parsed.netProfit,
      parsed.divPerMap,
      parsed.divPrice,
    ],
    [
      parsed.chisel,
      parsed.chiselPrice,
      parsed.scarabs.map((name, index) => [name, parsed.scarabCosts[index] ?? 0]),
      parsed.deliOrbQty,
      parsed.deliOrbType,
      parsed.deliOrbPrice,
      parsed.astroType,
      parsed.astroCount,
      parsed.astroPrice,
    ],
    [parsed.atlasTreeUrl, parsed.atlasPoints, parsed.atlasPointsMax],
    [
      parsed.league,
      parsed.gameDataRevision,
      parsed.gameDataPatchVersion ?? '',
      parsed.multiplyingModifiersAllocated == null
        ? null
        : parsed.multiplyingModifiersAllocated ? 1 : 0,
      parsed.multiplyingModifiersFragmentCount,
    ],
    [parsed.strategyName, parsed.strategyNotes, parsed.typeTags],
    [
      partyCode,
      parsed.sessionMinutes,
      parsed.excludedDrops.map((drop) => [drop.name, drop.value]),
      parsed.gemInfo
        ? [parsed.gemInfo.count, parsed.gemInfo.buy, parsed.gemInfo.sell, parsed.gemInfo.net]
        : null,
    ],
    [parsed.runRegex],
    parsed.lootSummary ? compactLootSummary(parsed.lootSummary) : null,
    null,
    parsed.observedDelirium
      ? [
          parsed.observedDelirium.sampleSize,
          parsed.observedDelirium.levelCounts.map((level) => [level.percentage, level.count]),
          parsed.observedDelirium.rewardCounts.map((reward) => [reward.name, reward.count]),
        ]
      : null,
  ];
  const compressed = zlibSync(strToU8(JSON.stringify(payload)), { level: 9 });
  return `${DISCORD_SHARE_WIRE_PREFIX}${bytesToBase64Url(compressed)}`;
}

function decodeObservedDelirium(
  value: unknown,
  mapCount: number,
): ObservedDeliriumSummary | null | false {
  if (value === null) return null;
  if (!tuple(value, 3)) return false;
  const [sampleValue, levelValue, rewardValue] = value;
  if (!Number.isInteger(sampleValue) || Number(sampleValue) < 1 || Number(sampleValue) > mapCount
    || !Array.isArray(levelValue) || levelValue.length < 1 || levelValue.length > 11
    || !Array.isArray(rewardValue) || rewardValue.length > 16) return false;

  const sampleSize = Number(sampleValue);
  const seenLevels = new Set<number>();
  const levelCounts: ObservedDeliriumSummary['levelCounts'] = [];
  for (const entry of levelValue) {
    if (!tuple(entry, 2) || !Number.isInteger(entry[0]) || Number(entry[0]) < 0 || Number(entry[0]) > 100
      || !Number.isInteger(entry[1]) || Number(entry[1]) < 1 || Number(entry[1]) > sampleSize
      || seenLevels.has(Number(entry[0]))) return false;
    seenLevels.add(Number(entry[0]));
    levelCounts.push({ percentage: Number(entry[0]), count: Number(entry[1]) });
  }
  if (levelCounts.reduce((sum, level) => sum + level.count, 0) !== sampleSize) return false;
  levelCounts.sort((left, right) => left.percentage - right.percentage);

  const seenRewards = new Set<string>();
  const rewardCounts: ObservedDeliriumSummary['rewardCounts'] = [];
  for (const entry of rewardValue) {
    if (!tuple(entry, 2) || !text(entry[0], 64) || String(entry[0]).trim().length === 0
      || !Number.isInteger(entry[1]) || Number(entry[1]) < 1 || Number(entry[1]) > sampleSize * 10) return false;
    const name = String(entry[0]).trim();
    const key = name.toLowerCase();
    if (seenRewards.has(key)) return false;
    seenRewards.add(key);
    rewardCounts.push({ name, count: Number(entry[1]) });
  }
  return { sampleSize, levelCounts, rewardCounts };
}

function decodeOperation(value: unknown): Pick<DiscordImport,
  'operation' | 'operationError' | 'updateStrategyId'
  | 'evidenceTargetStrategyId' | 'evidenceExpectedRevision' | 'evidenceRunKey'
  | 'evidenceRunStartedAt' | 'evidenceRunEndedAt' | 'setupFingerprint'> | null {
  const empty = {
    operationError: null,
    updateStrategyId: null,
    evidenceTargetStrategyId: null,
    evidenceExpectedRevision: null,
    evidenceRunKey: null,
    evidenceRunStartedAt: null,
    evidenceRunEndedAt: null,
    setupFingerprint: null,
  } as const;
  if (value === 0) return { ...empty, operation: 'share' };
  if (tuple(value, 2) && value[0] === 1 && uuid(value[1])) {
    return { ...empty, operation: 'update', updateStrategyId: value[1].toLowerCase() };
  }
  if (
    tuple(value, 7)
    && value[0] === 2
    && uuid(value[1])
    && Number.isInteger(value[2]) && Number(value[2]) > 0
    && sha256(value[3])
    && text(value[4], 64) && text(value[5], 64)
    && sha256(value[6])
  ) {
    return {
      ...empty,
      operation: 'evidence',
      evidenceTargetStrategyId: value[1].toLowerCase(),
      evidenceExpectedRevision: Number(value[2]),
      evidenceRunKey: value[3],
      evidenceRunStartedAt: value[4],
      evidenceRunEndedAt: value[5],
      setupFingerprint: value[6],
    };
  }
  return null;
}

export function decodeDiscordShareWire(raw: string): DiscordImport | null {
  try {
    const token = raw.trim().replace(/^```\s*/m, '').replace(/\s*```\s*$/m, '').trim();
    if (token.length > DISCORD_SHARE_WIRE_MAX) return null;
    const match = /^wl2\.([A-Za-z0-9_-]+)$/.exec(token);
    if (!match) return null;
    const inflated = unzlibSync(base64UrlToBytes(match[1]), {
      out: new Uint8Array(DISCORD_SHARE_OUTPUT_MAX),
    });
    if (inflated.length >= DISCORD_SHARE_OUTPUT_MAX) return null;
    const payload = JSON.parse(strFromU8(inflated)) as unknown;
    const isLegacyV2 = tuple(payload, 12) && payload[0] === LEGACY_DISCORD_SHARE_WIRE_VERSION;
    const isV3 = tuple(payload, 13) && payload[0] === DISCORD_SHARE_WIRE_VERSION;
    if (!isLegacyV2 && !isV3) return null;

    const operation = decodeOperation(payload[1]);
    const maps = payload[2];
    const money = payload[3];
    const setup = payload[4];
    const atlas = payload[5];
    const provenance = payload[6];
    const strategy = payload[7];
    const extras = payload[8];
    const regex = payload[9];
    const compactLoot = payload[10];
    const submissionId = payload[11];
    const compactObservedDelirium = isV3 ? payload[12] : null;
    if (!operation
      || !tuple(maps, 8) || !tuple(money, 6) || !tuple(setup, 9)
      || !tuple(atlas, 3) || !tuple(provenance, 5) || !tuple(strategy, 3)
      || !tuple(extras, 4) || !tuple(regex, 1)
      || (submissionId !== null && !uuid(submissionId))) return null;

    if (!Number.isInteger(maps[0]) || Number(maps[0]) < 1 || Number(maps[0]) > 100_000
      || (maps[1] !== 6 && maps[1] !== 8)
      || !finite(maps[2]) || !finiteOrNull(maps[3])
      || !maps.slice(4).every(finite)
      || !money.every(finite)) return null;

    const scarabs = setup[2];
    if (!text(setup[0], 120) || !finite(setup[1])
      || !Array.isArray(scarabs) || scarabs.length > 10
      || !scarabs.every((entry) => tuple(entry, 2) && text(entry[0], 120) && finite(entry[1]))
      || !Number.isInteger(setup[3]) || !text(setup[4], 120) || !finite(setup[5])
      || !text(setup[6], 120) || !Number.isInteger(setup[7]) || !finite(setup[8])) return null;

    if (!text(atlas[0], 1000) || !finiteOrNull(atlas[1]) || !finiteOrNull(atlas[2])
      || !text(provenance[0], 80) || !finiteOrNull(provenance[1]) || !text(provenance[2], 40)
      || (provenance[3] !== null && provenance[3] !== 0 && provenance[3] !== 1)
      || !finiteOrNull(provenance[4])) return null;

    const tags = strategy[2];
    if (!text(strategy[0], 80) || !text(strategy[1], 8000)
      || !Array.isArray(tags) || tags.length > 32 || !tags.every((tag) => text(tag, 64))) return null;

    const excluded = extras[2];
    const gem = extras[3];
    if (!Number.isInteger(extras[0]) || Number(extras[0]) < 0 || Number(extras[0]) > 6
      || !finiteOrNull(extras[1])
      || !Array.isArray(excluded) || excluded.length > 100
      || !excluded.every((entry) => tuple(entry, 2) && text(entry[0], 120) && finite(entry[1]))
      || (gem !== null && (!tuple(gem, 4) || !gem.every(finite)))
      || !text(regex[0], 300)) return null;

    const lootSummary = compactLoot == null ? null : expandCompactLootSummary(compactLoot);
    if (compactLoot != null && !lootSummary) return null;
    const observedDelirium = decodeObservedDelirium(compactObservedDelirium, Number(maps[0]));
    if (observedDelirium === false) return null;
    const partyCode = Number(extras[0]);
    return {
      mapCount: Number(maps[0]),
      mapType: `${maps[1]}-mod`,
      multiplier: Number(maps[2]),
      observedModAverage: maps[3] == null ? null : Number(maps[3]),
      observedModSampleSize: maps[3] == null ? null : Number(maps[0]),
      observedDelirium,
      avgQuant: Number(maps[4]), avgRarity: Number(maps[5]),
      avgPack: Number(maps[6]), avgCurr: Number(maps[7]),
      perMapCost: Number(money[0]), totalInvest: Number(money[1]),
      totalReturn: Number(money[2]), netProfit: Number(money[3]),
      divPerMap: Number(money[4]), divPrice: Number(money[5]),
      chisel: String(setup[0]), chiselPrice: Number(setup[1]),
      scarabs: scarabs.map((entry) => String(entry[0])),
      scarabCosts: scarabs.map((entry) => Number(entry[1])),
      deliOrbQty: Number(setup[3]), deliOrbType: String(setup[4]), deliOrbPrice: Number(setup[5]),
      astroType: String(setup[6]), astroCount: Number(setup[7]), astroPrice: Number(setup[8]),
      atlasTreeUrl: String(atlas[0]), atlasPoints: atlas[1] == null ? null : Number(atlas[1]),
      atlasPointsMax: atlas[2] == null ? null : Number(atlas[2]),
      league: String(provenance[0]),
      gameDataRevision: provenance[1] == null ? null : Number(provenance[1]),
      gameDataPatchVersion: provenance[2] ? String(provenance[2]) : null,
      multiplyingModifiersAllocated: provenance[3] == null ? null : provenance[3] === 1,
      multiplyingModifiersFragmentCount: provenance[4] == null ? null : Number(provenance[4]),
      strategyName: String(strategy[0]), strategyNotes: String(strategy[1]),
      typeTags: tags.map(String),
      isGroupPlay: partyCode > 0,
      groupSize: partyCode >= 2 ? partyCode : null,
      sessionMinutes: extras[1] == null ? null : Number(extras[1]),
      excludedDrops: excluded.map((entry) => ({ name: String(entry[0]), value: Number(entry[1]) })),
      gemInfo: gem == null ? null : {
        count: Number(gem[0]), buy: Number(gem[1]), sell: Number(gem[2]), net: Number(gem[3]),
      },
      runRegex: String(regex[0]), slamRegex: '',
      lootSummary, lootSummaryInvalid: false,
      ...operation,
    };
  } catch {
    return null;
  }
}
