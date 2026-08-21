import { describe, expect, it } from 'vitest';
import {
  atlasRemountSource,
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
    expect(isPathofpathingTreeUrl('https://pathofpathing.com')).toBe(false);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com/?v=3.29.0-atlas')).toBe(false);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com/?v=3.29.0#AAAABgAAAgEAcXVxdQAA')).toBe(false);
    expect(isPathofpathingTreeUrl('https://pathofpathing.com/?v=3.29.0-atlas#AAAA')).toBe(false);
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
