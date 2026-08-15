import { createContext, useContext } from 'react';

export const MaximizedPanelContext = createContext<string | null>(null);

export const usePanelMaximized = (componentId: string): boolean =>
  useContext(MaximizedPanelContext) === componentId;
