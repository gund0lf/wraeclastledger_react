/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/explicit-function-return-type */
'use strict'
const { existsSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { isDeepStrictEqual } = require('node:util')

const json = (file) => JSON.parse(readFileSync(file, 'utf8'))
// Packages can contain metadata-only subdirectories (esm/, modules/, utils/)
// with their own package.json. Only npm package roots identify dependencies.
const packageRoot = /^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/

function productionVersions(lock) {
  const versions = new Map()
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (!packageRoot.test(location) || entry.dev || !entry.version) continue
    const name = location.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/)[1]
    if (!versions.has(name)) versions.set(name, new Set())
    versions.get(name).add(entry.version)
  }
  return versions
}

function assertVersion(lock, location, manifest) {
  const expected = lock.packages?.[location]?.version
  if (!expected || manifest.version !== expected) {
    throw new Error(
      `Dependency lock mismatch: ${location} (${manifest.version ?? 'missing'}; expected ${expected ?? 'not locked'})`
    )
  }
}

function verifyInstalledDependencies(projectDir) {
  const lock = json(join(projectDir, 'package-lock.json'))
  const manifest = json(join(projectDir, 'package.json'))
  if (lock.lockfileVersion !== 3)
    throw new Error('Dependency verification requires lockfile version 3')
  for (const group of ['dependencies', 'devDependencies']) {
    if (!isDeepStrictEqual(manifest[group] ?? {}, lock.packages?.['']?.[group] ?? {})) {
      throw new Error(`Manifest/lock declarations differ: ${group}`)
    }
  }
  let verified = 0
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location.startsWith('node_modules/')) continue
    const file = join(projectDir, location, 'package.json')
    if (!existsSync(file)) {
      // npm omits unsupported OS/CPU optional packages from a clean installation.
      if (entry.optional) continue
      throw new Error(`Locked dependency missing: ${location}`)
    }
    assertVersion(lock, location, json(file))
    verified++
  }
  return { verified, lock }
}

function verifyPackagedDependencies(archive, lock, manifest, electronVersion, asar) {
  if (electronVersion !== lock.packages?.['node_modules/electron']?.version) {
    throw new Error('Packaged Electron version differs from the lockfile')
  }
  const locations = new Set()
  const runtimeVersions = productionVersions(lock)
  const direct = new Set(Object.keys(manifest.dependencies ?? {}))
  for (const file of asar.listPackage(archive)) {
    const normalized = file.replace(/\\/g, '/').replace(/^\//, '')
    if (!normalized.startsWith('node_modules/') || !normalized.endsWith('/package.json')) continue
    const location = normalized.slice(0, -'/package.json'.length)
    if (!packageRoot.test(location)) continue
    const name = location.match(/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)$/)[1]
    const packaged = JSON.parse(
      asar.extractFile(archive, file.replace(/^[/\\]/, '')).toString('utf8')
    )
    if (direct.has(name) && location === `node_modules/${name}`) {
      assertVersion(lock, location, packaged)
    } else if (!runtimeVersions.get(name)?.has(packaged.version)) {
      throw new Error(
        `Dependency lock mismatch: ${location} (${packaged.version ?? 'missing'}; not locked for production)`
      )
    }
    // electron-builder re-hoists its production tree independently of npm's
    // development tree. This is name/version inventory proof, not graph proof.
    locations.add(location)
  }
  for (const name of Object.keys(manifest.dependencies ?? {})) {
    if (!locations.has(`node_modules/${name}`))
      throw new Error(`Packaged dependency missing: ${name}`)
  }
  return { verified: locations.size, electronVersion }
}

function verifyAfterPack(context) {
  const projectDir = context.packager.projectDir
  const lock = json(join(projectDir, 'package-lock.json'))
  const manifest = json(join(projectDir, 'package.json'))
  const resources = context.packager.getResourcesDir(context.appOutDir)
  const result = verifyPackagedDependencies(
    join(resources, 'app.asar'),
    lock,
    manifest,
    context.packager.info.framework.version,
    require('@electron/asar')
  )
  console.log(
    `[dependency-lock] ${result.verified} packaged dependencies and Electron ${result.electronVersion} match the lockfile`
  )
  return result
}

module.exports = { verifyInstalledDependencies, verifyPackagedDependencies, verifyAfterPack }
if (require.main === module) {
  const result = verifyInstalledDependencies(resolve(__dirname, '..'))
  console.log(`[dependency-lock] ${result.verified} installed dependencies match the lockfile`)
}
