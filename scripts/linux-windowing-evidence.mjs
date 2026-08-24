export const LINUX_WINDOWING_MARKERS = [
  'focusable: !linuxOverlay',
  'fullscreenable: false',
  'setVisibleOnAllWorkspaces(true)',
  'overlay:bounds-interaction',
  'normalizeOverlayBoundsInteraction',
];

export const FORBIDDEN_LINUX_WINDOWING_MARKERS = [
  'appendSwitch("ozone-platform", "x11")',
  'type: linuxOverlay ? "toolbar" : void 0',
];

export const LINUX_LAUNCHER_MARKERS = [
  '#!/bin/sh',
  'wraeclastledger-bin',
  '--ozone-platform=x11',
  '"$@"',
];

export function missingLinuxWindowingMarkers(packagedApp) {
  return LINUX_WINDOWING_MARKERS.filter((marker) => !packagedApp.includes(marker));
}

export function forbiddenLinuxWindowingMarkers(packagedApp) {
  return FORBIDDEN_LINUX_WINDOWING_MARKERS.filter((marker) => packagedApp.includes(marker));
}

export function missingLinuxLauncherMarkers(packagedLauncher) {
  return LINUX_LAUNCHER_MARKERS.filter((marker) => !packagedLauncher.includes(marker));
}
