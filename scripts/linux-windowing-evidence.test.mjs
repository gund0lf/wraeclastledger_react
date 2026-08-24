import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LINUX_WINDOWING_MARKERS,
  missingLinuxWindowingMarkers,
} from './linux-windowing-evidence.mjs';

test('accepts a package containing every Linux overlay windowing marker', () => {
  assert.deepEqual(missingLinuxWindowingMarkers(LINUX_WINDOWING_MARKERS.join('\n')), []);
});

test('reports every missing marker instead of accepting a partial package', () => {
  assert.deepEqual(
    missingLinuxWindowingMarkers(LINUX_WINDOWING_MARKERS[0]),
    LINUX_WINDOWING_MARKERS.slice(1),
  );
});

test('requires the exact X11 switch rather than a native Wayland variant', () => {
  const packagedApp = LINUX_WINDOWING_MARKERS.join('\n')
    .replace('appendSwitch("ozone-platform", "x11")', 'appendSwitch("ozone-platform", "wayland")');
  assert.deepEqual(missingLinuxWindowingMarkers(packagedApp), [LINUX_WINDOWING_MARKERS[0]]);
});
