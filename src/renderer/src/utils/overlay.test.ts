import { describe, expect, it } from 'vitest';
import { DEFAULT_OVERLAY_COUNTER_IDS, normalizeOverlayPreferences } from '../../../shared/overlay';
import { overlayCounterSnapshot, parseOverlayCounterId } from './overlayCounters';

describe('overlay preferences', () => {
  it('hydrates bounded defaults and sanitizes user-managed configuration', () => {
    expect(normalizeOverlayPreferences(null).counterIds).toEqual([...DEFAULT_OVERLAY_COUNTER_IDS]);
    const normalized = normalizeOverlayPreferences({
      visible: true,
      mode: 'both',
      opacity: 4,
      locked: true,
      clickThrough: true,
      counterIds: ['stat:starfallCraters', 'stat:starfallCraters', ...Array.from({ length: 12 }, (_, index) => `future:${index}`)],
      timerShortcut: '  CommandOrControl+Shift+T  ',
      counterShortcuts: { 'stat:starfallCraters': ' Ctrl+1 ' },
      bounds: { x: 20, y: 30, width: 100, height: 2_000 },
    });
    expect(normalized).toMatchObject({
      visible: true,
      opacity: 1,
      locked: true,
      clickThrough: true,
      timerShortcut: 'CommandOrControl+Shift+T',
      bounds: { x: 20, y: 30, width: 220, height: 900 },
    });
    expect(normalized.counterIds).toHaveLength(8);
    expect(normalized.counterShortcuts['stat:starfallCraters']).toBe('Ctrl+1');
  });
});

describe('overlay counters', () => {
  it('resolves bounded scalar, anomaly, and Mercenary identities without fuzzy matching', () => {
    const statistics = {
      starfallCraters: 4,
      atlasAnomalies: [{ name: "River's End", count: 2 }],
      mercenaries: [{ archetype: 'Kineticist', count: 3 }],
    };
    expect(overlayCounterSnapshot('stat:starfallCraters', statistics)).toMatchObject({ value: 4 });
    expect(overlayCounterSnapshot("anomaly:River's End", statistics)).toMatchObject({ value: 2 });
    expect(overlayCounterSnapshot('mercenary:Kineticist', statistics)).toMatchObject({ value: 3 });
    expect(parseOverlayCounterId('mercenary:Kinet')).toBeNull();
    expect(overlayCounterSnapshot('future:anything', statistics)).toBeNull();
  });
});
