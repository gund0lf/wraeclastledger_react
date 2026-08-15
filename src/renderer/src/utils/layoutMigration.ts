import { Actions, IJsonModel, Model, Node } from 'flexlayout-react';

type ComponentNode = Node & { getComponent?: () => string | undefined };

type JsonNode = {
  type?: string;
  weight?: number;
  component?: string;
  children?: JsonNode[];
};

const ORIGINAL_SETUP_COMPONENTS = ['session-manager', 'atlas-calc', 'investment'];
const ORIGINAL_SETUP_WEIGHTS = [18, 37, 45];

/**
 * Replace only the untouched original three-stack settings column with the
 * accepted native-border Setup surface. Any sign of customization (different
 * weights/order, extra tabs, or an existing border) makes this a no-op.
 */
export function migrateDefaultSetupSidebarJson(json: IJsonModel): boolean {
  if ((json.borders?.length ?? 0) > 0) return false;

  const root = json.layout as JsonNode;
  const left = root.children?.[0];
  if (!left || left.type !== 'col' || left.weight !== 22 || left.children?.length !== 3) {
    return false;
  }

  const untouched = left.children.every((tabset, index) => {
    const onlyTab = tabset.children?.[0];
    return tabset.type === 'tabset'
      && tabset.weight === ORIGINAL_SETUP_WEIGHTS[index]
      && tabset.children?.length === 1
      && onlyTab?.type === 'tab'
      && onlyTab.component === ORIGINAL_SETUP_COMPONENTS[index];
  });
  if (!untouched || !root.children) return false;

  root.children.splice(0, 1);
  json.global = {
    ...json.global,
    borderEnableAutoHide: true,
    borderAutoSelectTabWhenClosed: false,
  };
  json.borders = [
    {
      type: 'border',
      location: 'left',
      size: 330,
      minSize: 300,
      maxSize: 440,
      selected: 0,
      children: [
        {
          type: 'tab',
          name: 'Setup',
          component: 'setup',
          enableClose: false,
          enableDrag: false,
        },
      ],
    },
  ];
  return true;
}

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

const RETIRED_COMPONENTS = new Set(['map-analyzer', 'map-search']);

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
