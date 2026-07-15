import { describe, expect, it } from 'vitest';
import { IJsonModel, Model, Node } from 'flexlayout-react';
import { migrateRegexBuilderTabs } from './layoutMigration';

type ComponentNode = Node & { getComponent?: () => string | undefined };

const tab = (name: string, component: string) => ({ type: 'tab' as const, name, component });

function modelWith(...tabs: ReturnType<typeof tab>[]): Model {
  return Model.fromJson({
    global: {},
    borders: [],
    layout: {
      type: 'row',
      children: [{ type: 'tabset', children: tabs }],
    },
  } as IJsonModel);
}

function components(model: Model): string[] {
  const result: string[] = [];
  model.visitNodes((node: Node) => {
    if (node.getType() !== 'tab') return;
    const component = (node as ComponentNode).getComponent?.();
    if (component) result.push(component);
  });
  return result;
}

describe('migrateRegexBuilderTabs', () => {
  it('removes a redundant legacy Builder when Regex already exists', () => {
    const model = modelWith(tab('Regex', 'regex'), tab('Regex Builder', 'regex-builder'));

    expect(migrateRegexBuilderTabs(model)).toBe(true);
    expect(components(model)).toEqual(['regex']);
  });

  it('upgrades a lone legacy Builder so the regex surface is preserved', () => {
    const model = modelWith(tab('Regex Builder', 'regex-builder'));

    expect(migrateRegexBuilderTabs(model)).toBe(true);
    expect(components(model)).toEqual(['regex']);
    expect(model.toJson().layout).toMatchObject({
      children: [{ children: [{ name: 'Regex', component: 'regex' }] }],
    });
  });

  it('keeps one Regex surface when multiple legacy Builders exist', () => {
    const model = modelWith(
      tab('Regex Builder A', 'regex-builder'),
      tab('Regex Builder B', 'regex-builder'),
      tab('Notes', 'notes')
    );

    expect(migrateRegexBuilderTabs(model)).toBe(true);
    expect(components(model)).toEqual(['regex', 'notes']);
  });

  it('is idempotent for an already migrated layout', () => {
    const model = modelWith(tab('Regex', 'regex'), tab('Notes', 'notes'));
    const before = model.toJson();

    expect(migrateRegexBuilderTabs(model)).toBe(false);
    expect(model.toJson()).toEqual(before);
  });
});
