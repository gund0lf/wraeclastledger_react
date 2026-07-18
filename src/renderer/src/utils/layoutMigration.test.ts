import { describe, expect, it } from 'vitest';
import { IJsonModel, Model, Node } from 'flexlayout-react';
import { migratePersistedLayout, migrateRegexBuilderTabs, removeRetiredTabs } from './layoutMigration';

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

describe('removeRetiredTabs', () => {
  it('removes retired panels while preserving neighboring panels', () => {
    const model = modelWith(
      tab('Atlas Tree', 'atlas-tree'),
      tab('Map Analyzer', 'map-analyzer'),
      tab('Map Search (poe.re)', 'map-search'),
      tab('Regex', 'regex'),
    );

    expect(removeRetiredTabs(model)).toBe(true);
    expect(components(model)).toEqual(['atlas-tree', 'regex']);
  });

  it('removes every duplicate retired tab and is then idempotent', () => {
    const model = modelWith(
      tab('Map Analyzer A', 'map-analyzer'),
      tab('Notes', 'notes'),
      tab('Map Analyzer B', 'map-analyzer'),
      tab('Map Search A', 'map-search'),
      tab('Map Search B', 'map-search'),
    );

    expect(removeRetiredTabs(model)).toBe(true);
    expect(components(model)).toEqual(['notes']);
    const after = model.toJson();
    expect(removeRetiredTabs(model)).toBe(false);
    expect(model.toJson()).toEqual(after);
  });

  it('leaves a valid empty layout when the retired panel was the only tab', () => {
    const model = modelWith(tab('Map Search (poe.re)', 'map-search'));

    expect(removeRetiredTabs(model)).toBe(true);
    expect(components(model)).toEqual([]);
    expect(() => model.toJson()).not.toThrow();
  });
});

describe('migratePersistedLayout', () => {
  it('applies regex upgrade and panel retirement in the same pass', () => {
    const model = modelWith(
      tab('Regex Builder', 'regex-builder'),
      tab('Map Analyzer', 'map-analyzer'),
      tab('Map Search (poe.re)', 'map-search'),
    );

    expect(migratePersistedLayout(model)).toBe(true);
    expect(components(model)).toEqual(['regex']);
    expect(migratePersistedLayout(model)).toBe(false);
  });
});
