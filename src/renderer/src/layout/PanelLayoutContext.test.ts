import { describe, expect, it } from 'vitest';
import { Actions, Model, Node, TabNode } from 'flexlayout-react';
import { defaultLayout } from './defaultLayout';
import {
  maximizedPanelComponent,
  selectedBorderPanelComponent,
  setupSidebarCollapsed,
} from './panelLayoutState';

const tabsetForComponent = (model: Model, componentId: string): Node => {
  let tabset: Node | undefined;
  model.visitNodes((node) => {
    if (node.getType() === 'tab' && (node as TabNode).getComponent() === componentId) {
      tabset = node.getParent();
    }
  });
  if (!tabset) throw new Error(`Missing tabset for ${componentId}`);
  return tabset;
};

describe('maximized panel context', () => {
  it('reports the selected panel only while its tabset is maximized', () => {
    const model = Model.fromJson(defaultLayout);
    const tabset = tabsetForComponent(model, 'session-log');

    expect(maximizedPanelComponent(model)).toBeNull();

    model.doAction(Actions.maximizeToggle(tabset.getId()));
    expect(maximizedPanelComponent(model)).toBe('session-log');

    model.doAction(Actions.maximizeToggle(tabset.getId()));
    expect(maximizedPanelComponent(model)).toBeNull();
  });

  it('follows the active tab inside a maximized tabset', () => {
    const model = Model.fromJson(defaultLayout);
    const tabset = tabsetForComponent(model, 'session-log');
    let notesId: string | undefined;
    model.visitNodes((node) => {
      if (node.getType() === 'tab' && (node as TabNode).getComponent() === 'notes') {
        notesId = node.getId();
      }
    });
    if (!notesId) throw new Error('Missing Notes tab');

    model.doAction(Actions.maximizeToggle(tabset.getId()));
    model.doAction(Actions.selectTab(notesId));

    expect(maximizedPanelComponent(model)).toBe('notes');
  });
});

describe('default Setup border', () => {
  it('toggles the combined Setup panel from the native left edge tab', () => {
    const model = Model.fromJson(defaultLayout);
    let setupId: string | undefined;
    model.visitNodes((node) => {
      if (node.getType() === 'tab' && (node as TabNode).getComponent() === 'setup') {
        setupId = node.getId();
      }
    });
    if (!setupId) throw new Error('Missing Setup border tab');

    expect(model.toJson().borders?.[0]).toMatchObject({ location: 'left', selected: 0 });
    expect(selectedBorderPanelComponent(model)).toBe('setup');
    expect(setupSidebarCollapsed(model)).toBe(false);

    model.doAction(Actions.selectTab(setupId));
    expect(model.toJson().borders?.[0].selected ?? -1).toBe(-1);
    expect(selectedBorderPanelComponent(model)).toBeNull();
    expect(setupSidebarCollapsed(model)).toBe(true);

    model.doAction(Actions.selectTab(setupId));
    expect(model.toJson().borders?.[0].selected).toBe(0);
    expect(setupSidebarCollapsed(model)).toBe(false);
  });
});
