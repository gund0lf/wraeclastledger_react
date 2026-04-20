import { useEffect, useRef, useState } from 'react';
import { Layout, Model, Node, Actions, DockLocation } from 'flexlayout-react';
import { getModuleComponent } from './layout/Registry';
import { defaultLayout } from './layout/defaultLayout';
import { Box, Button, Menu, Text, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { useSessionStore } from './store/useSessionStore';
import { parseMapClipboard } from './utils/mapParser';
import { UpdateBanner, APP_VERSION } from './UpdateBanner';
import { FaSync } from 'react-icons/fa';

// APP_VERSION imported from UpdateBanner.tsx — single source of truth

declare global {
  interface Window {
    api: any;
    electron?: {
      ipcRenderer: {
        on: (channel: string, listener: (...args: any[]) => void) => void;
        send: (channel: string, ...args: any[]) => void;
      }
    }
  }
}

const ALL_PANELS = [
  { component: 'session-manager', name: 'Sessions' },
  { component: 'session-log',     name: 'Map Log' },
  { component: 'atlas-calc',      name: 'Atlas Calc' },
  { component: 'investment',      name: 'Investment' },
  { component: 'dashboard',       name: 'Dashboard' },
  { component: 'statistics',      name: 'Statistics (legacy)' },
  { component: 'loot',            name: 'Loot (legacy)' },
  { component: 'atlas-tree',      name: 'Atlas Tree' },
  { component: 'map-search',      name: 'Map Search (poe.re)' },
  { component: 'regex',           name: 'Regex' },
  { component: 'map-analyzer',    name: 'Map Analyzer' },
  { component: 'strategy-browser', name: 'Strategy Browser' },
  { component: 'notes',            name: 'Notes' },
];

const LAYOUT_STORAGE_KEY = 'wraeclast-layout-v1';

function App(): JSX.Element {
  const [model] = useState(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved) return Model.fromJson(JSON.parse(saved));
    } catch { /* corrupt/old */ }
    return Model.fromJson(defaultLayout);
  });
  const [modelVersion, setModelVersion] = useState(0);
  const [checking, setChecking] = useState(false);

  const addMapRef      = useRef(useSessionStore.getState().addMap);
  const isWatchingRef  = useRef(useSessionStore.getState().isWatching);

  useEffect(() => {
    const unsub = useSessionStore.subscribe((state) => {
      addMapRef.current     = state.addMap;
      isWatchingRef.current = state.isWatching;
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const handleCapture = (text: string) => {
      if (!isWatchingRef.current) return;
      const parsed = parseMapClipboard(text);
      if (parsed) addMapRef.current(parsed);
    };
    if (window.api) window.api.onClipboardCapture(handleCapture);
    return () => { if (window.api) window.api.removeClipboardListener(); };
  }, []);

  const getOpenComponents = (): Set<string> => {
    const open = new Set<string>();
    model.visitNodes((node: Node) => {
      const comp = (node as any).getComponent?.();
      if (comp) open.add(comp);
    });
    return open;
  };

  const addPanel = (component: string, name: string) => {
    const newTab = { type: 'tab' as const, name, component };
    let targetId: string | null = null;
    model.visitNodes((node: Node) => {
      if (targetId) return;
      if (node.getType() === 'tabset') targetId = node.getId();
    });
    if (targetId) {
      model.doAction(Actions.addNode(newTab, targetId, DockLocation.CENTER, -1));
    } else {
      const rootId = model.getRoot().getId();
      model.doAction(Actions.addNode(newTab, rootId, DockLocation.RIGHT, -1));
    }
  };

  const handleCheckForUpdates = () => {
    setChecking(true);
    window.electron?.ipcRenderer.send('check-for-updates');
    setTimeout(() => setChecking(false), 3000);
  };

  const factory = (node: Node) => {
    const componentId = node.getComponent();
    if (typeof componentId === 'string') return getModuleComponent(componentId);
    return <div>Missing Config</div>;
  };

  const openComponents = getOpenComponents();

  return (
    <Box style={{ width: '100vw', height: '100vh', background: '#1A1B1E', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <Box style={{
        height: 30, background: '#141517', borderBottom: '1px solid #2C2E33',
        display: 'flex', alignItems: 'center', paddingLeft: 8, paddingRight: 8,
        flexShrink: 0, gap: 8,
      }}>
        <Menu shadow="md" width={220}>
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
                <Menu.Item key={panel.component} disabled={isOpen}
                  rightSection={isOpen ? <Text size="xs" c="blue">open</Text> : undefined}
                  onClick={() => !isOpen && addPanel(panel.component, panel.name)}>
                  {panel.name}
                </Menu.Item>
              );
            })}
            <Menu.Divider />
            <Menu.Item color="red" onClick={() => {
              localStorage.removeItem(LAYOUT_STORAGE_KEY);
              window.location.reload();
            }}>Reset layout to default</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        {/* Spacer */}
        <Box style={{ flex: 1 }} />

        {/* App name + version */}
        <Text size="xs" c="dimmed" style={{ fontSize: 10, letterSpacing: 1 }}>
          WRAECLASTLEDGER
        </Text>
        <Badge size="xs" color="dark" variant="outline" style={{ fontSize: 9, fontVariantNumeric: 'tabular-nums' }}>
          v{APP_VERSION}
        </Badge>

        <Box style={{ flex: 1 }} />

        {/* Check for updates */}
        <Tooltip label="Check for updates" position="bottom">
          <ActionIcon size="xs" variant="subtle" color="gray" loading={checking}
            onClick={handleCheckForUpdates}>
            <FaSync size={9} />
          </ActionIcon>
        </Tooltip>
      </Box>

      {/* Layout */}
      <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <Layout
          model={model}
          factory={factory}
          onModelChange={() => {
            setModelVersion((v) => v + 1);
            try {
              localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(model.toJson()));
            } catch { /* quota */ }
          }}
        />
      </Box>

      {/* Update notifications + changelog banner */}
      <UpdateBanner />
    </Box>
  );
}

export default App;
