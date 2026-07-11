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
}

export const useUIStore = create<UIState>()((set) => ({
  pendingStrategyAction: null,
  triggerStrategyAction: (action) => set({ pendingStrategyAction: action }),
  clearStrategyAction:   ()       => set({ pendingStrategyAction: null }),
  changelogRequested: false,
  requestChangelog:      () => set({ changelogRequested: true }),
  clearChangelogRequest: () => set({ changelogRequested: false }),
}));
