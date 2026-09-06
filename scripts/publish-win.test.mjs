import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const stages = ['typecheck', 'test', 'lint', 'build', 'upload'];
const npmCli = process.env.npm_execpath;

for (const failure of [...stages, null]) {
  test(failure ? `Windows publication stops at ${failure} failure` : 'Windows publication runs each gate before build and upload', () => {
    assert.ok(npmCli && existsSync(npmCli), 'Run via npm test or npm exec -- node --test scripts/publish-win.test.mjs');
    const publish = manifest.scripts['publish:win'];
    // Only these fixture-backed commands may execute. A future command change
    // must extend this closed harness before it can run inside a release test.
    const allowed = new Set(['npm run typecheck', 'npm test', 'npm run lint', 'npm run build',
      'electron-builder --win --publish always']);
    assert.equal(typeof publish, 'string');
    assert.ok(publish.split('&&').every(command => allowed.has(command.trim())), 'unrecognized publication command; extend its fake before running');

    const fixture = mkdtempSync(join(tmpdir(), 'wl publish gate-'));
    try {
      const bin = join(fixture, 'node_modules', '.bin');
      mkdirSync(bin, { recursive: true });
      writeFileSync(join(fixture, 'package.json'), JSON.stringify({
        name: 'wl-publication-fixture', version: '0.0.0', private: true,
        scripts: {
          'publish:win': publish,
          ...Object.fromEntries(stages.slice(0, -1).map(stage => [stage, `node stage.mjs ${stage}`])),
        },
      }));
      writeFileSync(join(fixture, 'stage.mjs'), `import { appendFileSync } from 'node:fs';
const [stage, ...args] = process.argv.slice(2);
appendFileSync('calls.jsonl', JSON.stringify({ stage, args }) + '\\n');
process.exit(stage === process.env.WLEDGER_PUBLISH_FIXTURE_FAIL ? 17 : 0);
`);
      writeFileSync(join(bin, 'electron-builder.cmd'), '@echo off\r\nnode "%~dp0../../stage.mjs" upload %*\r\nexit /b %errorlevel%\r\n');
      writeFileSync(join(bin, 'electron-builder'), '#!/bin/sh\nexec node "$(dirname "$0")/../../stage.mjs" upload "$@"\n', { mode: 0o755 });
      const userConfig = join(fixture, 'user.npmrc');
      const globalConfig = join(fixture, 'global.npmrc');
      writeFileSync(userConfig, ''); writeFileSync(globalConfig, '');
      const env = { ...process.env };
      for (const key of Object.keys(env)) {
        if (/token|secret|password/i.test(key) || /^npm_config_/i.test(key)) delete env[key];
      }
      Object.assign(env, {
        WLEDGER_PUBLISH_FIXTURE_FAIL: failure || '',
        npm_config_userconfig: userConfig, npm_config_globalconfig: globalConfig,
        npm_config_script_shell: process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : '/bin/sh',
        npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
      });
      const result = spawnSync(process.execPath, [npmCli, 'run', 'publish:win'], {
        cwd: fixture, env, encoding: 'utf8', timeout: 60000,
      });
      assert.ifError(result.error);
      assert.equal(result.status, failure ? 17 : 0, `${result.stdout}\n${result.stderr}`);
      const calls = readFileSync(join(fixture, 'calls.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
      const expected = failure ? stages.slice(0, stages.indexOf(failure) + 1) : stages;
      assert.deepEqual(calls.map(call => call.stage), expected);
      const upload = calls.find(call => call.stage === 'upload');
      if (upload) assert.deepEqual(upload.args, ['--win', '--publish', 'always']);
    } finally {
      assert.equal(dirname(resolve(fixture)), resolve(tmpdir()));
      assert.ok(fixture.includes('wl publish gate-'));
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
