# Electron 43 runtime upgrade

This document is the acceptance plan for the dedicated
`codex/electron-runtime-upgrade` branch. The branch must not be merged or
published until the automated gates and the applicable manual checks below are
green.

## Scope and target

- Application runtime: Electron `38.8.6` -> current stable Electron `43.x`
  (`43.4.1` at branch verification on 2026-08-21).
- Node declarations: `@types/node` 22 -> 24, matching Electron 43's embedded
  Node line.
- Development/CI floor: Node `>=22.12.0`; GitHub's Linux workflows use Node 24.
- GitHub-hosted JavaScript actions:
  `actions/checkout@v7`, `actions/setup-node@v7`,
  `actions/upload-artifact@v7`, and `actions/download-artifact@v8`.

Electron supports only its latest three stable major versions. Electron 38 is
outside that window, and npm reports high-severity findings inherited through
that old runtime. Electron 39 contains a security fix but is also outside the
current support window; moving to the current stable major avoids landing on a
different unsupported line.

The separate GitHub Actions Node 20 runtime warning is covered by the same
branch. The repository has only the two Linux workflows listed above, and every
official JavaScript action in them now uses its current Node 24 release line.
The upstream release tags were rechecked on 2026-08-21: checkout `v7.0.1`,
setup-node `v7.0.0`, upload-artifact `v7.0.1`, and download-artifact `v8.0.1`.

The Electron 39-43 breaking-change notes were checked against the application.
WraeclastLedger does not use the affected offscreen-rendering, frameless-window,
desktop-capture audio, PDF, extension, native-image bitmap, Linux dialog option,
or renderer `electron.clipboard` APIs. Its clipboard polling remains in the main
process; the renderer's manual Paste control uses the standard Web Clipboard
API. BrowserWindow navigation continues through `setWindowOpenHandler` and
`shell.openExternal`.

## Automated acceptance

Run from a clean dependency installation, not an old `node_modules` tree:

```powershell
npm install --no-audit --no-fund
npm ls electron @types/node --depth=0
npm audit --audit-level=high
npm run typecheck
npm test
npm run lint
npm run build
npm run build:unpack
npm run build:win -- --publish never
```

Expected results:

- Electron resolves to `43.x`, Node declarations to 24.x, and npm reports no
  invalid root dependencies.
- The high-severity audit gate is green.
- Typecheck has 0 errors; all tests pass; lint has 0 errors (the accepted warning
  baseline may remain); production bundling and both Windows package forms
  succeed.
- `dist/win-unpacked/WraeclastLedger.exe` starts as a packaged application.

Dispatch `Linux AppImage canary` against this branch with a unique prerelease
version and `publish_prerelease: false`. This is an artifact-only build: it runs
the same source gates, asserts Electron 43 and Node 24, audits the clean runner,
builds the Windows Proton clipboard helper and AppImage, extracts the package,
and verifies updater-channel metadata and bundled-helper hashes. It does not
create or alter a GitHub release.

### Branch verification record (2026-08-21)

The clean Windows dependency and build pass resolved Electron `43.4.1` and
`@types/node` `24.13.3`. `npm audit --audit-level=high` reported zero
vulnerabilities. Typecheck completed with zero errors; Vitest passed 60 files /
695 tests and the Cargo query suite passed 5/5; lint completed with zero errors
and the accepted 52-warning baseline; the production build, unpacked Windows
package, and NSIS installer all completed. The unpacked executable stayed alive
for a bounded isolated-profile startup smoke test.

Both Node 24 Linux paths passed from source SHA
`07aeb9f7a11151163448913ee6734c01d117e691` with their publish jobs skipped:

- artifact-only canary run
  [32481978202](https://github.com/gund0lf/wraeclastledger_react/actions/runs/32481978202)
  built `1.0.79-beta.1`; its AppImage is 138,739,245 bytes with SHA-256
  `fdcaf865d7a7242bf48d59e431b008cd9da9b382818e8c665f9d4a78637ab532`;
- artifact-only stable-path run
  [32482365480](https://github.com/gund0lf/wraeclastledger_react/actions/runs/32482365480)
  built and verified the `latest` channel without altering the existing
  v1.0.78 release.

Interactive behavior remains the manual Windows matrix below and Traceur's
host smoke test using the exact canary artifact.

## Windows manual regression matrix

Use `npm run dev` first. Keep the currently installed stable app closed while
testing the packaged executable so Windows does not redirect the second launch
to the existing instance.

1. **Startup and profile isolation** — Dev opens with the Dev profile; the
   installed stable profile remains unchanged. The title/version panel reports
   Electron 43 and Node 24.
2. **Window lifecycle** — Minimize, maximize, restore, close, relaunch, and
   attempt a second launch. The existing instance is focused and no duplicate
   window remains.
3. **Layout/persistence** — Collapse and expand Setup, change dock tabs and
   panel sizes, save a session, quit, and relaunch. Layout, session, notes,
   investment data, regex settings, and loot data survive. Narrow Atlas Calc
   Configuration does not flicker.
4. **Native clipboard capture** — Capture starts off. Enable it and copy three
   different Path of Exile maps; they arrive once, in order, with correct parsed
   stats. Capture off ignores a copy. Re-enable it and copy again. Manual Paste
   still parses existing clipboard text.
5. **Atlas reader** — Load a valid Path of Pathing URL, confirm the embedded tree
   and node stats, apply it to Atlas Calc, reset it, and switch existing session
   -> New Session. No stale Atlas Node Stats banner appears. A malformed URL is
   rejected without launching another application.
6. **Navigation** — Open Trade launches the system browser; Strategy Browser's
   Discord and Atlas links use their intended external targets; no popup is
   rendered inside the app.
7. **File chooser and loot** — Import WealthyExile baseline and return CSVs,
   verify Diff/Breakdown, add a custom row, and confirm totals. Repeat with a
   return-only clean-tab workflow.
8. **Strategy workflows** — Load/import a published strategy and exercise the
   Continue/Add run/Replace preparation paths without posting a real strategy.
   Loot evidence and per-run authored costs remain visible.
9. **Packaged startup** — Run the unpacked executable and then the generated
   NSIS installer. Repeat items 2, 4, 5, 6, and 7 in the packaged build.
10. **Updater UI** — On a normal same-version build, the update check completes
    without an unhandled error. A real Windows old->new updater rehearsal
    requires a later, explicitly authorized prerelease or stable publication;
    this branch deliberately does not publish one.

## Linux manual regression matrix

Download the artifact-only AppImage produced from this exact branch SHA. Do not
use a release asset with the same filename from another commit.

1. Verify the workflow run is green and the artifact contains the AppImage,
   channel metadata, packaged updater configuration, Proton helper, and evidence
   JSON.
2. On x86_64 Linux, install `protontricks`, start Path of Exile through Steam,
   make the AppImage executable, and launch it without root privileges.
3. Confirm startup, one-instance behavior, minimize/maximize/restore, Setup
   collapse, dock layout, save/quit/relaunch persistence, and the displayed
   Electron/Node versions.
4. Capture starts off. Enable it and wait for `Proton capture`; copy three maps
   in game and verify immediate ordered capture. Confirm capture-off behavior,
   re-enable behavior, the visible bridge-failure fallback, and manual Paste.
5. Verify embedded Path of Pathing, Atlas Calc application/reset/new-session
   behavior, Open Trade/system-browser navigation, and WealthyExile file
   selection plus baseline/return/custom loot calculations.
6. Exercise the Strategy Browser load/continue preparation paths and confirm
   saved data survives another relaunch.
7. The artifact-only AppImage cannot prove replacement by the auto-updater
   because no update metadata is published. A real Linux old->new rehearsal
   requires a later explicitly authorized beta.1->beta.2 publication, following
   `LINUX_APPIMAGE_CANARY.md`. The established Electron 38 rehearsal is not a
   substitute for one after the Electron 43 major change.

## Merge boundary

Passing automation proves compilation, dependency security, Windows packaging,
AppImage construction, bundled-helper integrity, and updater metadata. It does
not prove native UI/clipboard behavior on both operating systems. Keep the branch
separate until the Windows matrix and Traceur's Linux matrix are recorded green.
Only then merge it into `main`, add the release changelog/version entry, and run
the normal stable release process. Never publish directly from this test branch.
