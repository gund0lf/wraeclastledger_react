import { Actions, Model, Node } from 'flexlayout-react';

type ComponentNode = Node & { getComponent?: () => string | undefined };

/**
 * Upgrade persisted WP8 layouts without removing the user's only regex surface:
 * an existing Regex tab wins; otherwise the first legacy Builder becomes it.
 * Returns true only when the model changed, so callers can persist immediately.
 */
export function migrateRegexBuilderTabs(model: Model): boolean {
  const builderIds: string[] = [];
  let hasRegex = false;

  model.visitNodes((node: Node) => {
    if (node.getType() !== 'tab') return;
    const component = (node as ComponentNode).getComponent?.();
    if (component === 'regex') hasRegex = true;
    else if (component === 'regex-builder') builderIds.push(node.getId());
  });

  if (builderIds.length === 0) return false;

  for (const id of builderIds) {
    if (hasRegex) {
      model.doAction(Actions.deleteTab(id));
    } else {
      model.doAction(Actions.updateNodeAttributes(id, { component: 'regex', name: 'Regex' }));
      hasRegex = true;
    }
  }
  return true;
}

const RETIRED_COMPONENTS = new Set(['map-analyzer']);

/** Remove panels whose product surface has been deliberately retired. */
export function removeRetiredTabs(model: Model): boolean {
  const retiredIds: string[] = [];
  model.visitNodes((node: Node) => {
    if (node.getType() !== 'tab') return;
    const component = (node as ComponentNode).getComponent?.();
    if (component && RETIRED_COMPONENTS.has(component)) retiredIds.push(node.getId());
  });

  for (const id of retiredIds) model.doAction(Actions.deleteTab(id));
  return retiredIds.length > 0;
}

/** Apply every persisted-layout migration; all passes must run independently. */
export function migratePersistedLayout(model: Model): boolean {
  const regexChanged = migrateRegexBuilderTabs(model);
  const retiredChanged = removeRetiredTabs(model);
  return regexChanged || retiredChanged;
}
