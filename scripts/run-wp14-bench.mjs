import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '..');
const benchRoot = resolve(root, '.wp14-bench');
const workRoot = resolve(benchRoot, 'work');
const reportPath = resolve(benchRoot, 'wp14-benchmark-report.json');
const fixtureRoot = resolve(root, 'src/renderer/src/utils/__fixtures__');
const metadataPath = resolve(fixtureRoot, 'wp14-profile/fixture-metadata.json');

const assertInside = (parent, child) => {
  const rel = relative(parent, child);
  if (rel.startsWith('..') || rel === '' || rel.includes(':')) {
    throw new Error(`Refusing benchmark cleanup outside ${parent}: ${child}`);
  }
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const validateFixtures = () => {
  if (!existsSync(metadataPath)) {
    throw new Error(
      `Missing ${metadataPath}. Run npm.cmd run wp14:fixtures -- --profile-export <export.json> first.`,
    );
  }
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'));
  if (!Array.isArray(metadata.artifacts) || metadata.artifacts.length === 0) {
    throw new Error('WP14 fixture metadata contains no artifact inventory');
  }
  for (const artifact of metadata.artifacts) {
    const directory = artifact.tracked ? 'wp14' : 'wp14-profile';
    const file = resolve(fixtureRoot, directory, artifact.fileName);
    if (!existsSync(file)) throw new Error(`Missing required WP14 benchmark fixture: ${file}`);
    const bytes = readFileSync(file);
    const actual = sha256(bytes);
    if (bytes.length !== artifact.rawBytes || actual !== artifact.sha256) {
      throw new Error(
        `WP14 benchmark fixture mismatch: ${artifact.fileName} ` +
          `(bytes ${bytes.length}/${artifact.rawBytes}, sha ${actual}/${artifact.sha256})`,
      );
    }
  }
  return metadata;
};

const run = (command, args, label, env = process.env) => {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
};

const readCommitSha = () => {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error('Could not resolve benchmark commit SHA');
  return result.stdout.trim();
};

const updateCleanupResult = (cleanup) => {
  if (!existsSync(reportPath)) return;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  report.cleanup = cleanup;
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

validateFixtures();
mkdirSync(benchRoot, { recursive: true });
assertInside(benchRoot, workRoot);
rmSync(workRoot, { recursive: true, force: true });
rmSync(reportPath, { force: true });
mkdirSync(workRoot, { recursive: true });

const electronViteCli = resolve(
  root,
  'node_modules',
  require('electron-vite/package.json').bin['electron-vite'],
);
run(process.execPath, [electronViteCli, 'build', '--mode', 'wp14-bench'], 'production build');

const electronPath = require('electron');
const benchmarkEnv = {
  ...process.env,
  WL_WP14_BENCH: '1',
  WL_WP14_BENCH_ROOT: root,
  WL_WP14_BENCH_FIXTURES: fixtureRoot,
  WL_WP14_BENCH_WORK: workRoot,
  WL_WP14_BENCH_REPORT: reportPath,
  WL_WP14_BENCH_USER_DATA: resolve(workRoot, 'user-data'),
  WL_WP14_BENCH_COMMIT: readCommitSha(),
};

let benchmarkError = null;
try {
  run(electronPath, [root], 'Electron benchmark', benchmarkEnv);
  if (!existsSync(reportPath)) {
    throw new Error('Electron benchmark exited without producing its report');
  }
} catch (error) {
  benchmarkError = error;
}

let cleanup;
try {
  rmSync(workRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  cleanup = {
    userDataDeleted: true,
    workDirectoryDeleted: true,
    leftoverPath: null,
    error: null,
  };
} catch (error) {
  cleanup = {
    userDataDeleted: false,
    workDirectoryDeleted: false,
    leftoverPath: workRoot,
    error: error instanceof Error ? error.message : String(error),
  };
}
updateCleanupResult(cleanup);

if (benchmarkError) throw benchmarkError;
console.log(`WP14 benchmark report: ${reportPath}`);
