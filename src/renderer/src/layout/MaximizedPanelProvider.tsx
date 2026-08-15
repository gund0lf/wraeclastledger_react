import type { PropsWithChildren } from 'react';
import { MaximizedPanelContext } from './panelLayoutContext';

export const MaximizedPanelProvider = ({
  maximizedPanel,
  children,
}: PropsWithChildren<{ maximizedPanel: string | null }>) => (
  <MaximizedPanelContext.Provider value={maximizedPanel}>
    {children}
  </MaximizedPanelContext.Provider>
);
