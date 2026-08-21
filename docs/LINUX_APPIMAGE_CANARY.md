# Linux AppImage release path

Linux support uses an x86_64 AppImage. Its automatic map capture runs a small
bundled Windows helper inside Path of Exile's Proton prefix, avoiding the delayed
Wine-to-Wayland desktop clipboard surface.

## Proven canary

On 2026-08-15 Traceur completed the isolated `1.0.76-beta.1` to
`1.0.76-beta.2` rehearsal on CachyOS. The AppImage updated, restarted on beta.2,
retained its data, and captured another map after the update. The Setup panel and
normal map capture also remained operational. The canary releases stay on their
prerelease channel and are not stable artifacts.

Traceur then completed the remaining platform checks: Open Trade launched the
system browser, Path of Pathing worked inside Atlas Tree, WealthyExile import
opened the local file selector, and saved session/layout state survived quit and
relaunch. The Linux platform smoke is fully green. The final stable artifact
still requires the workflow's artifact-only build and evidence inspection before
its separate explicit attachment to a release.

## Stable release boundary

`Linux AppImage stable release` is manually dispatched for an existing stable
GitHub release. It checks out the selected release source, runs
typecheck/tests/lint, asserts the expected Electron 43/Node 24 toolchain, runs a
high-severity dependency audit, builds but does not directly publish, extracts
the packaged updater configuration and Proton helper, and verifies their hashes
and stable `latest-linux.yml` metadata. The workflows' JavaScript actions also
run on Node 24. Its default is artifact-only;
`publish_release_assets` must be explicitly enabled before the second job can
attach the exact verified AppImage and update metadata. That job also confirms
the release is regular and its tag resolves to the same source SHA. The workflow
never creates a stable release, so merging this plumbing cannot publish Linux by
itself.

`Linux AppImage canary` remains available for future prerelease rehearsals. Its
default is likewise artifact-only, and it accepts only `alpha`, `beta`, or `rc`
versions. A prerelease build opts into only its matching prerelease update
channel; stable Windows and Linux builds remain on `latest`.

The AppImage metadata describes its embedded block map. There is no separate
`.AppImage.blockmap` sidecar to publish.

For an Electron-major change, also complete the broader application/runtime
matrix in `ELECTRON_RUNTIME_UPGRADE.md`; this checklist is the Linux-specific
subset.

## Linux smoke checklist

Install `protontricks` through the normal distro package flow, start Path of
Exile through Steam, and verify:

```bash
command -v protontricks-launch
chmod +x WraeclastLedger-*-x86_64.AppImage
./WraeclastLedger-*-x86_64.AppImage
```

1. The AppImage opens without root privileges and enforces one app instance.
2. Capture starts off. Turning it on changes `Proton connecting` to
   `Proton capture`.
3. With Path of Exile focused, three different copied maps appear immediately
   and in order with correct parsed values.
4. Capture off ignores a copy; after enabling it again, the next copy arrives.
5. Manual Paste works. A bridge startup failure is visible and leaves Paste
   available.
6. Open Trade launches the system browser, Path of Pathing works in Atlas Tree,
   and WealthyExile CSV import can select a local file.
7. A saved session and layout survive quit/relaunch.
8. A same-channel update downloads, restarts into the newer version, retains
   data, and captures another map. This is green for beta.1 to beta.2.

## Current limits

- x86_64 AppImage only; no distro-native package or desktop integration.
- No Linux code signing. Users must make the downloaded file executable.
- Automatic capture requires `protontricks-launch`, Steam app id `238960`, and
  a Proton prefix discoverable by protontricks.
- Auto-update is enabled only when launched as an AppImage. Extracted Linux
  builds have no safely replaceable AppImage path and deliberately disable it.
- The workflows use `npm install` because this repository does not track a
  package lock. Dependency reproducibility remains a release-process concern
  shared by all platforms.
