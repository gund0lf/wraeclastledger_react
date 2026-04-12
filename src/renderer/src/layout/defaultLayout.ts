import { IJsonModel } from 'flexlayout-react';

export const defaultLayout: IJsonModel = {
  global: {
    tabEnableClose:  true,
    tabEnableFloat:  false,  // Float opens a detached BrowserWindow pointing to a
                             // renderer file path that doesn't exist in Electron —
                             // causes "Das System kann die angegebene Datei nicht finden"
                             // Use the ➕ Add Panel menu to restore closed tabs instead.
    tabEnableRename: false,
    borderEnableAutoHide: true,
  },
  borders: [],
  layout: {
    type: 'row',
    weight: 100,
    children: [
      // Left column — settings
      {
        type: 'col',
        weight: 22,
        children: [
          {
            type: 'tabset',
            weight: 18,
            children: [{ type: 'tab', name: 'Sessions', component: 'session-manager' }],
          },
          {
            type: 'tabset',
            weight: 37,
            children: [{ type: 'tab', name: 'Atlas Calc', component: 'atlas-calc' }],
          },
          {
            type: 'tabset',
            weight: 45,
            children: [{ type: 'tab', name: 'Investment', component: 'investment' }],
          },
        ],
      },
      // Centre column — map log + tree/search tabs
      {
        type: 'col',
        weight: 40,
        children: [
          {
            type: 'tabset',
            weight: 50,
            children: [{ type: 'tab', name: 'Map Log', component: 'session-log' }],
          },
          {
            type: 'tabset',
            weight: 50,
            children: [
              { type: 'tab', name: 'Atlas Tree',          component: 'atlas-tree' },
              { type: 'tab', name: 'Map Search (poe.re)', component: 'map-search' },
              { type: 'tab', name: 'Regex',               component: 'regex' },
              { type: 'tab', name: 'MapAnalyzer',         component: 'map-analyzer' },
            ],
          },
        ],
      },
      // Right column — stats + loot
      {
        type: 'col',
        weight: 38,
        children: [
          {
            type: 'tabset',
            weight: 45,
            children: [{ type: 'tab', name: 'Statistics', component: 'statistics' }],
          },
          {
            type: 'tabset',
            weight: 55,
            children: [{ type: 'tab', name: 'Loot', component: 'loot' }],
          },
        ],
      },
    ],
  },
};
