import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconCatalogueLoader, iconRetryDelay, type IconCatalogue } from './iconCatalogueLoader';
import { isIconArtFresh } from './iconCatalogueStore';

const example = (type: string): IconCatalogue => ({ family: 'exchange', league: 'Covens', type });
const success = (type: string) => ({ icons: [{ name: type, icon: type }], error: null, names: [], slugs: [] });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('icon catalogue refresh', () => {
  it.each([['Covens', 1], ['Allflame', 7], ['Standard', 7]] as const)(
    'refreshes %s artwork at exactly %i days', (league, days) => {
      const now = Date.parse('2026-11-27T12:00:00Z');
      const cutoff = now - days * 86_400_000;
      expect(isIconArtFresh(league, cutoff + 1, now)).toBe(true);
      expect(isIconArtFresh(league, cutoff, now)).toBe(false);
      expect(isIconArtFresh(league, now + 1, now)).toBe(false);
    });

  it('honours a throttle, preserves successes and fills every missing category after the cooldown', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-10-01T12:00:00Z'));
    const jobs = ['Currency', 'Fragment', 'Scarab', 'Map', 'Astrolabe'].map(example);
    const calls: string[] = [];
    let active = 0;
    let peak = 0;
    const fetchEconomyIcons = async (_family: string, _league: string, type: string) => {
      calls.push(type);
      peak = Math.max(peak, ++active);
      await Promise.resolve();
      active--;
      return type === 'Fragment' && calls.filter(t => t === type).length === 1
        ? { icons: null, status: 429, retryAfter: '120' } : success(type);
    };
    vi.stubGlobal('window', { api: { fetchEconomyIcons } });
    const loader = new IconCatalogueLoader(jobs);
    expect(await loader.load()).toBe(120_000);
    expect(jobs[0].response?.icons).toEqual(success('Currency').icons);
    vi.advanceTimersByTime(119_999);
    expect(await loader.load()).toBe(1);
    expect(calls).toEqual(['Currency', 'Fragment', 'Scarab']);
    vi.advanceTimersByTime(1);
    expect(await loader.load()).toBeNull();
    expect(calls).toEqual(['Currency', 'Fragment', 'Scarab', 'Map', 'Astrolabe', 'Fragment']);
    expect(peak).toBe(3);
    expect(jobs.every(job => job.response?.icons?.length === 1)).toBe(true);
  });

  it('bounds retries during an outage and retains older art', async () => {
    const jobs = [example('Currency')];
    jobs[0].response = success('Divine Orb');
    const fetchEconomyIcons = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('window', { api: { fetchEconomyIcons } });
    const loader = new IconCatalogueLoader(jobs);
    for (const expected of [15_000, 30_000, 60_000, null]) expect(await loader.load()).toBe(expected);
    expect(fetchEconomyIcons).toHaveBeenCalledTimes(4);
    expect(jobs[0].response.icons).toEqual(success('Divine Orb').icons);
  });

  it('reads an HTTP-date and uses a cooldown for an absent or malformed Retry-After', () => {
    expect(iconRetryDelay('Tue, 01 Dec 2026 12:00:00 GMT', Date.parse('2026-12-01T11:58:00Z'))).toBe(120_000);
    expect(iconRetryDelay(null, 0)).toBe(60_000);
    expect(iconRetryDelay('invalid', 0)).toBe(60_000);
  });
});
