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

## v1.0.80 WP14 migration smoke - Traceur

v1.0.80 is the first file-backed Sessions release. Its migration is deliberately
one-way, so preserve the live v1.0.79 profile and test the candidate against an
isolated copy before any public updater test.

### Before testing

1. In the live v1.0.79 AppImage, expand **Saved sessions**, choose **Select all**,
   then **Export**. Confirm the downloaded JSON is non-empty and keep it outside
   the AppImage and WraeclastLedger config directories.
2. Record the saved-session count, current session name, one known session's map
   count and edited value, and the current panel layout. A screenshot is enough.
3. Fully quit WraeclastLedger. Then make a complete profile copy:

   ```bash
   WL_PROFILE="${XDG_CONFIG_HOME:-$HOME/.config}/WraeclastLedger"
   WL_BACKUP="$HOME/WraeclastLedger-v1.0.79-profile-backup-$(date +%Y%m%d-%H%M%S)"
   test -d "$WL_PROFILE"
   cp -a -- "$WL_PROFILE" "$WL_BACKUP"
   test -d "$WL_BACKUP" && du -sh "$WL_BACKUP"
   printf 'Backup: %s\n' "$WL_BACKUP"
   ```

   Keep both the JSON export and this full profile copy until v1.0.80 is accepted.
   The profile copy protects the active working session, preferences, layout,
   and browser migration source that a selected-session JSON export does not.

### Pre-publication candidate on an isolated profile

Use the artifact-only workflow AppImage, not a public release asset. Replace the
example backup path with the exact path printed above:

```bash
WL_BACKUP="$HOME/WraeclastLedger-v1.0.79-profile-backup-YYYYMMDD-HHMMSS"
WL_SMOKE="$HOME/.local/share/WraeclastLedger-v1.0.80-smoke"
mkdir -p "$WL_SMOKE/config/WraeclastLedger"
cp -a -- "$WL_BACKUP/." "$WL_SMOKE/config/WraeclastLedger/"
chmod +x WraeclastLedger-1.0.80-x86_64.AppImage
XDG_CONFIG_HOME="$WL_SMOKE/config" ./WraeclastLedger-1.0.80-x86_64.AppImage
```

Verify all of the following inside that isolated candidate:

1. The header shows **v1.0.80 / DATA R3**. Startup completes without a record-
   mismatch or migration error.
2. Saved-session count and names, the previously recorded current session, map
   count/value, Notes, Baseline/Return data, Investment settings, and layout all
   match v1.0.79.
3. **Open data folder** opens
   `$WL_SMOKE/config/WraeclastLedger/ledger-data`; `README.txt`, `storage.json`,
   session entries, preferences, layout, and bootstrap records are present.
4. Duplicate a session as `WP14 Linux disposable`. Change one known scarab price,
   wait for **Auto-saved**, and confirm **Undo changes since opening** restores
   the old value. Repeat the edit, open **Version history**, expand its change
   details, and confirm the exact old and new values are shown. Restart and verify
   the edited value and history persist, then restore the opening version.
5. Move the disposable session to **Recently Deleted**. It appears exactly once
   under its real name. Restore it; it opens as **Historical session** without
   replacing the separate live target. Resume it, delete it again, then delete it
   permanently. No unnamed companion entry appears at any point.
6. Start a fresh empty session and switch away. Recently Deleted remains
   unchanged. Fork one historical session into the current league, select the
   fork from the session picker, and confirm it opens the fork rather than a new
   blank session.
7. Open a historical session, edit a value, wait for **Auto-saved**, then choose
   **Return to live session**. The previous live target returns and the historical
   edit remains when that session is reopened; Return to live is navigation, not
   an undo action.
8. Export the disposable/restored session as JSON and restore it once with the
   non-destructive conflict option. Quit normally and relaunch once more; session
   state, history, Recently Deleted state, and layout still persist.
9. Complete the ordinary Linux checks below: one-instance behavior, capture
   starts off, Proton capture of three maps in order, off/on behavior, manual
   Paste, visible bridge failure fallback, Open Trade, Atlas Tree, and
   WealthyExile file selection.

Report the AppImage SHA-256, distro/desktop/session type, whether the profile was
already v1.0.79, and a pass/fail line for each numbered item. Keep the isolated
smoke directory until release acceptance; do not point v1.0.79 at it after the
migration.

### After v1.0.80 is public

Launch the ordinary v1.0.79 AppImage without the `XDG_CONFIG_HOME` override and
accept the stable update. Confirm it restarts as v1.0.80, migrates the live
profile without an error, retains the recorded session/layout values, and
captures one additional map through Proton. Do not launch v1.0.79 against that
live profile again after migration. Keep the two backups until this final smoke
is accepted.

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
