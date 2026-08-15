import type { Model, TabNode } from 'flexlayout-react';

export const maximizedPanelComponent = (model: Model): string | null => {
  const selected = model.getMaximizedTabset()?.getSelectedNode();
  const component = selected?.getType() === 'tab'
    ? (selected as TabNode).getComponent()
    : undefined;
  return typeof component === 'string' ? component : null;
};
