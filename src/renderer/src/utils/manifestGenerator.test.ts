import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { BUNDLED_MANIFEST } from '../../../shared/gameData/manifest';

const script = resolve('scripts/gen-manifest-json.mjs');
const tempDirs: string[] = [];

const makeTempDir = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'wl-manifest-'));
  tempDirs.push(dir);
  return dir;
};

const clone = <T>(value: T): T => structuredClone(value);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const run = (args: string[]): string => execFileSync(process.execPath, [script, ...args], {
  cwd: resolve('.'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

describe('manifest JSON generator CLI', () => {
  it('creates deterministic JSON, then verifies the existing revision without rewriting', () => {
    const outDir = makeTempDir();
    expect(run(['--out-dir', outDir])).toContain('revision 1 created');
    const target = join(outDir, 'manifest-1.json');
    const first = readFileSync(target, 'utf8');
    expect(first.endsWith('\n')).toBe(true);
    expect(JSON.parse(first)).toEqual(BUNDLED_MANIFEST);

    expect(run(['--out-dir', outDir])).toContain('revision 1 verified');
    expect(readFileSync(target, 'utf8')).toBe(first);
  });

  it('refuses to overwrite a published revision that differs', () => {
    const outDir = makeTempDir();
    run(['--out-dir', outDir]);
    const target = join(outDir, 'manifest-1.json');
    const corrupt = clone(BUNDLED_MANIFEST);
    corrupt.patchVersion = 'corrupt';
    writeFileSync(target, JSON.stringify(corrupt));

    expect(() => run(['--out-dir', outDir])).toThrow(/refusing to overwrite published revision 1/);
  });

  it('rejects missing alias targets and alias cycles', () => {
    const outDir = makeTempDir();
    const missing = clone(BUNDLED_MANIFEST);
    Object.assign(missing.scarabs[0], { status: 'renamed', aliasOf: 'does-not-exist' });
    const missingSource = join(outDir, 'missing.ts');
    writeFileSync(missingSource, `export const BUNDLED_MANIFEST = ${JSON.stringify(missing)};`);
    expect(() => run(['--source', missingSource, '--out-dir', outDir])).toThrow(/does not exist/);

    const cycle = clone(BUNDLED_MANIFEST);
    Object.assign(cycle.scarabs[0], { status: 'renamed', aliasOf: cycle.scarabs[1].id });
    Object.assign(cycle.scarabs[1], { status: 'renamed', aliasOf: cycle.scarabs[0].id });
    const cycleSource = join(outDir, 'cycle.ts');
    writeFileSync(cycleSource, `export const BUNDLED_MANIFEST = ${JSON.stringify(cycle)};`);
    expect(() => run(['--source', cycleSource, '--out-dir', outDir])).toThrow(/alias cycle/);
  });

  it('rejects duplicate ids, invalid statuses, and skipped revisions', () => {
    const outDir = makeTempDir();
    const duplicate = clone(BUNDLED_MANIFEST);
    duplicate.deliriumOrbs[0].id = duplicate.scarabs[0].id;
    const duplicateSource = join(outDir, 'duplicate.ts');
    writeFileSync(duplicateSource, `export const BUNDLED_MANIFEST = ${JSON.stringify(duplicate)};`);
    expect(() => run(['--source', duplicateSource, '--out-dir', outDir])).toThrow(/duplicate entity id/);

    const invalid = clone(BUNDLED_MANIFEST) as unknown as { mechanics: Record<string, string> };
    invalid.mechanics.scarabs = 'unknown';
    const invalidSource = join(outDir, 'invalid.ts');
    writeFileSync(invalidSource, `export const BUNDLED_MANIFEST = ${JSON.stringify(invalid)};`);
    expect(() => run(['--source', invalidSource, '--out-dir', outDir])).toThrow(/invalid status/);

    const skipped = clone(BUNDLED_MANIFEST);
    skipped.revision = 2;
    skipped.schemaVersion = 1;
    skipped.contextKey = 'poe1-challenge';
    const skippedSource = join(outDir, 'skipped.ts');
    writeFileSync(skippedSource, `export const BUNDLED_MANIFEST = ${JSON.stringify(skipped)};`);
    expect(() => run(['--source', skippedSource, '--out-dir', outDir])).toThrow(/new revision must be 1/);
  });

  it('requires supported schema and context metadata after legacy revision 1', () => {
    const outDir = makeTempDir();
    const revision2 = clone(BUNDLED_MANIFEST);
    revision2.revision = 2;
    const source = join(outDir, 'revision2.ts');
    writeFileSync(source, `export const BUNDLED_MANIFEST = ${JSON.stringify(revision2)};`);
    expect(() => run(['--source', source, '--out-dir', outDir])).toThrow(/schemaVersion must be 1/);

    Object.assign(revision2, { schemaVersion: 1, contextKey: 'wrong-product' });
    writeFileSync(source, `export const BUNDLED_MANIFEST = ${JSON.stringify(revision2)};`);
    expect(() => run(['--source', source, '--out-dir', outDir])).toThrow(/contextKey must be/);
  });
});
