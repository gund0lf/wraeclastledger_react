import { describe, expect, it } from 'vitest';
import { formatRelativeAge, latestStrategyActivity } from './relativeTime';

const NOW = new Date('2026-08-15T12:00:00.000Z').getTime();
const daysAgo = (days: number): string =>
  new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

describe('formatRelativeAge', () => {
  it('uses compact day and week labels for recent strategies', () => {
    expect(formatRelativeAge(daysAgo(0), NOW)).toBe('Today');
    expect(formatRelativeAge(daysAgo(1), NOW)).toBe('1 day ago');
    expect(formatRelativeAge(daysAgo(6), NOW)).toBe('6 days ago');
    expect(formatRelativeAge(daysAgo(7), NOW)).toBe('1 week ago');
    expect(formatRelativeAge(daysAgo(14), NOW)).toBe('2 weeks ago');
    expect(formatRelativeAge(daysAgo(21), NOW)).toBe('3 weeks ago');
  });

  it('rolls older strategies into month and year labels', () => {
    expect(formatRelativeAge(daysAgo(28), NOW)).toBe('1 month ago');
    expect(formatRelativeAge(daysAgo(60), NOW)).toBe('2 months ago');
    expect(formatRelativeAge(daysAgo(365), NOW)).toBe('1 year ago');
    expect(formatRelativeAge(daysAgo(730), NOW)).toBe('2 years ago');
  });

  it('handles absent, invalid, and future timestamps safely', () => {
    expect(formatRelativeAge(null, NOW)).toBe('—');
    expect(formatRelativeAge('not-a-date', NOW)).toBe('—');
    expect(formatRelativeAge(new Date(NOW + 60_000).toISOString(), NOW)).toBe('Today');
  });
});

describe('latestStrategyActivity', () => {
  it('uses the update timestamp only for a genuinely revised strategy', () => {
    const postedAt = daysAgo(14);
    const updatedAt = daysAgo(2);

    expect(latestStrategyActivity(postedAt, updatedAt, 2)).toEqual({
      kind: 'Updated',
      timestamp: updatedAt,
    });
    expect(latestStrategyActivity(postedAt, updatedAt, 1)).toEqual({
      kind: 'Published',
      timestamp: postedAt,
    });
    expect(latestStrategyActivity(postedAt, null, 3)).toEqual({
      kind: 'Published',
      timestamp: postedAt,
    });
  });
});
