import { app, BrowserWindow, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename, writeFile } from 'node:fs/promises';
import { cpus, totalmem, type, release, arch } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import type {
  Wp14SaveAcknowledgement,
} from '../shared/wp14Benchmark';
import {
  WP14_BENCHMARK_COUNTS,
  WP14_BENCHMARK_SCHEMA_VERSION,
  WP14_BENCHMARK_TARGETS,
} from '../shared/wp14Benchmark';

const gzipAsync = promisify(gzip);

interface SaveRequest {
  caseId: string;
  revision: number;
  mode: 'full' | 'slice';
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
}

interface SaveBaseline {
  revision: number;
  payload: Record<string, unknown>;
}

const REQUIRED_PATH_ENV = [
  'WL_WP14_BENCH_FIXTURES',
  'WL_WP14_BENCH_WORK',
  'WL_WP14_BENCH_REPORT',
] as const;

const TEMPORARY_HOOKS = [
  {
    file: 'src/main/index.ts',
    symbol: 'wp14BenchmarkMode startup branch',
    guard: "is.dev && WL_WP14_BENCH === '1'",
    removal: 'pending before release-line integration',
  },
  {
    file: 'src/main/wp14Benchmark.ts',
    symbol: 'wp14-bench:* IPC and atomic benchmark writer',
    guard: "is.dev && WL_WP14_BENCH === '1'",
    removal: 'pending before release-line integration',
  },
  {
    file: 'src/preload/wp14Benchmark.ts',
    symbol: 'window.wp14Bench bridge',
    guard: 'loaded only by the guarded benchmark BrowserWindow',
    removal: 'pending before release-line integration',
  },
  {
    file: 'src/renderer/src/wp14Bench.ts',
    symbol: 'production-renderer benchmark scenarios',
    guard: 'reachable only through the guarded benchmark HTML entry',
    removal: 'pending before release-line integration',
  },
  {
    file: 'src/renderer/src/wp14Hydrate.ts',
    symbol: 'real-path hydration frame',
    guard: 'reachable only as a child of the guarded benchmark renderer',
    removal: 'pending before release-line integration',
  },
] as const;

const envPath = (name: (typeof REQUIRED_PATH_ENV)[number]): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required WP14 benchmark environment variable: ${name}`);
  return resolve(value);
};

const assertInside = (parent: string, child: string): void => {
  const normalizedParent = `${resolve(parent)}${sep}`;
  const normalizedChild = resolve(child);
  if (!normalizedChild.startsWith(normalizedParent)) {
    throw new Error(`WP14 benchmark path escaped its fenced directory: ${normalizedChild}`);
  }
};

const parseSaveRequest = (serialized: string): SaveRequest => {
  const parsed = JSON.parse(serialized) as Partial<SaveRequest>;
  if (
    typeof parsed.caseId !== 'string' ||
    !Number.isSafeInteger(parsed.revision) ||
    (parsed.mode !== 'full' && parsed.mode !== 'slice')
  ) {
    throw new Error('Invalid WP14 benchmark save request');
  }
  if (parsed.mode === 'full' && (!parsed.payload || typeof parsed.payload !== 'object')) {
    throw new Error('Tier A benchmark request is missing its full payload');
  }
  if (parsed.mode === 'slice' && (!parsed.changes || typeof parsed.changes !== 'object')) {
    throw new Error('Tier B benchmark request is missing its changed slice');
  }
  return parsed as SaveRequest;
};

const safeCaseId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, '_');

export async function runWp14Benchmark(): Promise<void> {
  for (const name of REQUIRED_PATH_ENV) envPath(name);
  if (!process.env.WL_WP14_BENCH_COMMIT) {
    throw new Error('Missing required WP14 benchmark environment variable: WL_WP14_BENCH_COMMIT');
  }
  const fixtureRoot = envPath('WL_WP14_BENCH_FIXTURES');
  const workRoot = envPath('WL_WP14_BENCH_WORK');
  const reportPath = envPath('WL_WP14_BENCH_REPORT');
  const baselines = new Map<string, SaveBaseline>();
  let finished = false;

  const allowedFixtures = new Set([
    'wp14-profile/fixture-metadata.json',
    'wp14-profile/large-session-envelope.json',
    'wp14-profile/many-session-envelope.json',
    'wp14-profile/rawtext-heavy-10mib-envelope.json',
    'wp14/active-named-dirty-envelope.json',
  ]);

  ipcMain.handle('wp14-bench:read-fixture', async (_event, fileName: unknown) => {
    if (typeof fileName !== 'string' || !allowedFixtures.has(fileName)) {
      throw new Error(`WP14 benchmark refused fixture path: ${String(fileName)}`);
    }
    const file = resolve(fixtureRoot, fileName);
    assertInside(fixtureRoot, file);
    return readFile(file, 'utf8');
  });

  ipcMain.handle(
    'wp14-bench:set-baseline',
    (_event, caseId: unknown, revision: unknown, payloadJson: unknown) => {
      if (
        typeof caseId !== 'string' ||
        !Number.isSafeInteger(revision) ||
        typeof payloadJson !== 'string'
      ) {
        throw new Error('Invalid WP14 benchmark baseline');
      }
      const payload = JSON.parse(payloadJson) as Record<string, unknown>;
      baselines.set(caseId, { revision: Number(revision), payload });
    },
  );

  ipcMain.handle('wp14-bench:save', async (_event, serialized: unknown) => {
    if (typeof serialized !== 'string') throw new Error('Benchmark request must be serialized');
    const totalStarted = performance.now();
    const mergeStarted = performance.now();
    const request = parseSaveRequest(serialized);
    const prior = baselines.get(request.caseId);
    if (prior && request.revision <= prior.revision) {
      throw new Error(
        `Stale WP14 benchmark revision ${request.revision} for ${request.caseId}; ` +
          `last accepted ${prior.revision}`,
      );
    }

    let payload: Record<string, unknown>;
    if (request.mode === 'full') {
      payload = request.payload as Record<string, unknown>;
    } else {
      if (!prior) throw new Error(`Tier B benchmark has no baseline for ${request.caseId}`);
      payload = { ...prior.payload, ...(request.changes as Record<string, unknown>) };
    }
    const parseAndMergeMs = performance.now() - mergeStarted;

    const stringifyStarted = performance.now();
    const record = JSON.stringify({
      schemaVersion: 1,
      generation: request.revision,
      payload,
    });
    const stringifyMs = performance.now() - stringifyStarted;

    const gzipStarted = performance.now();
    const compressed = await gzipAsync(Buffer.from(record, 'utf8'));
    const gzipMs = performance.now() - gzipStarted;

    const writeStarted = performance.now();
    const directory = join(workRoot, 'save-trials');
    const stem = `${safeCaseId(request.caseId)}-${request.revision}-${process.pid}`;
    const temporary = join(directory, `${stem}.tmp`);
    const destination = join(directory, `${stem}.wlrec.gz`);
    assertInside(workRoot, temporary);
    assertInside(workRoot, destination);
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, compressed);

    let fsyncSucceeded = false;
    let fsyncError: string | null = null;
    const handle = await open(temporary, 'r+');
    try {
      await handle.sync();
      fsyncSucceeded = true;
    } catch (error) {
      fsyncError = error instanceof Error ? error.message : String(error);
    } finally {
      await handle.close();
    }
    await rename(temporary, destination);
    const writeFsyncRenameMs = performance.now() - writeStarted;

    baselines.set(request.caseId, { revision: request.revision, payload });
    const acknowledgement: Wp14SaveAcknowledgement = {
      caseId: request.caseId,
      revision: request.revision,
      mode: request.mode,
      finalRawBytes: Buffer.byteLength(record),
      gzipBytes: compressed.length,
      sha256: createHash('sha256').update(record).digest('hex'),
      fsync: {
        attempted: true,
        succeeded: fsyncSucceeded,
        error: fsyncError,
      },
      mainTimings: {
        parseAndMergeMs,
        stringifyMs,
        gzipMs,
        writeFsyncRenameMs,
        totalMs: performance.now() - totalStarted,
      },
    };
    return acknowledgement;
  });

  const writeReport = async (
    rendererResults: Record<string, unknown>,
    fatalError: string | null,
  ): Promise<void> => {
    const cpuList = cpus();
    const report = {
      schemaVersion: WP14_BENCHMARK_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      run: {
        mode: 'production-bundle/unpackaged-electron',
        commitSha: process.env.WL_WP14_BENCH_COMMIT,
        appVersion: app.getVersion(),
        fence: "is.dev && WL_WP14_BENCH === '1'",
        fatalError,
      },
      machine: {
        platform: process.platform,
        osType: type(),
        osRelease: release(),
        arch: arch(),
        cpuModel: cpuList[0]?.model ?? 'unknown',
        logicalCores: cpuList.length,
        totalMemoryBytes: totalmem(),
        versions: {
          electron: process.versions.electron,
          chromium: process.versions.chrome,
          node: process.versions.node,
          v8: process.versions.v8,
        },
      },
      methodology: {
        counts: WP14_BENCHMARK_COUNTS,
        targets: WP14_BENCHMARK_TARGETS,
        fsync:
          'Every save attempts FileHandle.sync() on the written temporary file before rename. ' +
          'Each acknowledgement records success or the exact caveat.',
        thresholdRelaxations: [],
      },
      temporaryHooks: TEMPORARY_HOOKS,
      results: rendererResults,
      cleanup: {
        userDataDeleted: false,
        workDirectoryDeleted: false,
        leftoverPath: process.env.WL_WP14_BENCH_USER_DATA ?? null,
        error: 'pending orchestrator cleanup after Electron exits',
      },
    };
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  };

  ipcMain.handle('wp14-bench:finish', async (_event, rendererResults: unknown) => {
    if (!rendererResults || typeof rendererResults !== 'object' || Array.isArray(rendererResults)) {
      throw new Error('WP14 benchmark renderer returned an invalid report');
    }
    await writeReport(rendererResults as Record<string, unknown>, null);
    finished = true;
    setImmediate(() => app.quit());
  });

  ipcMain.handle('wp14-bench:fail', async (_event, message: unknown) => {
    const error = typeof message === 'string' ? message : 'Unknown renderer benchmark failure';
    await writeReport({}, error);
    finished = true;
    process.exitCode = 1;
    setImmediate(() => app.quit());
  });

  const window = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/wp14Benchmark.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  window.on('closed', () => {
    if (!finished) {
      console.error('[WP14 bench] Benchmark window closed before producing a report');
      process.exitCode = 1;
    }
  });
  await window.loadFile(join(__dirname, '../renderer/wp14-bench.html'));
}
