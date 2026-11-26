import { expect, it, vi } from 'vitest';
import { readAtlasStatsForLeague, buildAtlasStatsSyncPatch, hasCurrentAtlasStatsRead } from './atlasStatsSync';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
const original = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAAgEA909xdQAA';
const current = 'https://pathofpathing.com/?v=3.30.0-atlas#AAAABgAAAwIAYfNxdXF1AAA=';

it('accepts an Allflame tree for Allflame and refuses its stats for Covens', () => {
  expect(buildAtlasStatsSyncPatch([], original, 'Allflame').atlasStatsRead?.leagueName).toBe('Allflame');
  expect(() => buildAtlasStatsSyncPatch([], original, 'Covens')).toThrow(/3\.30\.0-atlas/);
  expect(buildAtlasStatsSyncPatch([], current, 'Covens').atlasStatsRead?.sourceUrl).toBe(current);
});
it('keeps a retargeted preview from applying bonuses over an authored 3.29 link', () => {
  expect(() => buildAtlasStatsSyncPatch([], current, 'Covens', undefined, [], original)).toThrow(/3\.30\.0-atlas/);
});
it('rejects a mismatched version before contacting the planner and reads the compatible source once', async () => {
  const readAtlasTreeStats = vi.fn(async () => ({ groups: [], error: null }));
  vi.stubGlobal('window', { api: { readAtlasTreeStats } });
  try {
    await expect(readAtlasStatsForLeague(original, 'Covens')).rejects.toThrow(/3\.30\.0-atlas/);
    expect(readAtlasTreeStats).not.toHaveBeenCalled();
    await expect(readAtlasStatsForLeague(current, 'Covens')).resolves.toEqual({ groups: [], error: null });
    expect(readAtlasTreeStats.mock.calls).toEqual([[current]]);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('recognises an older tree previously stamped Covens as needing another sync', () => {
  const historical = buildAtlasStatsSyncPatch([], original, 'Allflame').atlasStatsRead!;
  expect(hasCurrentAtlasStatsRead({ ...DEFAULT_SETTINGS, leagueName:'Covens', atlasTreeUrl:original,
    atlasStatsRead:{...historical,leagueName:'Covens'} })).toBe(false);
});
