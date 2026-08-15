import type { PropsWithChildren } from 'react';
import {
  MaximizedPanelContext,
  SetupSidebarCollapsedContext,
} from './panelLayoutContext';

export const MaximizedPanelProvider = ({
  maximizedPanel,
  setupSidebarCollapsed,
  children,
}: PropsWithChildren<{
  maximizedPanel: string | null;
  setupSidebarCollapsed: boolean;
}>) => (
  <MaximizedPanelContext.Provider value={maximizedPanel}>
    <SetupSidebarCollapsedContext.Provider value={setupSidebarCollapsed}>
      {children}
    </SetupSidebarCollapsedContext.Provider>
  </MaximizedPanelContext.Provider>
);
