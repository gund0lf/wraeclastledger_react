import { describe, expect, it } from 'vitest';
import {
  RecordValidationError,
  canonicalizeJson,
  computeSemanticHash,
  decodeRecordV1,
  encodeRecordV1,
  semanticHashesEqual,
  sha256Hex,
  type SessionBodyV1,
} from '../../../shared/sessionRecord';

const ZERO_HASH = '0'.repeat(64);

const sessionBody = (overrides: Partial<SessionBodyV1> = {}): SessionBodyV1 => ({
  kind: 'named',
  id: 'session-id',
  name: 'Session',
  createdAt: '2026-07-22T10:00:00.000Z',
  updatedAt: '2026-07-22T10:01:00.000Z',
  generation: 1,
  semanticHash: ZERO_HASH,
  summary: { mapCount: 1 },
  payload: { notes: 'ASCII' },
  ...overrides,
});

describe('WP14 framed-record contract', () => {
  it('round-trips a validated session record', async () => {
    const encoded = await encodeRecordV1('session', 1, sessionBody());
    const decoded = await decodeRecordV1(encoded);
    expect(decoded.header).toMatchObject({
      recordFormat: 1,
      contentType: 'session',
      contentVersion: 1,
    });
    expect(decoded.body).toEqual(sessionBody());
  });

  it('uses UTF-8 byte length instead of JavaScript string length', async () => {
    const body = sessionBody({ payload: { notes: 'Exile: \u{1f5fa}\ufe0f' } });
    const encoded = await encodeRecordV1('session', 1, body);
    const decoded = await decodeRecordV1(encoded);
    const bodyText = new TextDecoder().decode(decoded.bodyBytes);
    expect(decoded.header.bodyLength).toBe(new TextEncoder().encode(bodyText).byteLength);
    expect(decoded.header.bodyLength).toBeGreaterThan(bodyText.length);
  });

  it('detects a torn body before parsing it', async () => {
    const encoded = await encodeRecordV1('session', 1, sessionBody());
    await expect(decodeRecordV1(encoded.slice(0, -1))).rejects.toMatchObject({
      code: 'body-length-mismatch',
    });
  });

  it('rejects a frame truncated before the header delimiter', async () => {
    const encoded = await encodeRecordV1('session', 1, sessionBody());
    const newlineIndex = encoded.indexOf(0x0a);
    await expect(decodeRecordV1(encoded.slice(0, newlineIndex - 4))).rejects.toMatchObject({
      code: 'invalid-frame',
    });
  });

  it('detects literal-byte corruption with the body hash', async () => {
    const encoded = await encodeRecordV1('session', 1, sessionBody());
    const corrupted = encoded.slice();
    corrupted[corrupted.length - 2] ^= 1;
    await expect(decodeRecordV1(corrupted)).rejects.toMatchObject({
      code: 'body-hash-mismatch',
    });
  });

  it('rejects unsupported record versions and unexpected header fields', async () => {
    const bodyBytes = new TextEncoder().encode('{}');
    const hash = await sha256Hex(bodyBytes);
    const framed = (header: Record<string, unknown>) => new Uint8Array([
      ...new TextEncoder().encode(`${JSON.stringify(header)}\n`),
      ...bodyBytes,
    ]);
    const base = {
      recordFormat: 2,
      contentType: 'catalog',
      contentVersion: 1,
      bodyLength: bodyBytes.byteLength,
      bodyHash: hash,
    };
    await expect(decodeRecordV1(framed(base))).rejects.toMatchObject({ code: 'invalid-header' });
    await expect(decodeRecordV1(framed({ ...base, recordFormat: 1, extra: true })))
      .rejects.toMatchObject({ code: 'invalid-header' });
  });

  it('validates named and working session identity invariants', async () => {
    await expect(encodeRecordV1('session', 1, sessionBody({ id: null })))
      .rejects.toBeInstanceOf(RecordValidationError);
    await expect(encodeRecordV1('session', 1, sessionBody({
      kind: 'working',
      id: 'not-null',
      name: null,
    }))).rejects.toBeInstanceOf(RecordValidationError);
    await expect(encodeRecordV1('session', 1, sessionBody({
      kind: 'working',
      id: null,
      name: null,
    }))).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe('WP14 semantic hashing', () => {
  it('canonicalizes recursively without normalizing Unicode', () => {
    expect(canonicalizeJson({ z: 1, nested: { b: -0, a: 'e\u0301' } }))
      .toBe('{"nested":{"a":"e\u0301","b":0},"z":1}');
    expect(canonicalizeJson({ value: '\u00e9' }))
      .not.toBe(canonicalizeJson({ value: 'e\u0301' }));
  });

  it('produces the same hash for semantically identical key order', async () => {
    await expect(computeSemanticHash({ b: 2, a: { d: 4, c: 3 } }))
      .resolves.toBe(await computeSemanticHash({ a: { c: 3, d: 4 }, b: 2 }));
  });

  it.each([
    { label: 'undefined', value: { bad: undefined } },
    { label: 'non-finite number', value: { bad: Number.NaN } },
    { label: 'unsupported object', value: { bad: new Date() } },
    { label: 'unpaired surrogate', value: { bad: String.fromCharCode(0xd800) } },
  ])('rejects $label', ({ value }) => {
    expect(() => canonicalizeJson(value)).toThrow(RecordValidationError);
  });

  it('rejects sparse arrays', () => {
    const sparse = new Array(2);
    sparse[1] = 'present';
    expect(() => canonicalizeJson(sparse)).toThrow(/sparse array/);
  });

  it('compares semantic hashes only at equal content versions', () => {
    expect(semanticHashesEqual(
      { contentVersion: 1, semanticHash: ZERO_HASH },
      { contentVersion: 1, semanticHash: ZERO_HASH },
    )).toBe(true);
    expect(semanticHashesEqual(
      { contentVersion: 1, semanticHash: ZERO_HASH },
      { contentVersion: 2, semanticHash: ZERO_HASH },
    )).toBe(false);
  });
});
