import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { assertJsonValue, type JsonObject } from '../src/shared/sessionRecord';
import { summarizeTimings } from '../src/shared/wp14Benchmark';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = resolve(
  root,
  'src/renderer/src/utils/__fixtures__/wp14-profile/rawtext-heavy-10mib-envelope.json',
);
const reportPath = resolve(root, '.wp14-bench/wp14-ipc-validation-report.json');
const warmups = 5;
const iterations = 30;

let fixture: string;
try {
  fixture = readFileSync(fixturePath, 'utf8');
} catch (error) {
  throw new Error(`WP14 IPC benchmark fixture is missing: ${fixturePath}`, { cause: error });
}

const envelope = JSON.parse(fixture) as { state?: unknown };
if (envelope.state === null || typeof envelope.state !== 'object' || Array.isArray(envelope.state)) {
  throw new Error('WP14 IPC benchmark fixture has no object state payload');
}
const payload = envelope.state as JsonObject;

const measure = (): number => {
  const startedAt = performance.now();
  assertJsonValue(payload, '$.response.data.payload');
  return performance.now() - startedAt;
};

for (let index = 0; index < warmups; index += 1) measure();
const timings = Array.from({ length: iterations }, measure);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  runMode: 'vite-ssr/node-v8',
  method: 'assertJsonValue recursive walk including unpaired-surrogate scan; JSON parse excluded',
  fixture: {
    path: fixturePath,
    rawUtf8Bytes: Buffer.byteLength(fixture, 'utf8'),
  },
  warmups,
  iterations,
  timings: summarizeTimings(timings),
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
