/**
 * Lightweight non-persisted store for UI events that need to cross panel boundaries.
 * e.g. Sessions panel triggering the Share/Import modal that lives in StrategyBrowserModule.
 */
import { create } from 'zustand';

interface UIState {
  pendingStrategyAction: 'share' | 'import' | null;
  triggerStrategyAction: (action: 'share' | 'import') => void;
  clearStrategyAction: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  pendingStrategyAction: null,
  triggerStrategyAction: (action) => set({ pendingStrategyAction: action }),
  clearStrategyAction:   ()       => set({ pendingStrategyAction: null }),
}));
