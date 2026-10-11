import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOneShotScriptServer, scriptTiming } from './vite-script-support.mjs';

function timing(phase) {
  scriptTiming('vite-launcher', phase);
}

timing('module.body');
if (process.env.WL_WP14_TIMING_DIAGNOSTICS === '1') {
  process.once('beforeExit', () => timing('process.beforeExit'));
  process.once('exit', () => timing('process.exit'));
}

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scriptsRoot = resolve(projectRoot, 'scripts');
const targetArgument = process.argv[2];

if (!targetArgument) {
  throw new Error('Usage: node scripts/run-vite-script.mjs <scripts/task.ts> [...args]');
}

const targetPath = resolve(projectRoot, targetArgument);
const relativeToScripts = relative(scriptsRoot, targetPath);
if (
  relativeToScripts === '' ||
  relativeToScripts.startsWith(`..${sep}`) ||
  isAbsolute(relativeToScripts) ||
  !targetPath.endsWith('.ts')
) {
  throw new Error('Vite script target must be a TypeScript file inside scripts/');
}

process.argv.splice(2, 1);
const moduleUrl = `/${relative(projectRoot, targetPath).split(sep).join('/')}`;
timing('createServer.start');
const server = await createOneShotScriptServer(projectRoot);
timing('createServer.end');

try {
  timing('ssrLoadModule.start');
  await server.ssrLoadModule(moduleUrl);
  timing('ssrLoadModule.end');
} finally {
  timing('server.close.start');
  await server.close();
  timing('server.close.end');
}
