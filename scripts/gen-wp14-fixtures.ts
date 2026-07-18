import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WP14_FIXTURE_SEED,
  WP14_PROFILE_EXPORT_SHA256,
  generateProfileWp14Fixtures,
  generateSmallWp14Fixtures,
  type GeneratedFixture,
  type SessionExportEnvelope,
} from '../src/renderer/src/utils/__fixtures__/wp14Fixtures';

const args = process.argv.slice(2);
const valueAfter = (flag: string): string | null => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
};

const sourceArg = valueAfter('--profile-export');
if (!sourceArg) {
  throw new Error('Usage: npm.cmd run wp14:fixtures -- --profile-export <sessions-export.json>');
}

const seedArg = valueAfter('--seed');
const seed = seedArg ? Number(seedArg) : WP14_FIXTURE_SEED;
if (!Number.isSafeInteger(seed)) throw new Error(`Invalid deterministic seed: ${seedArg}`);

const root = resolve(import.meta.dirname, '..');
const trackedDir = resolve(root, 'src/renderer/src/utils/__fixtures__/wp14');
const profileDir = resolve(root, 'src/renderer/src/utils/__fixtures__/wp14-profile');
const sourcePath = resolve(sourceArg);
const sourceBytes = readFileSync(sourcePath);
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
if (sourceHash !== WP14_PROFILE_EXPORT_SHA256) {
  throw new Error(
    `Unexpected profile export SHA-256: ${sourceHash}; expected ${WP14_PROFILE_EXPORT_SHA256}`,
  );
}

const source = JSON.parse(sourceBytes.toString('utf8')) as SessionExportEnvelope;
const artifacts = [
  ...generateSmallWp14Fixtures(seed),
  ...generateProfileWp14Fixtures(source, seed),
];

const metadata = (fixture: GeneratedFixture) => {
  const bytes = Buffer.from(fixture.content, 'utf8');
  return {
    fileName: fixture.fileName,
    fixtureClass: fixture.fixtureClass,
    tracked: fixture.tracked,
    rawBytes: bytes.length,
    gzipBytes: gzipSync(bytes).length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
};

mkdirSync(trackedDir, { recursive: true });
mkdirSync(profileDir, { recursive: true });
for (const fixture of artifacts) {
  const directory = fixture.tracked ? trackedDir : profileDir;
  writeFileSync(resolve(directory, fixture.fileName), fixture.content, 'utf8');
}

const report = {
  seed,
  source: {
    fileName: sourcePath,
    rawBytes: sourceBytes.length,
    sha256: sourceHash,
  },
  artifacts: artifacts.map(metadata),
};
writeFileSync(
  resolve(profileDir, 'fixture-metadata.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
);
console.log(JSON.stringify(report, null, 2));
