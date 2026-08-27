import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from './useUIStore';

describe('useUIStore Atlas apply requests', () => {
  beforeEach(() => {
    useUIStore.setState({
      atlasApplyNonce: 0,
      atlasApplySessionNonce: null,
      panelRequestNonce: 0,
      panelRequestComponent: null,
    });
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

  it('keeps repeated panel activation requests distinct and clears only the handled request', () => {
    useUIStore.getState().requestPanel('atlas-tree');
    const first = useUIStore.getState().panelRequestNonce;
    useUIStore.getState().requestPanel('atlas-tree');
    const second = useUIStore.getState().panelRequestNonce;
    expect(second).toBe(first + 1);
    expect(useUIStore.getState().panelRequestComponent).toBe('atlas-tree');

    useUIStore.getState().clearPanelRequest(first);
    expect(useUIStore.getState().panelRequestComponent).toBe('atlas-tree');
    useUIStore.getState().clearPanelRequest(second);
    expect(useUIStore.getState().panelRequestComponent).toBeNull();
  });
});
