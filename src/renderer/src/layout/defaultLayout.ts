import { IJsonModel } from 'flexlayout-react';

export const defaultLayout: IJsonModel = {
  // tabEnableFloat is a valid runtime option in flexlayout-react but its type
  // definitions don't include it yet. Cast to any to suppress the false error.
  global: {
    tabEnableClose:  true,
    tabEnableFloat:  false,
    tabEnableRename: false,
    borderEnableAutoHide: true,
    borderAutoSelectTabWhenClosed: false,
  } as any,
  borders: [
    {
      type: 'border',
      location: 'left',
      size: 330,
      minSize: 300,
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
  ],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      {
        type: 'tabset', weight: 70,
        children: [
          { type: 'tab', name: 'Map Log', component: 'session-log' },
          { type: 'tab', name: 'Atlas Tree', component: 'atlas-tree' },
          { type: 'tab', name: 'Strategy Browser', component: 'strategy-browser' },
          { type: 'tab', name: 'Regex', component: 'regex' },
          { type: 'tab', name: 'Notes', component: 'notes' },
        ],
      },
      { type: 'tabset', weight: 30, children: [{ type: 'tab', name: 'Dashboard', component: 'dashboard' }] },
    ],
  },
};
