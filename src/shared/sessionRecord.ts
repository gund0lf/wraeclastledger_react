export const RECORD_FORMAT_VERSION = 1 as const;

export const RECORD_CONTENT_TYPES = [
  'session',
  'preferences',
  'layout',
  'bootstrap',
  'catalog',
] as const;

export type RecordContentType = (typeof RECORD_CONTENT_TYPES)[number];
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject { [key: string]: JsonValue | undefined }

export interface RecordHeaderV1 {
  recordFormat: typeof RECORD_FORMAT_VERSION;
  contentType: RecordContentType;
  contentVersion: number;
  bodyLength: number;
  bodyHash: string;
}

export type CheckpointReason = 'activation' | 'destructive' | 'pre-restore' | 'periodic';

export interface SessionCheckpointV1 extends JsonObject {
  id: string;
  at: string;
  reason: CheckpointReason;
  activationId?: string;
  summary: JsonObject;
}

export interface SessionBodyV1<
  Summary extends JsonObject = JsonObject,
  Payload extends JsonObject = JsonObject,
> extends JsonObject {
  kind: 'named' | 'working';
  id: string | null;
  name: string | null;
  createdAt: string;
  updatedAt: string;
  generation: number;
  semanticHash: string;
  summary: Summary;
  payload: Payload;
  checkpoint?: SessionCheckpointV1;
}

export type PreferencesBodyV1 = JsonObject;
export type LayoutBodyV1 = JsonObject;
export type BootstrapBodyV1 = JsonObject;
export type CatalogBodyV1 = JsonObject;

export interface DecodedRecordV1<T extends JsonValue = JsonValue> {
  header: RecordHeaderV1;
  body: T;
  bodyBytes: Uint8Array;
}

export type RecordValidationCode =
  | 'invalid-header'
  | 'invalid-body'
  | 'invalid-frame'
  | 'body-length-mismatch'
  | 'body-hash-mismatch'
  | 'invalid-utf8'
  | 'invalid-json';

export class RecordValidationError extends Error {
  constructor(
    public readonly code: RecordValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'RecordValidationError';
  }
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const CONTENT_TYPE_SET = new Set<string>(RECORD_CONTENT_TYPES);
const textEncoder = new TextEncoder();
const fatalTextDecoder = new TextDecoder('utf-8', { fatal: true });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertValidUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new RecordValidationError('invalid-body', `${path} contains an unpaired surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new RecordValidationError('invalid-body', `${path} contains an unpaired surrogate`);
    }
  }
}

export function assertJsonValue(value: unknown, path = '$'): asserts value is JsonValue {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    assertValidUnicode(value, path);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RecordValidationError('invalid-body', `${path} contains a non-finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new RecordValidationError('invalid-body', `${path} contains a sparse array`);
      }
      assertJsonValue(value[index], `${path}[${index}]`);
    }
    return;
  }
  if (!isPlainObject(value)) {
    throw new RecordValidationError('invalid-body', `${path} contains an unsupported value`);
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new RecordValidationError('invalid-body', `${path} contains a symbol key`);
  }
  for (const [key, child] of Object.entries(value)) {
    assertValidUnicode(key, `${path} key`);
    if (child === undefined) {
      throw new RecordValidationError('invalid-body', `${path}.${key} is undefined`);
    }
    assertJsonValue(child, `${path}.${key}`);
  }
}

function canonicalizeValidated(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') return JSON.stringify(Object.is(value, -0) ? 0 : value);
  if (Array.isArray(value)) return `[${value.map(canonicalizeValidated).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeValidated(value[key] as JsonValue)}`).join(',')}}`;
}

export function canonicalizeJson(value: unknown): string {
  assertJsonValue(value);
  return canonicalizeValidated(value);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const stableBytes = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', stableBytes.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function computeSemanticHash(value: unknown): Promise<string> {
  return sha256Hex(textEncoder.encode(canonicalizeJson(value)));
}

export function assertRecordHeaderV1(value: unknown): asserts value is RecordHeaderV1 {
  if (!isPlainObject(value)) {
    throw new RecordValidationError('invalid-header', 'Record header must be an object');
  }
  const keys = Object.keys(value).sort();
  const expected = ['bodyHash', 'bodyLength', 'contentType', 'contentVersion', 'recordFormat'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new RecordValidationError('invalid-header', 'Record header has unexpected fields');
  }
  if (value.recordFormat !== RECORD_FORMAT_VERSION) {
    throw new RecordValidationError('invalid-header', 'Unsupported record format');
  }
  if (typeof value.contentType !== 'string' || !CONTENT_TYPE_SET.has(value.contentType)) {
    throw new RecordValidationError('invalid-header', 'Unsupported content type');
  }
  if (!Number.isSafeInteger(value.contentVersion) || Number(value.contentVersion) < 1) {
    throw new RecordValidationError('invalid-header', 'Invalid content version');
  }
  if (!Number.isSafeInteger(value.bodyLength) || Number(value.bodyLength) < 0) {
    throw new RecordValidationError('invalid-header', 'Invalid body length');
  }
  if (typeof value.bodyHash !== 'string' || !HASH_PATTERN.test(value.bodyHash)) {
    throw new RecordValidationError('invalid-header', 'Invalid body hash');
  }
}

function assertNonEmptyString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new RecordValidationError('invalid-body', `${field} must be a non-empty string`);
  }
}

function assertTimestamp(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new RecordValidationError('invalid-body', `${field} must be a UTC ISO timestamp`);
  }
}

export function assertSessionBodyV1(value: unknown): asserts value is SessionBodyV1 {
  assertJsonValue(value);
  if (!isPlainObject(value) || (value.kind !== 'named' && value.kind !== 'working')) {
    throw new RecordValidationError('invalid-body', 'Session body has an invalid kind');
  }
  if (value.kind === 'named') {
    assertNonEmptyString(value.id, 'Session id');
    assertNonEmptyString(value.name, 'Session name');
  } else if (value.id !== null || value.name !== null) {
    throw new RecordValidationError('invalid-body', 'Working session id and name must be null');
  }
  assertTimestamp(value.createdAt, 'createdAt');
  assertTimestamp(value.updatedAt, 'updatedAt');
  if (!Number.isSafeInteger(value.generation) || Number(value.generation) < 0) {
    throw new RecordValidationError('invalid-body', 'generation must be a non-negative integer');
  }
  if (typeof value.semanticHash !== 'string' || !HASH_PATTERN.test(value.semanticHash)) {
    throw new RecordValidationError('invalid-body', 'semanticHash must be a SHA-256 hash');
  }
  if (!isPlainObject(value.summary) || !isPlainObject(value.payload)) {
    throw new RecordValidationError('invalid-body', 'summary and payload must be objects');
  }
  if (value.checkpoint !== undefined) {
    if (!isPlainObject(value.checkpoint)) {
      throw new RecordValidationError('invalid-body', 'checkpoint must be an object');
    }
    assertNonEmptyString(value.checkpoint.id, 'checkpoint.id');
    assertTimestamp(value.checkpoint.at, 'checkpoint.at');
    if (!['activation', 'destructive', 'pre-restore', 'periodic'].includes(String(value.checkpoint.reason))) {
      throw new RecordValidationError('invalid-body', 'checkpoint.reason is invalid');
    }
    if (value.checkpoint.activationId !== undefined) {
      assertNonEmptyString(value.checkpoint.activationId, 'checkpoint.activationId');
    }
    if (!isPlainObject(value.checkpoint.summary)) {
      throw new RecordValidationError('invalid-body', 'checkpoint.summary must be an object');
    }
  }
}

export function assertRecordBody(contentType: RecordContentType, value: unknown): asserts value is JsonValue {
  if (contentType === 'session') assertSessionBodyV1(value);
  else {
    assertJsonValue(value);
    if (!isPlainObject(value)) {
      throw new RecordValidationError('invalid-body', `${contentType} body must be an object`);
    }
  }
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function encodeRecordV1(
  contentType: RecordContentType,
  contentVersion: number,
  body: unknown,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(contentVersion) || contentVersion < 1) {
    throw new RecordValidationError('invalid-header', 'Invalid content version');
  }
  assertRecordBody(contentType, body);
  const bodyText = JSON.stringify(body);
  const bodyBytes = textEncoder.encode(bodyText);
  const header: RecordHeaderV1 = {
    recordFormat: RECORD_FORMAT_VERSION,
    contentType,
    contentVersion,
    bodyLength: bodyBytes.byteLength,
    bodyHash: await sha256Hex(bodyBytes),
  };
  return concatBytes(textEncoder.encode(`${JSON.stringify(header)}\n`), bodyBytes);
}

export async function decodeRecordV1(bytes: Uint8Array): Promise<DecodedRecordV1> {
  const newlineIndex = bytes.indexOf(0x0a);
  if (newlineIndex <= 0) {
    throw new RecordValidationError('invalid-frame', 'Record is missing its header delimiter');
  }
  const headerBytes = bytes.subarray(0, newlineIndex);
  if (headerBytes.includes(0x0d)) {
    throw new RecordValidationError('invalid-frame', 'Record header must end with one LF byte');
  }
  let headerText: string;
  try {
    headerText = fatalTextDecoder.decode(headerBytes);
  } catch {
    throw new RecordValidationError('invalid-utf8', 'Record header is not valid UTF-8');
  }
  let header: unknown;
  try {
    header = JSON.parse(headerText);
  } catch {
    throw new RecordValidationError('invalid-json', 'Record header is not valid JSON');
  }
  assertRecordHeaderV1(header);
  const bodyBytes = bytes.slice(newlineIndex + 1);
  if (bodyBytes.byteLength !== header.bodyLength) {
    throw new RecordValidationError(
      'body-length-mismatch',
      `Body length mismatch: expected ${header.bodyLength}, received ${bodyBytes.byteLength}`,
    );
  }
  if (await sha256Hex(bodyBytes) !== header.bodyHash) {
    throw new RecordValidationError('body-hash-mismatch', 'Body hash does not match the header');
  }
  let bodyText: string;
  try {
    bodyText = fatalTextDecoder.decode(bodyBytes);
  } catch {
    throw new RecordValidationError('invalid-utf8', 'Record body is not valid UTF-8');
  }
  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new RecordValidationError('invalid-json', 'Record body is not valid JSON');
  }
  assertRecordBody(header.contentType, body);
  return { header, body, bodyBytes };
}

export function semanticHashesEqual(
  left: { contentVersion: number; semanticHash: string },
  right: { contentVersion: number; semanticHash: string },
): boolean {
  return left.contentVersion === right.contentVersion && left.semanticHash === right.semanticHash;
}
