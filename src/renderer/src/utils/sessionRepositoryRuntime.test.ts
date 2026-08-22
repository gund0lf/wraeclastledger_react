import { describe, expect, it } from 'vitest';
import type { RepositoryWorkflow } from '../../../shared/sessionRepositoryIpc';
import {
  forkPayloadIntoLeague,
  selectRetrySnapshot,
  shouldSuspendForConfirmedLeague,
  workflowForHistoricalDuplicate,
} from '../repository/sessionRepositoryRuntime';

const workflow = (lifecycle: 'live' | 'historical' = 'live'): RepositoryWorkflow => ({
  activeTarget: { kind: 'working' },
  viewedTarget: { kind: 'working' },
  lifecycle,
  suspended: false,
  activationId: 'activation-1',
  pendingAtlasBonusSeed: false,
  pendingAtlasBonusValue: null,
});

describe('WP14 repository lifecycle provenance', () => {
  it('retries the newest queued snapshot rather than the older failed write', () => {
    expect(selectRetrySnapshot({ revision: 2 }, { revision: 1 })).toEqual({ revision: 2 });
    expect(selectRetrySnapshot(null, { revision: 1 })).toEqual({ revision: 1 });
  });

  it('keeps the live target while a duplicate remains the historical view', () => {
    const previous: RepositoryWorkflow = {
      ...workflow('historical'),
      activeTarget: { kind: 'session', sessionId: 'live-session' },
      viewedTarget: { kind: 'session', sessionId: 'historical-session' },
      suspended: true,
    };

    expect(workflowForHistoricalDuplicate(
      previous,
      { kind: 'session', sessionId: 'duplicate-session' },
      'activation-2',
    )).toEqual({
      ...previous,
      viewedTarget: { kind: 'session', sessionId: 'duplicate-session' },
      lifecycle: 'historical',
      suspended: true,
      activationId: 'activation-2',
    });
  });

  it('forks into a confirmed league without mutating old provenance or carrying its quote', () => {
    const original = {
      maps: [{ id: 'old-map' }],
      settings: {
        leagueName: 'Mirage',
        divinePrice: 215,
        divinePriceQuotedAt: '2026-08-01T00:00:00.000Z',
        atlasBonus: false,
      },
    };
    const forked = forkPayloadIntoLeague(original, 'Ancestors', true);

    expect(forked).toMatchObject({
      maps: [{ id: 'old-map' }],
      settings: { leagueName: 'Ancestors', divinePrice: 0, atlasBonus: true },
    });
    expect(forked.settings).not.toHaveProperty('divinePriceQuotedAt');
    expect(original.settings).toMatchObject({ leagueName: 'Mirage', divinePrice: 215 });
  });

  it('suspends a persisted live target from a different confirmed league', () => {
    expect(shouldSuspendForConfirmedLeague(
      workflow(),
      { settings: { leagueName: 'Mirage' } },
      'Ancestors',
    )).toBe(true);
  });

  it('keeps same-league and unstamped live targets live', () => {
    expect(shouldSuspendForConfirmedLeague(
      workflow(),
      { settings: { leagueName: 'Ancestors' } },
      'Ancestors',
    )).toBe(false);
    expect(shouldSuspendForConfirmedLeague(workflow(), { settings: { leagueName: '' } }, 'Ancestors'))
      .toBe(false);
  });

  it('never changes historical state or acts on an unconfirmed fallback', () => {
    expect(shouldSuspendForConfirmedLeague(
      workflow('historical'),
      { settings: { leagueName: 'Mirage' } },
      'Ancestors',
    )).toBe(false);
    expect(shouldSuspendForConfirmedLeague(
      workflow(),
      { settings: { leagueName: 'Mirage' } },
      null,
    )).toBe(false);
  });
});
