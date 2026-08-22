import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

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
const server = await createServer({
  root: projectRoot,
  configFile: false,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  await server.ssrLoadModule(moduleUrl);
} finally {
  await server.close();
}
