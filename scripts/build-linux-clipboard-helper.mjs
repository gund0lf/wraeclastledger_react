import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'linux') {
  console.log('[linux-clipboard] helper build skipped outside Linux');
  process.exit(0);
}

const source = resolve('native/wl-proton-clipboard.c');
const output = resolve('resources/linux/wl-proton-clipboard.exe');
mkdirSync(dirname(output), { recursive: true });

const result = spawnSync('x86_64-w64-mingw32-gcc', [
  '-std=c11',
  '-Os',
  '-s',
  '-static',
  source,
  '-o',
  output,
  '-luser32',
], { stdio: 'inherit' });

if (result.error) {
  throw new Error(`Could not start x86_64-w64-mingw32-gcc: ${result.error.message}`);
}
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`[linux-clipboard] built ${output}`);
