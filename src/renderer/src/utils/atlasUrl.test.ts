import { describe, expect, it, vi } from 'vitest';
import {
  atlasRemountSource,
  readInitializedAtlasPoints,
  isPathofpathingTreeUrl,
  isPathofpathingUrl,
  shouldAutoApplyExternalAtlasView,
} from './atlasUrl';

const TREE_URL = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA';

describe('Path of Pathing URL validation', () => {
  it('accepts only HTTPS navigation to the exact host', () => {
    expect(isPathofpathingUrl(TREE_URL)).toBe(true);
    expect(isPathofpathingUrl('ttps://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA')).toBe(false);
    expect(isPathofpathingUrl('http://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA')).toBe(false);
    expect(isPathofpathingUrl('https://pathofpathing.com:444/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA')).toBe(false);
    expect(isPathofpathingUrl('https://user@pathofpathing.com/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA')).toBe(false);
    expect(isPathofpathingUrl('https://pathofpathing.com.example/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA')).toBe(false);
  });

  it('requires an Atlas version and allocation hash for imports', () => {
    expect(isPathofpathingTreeUrl(TREE_URL)).toBe(true);
    expect(isPathofpathingTreeUrl(
      'https://pathofpathing.com/?v=3.28.0-atlas-league#AAAABgAADAsAJMFG',
    )).toBe(true);
    expect(isPathofpathingTreeUrl(
      'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAANi8GBJgGhgeICUoKQBZYGuYhayHcJ4oq0SuGK7ozSTQMNL5GPkgiTwtQF1KiWjRgZ219cXV5nnzFgoqZOKj0tvi4drzQwabExsVW2a3ZuOYS7IztFO1Z8WH1qPa3_Ob98FbmV62PXJCT6t3-13F1AAA=',
    )).toBe(true);
    expect(isPathofpathingTreeUrl(
      'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAADAsAJMFG==',
    )).toBe(true);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com')).toBe(false);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com/?v=3.29.0-atlas')).toBe(false);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com/?v=3.29.0#AAAABgAAAgEAcXVxdQAA')).toBe(false);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com/?v=3.29.0-atlas#AAAA')).toBe(false);
    expect(isPathofpathingTreeUrl(
      'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAA=AsAJMFG',
    )).toBe(false);
    expect(isPathofpathingTreeUrl(
      'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAADAsAJMFG===',
    )).toBe(false);
  });
});

describe('Atlas panel external apply guard', () => {
  it('does not reinterpret a fresh-session reset as an imported tree', () => {
    expect(shouldAutoApplyExternalAtlasView(
      true,
      'https://pathofpathing.com',
      TREE_URL,
      TREE_URL,
    )).toBe(false);
  });

  it('applies a genuine external tree change only once', () => {
    expect(shouldAutoApplyExternalAtlasView(false, TREE_URL, 'https://pathofpathing.com', 'https://pathofpathing.com')).toBe(true);
    expect(shouldAutoApplyExternalAtlasView(false, TREE_URL, TREE_URL, TREE_URL)).toBe(false);
  });
});

describe('Atlas panel remount source', () => {
  it('reopens from the latest captured allocation instead of the original import', () => {
    const original = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAAgEAcXVxdQAA';
    const edited = 'https://pathofpathing.com/?v=3.29.0-atlas#BBBABgAAAgEAcXVxdQAA';
    expect(atlasRemountSource(original, edited)).toBe(edited);
  });

  it('retains the known-safe source when the captured value is invalid', () => {
    expect(atlasRemountSource(TREE_URL, 'not a URL')).toBe(TREE_URL);
  });
});

describe('Atlas point capture after navigation', () => {
  it('waits through delayed tree initialization and accepts the rendered maximum', async () => {
    vi.useFakeTimers();
    try {
      let max = 121;
      const read = vi.fn(async () => ({ url: TREE_URL.replace("3.29", "3.30"), allocated: 0, max }));
      const result = readInitializedAtlasPoints(read, () => true);
      await vi.advanceTimersByTimeAsync(1500);
      expect(read.mock.calls.length).toBeGreaterThan(1);
      max = 150;
      await vi.advanceTimersByTimeAsync(250);
      expect(await result).toMatchObject({ allocated: 0, max: 150 });
    } finally { vi.useRealTimers(); }
  });

  it('ignores a late read after a replacement and times out on initial markup', async () => {
    vi.useFakeTimers();
    try {
      let current = true;
      const stale = readInitializedAtlasPoints(async () => {
        current = false;
        return { url: TREE_URL, allocated: 12, max: 138 };
      }, () => current);
      const timeout = readInitializedAtlasPoints(async () => (
        { url: TREE_URL, allocated: 0, max: 121 }
      ), () => true);
      await vi.advanceTimersByTimeAsync(5500);
      expect(await stale).toBeNull();
      expect(await timeout).toBeNull();
    } finally { vi.useRealTimers(); }
  });
});
