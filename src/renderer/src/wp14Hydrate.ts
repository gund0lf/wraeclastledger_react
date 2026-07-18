import type { Wp14HydrateResult, Wp14LongTask } from '../../shared/wp14Benchmark';

const nonce = new URLSearchParams(window.location.search).get('nonce') ?? 'missing';
const longTasks: Wp14LongTask[] = [];
let longTaskObserverSupported = true;
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    longTasks.push({
      phase: 'real-path-hydration',
      durationMs: entry.duration,
      startTimeMs: entry.startTime,
      source: 'hydrate-frame',
    });
  }
});

try {
  observer.observe({ type: 'longtask', buffered: true });
} catch {
  longTaskObserverSupported = false;
  // The explicit bootstrap duration remains valid if this Chromium build does
  // not expose the Long Tasks API. The parent reports the measurement as
  // unavailable rather than treating zero entries as a pass.
}

const started = performance.now();

try {
  const { useSessionStore } = await import('./store/useSessionStore');
  const durationMs = performance.now() - started;
  const state = useSessionStore.getState();
  await new Promise((resolve) => setTimeout(resolve, 0));
  observer.disconnect();
  const result: Wp14HydrateResult = {
    type: 'wp14-hydrate-result',
    nonce,
    durationMs,
    savedSessionCount: Object.keys(state.savedSessions).length,
    activeMapCount: state.maps.length,
    longTaskObserverSupported,
    longTasks,
  };
  window.parent.postMessage(result, '*');
} catch (error) {
  observer.disconnect();
  window.parent.postMessage(
    {
      type: 'wp14-hydrate-error',
      nonce,
      error: error instanceof Error ? error.message : String(error),
    },
    '*',
  );
}
