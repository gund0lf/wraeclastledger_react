import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import { buildAtlasStatsSyncPatch } from './atlasStatsSync';
import { recordRunStatisticsSetupContext, normalizeLocalManualStatistics } from './manualStatistics';
import type { ManualSessionStatistics } from '../types';

const url = 'https://pathofpathing.com/?v=3.30.0-atlas#AAAABgAABAMAbz1xdfECcXUAAA==';
function observe(stats: ManualSessionStatistics, effects?: Record<string, string>, sourceUrl = url) {
  const settings = {
    ...DEFAULT_SETTINGS, leagueName: 'Covens', atlasTreeUrl: url,
    ...buildAtlasStatsSyncPatch([], url, 'Covens', '2026-01-01', [712, 12887]),
    atlasChoiceAnswers: effects && { sourceUrl, leagueName: 'Covens', effects },
  };
  return recordRunStatisticsSetupContext(stats, 'wildwood', settings, 'manual-entry', false);
}

it('distinguishes Sentinel and Wildwood on one tree and retains the difference after reopening', () => {
  const sentinel = observe({}, { 712: '50999', 12887: '20818' });
  const both = observe(sentinel, { 712: '61631', 12887: '20818' });
  const reopened = normalizeLocalManualStatistics(JSON.parse(JSON.stringify(both)));
  const repeated = observe(reopened, { 12887: '20818', 712: '61631' });
  expect(repeated.setupProvenance?.wildwood?.contexts.map(c => c.atlasChoiceIds)).toEqual([
    { 712: '50999', 12887: '20818' }, { 712: '61631', 12887: '20818' },
  ]);
});

it('keeps old, stale and unrecognized answers unknown when a confirmed choice is later recorded', () => {
  const old = normalizeLocalManualStatistics(observe({}));
  const stale = observe(old, { 712: '50999' }, url + 'A');
  const invalid = observe(stale, { 712: '999999', 123: '50999' });
  const result = observe(invalid, { 712: '61631' });
  expect(result.setupProvenance?.wildwood?.contexts.map(c => c.atlasChoiceIds)).toEqual([
    undefined, { 712: '61631' },
  ]);
});
