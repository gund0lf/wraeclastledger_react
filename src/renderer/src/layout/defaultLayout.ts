import { IJsonModel } from 'flexlayout-react';

export const defaultLayout: IJsonModel = {
  // tabEnableFloat is a valid runtime option in flexlayout-react but its type
  // definitions don't include it yet. Cast to any to suppress the false error.
  global: {
    tabEnableClose:  true,
    tabEnableFloat:  false,
    tabEnableRename: false,
    borderEnableAutoHide: true,
  } as any,
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      // Left column — settings
      {
        type: 'col', weight: 22,
        children: [
          { type: 'tabset', weight: 18, children: [{ type: 'tab', name: 'Sessions',   component: 'session-manager' }] },
          { type: 'tabset', weight: 37, children: [{ type: 'tab', name: 'Atlas Calc', component: 'atlas-calc' }] },
          { type: 'tabset', weight: 45, children: [{ type: 'tab', name: 'Investment', component: 'investment' }] },
        ],
      },
      // Centre column — map log + tree/search tabs
      {
        type: 'col', weight: 40,
        children: [
          { type: 'tabset', weight: 50, children: [
            { type: 'tab', name: 'Map Log',          component: 'session-log' },
            { type: 'tab', name: 'Strategy Browser', component: 'strategy-browser' },
            { type: 'tab', name: 'Notes',            component: 'notes' },
          ]},
          {
            type: 'tabset', weight: 50,
            children: [
              { type: 'tab', name: 'Atlas Tree',          component: 'atlas-tree' },
              { type: 'tab', name: 'Regex',               component: 'regex' },
            ],
          },
        ],
      },
      // Right column — dashboard (stats + loot merged)
      {
        type: 'col', weight: 38,
        children: [
          { type: 'tabset', weight: 100, children: [{ type: 'tab', name: 'Dashboard', component: 'dashboard' }] },
        ],
      },
    ],
  },
};
