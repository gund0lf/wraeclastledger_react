import { createServer } from 'vite';

export function createOneShotScriptServer(root) {
  return createServer({
    root,
    configFile: false,
    logLevel: 'error',
    optimizeDeps: { noDiscovery: true },
    // These CLI tasks execute once; watching the project cannot help them.
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  });
}

export function scriptTiming(source, phase) {
  if (process.env.WL_WP14_TIMING_DIAGNOSTICS !== '1') return;
  const cpu = process.cpuUsage();
  process.stderr.write(`[WP14_TIMING] ${JSON.stringify({
    source, phase, elapsedMs: Number(performance.now().toFixed(3)),
    cpuUserMs: cpu.user / 1000, cpuSystemMs: cpu.system / 1000,
  })}\n`);
}
