export const LINUX_WINDOWING_MARKERS = [
  'appendSwitch("ozone-platform", "x11")',
  'focusable: !linuxOverlay',
  'fullscreenable: false',
  'type: linuxOverlay ? "toolbar" : void 0',
  'setVisibleOnAllWorkspaces(true)',
];

export function missingLinuxWindowingMarkers(packagedApp) {
  return LINUX_WINDOWING_MARKERS.filter((marker) => !packagedApp.includes(marker));
}
