import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FORBIDDEN_LINUX_WINDOWING_MARKERS,
  LINUX_LAUNCHER_MARKERS,
  LINUX_WINDOWING_MARKERS,
  forbiddenLinuxWindowingMarkers,
  missingLinuxLauncherMarkers,
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

test('rejects the ineffective programmatic X11 switch and Linux toolbar hint', () => {
  assert.deepEqual(
    forbiddenLinuxWindowingMarkers(FORBIDDEN_LINUX_WINDOWING_MARKERS.join('\n')),
    FORBIDDEN_LINUX_WINDOWING_MARKERS,
  );
  assert.deepEqual(forbiddenLinuxWindowingMarkers(LINUX_WINDOWING_MARKERS.join('\n')), []);
});

test('requires the packaged launcher to select XWayland and preserve arguments', () => {
  assert.deepEqual(missingLinuxLauncherMarkers(LINUX_LAUNCHER_MARKERS.join('\n')), []);
  assert.deepEqual(
    missingLinuxLauncherMarkers(LINUX_LAUNCHER_MARKERS.slice(0, -1).join('\n')),
    [LINUX_LAUNCHER_MARKERS.at(-1)],
  );
});
