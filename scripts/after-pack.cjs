/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
const { chmod, rename, writeFile } = require('node:fs/promises')
const { join } = require('node:path')

const LINUX_EXECUTABLE_NAME = 'wraeclastledger'
const LINUX_WRAPPED_EXECUTABLE_NAME = 'wraeclastledger-bin'
const LINUX_LAUNCHER = `#!/bin/sh
set -eu

APP_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$APP_DIR/${LINUX_WRAPPED_EXECUTABLE_NAME}" --ozone-platform=x11 "$@"
`

async function installLinuxLauncher(appOutDir) {
  const executablePath = join(appOutDir, LINUX_EXECUTABLE_NAME)
  const wrappedExecutablePath = join(appOutDir, LINUX_WRAPPED_EXECUTABLE_NAME)
  await rename(executablePath, wrappedExecutablePath)
  await writeFile(executablePath, LINUX_LAUNCHER, { encoding: 'utf8', mode: 0o755 })
  await chmod(executablePath, 0o755)
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return
  await installLinuxLauncher(context.appOutDir)
}

module.exports = afterPack
module.exports.LINUX_EXECUTABLE_NAME = LINUX_EXECUTABLE_NAME
module.exports.LINUX_WRAPPED_EXECUTABLE_NAME = LINUX_WRAPPED_EXECUTABLE_NAME
module.exports.LINUX_LAUNCHER = LINUX_LAUNCHER
module.exports.installLinuxLauncher = installLinuxLauncher
