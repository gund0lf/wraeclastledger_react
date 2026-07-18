import type {
  Wp14BenchmarkApi,
  Wp14HydrateResult,
  Wp14LongTask,
  Wp14SaveAcknowledgement,
  Wp14SaveTier,
} from '../../shared/wp14Benchmark';
import {
  WP14_BENCHMARK_COUNTS,
  WP14_BENCHMARK_TARGET_BYTES,
  WP14_BENCHMARK_TARGETS,
  deriveCatalogFixtureWithinQuota,
  deriveMapPrefixPayload,
  extractWp14SessionPayload,
  summarizeTimings,
  utf8Size,
} from '../../shared/wp14Benchmark';

declare global {
  interface Window {
    wp14Bench: Wp14BenchmarkApi;
  }
}

interface FixtureMetadata {
  seed: number;
  source: {
    rawBytes: number;
    sha256: string;
  };
  artifacts: Array<{
    fileName: string;
    fixtureClass: string;
    tracked: boolean;
    rawBytes: number;
    gzipBytes: number;
    sha256: string;
  }>;
}

interface PersistEnvelope {
  state: Record<string, unknown>;
  version: number;
}

interface HydrateError {
  type: 'wp14-hydrate-error';
  nonce: string;
  error: string;
}

interface SaveTrial {
  rendererSerializeMs: number;
  invokeToAckMs: number;
  endToEndAckMs: number;
  acknowledgement: Wp14SaveAcknowledgement;
}

const api = window.wp14Bench;
const longTasks: Wp14LongTask[] = [];
let activePhase = 'initialization';
let longTaskObserverSupported = true;
const longTaskObserver = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    longTasks.push({
      phase: activePhase,
      durationMs: entry.duration,
      startTimeMs: entry.startTime,
      source: 'benchmark-renderer',
    });
  }
});

try {
  longTaskObserver.observe({ type: 'longtask', buffered: true });
} catch {
  longTaskObserverSupported = false;
}

const status = (message: string): void => {
  const element = document.getElementById('status');
  if (element) element.textContent = message;
  console.log(`[WP14 bench] ${message}`);
};

const sleep = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const parseEnvelope = (content: string): PersistEnvelope =>
  JSON.parse(content) as PersistEnvelope;

const runHydrateFrame = (
  envelope: string,
  expectedSessionCount: number,
  nonce: string,
): Promise<Wp14HydrateResult> =>
  new Promise((resolve, reject) => {
    localStorage.clear();
    localStorage.setItem('map-tracker-storage', envelope);
    const frame = document.createElement('iframe');
    frame.hidden = true;
    const timeout = window.setTimeout(() => {
      frame.remove();
      reject(new Error(`Hydration frame timed out: ${nonce}`));
    }, 30_000);

    const listener = (event: MessageEvent<Wp14HydrateResult | HydrateError>): void => {
      if (event.source !== frame.contentWindow || event.data?.nonce !== nonce) return;
      window.removeEventListener('message', listener);
      window.clearTimeout(timeout);
      frame.remove();
      if (event.data.type === 'wp14-hydrate-error') {
        reject(new Error(event.data.error));
        return;
      }
      if (event.data.savedSessionCount !== expectedSessionCount) {
        reject(
          new Error(
            `Hydration count mismatch: ${event.data.savedSessionCount}/${expectedSessionCount}`,
          ),
        );
        return;
      }
      resolve(event.data);
    };

    window.addEventListener('message', listener);
    const url = new URL('wp14-hydrate.html', window.location.href);
    url.searchParams.set('nonce', nonce);
    frame.src = url.toString();
    document.body.append(frame);
  });

const runHydrationScenario = async (
  name: string,
  envelope: string,
  expectedSessionCount: number,
): Promise<Record<string, unknown>> => {
  const durations: number[] = [];
  const frameLongTasks: Wp14LongTask[] = [];
  let observerSupported = true;
  const total =
    WP14_BENCHMARK_COUNTS.bootstrapWarmups + WP14_BENCHMARK_COUNTS.bootstrapIterations;
  for (let index = 0; index < total; index++) {
    const warmup = index < WP14_BENCHMARK_COUNTS.bootstrapWarmups;
    activePhase = `${warmup ? 'warmup:' : ''}hydrate:${name}`;
    const result = await runHydrateFrame(
      envelope,
      expectedSessionCount,
      `${name}-${index}-${Date.now()}`,
    );
    if (!warmup) {
      durations.push(result.durationMs);
      observerSupported &&= result.longTaskObserverSupported;
      frameLongTasks.push(...result.longTasks);
    }
    await sleep(0);
  }
  longTasks.push(...frameLongTasks);
  return {
    fixtureCodeUnits: envelope.length,
    estimatedQuotaBytes: envelope.length * 2,
    expectedSessionCount,
    timing: summarizeTimings(durations),
    longTaskObserverSupported: observerSupported,
    longTaskCount: frameLongTasks.length,
  };
};

const probeLocalStorageQuota = (manySessionEnvelope: string): Record<string, unknown> => {
  activePhase = 'quota-probe';
  localStorage.clear();
  let fullSeedSucceeded = true;
  let fullSeedError: { name: string; message: string } | null = null;
  try {
    localStorage.setItem('map-tracker-storage', manySessionEnvelope);
  } catch (error) {
    fullSeedSucceeded = false;
    fullSeedError = {
      name: error instanceof DOMException ? error.name : 'Error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  localStorage.clear();

  const canStore = (characters: number): boolean => {
    localStorage.clear();
    try {
      localStorage.setItem('wp14-quota-probe', 'x'.repeat(characters));
      return true;
    } catch {
      return false;
    } finally {
      localStorage.clear();
    }
  };

  let lower = 0;
  let upper = Math.max(1, manySessionEnvelope.length);
  if (canStore(upper)) {
    lower = upper;
    while (upper < 32 * 1024 * 1024 && canStore(upper * 2)) {
      lower = upper * 2;
      upper *= 2;
    }
    upper = Math.min(upper * 2, 32 * 1024 * 1024);
  }
  while (lower + 1 < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (canStore(middle)) lower = middle;
    else upper = middle;
  }
  localStorage.clear();

  return {
    fullManySessionSeed: {
      codeUnits: manySessionEnvelope.length,
      estimatedUtf16Bytes: manySessionEnvelope.length * 2,
      succeeded: fullSeedSucceeded,
      error: fullSeedError,
    },
    measuredCeiling: {
      asciiValueCodeUnits: lower,
      estimatedUtf16Bytes: lower * 2,
      method: 'deterministic binary search using an isolated-origin localStorage value',
    },
    headline: fullSeedSucceeded
      ? 'The 100-session fixture fit this machine profile unexpectedly; use the measured ceiling.'
      : 'Current localStorage cannot hold the realistic 100-session catalogue fixture.',
  };
};

const runFileShapedHydration = async (
  manySessionEnvelope: string,
): Promise<Record<string, unknown>> => {
  activePhase = 'file-shaped-import';
  localStorage.clear();
  const { mergePersistedSessionState, useSessionStore } =
    await import('./store/useSessionStore');
  const currentState = useSessionStore.getState();
  const durations: number[] = [];
  const total =
    WP14_BENCHMARK_COUNTS.bootstrapWarmups + WP14_BENCHMARK_COUNTS.bootstrapIterations;
  for (let index = 0; index < total; index++) {
    const warmup = index < WP14_BENCHMARK_COUNTS.bootstrapWarmups;
    activePhase = `${warmup ? 'warmup:' : ''}file-shaped-hydration`;
    const started = performance.now();
    const envelope = JSON.parse(manySessionEnvelope) as PersistEnvelope;
    const hydrated = mergePersistedSessionState(envelope.state, currentState);
    const duration = performance.now() - started;
    if (Object.keys(hydrated.savedSessions).length !== 100) {
      throw new Error('File-shaped hydration did not preserve the 100-session catalogue');
    }
    if (!warmup) durations.push(duration);
    await sleep(0);
  }
  return {
    fixtureRawBytes: utf8Size(manySessionEnvelope),
    expectedSessionCount: 100,
    path: 'disk read outside timing -> JSON.parse -> current-version migration no-op -> mergePersistedSessionState',
    timing: summarizeTimings(durations),
  };
};

const runSaveTrial = async (
  tier: Wp14SaveTier,
  caseId: string,
  revision: number,
  payload: Record<string, unknown>,
  note: string,
): Promise<SaveTrial> => {
  const request =
    tier === 'A'
      ? { caseId, revision, mode: 'full', payload: { ...payload, sessionNotes: note } }
      : { caseId, revision, mode: 'slice', changes: { sessionNotes: note } };
  const endToEndStarted = performance.now();
  const serializeStarted = performance.now();
  const serialized = JSON.stringify(request);
  const rendererSerializeMs = performance.now() - serializeStarted;
  const invokeStarted = performance.now();
  const acknowledgement = await api.save(serialized);
  const invokeToAckMs = performance.now() - invokeStarted;
  return {
    rendererSerializeMs,
    invokeToAckMs,
    endToEndAckMs: performance.now() - endToEndStarted,
    acknowledgement,
  };
};

const runSaveScenario = async (
  tier: Wp14SaveTier,
  sizeName: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const trials: SaveTrial[] = [];
  const total = WP14_BENCHMARK_COUNTS.saveWarmups + WP14_BENCHMARK_COUNTS.saveIterations;
  for (let index = 0; index < total; index++) {
    const warmup = index < WP14_BENCHMARK_COUNTS.saveWarmups;
    const caseId = `save-${tier}-${sizeName}-${index}`;
    activePhase = `${warmup ? 'warmup:' : ''}save:${tier}:${sizeName}`;
    if (tier === 'B') await api.setSaveBaseline(caseId, 0, JSON.stringify(payload));
    const trial = await runSaveTrial(tier, caseId, 1, payload, `save trial ${index}`);
    if (!warmup) trials.push(trial);
    await sleep(0);
  }

  const fsyncFailures = trials
    .filter((trial) => !trial.acknowledgement.fsync.succeeded)
    .map((trial) => ({
      caseId: trial.acknowledgement.caseId,
      error: trial.acknowledgement.fsync.error,
    }));
  return {
    tier,
    payloadRawBytes: utf8Size(JSON.stringify(payload)),
    rendererSerialize: summarizeTimings(trials.map((trial) => trial.rendererSerializeMs)),
    invokeToDurableAck: summarizeTimings(trials.map((trial) => trial.invokeToAckMs)),
    endToEndDurableAck: summarizeTimings(trials.map((trial) => trial.endToEndAckMs)),
    main: {
      parseAndMerge: summarizeTimings(
        trials.map((trial) => trial.acknowledgement.mainTimings.parseAndMergeMs),
      ),
      stringify: summarizeTimings(
        trials.map((trial) => trial.acknowledgement.mainTimings.stringifyMs),
      ),
      gzip: summarizeTimings(
        trials.map((trial) => trial.acknowledgement.mainTimings.gzipMs),
      ),
      writeFsyncRename: summarizeTimings(
        trials.map((trial) => trial.acknowledgement.mainTimings.writeFsyncRenameMs),
      ),
      total: summarizeTimings(
        trials.map((trial) => trial.acknowledgement.mainTimings.totalMs),
      ),
    },
    finalRawBytes: trials[0]?.acknowledgement.finalRawBytes ?? null,
    gzipBytes: trials[0]?.acknowledgement.gzipBytes ?? null,
    fsync: {
      attemptedOnEveryTrial: true,
      successfulTrials: trials.length - fsyncFailures.length,
      failedTrials: fsyncFailures.length,
      caveats: fsyncFailures,
    },
  };
};

const runTypingTrace = async (
  tier: Wp14SaveTier,
  debounceMs: number,
  payload: Record<string, unknown>,
  runIndex: number,
): Promise<{ writes: number; lastInputToAckMs: number; acknowledgements: SaveTrial[] }> => {
  const caseId = `typing-${tier}-${debounceMs}-${runIndex}`;
  if (tier === 'B') await api.setSaveBaseline(caseId, 0, JSON.stringify(payload));

  let latestNote = '';
  let acknowledgedNote = '';
  let revision = 0;
  let timer: number | null = null;
  let inFlight = false;
  let queued = false;
  let finalInputAt = performance.now();
  let finalAckAt = finalInputAt;
  let failure: unknown = null;
  const acknowledgements: SaveTrial[] = [];

  const persistLatest = async (): Promise<void> => {
    if (inFlight) {
      queued = true;
      return;
    }
    inFlight = true;
    try {
      const note = latestNote;
      const trial = await runSaveTrial(tier, caseId, ++revision, payload, note);
      acknowledgements.push(trial);
      acknowledgedNote = note;
      finalAckAt = performance.now();
    } catch (error) {
      failure = error;
    } finally {
      inFlight = false;
    }
    if (!failure && (queued || acknowledgedNote !== latestNote)) {
      queued = false;
      await persistLatest();
    }
  };

  const edit = (note: string): void => {
    latestNote = note;
    finalInputAt = performance.now();
    if (timer !== null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      void persistLatest();
    }, debounceMs);
  };

  for (let index = 0; index < 24; index++) {
    edit(`first burst ${index}`);
    await sleep(20);
  }
  await sleep(300);
  for (let index = 0; index < 24; index++) {
    edit(`second burst ${index}`);
    await sleep(20);
  }

  while (!failure && (timer !== null || inFlight || acknowledgedNote !== latestNote)) {
    await sleep(10);
  }
  if (failure) throw failure;
  return {
    writes: acknowledgements.length,
    lastInputToAckMs: finalAckAt - finalInputAt,
    acknowledgements,
  };
};

const runTypingScenario = async (
  tier: Wp14SaveTier,
  debounceMs: number,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  const measured: Array<Awaited<ReturnType<typeof runTypingTrace>>> = [];
  const total = WP14_BENCHMARK_COUNTS.typingWarmups + WP14_BENCHMARK_COUNTS.typingIterations;
  for (let index = 0; index < total; index++) {
    const warmup = index < WP14_BENCHMARK_COUNTS.typingWarmups;
    activePhase = `${warmup ? 'warmup:' : ''}typing:${tier}:${debounceMs}`;
    const result = await runTypingTrace(tier, debounceMs, payload, index);
    if (!warmup) measured.push(result);
    await sleep(0);
  }
  return {
    tier,
    debounceMs,
    inputTrace: {
      firstBurst: '24 edits at 20 ms intervals',
      pauseMs: 300,
      secondBurst: '24 edits at 20 ms intervals',
    },
    writesPerRun: measured.map((run) => run.writes),
    lastInputToDurableAck: summarizeTimings(measured.map((run) => run.lastInputToAckMs)),
    durableWriteAck: summarizeTimings(
      measured.flatMap((run) => run.acknowledgements.map((trial) => trial.endToEndAckMs)),
    ),
  };
};

const retentionEvidence = (metadata: FixtureMetadata): Record<string, unknown> => {
  const budgets = [25, 50, 100].map((mib) => ({
    mib,
    bytes: mib * 1024 * 1024,
  }));
  return {
    policy: 'evidence only; no retention constant is selected by the harness',
    artifacts: metadata.artifacts.map((artifact) => ({
      fileName: artifact.fileName,
      fixtureClass: artifact.fixtureClass,
      rawBytes: artifact.rawBytes,
      gzipBytes: artifact.gzipBytes,
      compressionRatio:
        artifact.rawBytes === 0 ? null : Math.round((artifact.gzipBytes / artifact.rawBytes) * 1e6) / 1e6,
      projectedIndividualCounts: Object.fromEntries(
        budgets.map((budget) => [
          `${budget.mib}MiB`,
          artifact.gzipBytes === 0 ? null : Math.floor(budget.bytes / artifact.gzipBytes),
        ]),
      ),
    })),
  };
};

const targetStatus = (value: number | null, maximum: number): string =>
  value !== null && value <= maximum ? 'pass' : 'miss-requires-explicit-amendment';

const run = async (): Promise<void> => {
  status('Loading and validating benchmark fixtures');
  const [metadataText, largeText, manyText, rawTextHeavy, smallText] = await Promise.all([
    api.readFixture('wp14-profile/fixture-metadata.json'),
    api.readFixture('wp14-profile/large-session-envelope.json'),
    api.readFixture('wp14-profile/many-session-envelope.json'),
    api.readFixture('wp14-profile/rawtext-heavy-10mib-envelope.json'),
    api.readFixture('wp14/active-named-dirty-envelope.json'),
  ]);
  const metadata = JSON.parse(metadataText) as FixtureMetadata;

  status('Measuring the localStorage quota ceiling');
  const quota = probeLocalStorageQuota(manyText);
  const measuredQuota = (quota.measuredCeiling as { asciiValueCodeUnits: number })
    .asciiValueCodeUnits;
  const safeCatalog = deriveCatalogFixtureWithinQuota(manyText, measuredQuota);

  status('Measuring real-path localStorage hydration');
  const largeEnvelope = parseEnvelope(largeText);
  const largeSessionCount = Object.keys(
    largeEnvelope.state.savedSessions as Record<string, unknown>,
  ).length;
  const realLarge = await runHydrationScenario('large-session', largeText, largeSessionCount);
  const realCatalog = await runHydrationScenario(
    'quota-safe-catalog',
    safeCatalog.content,
    safeCatalog.sessionCount,
  );

  status('Measuring future file-shaped hydration');
  const fileShaped = await runFileShapedHydration(manyText);

  const smallPayload = extractWp14SessionPayload(parseEnvelope(smallText).state);
  const rawState = parseEnvelope(rawTextHeavy).state;
  const typicalPayload = deriveMapPrefixPayload(rawState, WP14_BENCHMARK_TARGET_BYTES);
  const tenMiBPayload = extractWp14SessionPayload(rawState);
  const payloads = {
    small: smallPayload,
    typical: typicalPayload,
    tenMiB: tenMiBPayload,
  };

  status('Measuring Tier A and Tier B durable acknowledgements');
  const saves: Record<string, unknown> = {};
  for (const tier of ['A', 'B'] as const) {
    for (const [sizeName, payload] of Object.entries(payloads)) {
      saves[`${tier}-${sizeName}`] = await runSaveScenario(tier, sizeName, payload);
    }
  }

  status('Simulating typing bursts across debounce candidates');
  const typing: Record<string, unknown> = {};
  for (const tier of ['A', 'B'] as const) {
    for (const debounceMs of [250, 500, 1000]) {
      typing[`${tier}-${debounceMs}`] = await runTypingScenario(
        tier,
        debounceMs,
        typicalPayload,
      );
    }
  }

  await sleep(0);
  longTaskObserver.disconnect();
  localStorage.clear();

  const measuredLongTasks = longTasks.filter(
    (task) =>
      !task.phase.startsWith('warmup:') &&
      (task.phase.startsWith('hydrate:') ||
        task.phase === 'real-path-hydration' ||
        task.phase === 'file-shaped-hydration' ||
        task.phase.startsWith('save:') ||
        task.phase.startsWith('typing:')),
  );
  const maxLongTask = measuredLongTasks.reduce(
    (maximum, task) => Math.max(maximum, task.durationMs),
    0,
  );
  const hydrationObserverSupported =
    (realLarge.longTaskObserverSupported as boolean) &&
    (realCatalog.longTaskObserverSupported as boolean);
  const allLongTaskObserversSupported =
    longTaskObserverSupported && hydrationObserverSupported;
  const largeP95 = (realLarge.timing as { p95Ms: number | null }).p95Ms;
  const catalogP95 = (realCatalog.timing as { p95Ms: number | null }).p95Ms;
  const fileP95 = (fileShaped.timing as { p95Ms: number | null }).p95Ms;
  const tenMiBA = (
    (saves['A-tenMiB'] as { endToEndDurableAck: { p95Ms: number | null } })
      .endToEndDurableAck
  ).p95Ms;
  const tenMiBB = (
    (saves['B-tenMiB'] as { endToEndDurableAck: { p95Ms: number | null } })
      .endToEndDurableAck
  ).p95Ms;

  const report = {
    fixtureEvidence: {
      seed: metadata.seed,
      source: metadata.source,
      inputHashesValidatedByOrchestrator: true,
      payloads: Object.fromEntries(
        Object.entries(payloads).map(([name, payload]) => [
          name,
          { rawBytes: utf8Size(JSON.stringify(payload)) },
        ]),
      ),
    },
    quota: {
      ...quota,
      safeCatalog: {
        sessionCount: safeCatalog.sessionCount,
        codeUnits: safeCatalog.codeUnits,
        estimatedUtf16Bytes: safeCatalog.codeUnits * 2,
        safetyRatio: safeCatalog.quotaSafetyRatio,
      },
    },
    bootstrap: {
      realPath: {
        methodology:
          'isolated localStorage seed -> production store import -> getItem -> JSON.parse -> ' +
          'same-version migration no-op -> mergePersistedSessionState',
        largeSession: realLarge,
        quotaSafeCatalog: realCatalog,
      },
      fileShaped: fileShaped,
    },
    saves,
    typing,
    retention: retentionEvidence(metadata),
    rendererLongTasks: {
      observerSupported: allLongTaskObserversSupported,
      count: measuredLongTasks.length,
      maxDurationMs: maxLongTask,
      entries: measuredLongTasks,
    },
    targetEvaluation: {
      realLargeBootstrap: {
        targetMs: WP14_BENCHMARK_TARGETS.bootstrapP95Ms,
        observedP95Ms: largeP95,
        status: targetStatus(largeP95, WP14_BENCHMARK_TARGETS.bootstrapP95Ms),
      },
      realCatalogBootstrap: {
        targetMs: WP14_BENCHMARK_TARGETS.bootstrapP95Ms,
        observedP95Ms: catalogP95,
        status: targetStatus(catalogP95, WP14_BENCHMARK_TARGETS.bootstrapP95Ms),
      },
      fileShapedBootstrap: {
        targetMs: WP14_BENCHMARK_TARGETS.bootstrapP95Ms,
        observedP95Ms: fileP95,
        status: targetStatus(fileP95, WP14_BENCHMARK_TARGETS.bootstrapP95Ms),
      },
      rendererLongTask: {
        targetMs: WP14_BENCHMARK_TARGETS.rendererLongTaskMaxMs,
        observedMaxMs: allLongTaskObserversSupported ? maxLongTask : null,
        status: allLongTaskObserversSupported
          ? targetStatus(maxLongTask, WP14_BENCHMARK_TARGETS.rendererLongTaskMaxMs)
          : 'not-measured-observer-unavailable',
      },
      tierATenMiBAck: {
        targetMs: WP14_BENCHMARK_TARGETS.tenMiBSaveAckP95Ms,
        observedP95Ms: tenMiBA,
        status: targetStatus(tenMiBA, WP14_BENCHMARK_TARGETS.tenMiBSaveAckP95Ms),
      },
      tierBTenMiBAck: {
        targetMs: WP14_BENCHMARK_TARGETS.tenMiBSaveAckP95Ms,
        observedP95Ms: tenMiBB,
        status: targetStatus(tenMiBB, WP14_BENCHMARK_TARGETS.tenMiBSaveAckP95Ms),
      },
      thresholdRelaxations: [],
    },
  };

  status('Writing benchmark report');
  await api.finish(report);
};

run().catch(async (error) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error('[WP14 bench] Fatal renderer failure:', error);
  try {
    await api.fail(message);
  } catch (reportError) {
    console.error('[WP14 bench] Could not report renderer failure:', reportError);
  }
});
