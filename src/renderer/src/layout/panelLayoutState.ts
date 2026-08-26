import { DockLocation } from 'flexlayout-react';
import type { Model, TabNode } from 'flexlayout-react';

export const maximizedPanelComponent = (model: Model): string | null => {
  const selected = model.getMaximizedTabset()?.getSelectedNode();
  const component = selected?.getType() === 'tab'
    ? (selected as TabNode).getComponent()
    : undefined;
  return typeof component === 'string' ? component : null;
};

export const selectedBorderPanelComponent = (
  model: Model,
  location: DockLocation = DockLocation.LEFT,
): string | null => {
  const selected = model.getBorderSet().getBorders()
    .find((border) => border.getLocation() === location)
    ?.getSelectedNode();
  const component = selected?.getType() === 'tab'
    ? (selected as TabNode).getComponent()
    : undefined;
  return typeof component === 'string' ? component : null;
};

export const setupSidebarCollapsed = (model: Model): boolean => {
  const setupBorder = model.getBorderSet().getBorders().find((border) =>
    border.getLocation() === DockLocation.LEFT
    && border.getChildren().some((node) =>
      node.getType() === 'tab' && (node as TabNode).getComponent() === 'setup'
    )
  );
  return setupBorder?.getSelected() === -1;
};
