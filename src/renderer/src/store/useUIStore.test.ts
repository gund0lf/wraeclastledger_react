import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './useUIStore';

describe('useUIStore Atlas apply requests', () => {
  beforeEach(() => {
    useUIStore.setState({ atlasApplyNonce: 0, atlasApplySessionNonce: null });
  });

  it('ties every request to the session generation that owns the loaded tree', () => {
    useUIStore.getState().requestAtlasApply(7);
    expect(useUIStore.getState()).toMatchObject({
      atlasApplyNonce: 1,
      atlasApplySessionNonce: 7,
    });

    useUIStore.getState().requestAtlasApply(8);
    expect(useUIStore.getState()).toMatchObject({
      atlasApplyNonce: 2,
      atlasApplySessionNonce: 8,
    });
  });
});
