import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../store/useSessionStore';
import type { MapData, SavedSession } from '../types';
import {
  buildPersonalRetrospectiveGroups,
  collectPersonalLeagueCandidates,
  isRetrospectiveLeague,
  normalizeLeagueKey,
  sessionActivityAt,
} from './retrospectives';

const mapAt = (id: string, parsedAt?: number): MapData => ({
  id,
  tier: 16,
  name: 'Test Map',
  quantity: 100,
  rarity: 50,
  packSize: 30,
  quality: 0,
  qualityType: '',
  moreCurrency: 0,
  moreMaps: 0,
  moreScarabs: 0,
  moreDivCards: 0,
  modCount: 8,
  parsedAt,
  isOriginator: false,
  isEmpoweredMirage: false,
  isNightmare: false,
  isCorrupted: false,
});

const session = (
  id: string,
  leagueName: string,
  createdAt: string,
  maps: MapData[] = [],
): SavedSession => ({
  id,
  name: id,
  createdAt,
  maps,
  lootItems: [],
  baselineItems: [],
  baselineTotal: 0,
  settings: {
    ...DEFAULT_SETTINGS,
    scarabs: DEFAULT_SETTINGS.scarabs.map((scarab) => ({ ...scarab })),
    leagueName,
  },
});

describe('normalizeLeagueKey', () => {
  it('uses the permanent ASCII-only normalization contract', () => {
    expect(normalizeLeagueKey(' \tCurse  of\r\nTHE Allflame\f ')).toBe('curse of the allflame');
    expect(normalizeLeagueKey('MÍRAGE')).toBe('mÍrage');
    expect(normalizeLeagueKey('\u00a0Mirage\u00a0')).toBe('\u00a0mirage\u00a0');
  });

  it('rejects empty and Standard personal retrospective leagues', () => {
    expect(isRetrospectiveLeague('  ')).toBe(false);
    expect(isRetrospectiveLeague('\tSTANDARD\r')).toBe(false);
    expect(isRetrospectiveLeague('Mirage')).toBe(true);
  });
});

describe('sessionActivityAt', () => {
  it('uses the newest finite map parse time before the creation fallback', () => {
    const value = session('s1', 'Mirage', '2026-07-01T00:00:00.000Z', [
      mapAt('m1', Date.parse('2026-07-02T00:00:00.000Z')),
      mapAt('m2', Date.parse('2026-07-03T00:00:00.000Z')),
    ]);
    expect(sessionActivityAt(value)).toBe(Date.parse('2026-07-03T00:00:00.000Z'));
  });

  it('falls back to createdAt and returns null for fully undated data', () => {
    expect(sessionActivityAt(session('s1', 'Mirage', '2026-07-01T00:00:00.000Z')))
      .toBe(Date.parse('2026-07-01T00:00:00.000Z'));
    expect(sessionActivityAt(session('s2', 'Mirage', 'invalid'))).toBeNull();
  });
});

describe('personal retrospective derivation', () => {
  const savedSessions = {
    before: session('before', ' Mirage ', '2026-07-19T00:00:00.000Z'),
    boundary: session('boundary', 'MIRAGE', '2026-07-20T22:00:00.000Z'),
    after: session('after', 'mirage', '2026-07-21T00:00:00.000Z'),
    undated: session('undated', 'Mirage', 'invalid'),
    other: session('other', 'Ancestors', '2026-07-10T00:00:00.000Z'),
    standard: session('standard', 'Standard', '2026-07-10T00:00:00.000Z'),
  };

  it('groups display-name variants under one permanent league key', () => {
    const candidates = collectPersonalLeagueCandidates(savedSessions);
    expect(candidates.map((candidate) => [
      candidate.leagueKey,
      candidate.sessionCount,
    ])).toEqual([
      ['mirage', 4],
      ['ancestors', 1],
    ]);
  });

  it('includes the cutoff boundary and reports omitted sessions honestly', () => {
    const groups = buildPersonalRetrospectiveGroups(savedSessions, {
      mirage: {
        cutoffUtc: '2026-07-20T22:00:00.000Z',
        closedAt: '2026-07-25T12:00:00.000Z',
      },
    });
    expect(groups).toHaveLength(1);
    expect(groups[0].sessions.map((value) => value.id)).toEqual(['boundary', 'before']);
    expect(groups[0].omittedAfterCutoff).toBe(1);
    expect(groups[0].omittedUndated).toBe(1);
  });

  it('derives only leagues with an explicit local close-out record', () => {
    const groups = buildPersonalRetrospectiveGroups(savedSessions, {
      ancestors: {
        cutoffUtc: '2026-07-16T00:00:00.000Z',
        closedAt: '2026-07-25T12:00:00.000Z',
      },
    });
    expect(groups.map((group) => group.leagueKey)).toEqual(['ancestors']);
  });
});
