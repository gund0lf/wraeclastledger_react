import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import {
  atlasSyncPresentation,
  atlasSyncState,
  describeMapModifierSource,
  fragmentSourceLabel,
  shouldShowAtlasSyncGuidance,
} from './atlasCalcPresentation';
import type { MapData, SessionSettings } from '../types';

const url = 'https://pathofpathing.com/?v=3.29.0-atlas#AAAABgAAQzIQBJgJ';
const settings = (patch: Partial<SessionSettings> = {}): SessionSettings => ({
  ...DEFAULT_SETTINGS,
  leagueName: 'Allflame',
  atlasTreeUrl: url,
  ...patch,
});
const map = (patch: Partial<MapData> = {}): MapData => ({
  id: Math.random().toString(),
  tier: 16,
  name: 'Test',
  quantity: 100,
  rarity: 50,
  packSize: 30,
  quality: 20,
  qualityType: 'Standard',
  moreCurrency: 0,
  moreMaps: 0,
  moreScarabs: 0,
  moreDivCards: 0,
  modCount: 6,
  explicitModCount: 6,
  isOriginator: false,
  isEmpoweredMirage: false,
  isNightmare: false,
  isCorrupted: false,
  isUnidentified: false,
  ...patch,
});

describe('Atlas Calc provenance presentation', () => {
  const read = {
    schemaVersion: 1 as const,
    sourceUrl: url,
    leagueName: 'Allflame',
    readAt: '2026-08-27T12:00:00.000Z',
    calc: { smallNodesAllocated: 16, mountingModifiers: true, multiplyingModifiersAllocated: true },
  };

  it('distinguishes current, changed, never-read, and legacy/imported values', () => {
    expect(atlasSyncState(settings({ atlasStatsRead: read }), 'live')).toBe('current');
    expect(atlasSyncState(settings({ atlasStatsRead: read, atlasTreeUrl: `${url}x` }), 'live'))
      .toBe('changed-since-read');
    expect(atlasSyncState(settings(), 'live')).toBe('never-read');
    expect(atlasSyncState(settings({ mountingModifiers: true }), 'live')).toBe('legacy-imported');
  });

  it('shares the same concise status presentation across setup consumers', () => {
    expect(atlasSyncPresentation('current')).toMatchObject({ label: 'Synced', color: 'green' });
    expect(atlasSyncPresentation('changed-since-read')).toMatchObject({ label: 'Tree changed', color: 'yellow' });
    expect(atlasSyncPresentation('never-read')).toMatchObject({ label: 'Not synced', color: 'gray' });
    expect(atlasSyncPresentation('previous-league')).toMatchObject({ label: 'Previous league', color: 'yellow' });
    expect(atlasSyncPresentation('legacy-imported')).toMatchObject({ label: 'Legacy / imported', color: 'yellow' });
  });

  it('uses exact Map Log evidence from the first map when coverage is complete', () => {
    const first = describeMapModifierSource([map({ explicitModCount: 8 })], '6-mod');
    expect(first).toMatchObject({
      observed: true,
      value: '8.0 observed',
      source: 'Map Log · 1/1 exact counts',
    });
    const observed = describeMapModifierSource([map(), map(), map(), map()], '8-mod');
    expect(observed).toMatchObject({ observed: true, value: '6.0 observed' });
    const partial = describeMapModifierSource([map(), map(), map(), map({ explicitModCount: undefined })], '8-mod');
    expect(partial).toMatchObject({ observed: false, value: '8-mod', source: 'Map Log · 3/4 exact counts' });
    expect(partial.detail).toContain('3/4');
  });

  it('labels an empty session as provisional rather than observed', () => {
    const empty = describeMapModifierSource([], '6-mod');
    expect(empty).toMatchObject({
      observed: false,
      value: '6-mod',
      source: 'Provisional compatibility value',
    });
    expect(empty.detail).toContain('No captured maps yet');
  });

  it('labels Investment as authoritative and retained overrides as fallback', () => {
    expect(fragmentSourceLabel('observed', 4)).toContain('Investment');
    expect(fragmentSourceLabel('override', 3)).toContain('Legacy/imported fallback');
  });

  it('shows guidance only while the user has an unresolved Atlas state', () => {
    const settled = {
      syncUnavailable: false,
      legacyNoticeDismissed: false,
    };
    expect(shouldShowAtlasSyncGuidance('current', settled)).toBe(false);
    expect(shouldShowAtlasSyncGuidance('changed-since-read', settled)).toBe(true);
    expect(shouldShowAtlasSyncGuidance('previous-league', settled)).toBe(true);
    expect(shouldShowAtlasSyncGuidance('legacy-imported', settled)).toBe(true);
    expect(shouldShowAtlasSyncGuidance('legacy-imported', { ...settled, legacyNoticeDismissed: true })).toBe(false);
    expect(shouldShowAtlasSyncGuidance('current', { ...settled, syncUnavailable: true })).toBe(true);
  });
});
