import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from './useSessionStore';

describe('personal retrospective close-outs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    useSessionStore.setState({ retrospectiveCloseouts: {} });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores two league close-outs sequentially without replacing either one', () => {
    const actions = useSessionStore.getState();
    actions.setPersonalLeagueCloseout(' Mirage ', '2026-07-20T22:00:00Z');
    actions.setPersonalLeagueCloseout('Curse   of the Allflame', '2026-10-01T19:00:00Z');

    expect(useSessionStore.getState().retrospectiveCloseouts).toEqual({
      mirage: {
        cutoffUtc: '2026-07-20T22:00:00.000Z',
        closedAt: '2026-07-25T12:00:00.000Z',
      },
      'curse of the allflame': {
        cutoffUtc: '2026-10-01T19:00:00.000Z',
        closedAt: '2026-07-25T12:00:00.000Z',
      },
    });
  });

  it('updates a cutoff while preserving when the league was first closed', () => {
    const actions = useSessionStore.getState();
    actions.setPersonalLeagueCloseout('Mirage', '2026-07-20T22:00:00Z');
    vi.setSystemTime(new Date('2026-07-26T12:00:00.000Z'));
    actions.setPersonalLeagueCloseout('MIRAGE', '2026-07-20T21:00:00Z');

    expect(useSessionStore.getState().retrospectiveCloseouts.mirage).toEqual({
      cutoffUtc: '2026-07-20T21:00:00.000Z',
      closedAt: '2026-07-25T12:00:00.000Z',
    });
  });

  it('reopens one league without disturbing another', () => {
    const actions = useSessionStore.getState();
    actions.setPersonalLeagueCloseout('Mirage', '2026-07-20T22:00:00Z');
    actions.setPersonalLeagueCloseout('Ancestors', '2026-07-16T00:00:00Z');
    actions.removePersonalLeagueCloseout(' MIRAGE ');

    expect(useSessionStore.getState().retrospectiveCloseouts).toEqual({
      ancestors: {
        cutoffUtc: '2026-07-16T00:00:00.000Z',
        closedAt: '2026-07-25T12:00:00.000Z',
      },
    });
  });

  it('rejects unsupported names and invalid cutoff values', () => {
    const actions = useSessionStore.getState();
    expect(() => actions.setPersonalLeagueCloseout('Standard', '2026-07-20T22:00:00Z'))
      .toThrow('supported league');
    expect(() => actions.setPersonalLeagueCloseout('Mirage', 'not-a-date'))
      .toThrow('valid retrospective cutoff');
  });
});
