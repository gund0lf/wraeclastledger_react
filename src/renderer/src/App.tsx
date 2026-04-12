import { useEffect, useRef, useState } from 'react';
import { Layout, Model, Node, Actions, DockLocation } from 'flexlayout-react';
import { getModuleComponent } from './layout/Registry';
import { defaultLayout } from './layout/defaultLayout';
import { Box, Button, Menu } from '@mantine/core';
import { useSessionStore } from './store/useSessionStore';
import { parseMapClipboard } from './utils/mapParser';

declare global {
  interface Window {
    api: any;
  }
}

const ALL_PANELS = [
  { component: 'session-manager', name: 'Sessions' },
  { component: 'session-log',     name: 'Map Log' },
  { component: 'atlas-calc',      name: 'Atlas Calc' },
  { component: 'investment',      name: 'Investment' },
  { component: 'statistics',      name: 'Statistics' },
  { component: 'loot',            name: 'Loot' },
  { component: 'atlas-tree',      name: 'Atlas Tree' },
  { component: 'map-search',      name: 'Map Search (poe.re)' },
  { component: 'regex',           name: 'Regex' },
];

function App(): JSX.Element {
  const [model] = useState(() => Model.fromJson(defaultLayout));

  // Force re-render whenever the layout model changes so the Panels menu
  // always reflects which tabs are actually open. Without this, getOpenComponents()
  // would return stale results after a tab is closed.
  const [modelVersion, setModelVersion] = useState(0);

  // Refs so the IPC listener always sees current values without re-registering
  const addMapRef      = useRef(useSessionStore.getState().addMap);
  const isWatchingRef  = useRef(useSessionStore.getState().isWatching);

  useEffect(() => {
    const unsub = useSessionStore.subscribe((state) => {
      addMapRef.current     = state.addMap;
      isWatchingRef.current = state.isWatching;
    });
    return () => unsub();
  }, []);

  // Register IPC listener once — refs handle fresh values
  useEffect(() => {
    const handleCapture = (text: string) => {
      if (!isWatchingRef.current) return;
      const parsed = parseMapClipboard(text);
      if (parsed) {
        addMapRef.current(parsed);
        console.log('Map captured:', parsed.name);
      }
    };
    if (window.api) window.api.onClipboardCapture(handleCapture);
    return () => { if (window.api) window.api.removeClipboardListener(); };
  }, []);

  // ── Panel open/close detection ─────────────────────────────────────────────
  // Called every time the layout changes so our menu re-computes
  const getOpenComponents = (): Set<string> => {
    const open = new Set<string>();
    model.visitNodes((node: Node) => {
      const comp = (node as any).getComponent?.();
      if (comp) open.add(comp);
    });
    return open;
  };

  // ── Add a panel back after it's been closed ────────────────────────────────
  const addPanel = (component: string, name: string) => {
    const newTab = { type: 'tab' as const, name, component };

    // Walk the model to find any surviving tabset
    let targetId: string | null = null;
    model.visitNodes((node: Node) => {
      if (targetId) return;
      if (node.getType() === 'tabset') targetId = node.getId();
    });

    if (targetId) {
      // Dock into the first available tabset
      model.doAction(Actions.addNode(newTab, targetId, DockLocation.CENTER, -1));
    } else {
      // All tabsets are gone — add directly to the root row.
      // FlexLayout will wrap it in a new tabset automatically.
      const rootId = model.getRoot().getId();
      model.doAction(Actions.addNode(newTab, rootId, DockLocation.RIGHT, -1));
    }
  };

  // ── FlexLayout factory ─────────────────────────────────────────────────────
  const factory = (node: Node) => {
    const componentId = node.getComponent();
    if (typeof componentId === 'string') return getModuleComponent(componentId);
    return <div>Missing Config</div>;
  };

  const openComponents = getOpenComponents(); // fresh every render (triggered by modelVersion)

  return (
    <Box style={{ width: '100vw', height: '100vh', background: '#1A1B1E', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Box
        style={{
          height: 30,
          background: '#141517',
          borderBottom: '1px solid #2C2E33',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 8,
          flexShrink: 0,
        }}
      >
        <Menu shadow="md" width={200}>
          <Menu.Target>
            <Button size="compact-xs" variant="subtle" color="gray" style={{ fontSize: 11 }}>
              + Add Panel
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Panels</Menu.Label>
            {ALL_PANELS.map((panel) => {
              const isOpen = openComponents.has(panel.component);
              return (
                <Menu.Item
                  key={panel.component}
                  disabled={isOpen}
                  rightSection={
                    isOpen
                      ? <span style={{ color: '#4dabf7', fontSize: 10 }}>open</span>
                      : undefined
                  }
                  onClick={() => !isOpen && addPanel(panel.component, panel.name)}
                >
                  {panel.name}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      </Box>

      {/* Layout */}
      <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Layout
          model={model}
          factory={factory}
          onModelChange={() => setModelVersion((v) => v + 1)}
        />
      </Box>
    </Box>
  );
}

export default App;
