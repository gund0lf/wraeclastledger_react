# Linux AppImage canary

Linux support is experimental. The first target is an x86_64 AppImage tested on
CachyOS; it is not yet advertised as a stable supported platform.

## Build and release boundary

Pushing `codex/linux-appimage-canary` runs a `1.0.76-beta.1` build as an
artifact-only canary. This makes the new workflow testable before it exists on
the default branch, and that push path can never publish a release.

After the workflow has been reviewed and merged, `Linux AppImage canary` can
also be manually dispatched with a prerelease version such as
`1.0.76-beta.1`. It has two modes:

1. `publish_prerelease: false` runs the full gate, builds the AppImage, and
   uploads it only as a workflow artifact. This is the default and cannot affect
   installed users.
2. `publish_prerelease: true` repeats the gate and publishes a GitHub prerelease.
   A prerelease AppImage opts into prerelease updates; stable Windows builds do
   not.

Do not publish the prerelease until the artifact-only build has completed and
its AppImage, channel metadata, source builder configuration, and
`linux-canary-evidence.json` hashes have been inspected. The channel metadata
must describe the AppImage's embedded block map; AppImage differential updates
do not use a separate `.AppImage.blockmap` sidecar. The workflow refuses a
prerelease build that generates stable `latest-linux.yml` metadata or embeds a
different updater channel in the packaged app.

## CachyOS smoke

This canary deliberately bypasses the delayed Wine-to-Wayland desktop clipboard.
Its bundled Windows helper runs inside Path of Exile's Proton prefix and streams
each clipboard event to WraeclastLedger. Traceur's probe proved that this internal
clipboard retains all copies in order even when Wayland exposes only the final
copy after Path of Exile loses focus.

Install `protontricks` through the normal CachyOS package flow, start Path of
Exile through Steam with its normal Proton configuration, then verify the helper
launcher is available:

```bash
command -v protontricks-launch
```

Download the artifact on the Linux machine, then:

```bash
chmod +x WraeclastLedger-*-x86_64.AppImage
./WraeclastLedger-*-x86_64.AppImage
```

Run Path of Exile through the user's normal Proton setup and verify:

1. The AppImage opens without installation or root privileges and only one app
   instance remains when it is launched twice.
2. Capture starts off after launch. Turn it on and confirm the yellow
   `Proton connecting` badge changes to the green `Proton capture` badge.
3. Keep Path of Exile focused. Copy three different real maps in sequence
   without Alt-Tab. Confirm all three rows appear immediately, in order, with
   the expected tier, modifiers, quantity, rarity, and pack size.
4. Turn Capture off, copy another map, and confirm no row appears. Turn Capture
   back on, wait for `Proton capture`, and confirm the next new copy appears.
5. Manual Paste still works. If the bridge cannot start, confirm the app shows
   a red error naming the failure and explicitly leaves Paste available.
6. Open Trade launches the system browser, Path of Pathing loads in the Atlas
   Tree panel, and WealthyExile CSV import can select a local file.
7. Save a session, quit, relaunch the same AppImage, and confirm the session and
   layout persist under the Linux user-data directory.
8. For updater proof, publish a second prerelease on the same channel (for
   example beta.2 after beta.1). Launch beta.1 from its AppImage file, confirm it
   detects/downloads beta.2, choose Restart & Update, and verify the version and
   session data after restart.

Record the desktop/session type, the two Capture badge transitions, and whether
all three focused-game copies arrive in order. A clipboard failure is a
supported-platform blocker, not something to hide behind packaging success.

## Known limits of this canary

- x86_64 only.
- No distro-native package, desktop integration, or Pacman package yet.
- No Linux code signing. Users must explicitly make the downloaded file
  executable.
- Automatic capture currently requires `protontricks-launch`, Steam app id
  `238960`, and a Proton prefix discoverable by protontricks. Failure is surfaced
  in the Map Log and falls back to manual Paste; it is never silently treated as
  working capture.
- Auto-update is enabled only when the program is launched as an AppImage. An
  extracted or unpackaged Linux build deliberately disables it because it has
  no safely replaceable AppImage path.
- The workflow currently uses `npm install` because this repository deliberately
  does not track `package-lock.json`. Before declaring Linux a stable supported
  release, dependency reproducibility should be revisited for all platforms.
