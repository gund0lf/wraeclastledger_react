import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Layout, Model, Node, Actions, DockLocation } from 'flexlayout-react';
import { getModuleComponent } from './layout/Registry';
import { defaultLayout } from './layout/defaultLayout';
import { Box, Button, Menu, Text, ActionIcon, Tooltip, Badge, Alert } from '@mantine/core';
import { useSessionStore } from './store/useSessionStore';
import { useUIStore } from './store/useUIStore';
import { parseMapClipboard } from './utils/mapParser';
import { getGameDataStatus, initGameData } from './utils/gameData';
import { UpdateBanner, APP_VERSION } from './UpdateBanner';
import { IconRefresh } from '@tabler/icons-react';
import { FONT } from './utils/uiTokens';
import { migrateDefaultSetupSidebarJson, migratePersistedLayout } from './utils/layoutMigration';
import { MaximizedPanelProvider } from './layout/MaximizedPanelProvider';
import { maximizedPanelComponent, setupSidebarCollapsed } from './layout/panelLayoutState';
import { retryRepositorySave, saveRepositoryLayout } from './repository/sessionRepositoryRuntime';

// APP_VERSION imported from UpdateBanner.tsx — single source of truth
// window.electron and window.api are declared in src/preload/index.d.ts — no redeclaration needed here.

const ALL_PANELS = [
  { component: 'setup',           name: 'Setup' },
  { component: 'session-manager', name: 'Sessions' },
  { component: 'session-log',     name: 'Map Log' },
  { component: 'atlas-calc',      name: 'Atlas Calc' },
  { component: 'investment',      name: 'Investment' },
  { component: 'dashboard',       name: 'Dashboard' },
  { component: 'run-statistics',  name: 'Run Statistics' },
  // 'statistics' and 'loot' are legacy panels superseded by Dashboard — their
  // registry entries remain as tombstones for old saved layouts, but they are
  // no longer offered in "+ Add Panel" (WP5).
  { component: 'atlas-tree',      name: 'Atlas Tree' },
  { component: 'regex',           name: 'Regex' },
  { component: 'strategy-browser', name: 'Strategy Browser' },
  { component: 'notes',            name: 'Notes' },
];

function App({ initialLayoutRawValue }: { initialLayoutRawValue: string | null }): JSX.Element {
  const [initialLayout] = useState(() => {
    let m: Model;
    let setupSidebarMigrated = false;
    try {
      if (initialLayoutRawValue) {
        const parsed = JSON.parse(initialLayoutRawValue);
        setupSidebarMigrated = migrateDefaultSetupSidebarJson(parsed);
        m = Model.fromJson(parsed);
      } else {
        m = Model.fromJson(defaultLayout);
      }
    } catch {
      m = Model.fromJson(defaultLayout); // corrupt/old
    }
    const persistedLayoutMigrated = migratePersistedLayout(m);
    const migrated = setupSidebarMigrated || persistedLayoutMigrated;
    return { model: m, migrated };
  });
  const model = initialLayout.model;
  // FlexLayout mutates its Model in place. Updating this otherwise-unused state
  // forces the toolbar and context-derived maximized presentation to re-render.
  const [, setModelVersion] = useState(0);
  const maximizedPanel = maximizedPanelComponent(model);
  const isSetupSidebarCollapsed = setupSidebarCollapsed(model);
  const [checking, setChecking] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const repositorySaveError = useSessionStore((state) => state.saveError);
  const [gameDataStatus, setGameDataStatus] = useState(getGameDataStatus);

  const addMapRef      = useRef(useSessionStore.getState().addMap);
  const isWatchingRef  = useRef(useSessionStore.getState().isWatching);

  useEffect(() => {
    if (initialLayout.migrated) {
      void saveRepositoryLayout(JSON.stringify(model.toJson()))
        .then(() => setLayoutError(null))
        .catch((error) => {
          setLayoutError(error instanceof Error ? error.message : String(error));
        });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Game-data manifest: adopt a newer cached revision if one exists
    // (rollover Phase 1 step 2). Fire-and-forget — bundled data is the
    // always-working floor; failures warn loudly inside initGameData.
    initGameData().finally(() => setGameDataStatus(getGameDataStatus()));
    const unsub = useSessionStore.subscribe((state) => {
      addMapRef.current = state.addMap;
      // WP13: the Capture toggle drives the main-process polling lifecycle —
      // polling only runs while watching. The isWatchingRef guard in
      // handleCapture stays as a belt-and-suspenders filter.
      if (state.isWatching !== isWatchingRef.current) {
        isWatchingRef.current = state.isWatching;
        window.api?.setClipboardWatch(state.isWatching);
      }
    });
    // Initial sync (isWatching can start true when a layout restores mid-state)
    window.api?.setClipboardWatch(isWatchingRef.current);
    return () => { unsub(); window.api?.setClipboardWatch(false); };
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
    // flexlayout-react's type definitions don't expose getComponent() on Node,
    // but the method exists at runtime. Cast to any to satisfy TS.
    const componentId = (node as any).getComponent?.();
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
        flexShrink: 0, gap: 8, position: 'relative',
      }}>
        <Box style={{ position: 'absolute', left: 8 }}>
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
              void saveRepositoryLayout(JSON.stringify(defaultLayout))
                .then(() => window.location.reload())
                .catch((error) => setLayoutError(error instanceof Error ? error.message : String(error)));
            }}>Reset layout to default</Menu.Item>
          </Menu.Dropdown>
        </Menu>
        </Box>

        {/* Spacer */}
        <Box style={{ flex: 1 }} />

        {/* App name + version + update check (session-16: the update check is
            version-related, so it sits WITH the version instead of alone in
            the far corner) */}
        <Text size="xs" c="dimmed" style={{ fontSize: 10, letterSpacing: 1 }}>
          WRAECLASTLEDGER
        </Text>
        {/* session-17 review: was color="dark" outline at raw fontSize 9 —
            near-invisible on the dark surface (and a uiTokens violation). */}
        <Tooltip label="View changelog" position="bottom">
          <Badge size="xs" color="gray" variant="outline"
            style={{ fontSize: FONT.small, fontVariantNumeric: 'tabular-nums', cursor: 'pointer' }}
            onClick={() => useUIStore.getState().requestChangelog()}>
            v{APP_VERSION}
          </Badge>
        </Tooltip>
        <Tooltip
          label={`Game data revision ${gameDataStatus.revision} · patch ${gameDataStatus.patchVersion} · ${gameDataStatus.source}${gameDataStatus.warning ? ` — ${gameDataStatus.warning}` : ''}`}
          position="bottom"
        >
          <Badge size="xs" color={gameDataStatus.warning ? 'yellow' : 'gray'} variant="outline"
            style={{ fontSize: FONT.small, fontVariantNumeric: 'tabular-nums' }}>
            DATA R{gameDataStatus.revision}
          </Badge>
        </Tooltip>
        <Tooltip label="Check for updates" position="bottom">
          <ActionIcon size="xs" variant="subtle" color="gray" loading={checking}
            onClick={handleCheckForUpdates} aria-label="Check for updates">
            <IconRefresh size={11} />
          </ActionIcon>
        </Tooltip>

        <Box style={{ flex: 1 }} />
      </Box>

      {/* Layout */}
      <Box style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <MaximizedPanelProvider
          maximizedPanel={maximizedPanel}
          setupSidebarCollapsed={isSetupSidebarCollapsed}
        >
          <Layout
            model={model}
            factory={factory}
            onModelChange={() => {
              setModelVersion((v) => v + 1);
              void saveRepositoryLayout(JSON.stringify(model.toJson()))
                .then(() => setLayoutError(null))
                .catch((error) => {
                  console.error('[App] layout file save failed:', error);
                  setLayoutError(error instanceof Error ? error.message : String(error));
                });
            }}
          />
        </MaximizedPanelProvider>
      </Box>

      {(layoutError || repositorySaveError) && (
        <Alert color="orange" variant="light"
          style={{ position: 'absolute', bottom: 32, right: 16, zIndex: 9999, maxWidth: 380 }}>
          <Text size="xs" fw={600}>Save failed</Text>
          <Text size="xs" c="dimmed">
            {layoutError ?? repositorySaveError}
          </Text>
          {repositorySaveError ? (
            <Button size="compact-xs" variant="default" mt={6}
              onClick={() => {
                void retryRepositorySave()
                  .then(() => setLayoutError(null))
                  .catch(() => undefined);
              }}>Retry</Button>
          ) : (
            <Button size="compact-xs" variant="subtle" color="gray" mt={6}
              onClick={() => setLayoutError(null)}>Dismiss</Button>
          )}
        </Alert>
      )}

      {/* Update notifications + changelog banner */}
      <UpdateBanner />
    </Box>
  );
}

export default App;
