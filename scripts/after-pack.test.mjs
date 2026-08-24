import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  LINUX_EXECUTABLE_NAME,
  LINUX_LAUNCHER,
  LINUX_WRAPPED_EXECUTABLE_NAME,
  installLinuxLauncher,
} = require('./after-pack.cjs');

test('the packaged Linux launcher selects XWayland before forwarding user arguments', () => {
  assert.equal(LINUX_EXECUTABLE_NAME, 'wraeclastledger');
  assert.equal(LINUX_WRAPPED_EXECUTABLE_NAME, 'wraeclastledger-bin');
  assert.match(LINUX_LAUNCHER, /^#!\/bin\/sh\n/);
  assert.match(
    LINUX_LAUNCHER,
    /exec "\$APP_DIR\/wraeclastledger-bin" --ozone-platform=x11 "\$@"/,
  );
});

test('the launcher does not replace or discard updater and user arguments', () => {
  assert.match(LINUX_LAUNCHER, /"\$@"/);
  assert.doesNotMatch(LINUX_LAUNCHER, /shift|set --/);
});

test('the Linux pack hook preserves the Electron binary behind the launcher', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wl-linux-launcher-'));
  try {
    await writeFile(join(directory, LINUX_EXECUTABLE_NAME), 'electron-binary');
    await installLinuxLauncher(directory);
    assert.equal(
      await readFile(join(directory, LINUX_WRAPPED_EXECUTABLE_NAME), 'utf8'),
      'electron-binary',
    );
    assert.equal(await readFile(join(directory, LINUX_EXECUTABLE_NAME), 'utf8'), LINUX_LAUNCHER);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
