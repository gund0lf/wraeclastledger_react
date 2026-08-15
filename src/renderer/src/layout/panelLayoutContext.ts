import { createContext, useContext } from 'react';

export const MaximizedPanelContext = createContext<string | null>(null);
export const SetupSidebarCollapsedContext = createContext(false);

export const usePanelMaximized = (componentId: string): boolean =>
  useContext(MaximizedPanelContext) === componentId;

export const useSetupSidebarCollapsed = (): boolean =>
  useContext(SetupSidebarCollapsedContext);
