# Linux AppImage

WraeclastLedger is available for x86_64 Linux as an AppImage. Linux support is
validated on CachyOS with KDE Wayland and Path of Exile running through Steam
Proton. Other distributions and desktop environments are best-effort until they
have been tested.

## Install and run

Download the AppImage from the
[official GitHub Releases](https://github.com/gund0lf/wraeclastledger_react/releases/latest),
make it executable, and launch it as your normal user:

```bash
chmod +x WraeclastLedger-*-x86_64.AppImage
./WraeclastLedger-*-x86_64.AppImage
```

Do not run the application as root. AppImage auto-update works only when the app
is launched from the AppImage itself; an extracted build has no safely
replaceable AppImage path and therefore disables automatic updates.

## Path of Exile clipboard capture

Automatic capture requires:

- Steam's Path of Exile installation (app id `238960`);
- a Proton prefix discoverable through `protontricks`; and
- `protontricks-launch` available on `PATH`.

Start Path of Exile through Steam before enabling capture. The app launches its
bundled Windows clipboard helper inside the game's Proton prefix. If that bridge
cannot start, WraeclastLedger reports the failure and manual **Paste** remains
available.

Within a Wayland desktop, the AppImage deliberately uses XWayland. Native
Wayland does not currently provide the always-on-top behavior required by the
optional Timer/Counters companion window.

## Current limits

- x86_64 AppImage only; no distro-native package or desktop integration.
- The AppImage is unsigned. Install it only from this repository's official
  release page.
- Automatic capture depends on Steam Proton and `protontricks-launch` as
  described above.
- Distribution, desktop, compositor, and Proton differences can affect file
  selection, overlay behavior, and clipboard capture outside the validated
  environment.

## Build and release workflows

The tracked GitHub Actions workflows under `.github/workflows/` are the source
of truth for Linux artifacts:

- **Linux AppImage canary** builds an isolated `alpha`, `beta`, or `rc`
  artifact. It is artifact-only by default; publishing a prerelease requires an
  explicit dispatch option and uses the matching prerelease update channel.
- **Linux AppImage stable release** builds and verifies an existing stable tag.
  It is artifact-only by default. Its separate publication job requires an
  explicit dispatch option, confirms that the target is a regular published
  release, and verifies that the built artifact source matches the release tag
  before attaching the AppImage and `latest-linux.yml`.

Both workflows run the repository's typecheck, tests, lint, dependency audit,
packaging, updater-metadata checks, and bundled-helper verification. They do not
create a stable release; the Windows release and stable tag must already exist.
