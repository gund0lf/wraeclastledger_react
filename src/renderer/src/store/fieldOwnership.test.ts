import { describe, expect, it } from 'vitest';
import { useSessionStore } from './useSessionStore';
import { FIELD_OWNERSHIP } from './fieldOwnership';

describe('WP14 field ownership characterization', () => {
  it('classifies every non-function persisted default-state key exactly once', () => {
    const defaultStateKeys = Object.entries(useSessionStore.getState())
      .filter(([, value]) => typeof value !== 'function')
      .map(([key]) => key)
      .sort();

    expect(Object.keys(FIELD_OWNERSHIP).sort()).toEqual(defaultStateKeys);
  });
});
