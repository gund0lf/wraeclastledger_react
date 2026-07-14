#!/usr/bin/env node
/**
 * Generate the server's immutable manifest-N.json from the client source of
 * truth. Offline and deterministic: no wiki/poe.ninja calls happen here.
 *
 * Usage:
 *   node scripts/gen-manifest-json.mjs
 *   node scripts/gen-manifest-json.mjs --out-dir <directory>
 *
 * Existing revisions are never overwritten. An existing same-number file must
 * parse-compare identical; a new file must be exactly maxRevision + 1.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_SOURCE = join(ROOT, 'src', 'shared', 'gameData', 'manifest.ts');
const DEFAULT_OUT_DIR = join(ROOT, 'traceuer-server-side', 'wraeclast-strategy', 'api', 'game-data');

const ENTITY_STATUSES = new Set(['active', 'reworked', 'renamed', 'removed']);
const MECHANIC_STATUSES = new Set(['active', 'reworked', 'removed']);
const ENTITY_GROUPS = ['scarabs', 'deliriumOrbs', 'astrolabes', 'chisels'];
const SUPPORTED_SCHEMA_VERSION = 1;
const SUPPORTED_CONTEXT_KEY = 'poe1-challenge';

function fail(message) {
  throw new Error(message);
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('manifest must be an object');
  if (!Number.isInteger(manifest.revision) || manifest.revision < 1) fail('revision must be a positive integer');
  if (manifest.revision > 1 || manifest.schemaVersion !== undefined || manifest.contextKey !== undefined) {
    if (manifest.schemaVersion !== SUPPORTED_SCHEMA_VERSION) fail(`schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}`);
    if (manifest.contextKey !== SUPPORTED_CONTEXT_KEY) fail(`contextKey must be "${SUPPORTED_CONTEXT_KEY}"`);
  }
  if (typeof manifest.patchVersion !== 'string' || !manifest.patchVersion.trim()) fail('patchVersion must be non-empty');
  if (typeof manifest.atlasTreeVersion !== 'string') fail('atlasTreeVersion must be a string');
  if (!manifest.mechanics || typeof manifest.mechanics !== 'object' || Array.isArray(manifest.mechanics)) fail('mechanics must be an object');

  for (const [key, status] of Object.entries(manifest.mechanics)) {
    if (!key.trim()) fail('mechanic keys must be non-empty');
    if (!MECHANIC_STATUSES.has(status)) fail(`mechanics.${key} has invalid status "${status}"`);
  }

  const entities = [];
  const ids = new Map();
  const namesByGroup = new Map();
  for (const group of ENTITY_GROUPS) {
    const rows = manifest[group];
    if (!Array.isArray(rows)) fail(`${group} must be an array`);
    const names = new Set();
    namesByGroup.set(group, names);
    for (const [index, entity] of rows.entries()) {
      const at = `${group}[${index}]`;
      if (!entity || typeof entity !== 'object' || Array.isArray(entity)) fail(`${at} must be an object`);
      if (typeof entity.id !== 'string' || !entity.id.trim()) fail(`${at}.id must be non-empty`);
      if (typeof entity.name !== 'string' || !entity.name.trim()) fail(`${at}.name must be non-empty`);
      if (!ENTITY_STATUSES.has(entity.status)) fail(`${at} has invalid status "${entity.status}"`);
      if (ids.has(entity.id)) fail(`duplicate entity id "${entity.id}" (${ids.get(entity.id)} and ${at})`);
      if (names.has(entity.name)) fail(`duplicate ${group} name "${entity.name}"`);
      ids.set(entity.id, at);
      names.add(entity.name);
      entities.push({ entity, at });

      if (entity.status === 'renamed' && (typeof entity.aliasOf !== 'string' || !entity.aliasOf.trim())) {
        fail(`${at} is renamed but has no aliasOf target`);
      }
      if (entity.status !== 'renamed' && entity.aliasOf !== undefined) {
        fail(`${at} has aliasOf but status is not renamed`);
      }
    }
  }

  const byId = new Map(entities.map(({ entity }) => [entity.id, entity]));
  for (const { entity, at } of entities) {
    if (!entity.aliasOf) continue;
    if (entity.aliasOf === entity.id) fail(`${at} aliases itself`);
    if (!byId.has(entity.aliasOf)) fail(`${at} alias target "${entity.aliasOf}" does not exist`);
  }

  for (const { entity, at } of entities) {
    const seen = new Set();
    let cursor = entity;
    while (cursor.aliasOf) {
      if (seen.has(cursor.id)) fail(`${at} participates in an alias cycle`);
      seen.add(cursor.id);
      cursor = byId.get(cursor.aliasOf);
    }
  }

  return manifest;
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(validateManifest(manifest), null, 2)}\n`;
}

async function loadTypeScriptManifest(sourcePath) {
  const source = await readFile(sourcePath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: sourcePath,
    reportDiagnostics: true,
  });
  const errors = (compiled.diagnostics ?? []).filter((d) => d.category === ts.DiagnosticCategory.Error);
  if (errors.length) fail(`TypeScript manifest transpile failed: ${errors.map((d) => d.messageText).join('; ')}`);

  const module = { exports: {} };
  const unsupportedRequire = (id) => fail(`manifest.ts emitted an unexpected runtime import: ${id}`);
  vm.runInNewContext(compiled.outputText, { module, exports: module.exports, require: unsupportedRequire }, { filename: sourcePath });
  if (!module.exports.BUNDLED_MANIFEST) fail('manifest.ts did not export BUNDLED_MANIFEST');
  return module.exports.BUNDLED_MANIFEST;
}

function parseArgs(argv) {
  let outDir = DEFAULT_OUT_DIR;
  let sourcePath = DEFAULT_SOURCE;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out-dir') {
      if (!argv[i + 1]) fail('--out-dir requires a path');
      outDir = resolve(argv[++i]);
    } else if (argv[i] === '--source') {
      if (!argv[i + 1]) fail('--source requires a path');
      sourcePath = resolve(argv[++i]);
    } else {
      fail(`unknown argument: ${argv[i]}`);
    }
  }
  return { outDir, sourcePath };
}

async function existingRevisions(outDir) {
  const files = await readdir(outDir);
  return files
    .map((name) => /^manifest-(\d+)\.json$/.exec(name))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}

export async function generateManifest({ sourcePath = DEFAULT_SOURCE, outDir = DEFAULT_OUT_DIR } = {}) {
  const manifest = validateManifest(await loadTypeScriptManifest(sourcePath));
  const serialized = serializeManifest(manifest);
  const revisions = await existingRevisions(outDir);
  const latest = revisions.at(-1) ?? 0;
  const target = join(outDir, `manifest-${manifest.revision}.json`);

  if (revisions.includes(manifest.revision)) {
    const existing = JSON.parse(await readFile(target, 'utf8'));
    validateManifest(existing);
    if (JSON.stringify(existing) !== JSON.stringify(manifest)) {
      fail(`refusing to overwrite published revision ${manifest.revision}: ${target} differs from manifest.ts`);
    }
    return { action: 'verified', target, revision: manifest.revision };
  }

  if (manifest.revision !== latest + 1) {
    fail(`new revision must be ${latest + 1} (latest is ${latest}); got ${manifest.revision}`);
  }

  await writeFile(target, serialized, { encoding: 'utf8', flag: 'wx' });
  const written = JSON.parse(await readFile(target, 'utf8'));
  if (JSON.stringify(written) !== JSON.stringify(manifest)) fail(`post-write parse comparison failed for ${target}`);
  return { action: 'created', target, revision: manifest.revision };
}

async function main() {
  const { outDir, sourcePath } = parseArgs(process.argv.slice(2));
  const result = await generateManifest({ outDir, sourcePath });
  console.log(`[GameData] revision ${result.revision} ${result.action}: ${result.target}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`[GameData] ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}
