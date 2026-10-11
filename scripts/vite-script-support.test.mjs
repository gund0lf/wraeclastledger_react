import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createOneShotScriptServer, scriptTiming } from './vite-script-support.mjs';

test('one-shot Vite uses the real no-op watcher, including explicit add calls', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wl-one-shot-vite-test-'));
  let server;
  try {
    server = await createOneShotScriptServer(root);
    assert.equal(server.config.server.watch, null);
    assert.deepEqual(server.watcher.getWatched(), {});
    server.watcher.add(root);
    assert.deepEqual(server.watcher.getWatched(), {});
  } finally {
    await server?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('timing diagnostics are silent by default and require exact opt-in', (t) => {
  const previous = process.env.WL_WP14_TIMING_DIAGNOSTICS;
  const write = t.mock.method(process.stderr, 'write', () => true);
  try {
    delete process.env.WL_WP14_TIMING_DIAGNOSTICS;
    scriptTiming('test', 'default');
    for (const value of ['', '0', 'true']) {
      process.env.WL_WP14_TIMING_DIAGNOSTICS = value;
      scriptTiming('test', 'disabled');
    }
    assert.equal(write.mock.callCount(), 0);
    process.env.WL_WP14_TIMING_DIAGNOSTICS = '1';
    scriptTiming('test', 'enabled');
    assert.equal(write.mock.callCount(), 1);
    const line = write.mock.calls[0].arguments[0];
    assert.ok(line.startsWith('[WP14_TIMING] '));
    const record = JSON.parse(line.slice('[WP14_TIMING] '.length));
    assert.deepEqual(Object.keys(record).sort(), [
      'cpuSystemMs', 'cpuUserMs', 'elapsedMs', 'phase', 'source',
    ]);
    assert.equal(record.source, 'test');
    assert.equal(record.phase, 'enabled');
    assert.ok(Number.isFinite(record.elapsedMs));
  } finally {
    if (previous === undefined) delete process.env.WL_WP14_TIMING_DIAGNOSTICS;
    else process.env.WL_WP14_TIMING_DIAGNOSTICS = previous;
    write.mock.restore();
  }
});
