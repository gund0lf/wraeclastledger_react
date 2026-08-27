/**
 * Lightweight non-persisted store for UI events that need to cross panel boundaries.
 * e.g. Sessions panel triggering the Share/Import modal that lives in StrategyBrowserModule.
 */
import { create } from 'zustand';

interface UIState {
  pendingStrategyAction: 'share' | 'import' | null;
  triggerStrategyAction: (action: 'share' | 'import') => void;
  clearStrategyAction: () => void;
  // Title-bar version badge -> reopen the What's New changelog panel
  // (lives in UpdateBanner, which otherwise only shows once per version).
  changelogRequested: boolean;
  requestChangelog: () => void;
  clearChangelogRequest: () => void;
  // Load Build -> force the visible Atlas Tree to follow/remount the loaded URL,
  // even when it is unchanged. The isolated reader owns the actual setup sync;
  // persisting a URL alone must never mark derived values current.
  // Monotonic counter: every increment is a distinct view-refresh request.
  atlasApplyNonce: number;
  atlasApplySessionNonce: number | null;
  requestAtlasApply: (sessionNonce: number) => void;
  panelRequestNonce: number;
  panelRequestComponent: string | null;
  requestPanel: (component: string) => void;
  clearPanelRequest: (requestNonce: number) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  pendingStrategyAction: null,
  triggerStrategyAction: (action) => set({ pendingStrategyAction: action }),
  clearStrategyAction:   ()       => set({ pendingStrategyAction: null }),
  changelogRequested: false,
  requestChangelog:      () => set({ changelogRequested: true }),
  clearChangelogRequest: () => set({ changelogRequested: false }),
  atlasApplyNonce: 0,
  atlasApplySessionNonce: null,
  requestAtlasApply:     (sessionNonce) => set((s) => ({
    atlasApplyNonce: s.atlasApplyNonce + 1,
    atlasApplySessionNonce: sessionNonce,
  })),
  panelRequestNonce: 0,
  panelRequestComponent: null,
  requestPanel: (component) => set((s) => ({
    panelRequestNonce: s.panelRequestNonce + 1,
    panelRequestComponent: component,
  })),
  clearPanelRequest: (requestNonce) => set((s) => (
    s.panelRequestNonce === requestNonce
      ? { panelRequestComponent: null }
      : {}
  )),
}));
