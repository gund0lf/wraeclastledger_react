import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, useSessionStore } from '../store/useSessionStore';
import { encodeSessionPayload } from '../repository/sessionPayloadCodec';
import { parseMapClipboard } from './mapParser';
import type { AtlasStatsReadResult } from '../../../shared/atlasStats';
import { buildAtlasStatsSyncPatch } from './atlasStatsSync';
import { buildCovensShare } from './covensShare';
import { needsAtlasShareReview, reviewAtlasForShare } from './atlasShareReview';

const tree = 'https://pathofpathing.com/?v=3.30.0-atlas#AAAABgAAAwIAYfNxdXF1AAA=';
const oldTree = tree.replace('AwIA', 'AgIA');
const stale = {
  ...DEFAULT_SETTINGS, leagueName: 'Covens', atlasTreeUrl: tree,
  ...buildAtlasStatsSyncPatch([], oldTree, 'Covens', undefined, [36870]),
  atlasDetectedTags: ['harvest'],
  atlasChoiceAnswers: { sourceUrl: oldTree, leagueName: 'Covens', effects: { '36870': '1' } },
};
const allocation = { groups: [], allocatedNodeIds: [36870], error: null };
afterEach(() => vi.unstubAllGlobals());

it('reviews a changed, never-read or incomplete Covens tree, and skips a current tree or absent link', () => {
  expect(needsAtlasShareReview(stale)).toBe(true);
  expect(needsAtlasShareReview({ ...stale, atlasStatsRead: undefined })).toBe(true);
  expect(needsAtlasShareReview({ ...stale, ...buildAtlasStatsSyncPatch([], tree, 'Covens') })).toBe(true);
  expect(needsAtlasShareReview({ ...stale, atlasTreeUrl: '' })).toBe(false);
  expect(needsAtlasShareReview({ ...stale, leagueName: 'Allflame' })).toBe(false);
  expect(needsAtlasShareReview({ ...stale, ...buildAtlasStatsSyncPatch([], tree, 'Covens', undefined, []) })).toBe(false);
});

it('shares the current link as recorded without a planner read, stale node answers or stale automatic tags', async () => {
  const readAtlasTreeStats = vi.fn();
  vi.stubGlobal('window', { api: { readAtlasTreeStats } });
  const review = await reviewAtlasForShare(stale, [], 'recorded', new AbortController().signal);
  expect(review?.atlas).toBeNull();
  expect(review?.tags).not.toContain('harvest');
  expect(stale.atlasTreeUrl).toBe(tree);
  expect(readAtlasTreeStats).not.toHaveBeenCalled();
});

it('uses the normal reader for the current tree and keeps historical settings, evidence and spend intact', async () => {
  const readAtlasTreeStats = vi.fn().mockResolvedValue(allocation);
  vi.stubGlobal('window', { api: { readAtlasTreeStats } });
  const map = parseMapClipboard(['Item Class: Maps', 'Rarity: Rare', 'Fixture', 'Map (Tier 16)', '--------',
    'Atlas Drops: +45% (augmented)', '--------', '{ Rare-only Suffix Modifier "Encounter" }',
    'Area contains a Mirage', '--------', 'Travel to a Map of this tier or lower by using this in a personal Map Device.'].join('\n'))!;
  const saved = { ...useSessionStore.getInitialState(), maps: [map], sessionLifecycle: 'historical' as const,
    settings: { ...stale, deliriumOrbSpend: [{ type: 'Fine', count: 5, priceEach: 4 }] } };
  const before = JSON.stringify(encodeSessionPayload(saved));
  const historical = buildCovensShare(saved.settings, saved.maps);
  expect(historical).toMatchObject({ atlas: null, atlas_drops: { sum: 45, count: 1 },
    encounters: { confirmed: { mirage: 1 } }, orbs: [{ used: 5, price_each: { amount: 4 } }] });
  const review = await reviewAtlasForShare(saved.settings, saved.maps, 'sync', new AbortController().signal);
  expect(readAtlasTreeStats).toHaveBeenCalledWith(tree);
  expect(review?.atlas).toEqual({ version: '3.30.0-atlas', choices: [{ node: 36870, option: null }] });
  expect(review?.tags).toContain('mirage');
  expect(buildCovensShare(saved.settings, saved.maps, review!.atlas)).toEqual({ ...historical, atlas: review!.atlas });
  expect(JSON.stringify(encodeSessionPayload(saved))).toEqual(before);
  expect(buildCovensShare(saved.settings, saved.maps)).toEqual(historical);
});

it('includes a recorded option only when both its tree and allocated node match', async () => {
  vi.stubGlobal('window', { api: { readAtlasTreeStats: vi.fn().mockResolvedValue({ ...allocation, allocatedNodeIds: [712] }) } });
  const currentAnswer = { sourceUrl: tree, leagueName: 'Covens', effects: { '712': '50999' } };
  const review = await reviewAtlasForShare({ ...stale, atlasChoiceAnswers: currentAnswer }, [], 'sync', new AbortController().signal);
  expect(review?.atlas?.choices).toEqual([{ node: 712, option: 50999 }]);
  expect(review?.tags).toContain('sentinel');
});

it('cancels an in-flight sync without a preview or a change to the session', async () => {
  let finish!: (result: AtlasStatsReadResult) => void;
  vi.stubGlobal('window', { api: { readAtlasTreeStats: () => new Promise(resolve => { finish = resolve; }) } });
  const before = structuredClone(stale);
  const cancel = new AbortController();
  const work = reviewAtlasForShare(stale, [], 'sync', cancel.signal);
  cancel.abort();
  finish(allocation);
  expect(await work).toBeUndefined();
  expect(stale).toEqual(before);
});

it.each([{ groups: null, error: 'Planner unavailable' }, { groups: [], error: null }])(
  'refuses a failed or incomplete sync before preview and allows a separate recorded choice', async result => {
    vi.stubGlobal('window', { api: { readAtlasTreeStats: vi.fn().mockResolvedValue(result) } });
    const before = structuredClone(stale);
    await expect(reviewAtlasForShare(stale, [], 'sync', new AbortController().signal)).rejects.toThrow();
    expect(stale).toEqual(before);
    expect((await reviewAtlasForShare(stale, [], 'recorded', new AbortController().signal))?.atlas).toBeNull();
  },
);

it('uses a hosted effect only for the share and reports conflicting recorded answers', async () => {
  const url = 'https://atlas.wraeclastledger.com/?v=3.30.0-atlas&choices=712-17864#AAAABgAAAwIAAshxdXF1AAA=';
  const settings = { ...stale, atlasTreeUrl: url };
  const before = JSON.stringify(settings);
  vi.stubGlobal('window', { api: { readAtlasTreeStats: vi.fn().mockResolvedValue({
    groups: [], error: null, allocatedNodeIds: [712], choiceEffects: { '712': '17864' },
  }) } });
  const review = await reviewAtlasForShare(settings, [], 'sync', new AbortController().signal);
  expect(review?.atlas?.choices).toEqual([{ node: 712, option: 17864 }]);
  expect(JSON.stringify(settings)).toBe(before);
  const conflict = { ...settings, atlasChoiceAnswers: { sourceUrl: url, leagueName: 'Covens', effects: { '712': '50999' } } };
  await expect(reviewAtlasForShare(conflict, [], 'sync', new AbortController().signal)).rejects.toThrow('saved Atlas choices differ');
});
