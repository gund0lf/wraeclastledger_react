import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { verifyInstalledDependencies, verifyPackagedDependencies, verifyAfterPack } = require('./dependency-lock.cjs');
const asar = require('@electron/asar');
const manifest = { dependencies: { fflate: '^0.8.2' }, devDependencies: { electron: '44.5.1' } };
const lock = {
  lockfileVersion: 3,
  packages: {
    '': manifest,
    'node_modules/fflate': { version: '0.8.3' },
    'node_modules/electron': { version: '44.5.1', dev: true },
    'node_modules/platform-optional': { version: '1.0.0', optional: true },
  },
};
const writeJson = (file, value) => writeFile(file, JSON.stringify(value));
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'wl-lock-check-'));
  try {
    await writeJson(join(directory, 'package.json'), manifest);
    await writeJson(join(directory, 'package-lock.json'), lock);
    for (const [name, version] of [['fflate', '0.8.3'], ['electron', '44.5.1']]) {
      await mkdir(join(directory, 'node_modules', name), { recursive: true });
      await writeJson(join(directory, 'node_modules', name, 'package.json'), { name, version });
    }
    await run(directory);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.match(directory, /wl-lock-check-/);
    await rm(directory, { recursive: true, force: true });
  }
}

test('installed verification accepts exact versions and omitted optional platform packages', () => fixture(directory => {
  assert.equal(verifyInstalledDependencies(directory).verified, 2);
}));
test('installed verification rejects the previously observed fflate drift', () => fixture(async directory => {
  await writeJson(join(directory, 'node_modules/fflate/package.json'), { name: 'fflate', version: '0.8.2' });
  assert.throws(() => verifyInstalledDependencies(directory), /lock mismatch: node_modules\/fflate/);
}));
test('installed verification rejects manifest/lock declaration drift', () => fixture(async directory => {
  await writeJson(join(directory, 'package.json'), { ...manifest, dependencies: { fflate: '^0.8.3' } });
  assert.throws(() => verifyInstalledDependencies(directory), /declarations differ/);
}));
test('installed verification rejects missing required dependencies', () => fixture(async directory => {
  await writeJson(join(directory, 'package-lock.json'), { ...lock, packages: { ...lock.packages, 'node_modules/required': { version: '1.0.0' } } });
  assert.throws(() => verifyInstalledDependencies(directory), /Locked dependency missing/);
}));

for (const [label, entries, electron, pattern] of [
  ['matching archive', { 'node_modules/fflate/package.json': { version: '0.8.3' } }, '44.5.1', null],
  ['stale archive', { 'node_modules/fflate/package.json': { version: '0.8.2' } }, '44.5.1', /lock mismatch/],
  ['unlocked package', { 'node_modules/foreign/package.json': { version: '1.0.0' } }, '44.5.1', /not locked/],
  ['missing runtime dependency', {}, '44.5.1', /Packaged dependency missing/],
  ['wrong Electron runtime', { 'node_modules/fflate/package.json': { version: '0.8.3' } }, '43.4.1', /Electron version differs/],
  ['metadata-only subpackage manifests', {
    'node_modules/fflate/package.json': { version: '0.8.3' },
    'node_modules/fflate/esm/package.json': { type: 'module' },
    'node_modules/@babel/runtime/helpers/esm/package.json': { type: 'module' },
    'node_modules/@floating-ui/utils/dom/package.json': { main: '../dom.js' },
    'node_modules/tslib/modules/package.json': { type: 'module' },
  }, '44.5.1', null],
  ['an unlocked nested true package root', {
    'node_modules/fflate/package.json': { version: '0.8.3' },
    'node_modules/fflate/node_modules/foreign/package.json': { version: '1.0.0' },
  }, '44.5.1', /not locked/],
]) {
  test(`archive verification handles ${label} with native path separators`, () => {
    const reader = {
      listPackage: () => Object.keys(entries).map(name => '\\' + name.replaceAll('/', '\\')),
      extractFile: (_archive, name) => Buffer.from(JSON.stringify(entries[name.replaceAll('\\', '/')])),
    };
    const verify = () => verifyPackagedDependencies('fixture.asar', lock, manifest, electron, reader);
    if (pattern) assert.throws(verify, pattern);
    else assert.deepEqual(verify(), { verified: 1, electronVersion: '44.5.1' });
  });
}
test('packaged inventory accepts builder-hoisted production versions, not colliding dev-only versions', () => {
  const hoistedLock = { ...lock, packages: { ...lock.packages,
    'node_modules/semver': { version: '6.3.1', dev: true },
    'node_modules/electron-updater/node_modules/semver': { version: '7.7.3' },
    'node_modules/electron-updater/node_modules/@scope/runtime': { version: '2.0.0' },
  } };
  const entries = {
    'node_modules/fflate/package.json': { version: '0.8.3' },
    'node_modules/semver/package.json': { version: '7.7.3' },
    'node_modules/@scope/runtime/package.json': { version: '2.0.0' },
    'node_modules/@scope/runtime/esm/package.json': { type: 'module' },
  };
  const reader = {
    listPackage: () => Object.keys(entries).map(name => '/' + name),
    extractFile: (_archive, name) => Buffer.from(JSON.stringify(entries[name])),
  };
  assert.equal(verifyPackagedDependencies('hoisted.asar', hoistedLock, manifest, '44.5.1', reader).verified, 3);
  entries['node_modules/semver/package.json'].version = '6.3.1';
  assert.throws(() => verifyPackagedDependencies('hoisted.asar', hoistedLock, manifest, '44.5.1', reader), /not locked for production/);
  entries['node_modules/semver/package.json'].version = '9.0.0';
  assert.throws(() => verifyPackagedDependencies('hoisted.asar', hoistedLock, manifest, '44.5.1', reader), /not locked for production/);
});
test('a direct runtime dependency must use its exact root lock version even if another version is locked elsewhere', () => {
  const multiLock = { ...lock, packages: { ...lock.packages,
    'node_modules/example/node_modules/fflate': { version: '0.8.2' },
  } };
  const reader = { listPackage: () => ['/node_modules/fflate/package.json'],
    extractFile: () => Buffer.from('{"version":"0.8.2"}') };
  assert.throws(() => verifyPackagedDependencies('direct.asar', multiLock, manifest, '44.5.1', reader), /expected 0.8.3/);
});
test('the real ASAR reader handles builder-hoisted packages and metadata-only manifests', () => fixture(async directory => {
  const updatedLock = { ...lock, packages: { ...lock.packages,
    'node_modules/semver': { version: '6.3.1', dev: true },
    'node_modules/electron-updater/node_modules/semver': { version: '7.7.3' },
    'node_modules/electron-updater/node_modules/fs-extra': { version: '10.1.0' },
    'node_modules/electron-updater/node_modules/@scope/runtime': { version: '2.0.0' },
  } };
  await writeJson(join(directory, 'package-lock.json'), updatedLock);
  const app = join(directory, 'hoisted-app'), resources = join(directory, 'hoisted-resources');
  await mkdir(resources);
  for (const [path, contents] of Object.entries({
    'node_modules/fflate/package.json': { name: 'fflate', version: '0.8.3' },
    'node_modules/semver/package.json': { name: 'semver', version: '7.7.3' },
    'node_modules/fs-extra/package.json': { name: 'fs-extra', version: '10.1.0' },
    'node_modules/@scope/runtime/package.json': { name: '@scope/runtime', version: '2.0.0' },
    'node_modules/@scope/runtime/esm/package.json': { type: 'module' },
    'node_modules/fflate/esm/package.json': { type: 'module' },
  })) {
    const file = join(app, path);
    await mkdir(dirname(file), { recursive: true });
    await writeJson(file, contents);
  }
  await asar.createPackage(app, join(resources, 'app.asar'));
  assert.deepEqual(verifyAfterPack({ appOutDir: directory, packager: {
    projectDir: directory, getResourcesDir: () => resources, info: { framework: { version: '44.5.1' } },
  } }), { verified: 4, electronVersion: '44.5.1' });
}));
test('the real after-pack assembly inspects a real ASAR', () => fixture(async directory => {
  const app = join(directory, 'app');
  const resources = join(directory, 'resources');
  await mkdir(join(app, 'node_modules/fflate'), { recursive: true });
  await mkdir(resources);
  await writeJson(join(app, 'node_modules/fflate/package.json'), { name: 'fflate', version: '0.8.3' });
  await asar.createPackage(app, join(resources, 'app.asar'));
  assert.deepEqual(verifyAfterPack({ appOutDir: directory, packager: {
    projectDir: directory, getResourcesDir: () => resources, info: { framework: { version: '44.5.1' } },
  } }), { verified: 1, electronVersion: '44.5.1' });
}));
