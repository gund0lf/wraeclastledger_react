import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STRATEGY_SORT,
  SORT_DEFAULT_DIR,
  SORT_OPTIONS,
} from './strategyConstants';

describe('Strategy Browser sort catalogue', () => {
  it('uses one latest-activity choice as the default time sort', () => {
    expect(DEFAULT_STRATEGY_SORT).toBe('activity');
    expect(SORT_DEFAULT_DIR.activity).toBe('desc');
    expect(SORT_OPTIONS[0]).toEqual({
      value: 'activity',
      label: 'Latest activity',
    });
    expect(SORT_OPTIONS.some(({ value }) => value === 'posted_at')).toBe(false);
  });

  it('gives every dropdown sort one default direction and no duplicate key', () => {
    const keys = SORT_OPTIONS.map(({ value }) => value);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((key) => SORT_DEFAULT_DIR[key] !== undefined)).toBe(true);
  });
});
