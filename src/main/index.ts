import { app, shell, BrowserWindow, ipcMain, clipboard, dialog, globalShortcut, powerMonitor, screen } from 'electron'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'
import {
  brickRegexTerm,
  expandSelectedBrickIds,
  resolveBrickTradeStats,
} from '../shared/brickMods'
import type { ResolvedBrickTradeStat, UnavailableBrickTradeStat } from '../shared/brickMods'
import type { AtlasStatGroup, AtlasStatsReadResult } from '../shared/atlasStats'
import { createKeyedSerialTask, isAllowedPathOfPathingUrl } from '../shared/atlasReaderSafety'
import { resolveUserDataPath } from '../shared/appProfile'
import { resolveAutoUpdatePolicy } from '../shared/updatePolicy'
import {
  ProtonClipboardFrameDecoder,
  type ClipboardBridgeStatus,
} from '../shared/protonClipboardBridge'
import {
  buildDeliriumTradeStatFilter,
  SPECIAL_MAP_STAT_TEXT,
  resolveOrdinaryMapSpecialStatIds,
  resolveSpecialMapTradeStats,
  tradeItemTypeForMapType,
  usesOrdinaryMapSpecialExclusions,
} from '../shared/tradeMapFilters'
import { FileSessionRepository } from './sessionRepository'
import { createSessionRepositoryAdapter } from './sessionRepositoryAdapter'
import { registerSessionRepositoryIpc } from './sessionRepositoryIpc'
import { WP14_RECOMMENDED_MAX_EXPORT_DOCUMENT_BYTES } from '../shared/wp14Benchmark'
import {
  completeRepositoryQuit,
  decideRepositoryClose,
  type RendererFlushResult,
  type RepositoryQuitReason,
} from './sessionRepositoryClose'
import {
  DEFAULT_OVERLAY_PREFERENCES,
  OVERLAY_MIN_HEIGHT,
  OVERLAY_MIN_WIDTH,
  OVERLAY_MINIMAL_HEIGHT,
  OVERLAY_MINIMAL_WIDTH,
  normalizeOverlayBoundsInteraction,
  normalizeOverlayPreferences,
  type OverlayAction,
  type OverlayBounds,
  type OverlayPreferences,
  type OverlayShortcutStatus,
  type OverlaySnapshot,
} from '../shared/overlay'

// The installed build and `npm run dev` used to share one Chromium profile.
// Their file:// and localhost origins could then touch the same LevelDB while
// both processes were running. Isolate development before Chromium storage is
// initialised; ProcessSingleton is scoped to this userData directory, so each
// profile permits one writer while dev and installed builds may coexist.
app.setPath('userData', resolveUserDataPath(app.getPath('userData'), is.dev))
const hasSingleInstanceLock = app.requestSingleInstanceLock({
  profile: is.dev ? 'development' : 'installed',
})

const sessionRepository = new FileSessionRepository({
  userDataPath: app.getPath('userData'),
  openPath: (path) => shell.openPath(path),
})
const unregisterSessionRepositoryIpc = registerSessionRepositoryIpc(
  ipcMain,
  createSessionRepositoryAdapter(sessionRepository, {
    maxExportDocumentBytes: WP14_RECOMMENDED_MAX_EXPORT_DOCUMENT_BYTES,
  }),
)

const rendererFlushWaiters = new Map<string, (result: RendererFlushResult) => void>()
let quitBypass = false
let quitInProgress = false
let rendererFlushUnavailable = false

ipcMain.on('session-repository:flush-result', (_event, result: RendererFlushResult) => {
  if (!result || typeof result.requestId !== 'string' || typeof result.ok !== 'boolean') return
  if (result.error !== undefined && typeof result.error !== 'string') return
  if (result.recoveryDocument !== undefined && typeof result.recoveryDocument !== 'string') return
  const resolve = rendererFlushWaiters.get(result.requestId)
  if (!resolve) return
  rendererFlushWaiters.delete(result.requestId)
  resolve(result)
})

function requestRendererFlush(
  mainWindow: BrowserWindow,
  mode: 'flush' | 'export-recovery',
): Promise<RendererFlushResult> {
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return new Promise((resolve) => {
    rendererFlushWaiters.set(requestId, resolve)
    mainWindow.webContents.send('session-repository:flush-request', { requestId, mode })
  })
}

async function waitFiveSeconds<T>(promise: Promise<T>): Promise<{ timedOut: false; value: T } | { timedOut: true }> {
  let timeout: NodeJS.Timeout | null = null
  const result = await Promise.race([
    promise.then((value) => ({ timedOut: false as const, value })),
    new Promise<{ timedOut: true }>((resolve) => {
      timeout = setTimeout(() => resolve({ timedOut: true }), 5000)
    }),
  ])
  if (timeout) clearTimeout(timeout)
  return result
}

async function exportPendingRecovery(
  mainWindow: BrowserWindow,
  knownDocument?: string,
): Promise<void> {
  let document = knownDocument
  if (!document) {
    const exported = await waitFiveSeconds(requestRendererFlush(mainWindow, 'export-recovery'))
    if (!exported.timedOut && exported.value.ok) document = exported.value.recoveryDocument
  }
  if (!document) {
    await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Recovery export failed',
      message: 'The renderer did not provide a pending-state recovery document.',
    })
    return
  }
  const selected = await dialog.showSaveDialog(mainWindow, {
    title: 'Export pending WraeclastLedger state',
    defaultPath: `wraeclast-recovery-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (!selected.canceled && selected.filePath) await writeFile(selected.filePath, document, 'utf8')
}

async function awaitFlushDecision(
  mainWindow: BrowserWindow,
  initial: Promise<RendererFlushResult>,
): Promise<'saved' | 'force'> {
  return decideRepositoryClose(initial, {
    wait: waitFiveSeconds,
    requestFlush: () => requestRendererFlush(mainWindow, 'flush'),
    exportPending: (document) => exportPendingRecovery(mainWindow, document),
    prompt: async (knownFailure) => {
      const answer = await dialog.showMessageBox(mainWindow, {
        type: knownFailure ? 'error' : 'warning',
        title: knownFailure ? 'Save failed' : 'Still saving',
        message: knownFailure
          ? (knownFailure.error ?? 'The latest repository save failed.')
          : 'WraeclastLedger is still committing the latest changes to disk.',
        detail: 'Keep waiting is safest. You can retry, export the pending in-memory state, or explicitly exit without the latest changes.',
        buttons: ['Keep waiting', 'Retry', 'Export pending state', 'Exit without latest changes'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      return answer.response as 0 | 1 | 2 | 3
    },
  })
}

async function continueQuit(reason: RepositoryQuitReason, mainWindow: BrowserWindow): Promise<void> {
  if (quitInProgress || quitBypass) return
  quitInProgress = true
  try {
    if (!rendererFlushUnavailable) {
      await awaitFlushDecision(mainWindow, requestRendererFlush(mainWindow, 'flush'))
    }
    await completeRepositoryQuit(reason, {
      releaseLock: () => sessionRepository.releaseLock(),
      unregister: unregisterSessionRepositoryIpc,
      prepareFinalAction: () => { quitBypass = true },
      closeWindow: () => {
        if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy()
        mainWindow.close()
      },
      quitApp: () => app.quit(),
      installUpdate: () => autoUpdater.quitAndInstall(false, true),
      // A stale lock is recoverable on the next launch and must not trap the
      // user after their data is saved (or after explicit force-exit consent).
      onReleaseError: (error) => console.error(
        '[Session repository] Could not release close lock:', error,
      ),
    })
  } catch (error) {
    console.error('[Session repository] Close protocol failed:', error)
  } finally {
    quitInProgress = false
  }
}

let clipboardInterval: NodeJS.Timeout | null = null;
let lastClipboardText = '';
let watchWindow: BrowserWindow | null = null;
let mainWindowRef: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayBoundsTimer: NodeJS.Timeout | null = null;
let lastOverlaySnapshot: OverlaySnapshot | null = null;
let lastOverlayPreferences: OverlayPreferences = {
  ...DEFAULT_OVERLAY_PREFERENCES,
  counterIds: [...DEFAULT_OVERLAY_PREFERENCES.counterIds],
};
let overlayBoundsInteraction: {
  kind: 'move' | 'resize';
  screenX: number;
  screenY: number;
  bounds: OverlayBounds;
} | null = null;
const overlayShortcutRegistrations = new Set<string>();
let clipboardBridgeProcess: ChildProcessWithoutNullStreams | null = null;
let clipboardBridgeGeneration = 0;
let clipboardBridgeStatus: ClipboardBridgeStatus = { state: 'idle' };

function sendOverlayAction(action: OverlayAction): void {
  const win = mainWindowRef;
  if (win && !win.isDestroyed()) win.webContents.send('overlay:action', action);
}

function unregisterOverlayShortcuts(): void {
  for (const accelerator of overlayShortcutRegistrations) {
    globalShortcut.unregister(accelerator);
  }
  overlayShortcutRegistrations.clear();
}

function registerOverlayShortcuts(preferences: OverlayPreferences): OverlayShortcutStatus {
  unregisterOverlayShortcuts();
  const register = (
    accelerator: string,
    action: OverlayAction,
  ): { accelerator: string; registered: boolean; error: string | null } | null => {
    if (!accelerator) return null;
    try {
      const registered = globalShortcut.register(accelerator, () => sendOverlayAction(action));
      if (registered) overlayShortcutRegistrations.add(accelerator);
      return {
        accelerator,
        registered,
        error: registered ? null : 'Unavailable or already registered by another application',
      };
    } catch (error) {
      return {
        accelerator,
        registered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const counters: OverlayShortcutStatus['counters'] = {};
  for (const counterId of preferences.counterIds) {
    const result = register(preferences.counterShortcuts[counterId] ?? '', {
      type: 'counter-delta', counterId, delta: 1,
    });
    if (result) counters[counterId] = result;
  }
  return {
    timer: register(preferences.timerShortcut, { type: 'timer-toggle' }),
    counters,
  };
}

function visibleOverlayBounds(preferences: OverlayPreferences): OverlayBounds {
  const fallback = { width: 290, height: preferences.mode === 'both' ? 250 : 155 };
  const mainBounds = mainWindowRef && !mainWindowRef.isDestroyed()
    ? mainWindowRef.getBounds()
    : screen.getPrimaryDisplay().workArea;
  const initialDisplay = screen.getDisplayMatching(mainBounds);
  const requested = preferences.bounds ?? {
    ...fallback,
    x: initialDisplay.workArea.x + initialDisplay.workArea.width - fallback.width - 24,
    y: initialDisplay.workArea.y + 80,
  };
  const display = screen.getDisplayMatching(requested);
  const minWidth = preferences.minimal ? OVERLAY_MINIMAL_WIDTH : OVERLAY_MIN_WIDTH;
  const minHeight = preferences.minimal ? OVERLAY_MINIMAL_HEIGHT : OVERLAY_MIN_HEIGHT;
  const width = Math.min(display.workArea.width, Math.max(minWidth, requested.width));
  const height = Math.min(display.workArea.height, Math.max(minHeight, requested.height));
  return {
    width,
    height,
    x: Math.min(display.workArea.x + display.workArea.width - 40,
      Math.max(display.workArea.x - width + 40, requested.x)),
    y: Math.min(display.workArea.y + display.workArea.height - 40,
      Math.max(display.workArea.y, requested.y)),
  };
}

function publishOverlayBounds(): void {
  if (!overlayWindow || overlayWindow.isDestroyed() || !mainWindowRef || mainWindowRef.isDestroyed()) return;
  const bounds = overlayWindow.getBounds();
  mainWindowRef.webContents.send('overlay:bounds', bounds satisfies OverlayBounds);
}

function createOverlayWindow(preferences: OverlayPreferences): BrowserWindow {
  const bounds = visibleOverlayBounds(preferences);
  const linuxOverlay = process.platform === 'linux';
  const win = new BrowserWindow({
    ...bounds,
    title: 'WraeclastLedger Overlay',
    frame: false,
    transparent: true,
    show: false,
    alwaysOnTop: true,
    focusable: !linuxOverlay,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    hasShadow: true,
    resizable: !preferences.locked,
    movable: !preferences.locked,
    icon,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  if (linuxOverlay) win.setVisibleOnAllWorkspaces(true);
  win.setOpacity(preferences.opacity);
  win.setIgnoreMouseEvents(preferences.clickThrough, { forward: true });
  win.on('ready-to-show', () => win.showInactive());
  win.webContents.on('did-finish-load', () => {
    if (lastOverlaySnapshot && !win.isDestroyed()) {
      win.webContents.send('overlay:snapshot', lastOverlaySnapshot);
    }
  });
  win.on('page-title-updated', (event) => event.preventDefault());
  const scheduleBounds = (): void => {
    if (overlayBoundsTimer) clearTimeout(overlayBoundsTimer);
    overlayBoundsTimer = setTimeout(() => {
      overlayBoundsTimer = null;
      publishOverlayBounds();
    }, 250);
  };
  win.on('move', scheduleBounds);
  win.on('resize', scheduleBounds);
  win.on('closed', () => {
    overlayWindow = null;
    overlayBoundsInteraction = null;
    if (overlayBoundsTimer) clearTimeout(overlayBoundsTimer);
    overlayBoundsTimer = null;
  });
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    const url = new URL(process.env['ELECTRON_RENDERER_URL']);
    url.searchParams.set('overlay', '1');
    void win.loadURL(url.toString());
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { query: { overlay: '1' } });
  }
  return win;
}

function syncOverlayWindow(rawPreferences: unknown): OverlayShortcutStatus {
  const preferences = normalizeOverlayPreferences(rawPreferences);
  lastOverlayPreferences = preferences;
  if (preferences.locked || preferences.clickThrough || !preferences.visible) {
    overlayBoundsInteraction = null;
  }
  const shortcutStatus = registerOverlayShortcuts(preferences);
  if (!preferences.visible) {
    if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
    overlayWindow = null;
    return shortcutStatus;
  }
  if (!overlayWindow || overlayWindow.isDestroyed()) overlayWindow = createOverlayWindow(preferences);
  overlayWindow.setOpacity(preferences.opacity);
  overlayWindow.setMovable(!preferences.locked);
  overlayWindow.setResizable(!preferences.locked);
  overlayWindow.setIgnoreMouseEvents(preferences.clickThrough, { forward: true });
  const desiredBounds = visibleOverlayBounds(preferences);
  const currentBounds = overlayWindow.getBounds();
  if (currentBounds.x !== desiredBounds.x || currentBounds.y !== desiredBounds.y ||
      currentBounds.width !== desiredBounds.width || currentBounds.height !== desiredBounds.height) {
    overlayWindow.setBounds(desiredBounds);
  }
  return shortcutStatus;
}

ipcMain.handle('overlay:sync-preferences', (_event, preferences: unknown) =>
  syncOverlayWindow(preferences));
ipcMain.on('overlay:snapshot', (_event, snapshot: OverlaySnapshot) => {
  lastOverlaySnapshot = snapshot;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('overlay:snapshot', snapshot);
  }
});
ipcMain.on('overlay:action', (_event, action: OverlayAction) => sendOverlayAction(action));
ipcMain.on('overlay:bounds-interaction', (event, rawInteraction: unknown) => {
  if (process.platform !== 'linux' || !overlayWindow || overlayWindow.isDestroyed() ||
      event.sender !== overlayWindow.webContents || lastOverlayPreferences.locked ||
      lastOverlayPreferences.clickThrough) {
    overlayBoundsInteraction = null;
    return;
  }
  const interaction = normalizeOverlayBoundsInteraction(rawInteraction);
  if (!interaction) return;
  if (interaction.phase === 'end') {
    if (overlayBoundsInteraction?.kind === interaction.kind) {
      overlayBoundsInteraction = null;
      publishOverlayBounds();
    }
    return;
  }
  if (interaction.phase === 'start') {
    overlayBoundsInteraction = {
      kind: interaction.kind,
      screenX: interaction.screenX,
      screenY: interaction.screenY,
      bounds: overlayWindow.getBounds(),
    };
    return;
  }
  const active = overlayBoundsInteraction;
  if (!active || active.kind !== interaction.kind) return;
  const deltaX = Math.round(interaction.screenX - active.screenX);
  const deltaY = Math.round(interaction.screenY - active.screenY);
  const requested = active.kind === 'move'
    ? { ...active.bounds, x: active.bounds.x + deltaX, y: active.bounds.y + deltaY }
    : {
      ...active.bounds,
      width: active.bounds.width + deltaX,
      height: active.bounds.height + deltaY,
    };
  overlayWindow.setBounds(visibleOverlayBounds({
    ...lastOverlayPreferences,
    bounds: requested,
  }));
});

function publishClipboardBridgeStatus(status: ClipboardBridgeStatus): void {
  clipboardBridgeStatus = status;
  const win = watchWindow;
  if (win && !win.isDestroyed()) {
    win.webContents.send('on-clipboard-bridge-status', status);
  }
}

function publishClipboardText(text: string): void {
  const win = watchWindow;
  if (!win || win.isDestroyed() || text === lastClipboardText) return;
  lastClipboardText = text;
  win.webContents.send('on-clipboard-capture', text);
}

function stopProtonClipboardBridge(): void {
  clipboardBridgeGeneration += 1;
  const child = clipboardBridgeProcess;
  clipboardBridgeProcess = null;
  publishClipboardBridgeStatus({ state: 'idle' });
  if (!child) return;
  child.stdin.end();
  const forceKill = setTimeout(() => child.kill(), 1500);
  forceKill.unref();
  child.once('exit', () => {
    clearTimeout(forceKill);
  });
}

async function startProtonClipboardBridge(): Promise<void> {
  if (clipboardBridgeProcess || clipboardBridgeStatus.state === 'connecting') return;
  const generation = ++clipboardBridgeGeneration;
  publishClipboardBridgeStatus({
    state: 'connecting',
    message: 'Connecting to Path of Exile through Proton...',
  });

  try {
    const bundledHelper = process.env.WL_PROTON_CLIPBOARD_HELPER
      || join(process.resourcesPath, 'linux', 'wl-proton-clipboard.exe');
    const helperDirectory = join(app.getPath('userData'), 'linux-bridge');
    const runnableHelper = join(helperDirectory, 'wl-proton-clipboard.exe');
    await mkdir(helperDirectory, { recursive: true });
    await copyFile(bundledHelper, runnableHelper);
    if (generation !== clipboardBridgeGeneration) return;

    const child = spawn(
      process.env.WL_PROTONTRICKS_LAUNCH || 'protontricks-launch',
      ['--appid', '238960', runnableHelper],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    clipboardBridgeProcess = child;
    const decoder = new ProtonClipboardFrameDecoder();
    let diagnostic = '';
    let failed = false;

    const fail = (detail: string): void => {
      if (generation !== clipboardBridgeGeneration || failed) return;
      failed = true;
      clipboardBridgeProcess = null;
      child.stdin.end();
      child.kill();
      console.error(`[Clipboard bridge] ${detail}${diagnostic ? `\n${diagnostic}` : ''}`);
      publishClipboardBridgeStatus({
        state: 'error',
        message: `${detail} Automatic Linux capture is unavailable; the Paste button still works.`,
      });
    };

    child.stdout.on('data', (chunk: Buffer) => {
      if (generation !== clipboardBridgeGeneration || failed) return;
      try {
        for (const event of decoder.push(chunk)) {
          if (event.type === 'ready') {
            publishClipboardBridgeStatus({
              state: 'ready',
              message: 'Capturing directly from Path of Exile through Proton.',
            });
          } else {
            publishClipboardText(event.text);
          }
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'The Proton clipboard stream was invalid.');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      diagnostic = `${diagnostic}${chunk.toString('utf8')}`.slice(-8192);
    });
    child.once('error', (error) => fail(`Could not launch protontricks: ${error.message}`));
    child.once('exit', (code, signal) => {
      if (generation !== clipboardBridgeGeneration || failed) return;
      clipboardBridgeProcess = null;
      fail(`The Proton clipboard helper stopped (${signal ?? `exit ${code ?? 'unknown'}`}).`);
    });
  } catch (error) {
    if (generation !== clipboardBridgeGeneration) return;
    console.error('[Clipboard bridge]', error);
    publishClipboardBridgeStatus({
      state: 'error',
      message: `Could not prepare the Proton clipboard helper: ${error instanceof Error ? error.message : 'unknown error'}. Automatic Linux capture is unavailable; the Paste button still works.`,
    });
  }
}

// ── WP13: clipboard polling lifecycle ────────────────────────────────────────
// Polling only runs while the renderer's Capture toggle is ON (previously it
// ran every 200ms forever and the renderer filtered by isWatching). Turning
// Capture ON primes the current clipboard as the baseline without emitting it:
// stale map text must not populate a freshly cleared log. Copying the SAME map
// twice in a row while watching still yields identical text and is skipped —
// the manual Paste button remains the explicit answer for that case.
function setClipboardWatch(on: boolean): void {
  if (process.platform === 'linux') {
    if (on) void startProtonClipboardBridge();
    else stopProtonClipboardBridge();
    return;
  }
  if (on) {
    if (clipboardInterval) return; // already polling
    lastClipboardText = clipboard.readText();
    clipboardInterval = setInterval(() => {
      const win = watchWindow;
      if (!win || win.isDestroyed()) return;
      const text = clipboard.readText();
      publishClipboardText(text);
    }, 200);
  } else if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
  }
}

ipcMain.on('clipboard:set-watch', (_event, on: boolean) => setClipboardWatch(!!on));
ipcMain.handle('clipboard:get-bridge-status', () => clipboardBridgeStatus);

function setupAutoUpdater(mainWindow: BrowserWindow): void {
  const policy = resolveAutoUpdatePolicy({
    isDevelopment: is.dev,
    platform: process.platform,
    version: app.getVersion(),
    appImagePath: process.env.APPIMAGE,
  });
  if (!policy.enabled) {
    console.info(`[Updater] Disabled: ${policy.reason}`);
    return;
  }
  autoUpdater.allowPrerelease = policy.allowPrerelease;
  autoUpdater.autoDownload         = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available',     (info) => mainWindow.webContents.send('update-available', info.version));
  autoUpdater.on('update-not-available', ()     => mainWindow.webContents.send('update-not-available'));
  autoUpdater.on('update-downloaded',    ()     => mainWindow.webContents.send('update-downloaded'));
  autoUpdater.on('error', (err) => {
    console.error('[Updater]', err?.message ?? err);
    mainWindow.webContents.send('update-error', err?.message ?? 'Unknown error');
  });
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000);
}

ipcMain.on('install-update', () => {
  const mainWindow = watchWindow
  if (mainWindow && !mainWindow.isDestroyed()) void continueQuit('updater', mainWindow)
});
ipcMain.on('check-for-updates', () => {
  const policy = resolveAutoUpdatePolicy({
    isDevelopment: is.dev,
    platform: process.platform,
    version: app.getVersion(),
    appImagePath: process.env.APPIMAGE,
  });
  if (!policy.enabled) return;
  autoUpdater.allowPrerelease = policy.allowPrerelease;
  autoUpdater.checkForUpdates().catch(() => {});
});

// Strategy Browser can load a Path of Pathing tree while the visible Atlas Tree
// tab is display:none. A renderer webview in that subtree cannot initialise, so
// derive its stats in a short-lived, isolated main-process window instead.
async function readAtlasTreeStats(rawUrl: string): Promise<AtlasStatsReadResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
    if (!isAllowedPathOfPathingUrl(rawUrl)) {
      throw new Error('Only https://pathofpathing.com URLs are allowed');
    }
  } catch (error) {
    return { groups: null, error: error instanceof Error ? error.message : 'Invalid Atlas Tree URL' };
  }

  const reader = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  reader.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  reader.webContents.on('will-navigate', (event, target) => {
    try {
      const next = new URL(target);
      if (next.protocol !== 'https:' || next.hostname !== 'pathofpathing.com') event.preventDefault();
    } catch { event.preventDefault(); }
  });

  try {
    await reader.loadURL(url.toString());
    if (!isAllowedPathOfPathingUrl(reader.webContents.getURL())) {
      return { groups: null, error: 'Path of Pathing redirected to an untrusted URL' };
    }
    const deadline = Date.now() + 8_000;
    let ready = false;
    while (Date.now() < deadline) {
      ready = await reader.webContents.executeJavaScript(
        `Promise.resolve(!!document.getElementById('skillTreeStats_ShowHide'))`,
      );
      if (ready) break;
      await new Promise<void>((resolve) => setTimeout(resolve, 200));
    }
    if (!ready) return { groups: null, error: 'Path of Pathing stats did not become ready' };

    const raw: unknown = await reader.webContents.executeJavaScript(`
      (async function() {
        var btn = document.getElementById('skillTreeStats_ShowHide');
        if (btn && btn.textContent && btn.textContent.trim() === 'Show stats') {
          btn.click();
          await new Promise(function(resolve) { setTimeout(resolve, 300); });
        }
        var container = document.getElementById('skillTreeStats');
        if (container) {
          container.scrollTop = container.scrollHeight;
          await new Promise(function(resolve) { setTimeout(resolve, 150); });
        }
        var statEls = Array.from(document.querySelectorAll('#skillTreeStats_Content .stat[data-group-name]'));
        var groups = {};
        var order = [];
        statEls.forEach(function(el) {
          var name = el.getAttribute('data-group-name');
          if (!groups[name]) { groups[name] = []; order.push(name); }
          var text = el.textContent.trim();
          if (text) groups[name].push(text);
        });
        return order.map(function(name) { return { title: name, stats: groups[name] }; });
      })()
    `);

    if (!Array.isArray(raw)) return { groups: null, error: 'Path of Pathing returned invalid stats' };
    const groups: AtlasStatGroup[] = raw.flatMap((group: unknown) => {
      if (!group || typeof group !== 'object') return [];
      const candidate = group as { title?: unknown; stats?: unknown };
      if (typeof candidate.title !== 'string' || !Array.isArray(candidate.stats) ||
          !candidate.stats.every((stat) => typeof stat === 'string')) return [];
      return [{ title: candidate.title, stats: candidate.stats as string[] }];
    });
    return groups.length > 0
      ? { groups, error: null }
      : { groups: null, error: 'No Atlas Tree stats were found' };
  } catch (error) {
    console.error('[Atlas Tree reader]', error);
    return { groups: null, error: error instanceof Error ? error.message : 'Atlas Tree reader failed' };
  } finally {
    if (!reader.isDestroyed()) reader.destroy();
  }
}

const readAtlasTreeStatsSingleFlight = createKeyedSerialTask(readAtlasTreeStats);
ipcMain.handle('atlas-tree:read-stats', (_event, rawUrl: string) =>
  readAtlasTreeStatsSingleFlight(rawUrl));

// ── PoE Trade stat ID cache ───────────────────────────────────────────────────
const STATS_CACHE = new Map<string, string>();
let statsFetchPromise: Promise<void> | null = null;

const PSEUDO_IDS: Record<string, string> = {
  currency: 'pseudo.pseudo_map_more_currency_drops',
  scarabs:  'pseudo.pseudo_map_more_scarab_drops',
  maps:     'pseudo.pseudo_map_more_map_drops',
};

const STAT_LOOKUPS: Record<string, string> = {
  empowered:       'Empowered Mirage which covers the entire Map',
  delirious_pct:   'enchant:Players in Area are #% Delirious',
  deli_currency:   'enchant:Delirium Reward Type: Currency',
  deli_scarabs:    'enchant:Delirium Reward Type: Scarabs',
  deli_fragments:  'enchant:Delirium Reward Type: Fragments',
  deli_divcards:   'enchant:Delirium Reward Type: Divination Cards',
  deli_maps:       'enchant:Delirium Reward Type: Map Items',
  deli_essences:   'enchant:Delirium Reward Type: Essences',
  deli_unique:     'enchant:Delirium Reward Type: Unique Items',
  deli_expedition: 'enchant:Delirium Reward Type: Expedition Items',
  deli_breach:     'enchant:Delirium Reward Type: Breach Items',
  deli_delirium:   'enchant:Delirium Reward Type: Delirium',
  deli_blight:     'enchant:Delirium Reward Type: Blight Items',
  deli_abyss:      'enchant:Delirium Reward Type: Abyss Items',
  deli_gems:       'enchant:Delirium Reward Type: Gems',
  deli_fossils:    'enchant:Delirium Reward Type: Fossils',
  deli_armour:     'enchant:Delirium Reward Type: Armour',
  deli_weapons:    'enchant:Delirium Reward Type: Weapons',
  deli_jewellery:  'enchant:Delirium Reward Type: Jewellery',
  deli_incubators: 'enchant:Delirium Reward Type: Incubators',
  deli_labyrinth:  'enchant:Delirium Reward Type: Labyrinth Items',
  deli_catalysts:  'enchant:Delirium Reward Type: Catalysts',
  deli_talismans:  'enchant:Delirium Reward Type: Talismans',
};

// Brick mod catalogue (id/label/exact Trade patterns/category) + the regexTerm resolver now
// live in src/shared/brickMods.ts so main and the renderer share ONE definition
// and the stash tokens are defined once, in shared/modTokens.ts (WP12).

// Stable catalogue ids stay renderer-facing; only main expands them into live
// Trade stat ids. This preserves distinct regular/Nightmare labels even when
// GGG maps multiple tier variants to one Trade stat.
let BRICK_MOD_RESOLVED: ResolvedBrickTradeStat[] = [];
let BRICK_MOD_UNAVAILABLE: UnavailableBrickTradeStat[] = [];
let SPECIAL_MAP_STAT_IDS = new Map<keyof typeof SPECIAL_MAP_STAT_TEXT, string>();
let statsLoadError: string | null = null;

async function ensureStatsLoaded(): Promise<void> {
  if (STATS_CACHE.size > 0) return;
  if (statsFetchPromise) return statsFetchPromise;
  statsFetchPromise = (async () => {
    try {
      const res = await fetch('https://www.pathofexile.com/api/trade/data/stats', {
        headers: { 'User-Agent': 'WraeclastLedger/1.0 (github.com/gund0lf/wraeclastledger_react)' },
      });
      if (!res.ok) {
        statsLoadError = `PoE Trade stats request failed (HTTP ${res.status})`;
        return;
      }
      const data = await res.json() as { result: { id: string; entries: { id: string; text: string }[] }[] };
      const explicitEntries = data.result.find((group) => group.id === 'explicit')?.entries ?? [];
      const allEntries = data.result
        .filter((group) => !group.id.includes('2'))
        .flatMap((group) => group.entries);
      for (const group of data.result) {
        if (group.id.includes('2')) continue;
        for (const entry of group.entries) {
          for (const [key, rawNeedle] of Object.entries(STAT_LOOKUPS)) {
            if (STATS_CACHE.has(key)) continue;
            const enchantOnly = rawNeedle.startsWith('enchant:');
            const needle = enchantOnly ? rawNeedle.slice(8) : rawNeedle;
            if (enchantOnly && group.id !== 'enchant') continue;
            if (entry.text.includes(needle)) STATS_CACHE.set(key, entry.id);
          }
        }
      }
      const brickResolution = resolveBrickTradeStats(explicitEntries);
      BRICK_MOD_RESOLVED = brickResolution.resolved;
      BRICK_MOD_UNAVAILABLE = brickResolution.unavailable;
      SPECIAL_MAP_STAT_IDS = resolveSpecialMapTradeStats(allEntries).resolved;
    } catch (error) {
      statsLoadError = error instanceof Error ? error.message : 'PoE Trade stats failed to load';
    }
  })();
  return statsFetchPromise;
}

// Returns stable catalogue ids. Trade stat ids never cross into the renderer.
ipcMain.handle('trade:get-brick-mods', async () => {
  await ensureStatsLoaded();
  const mods = BRICK_MOD_RESOLVED
    .map(({ def }) => ({
      id:        def.id,
      label:     def.label,
      regexTerm: brickRegexTerm(def),
      category:  def.category,
      tradeTexts: def.tradePatterns.map((pattern) => pattern.text),
    }));
  return { mods, unavailable: BRICK_MOD_UNAVAILABLE, error: statsLoadError };
});

// ── Trade params ──────────────────────────────────────────────────────────────
interface TradeParams {
  league:          string;
  minIIQ:          number;
  minPack:         number;
  minIIR:          number;
  minCurrency:     number;
  minScarabs:      number;
  minMaps:         number;
  mapType:         'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
  empowered:       boolean;
  minDelirious:    number;   // -1 = any, 0 = none, positive tiers = exact
  deliRewardTypes: string[];
  brickExclusions: string[];
  minTier:         number;   // 0 = any, 16 = T16+
  corruptedFilter: 'any' | 'yes' | 'no';
}

ipcMain.handle('trade:search-maps', async (_event, params: TradeParams) => {
  await ensureStatsLoaded();

  const { league, minIIQ, minPack, minIIR, minCurrency, minScarabs, minMaps,
          mapType, empowered, minDelirious, deliRewardTypes, brickExclusions,
          minTier, corruptedFilter } = params;

  // Corrupted: explicit override wins, else mapType default
  let corruptedOption: string | null = null;
  if      (corruptedFilter === 'yes') corruptedOption = 'true';
  else if (corruptedFilter === 'no')  corruptedOption = 'false';
  else if (mapType === '8mod')        corruptedOption = 'true';
  else if (mapType === 'regular')     corruptedOption = 'false';

  const mapFilters: Record<string, { min?: number; max?: number }> = {};
  if (minIIQ  > 0)  mapFilters['map_iiq']     = { min: minIIQ };
  if (minPack > 0)  mapFilters['map_packsize'] = { min: minPack };
  if (minIIR  > 0)  mapFilters['map_iir']      = { min: minIIR };
  if (minTier > 0)  mapFilters['map_tier']     = { min: minTier };

  // 8-mod maps: add max IIQ/IIR/Pack to exclude nightmare maps.
  // Verified regular top-tier mods cap out at IIQ:143, IIR:82, Pack:53 (best 4P+4S).
  // Any map rolling higher must have uber-tier mods — almost certainly a nightmare map.
  // Buffer of +2/+3 added to avoid false positives from rounding.
  if (mapType === '8mod') {
    mapFilters['map_iiq']     = { ...(mapFilters['map_iiq']     ?? {}), max: 145 };
    mapFilters['map_iir']     = { ...(mapFilters['map_iir']     ?? {}), max: 85  };
    mapFilters['map_packsize']= { ...(mapFilters['map_packsize']?? {}), max: 55  };
  }

  const statsArray: unknown[] = [];

  const pseudoFilters: { id: string; value: { min: number } }[] = [];
  if (minCurrency > 0) pseudoFilters.push({ id: PSEUDO_IDS.currency, value: { min: minCurrency } });
  if (minScarabs  > 0) pseudoFilters.push({ id: PSEUDO_IDS.scarabs,  value: { min: minScarabs  } });
  if (minMaps     > 0) pseudoFilters.push({ id: PSEUDO_IDS.maps,     value: { min: minMaps     } });
  if (pseudoFilters.length > 0) statsArray.push({ type: 'and', filters: pseudoFilters });

  const originatorStatId = SPECIAL_MAP_STAT_IDS.get('originator');
  if (mapType === 'originator' && !originatorStatId) {
    return {
      url: null,
      error: `Special-map exclusion unavailable: ${SPECIAL_MAP_STAT_TEXT.originator}`,
    };
  }

  if (mapType === 'originator')
    statsArray.push({ type: 'and', filters: [{ id: originatorStatId! }] });

  if (empowered && STATS_CACHE.has('empowered'))
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('empowered')! }] });

  if (usesOrdinaryMapSpecialExclusions(mapType)) {
    const specialMapStats = resolveOrdinaryMapSpecialStatIds(SPECIAL_MAP_STAT_IDS);
    if (specialMapStats.missing.length > 0) {
      return {
        url: null,
        error: `${mapType === '8mod' ? '8-mod' : 'Regular'} special-map exclusions unavailable: ${specialMapStats.missing
          .map((key) => SPECIAL_MAP_STAT_TEXT[key])
          .join(', ')}`,
      };
    }
    statsArray.push({
      type: 'not',
      filters: specialMapStats.ids.map((id) => ({ id })),
    });
  }

  if (mapType === '8mod') {
    statsArray.push({ type: 'and', filters: [{ id: 'pseudo.pseudo_number_of_affix_mods', value: { min: 8 } }] });
  }

  try {
    const deliriumFilter = buildDeliriumTradeStatFilter(
      STATS_CACHE.get('delirious_pct'),
      minDelirious,
    );
    if (deliriumFilter) statsArray.push(deliriumFilter);
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : 'Delirium Trade stat is unavailable',
    };
  }

  if (deliRewardTypes.length > 0) {
    const resolvedIds = deliRewardTypes
      .map((key) => STATS_CACHE.get(key))
      .filter((id): id is string => !!id)
      .map((id) => ({ id }));
    if (resolvedIds.length > 0) statsArray.push({ type: 'if', filters: resolvedIds });
  }

  if (brickExclusions.length > 0) {
    const resolvedBrickIds = expandSelectedBrickIds(
      brickExclusions,
      BRICK_MOD_RESOLVED,
    );
    if (resolvedBrickIds.length > 0) {
      statsArray.push({ type: 'not', filters: resolvedBrickIds.map((id) => ({ id })) });
    }
  }

  const itemType = tradeItemTypeForMapType(mapType);
  const query = {
    query: {
      // 'securable' = Instant Buyout only (PoB source: LISTED_STATUS_OPTIONS)
      // 'available' = Instant Buyout & In Person (broader — was incorrectly used before)
      status: { option: 'securable' },
      ...(itemType ? { type: itemType } : {}),
      filters: {
        type_filters: {
          filters: { category: { option: 'map' }, rarity: { option: 'nonunique' } },
        },
        map_filters: { filters: mapFilters },
        ...(corruptedOption ? { misc_filters: { filters: { corrupted: { option: corruptedOption } } } } : {}),
      },
      stats: statsArray,
    },
    sort: { price: 'asc' },
  };

  try {
    const res = await fetch(
      `https://www.pathofexile.com/api/trade/search/${encodeURIComponent(league)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'WraeclastLedger/1.0 (github.com/gund0lf/wraeclastledger_react)' },
        body: JSON.stringify(query),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Trade API ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json() as { id?: string };
    if (!data.id) throw new Error('No search ID in response');
    return { url: `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${data.id}`, error: null };
  } catch (err: any) {
    return { url: null, error: err.message ?? 'Unknown error' };
  }
});

// poe.ninja is fetched from the main process (not the renderer) so it isn't subject
// to CORS: poe.ninja sends no Access-Control-Allow-Origin header, so a renderer-origin
// fetch (localhost in dev) gets blocked. Returns { lines, error } for league.ts +
// priceUtils.ts (league detection + divine price).
ipcMain.handle('poeninja:currency-overview', async (_event, league: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(
      `https://poe.ninja/poe1/api/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=Currency`,
      { signal: controller.signal }
    );
    if (!res.ok) return { lines: null, error: `poe.ninja ${res.status}` };
    const data = await res.json() as { lines?: { id: string; primaryValue?: number }[] };
    return { lines: data.lines ?? [], error: null };
  } catch (err: any) {
    return { lines: null, error: err?.message ?? 'fetch failed' };
  } finally {
    clearTimeout(timeoutId);
  }
});

// poe.ninja league index (index-state) — feeds the manual league-override
// dropdown (league.ts fetchSelectableLeagues). Routed through main (CORS).
// SHAPE UNVERIFIED (EXTERNAL_APIS.md poe.ninja §C / rollover plan D4): parse
// defensively across the plausible shapes and return a flat name list; the
// renderer falls back to KNOWN_LEAGUES with a loud warn when this comes back
// null. Verify the real shape once in dev (open the League dropdown, check
// the list is longer than KNOWN_LEAGUES) and tighten the parse then.
ipcMain.handle('poeninja:league-index', async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch('https://poe.ninja/poe1/api/data/index-state', { signal: controller.signal });
    if (!res.ok) return { leagues: null, error: `poe.ninja ${res.status}` };
    const data = await res.json() as any;
    const raw: unknown[] = Array.isArray(data?.economyLeagues) ? data.economyLeagues
      : Array.isArray(data?.leagues) ? data.leagues
      : Array.isArray(data) ? data
      : [];
    const names = raw
      .map((l: any) => (typeof l === 'string' ? l : typeof l?.name === 'string' ? l.name : null))
      .filter((n: string | null): n is string => !!n && n.trim().length > 0);
    if (names.length === 0) return { leagues: null, error: 'index-state parsed to 0 leagues (shape changed?)' };
    return { leagues: names, error: null };
  } catch (err: any) {
    return { leagues: null, error: err?.message ?? 'fetch failed' };
  } finally {
    clearTimeout(timeoutId);
  }
});

// Game-data manifest disk cache (rollover Phase 1 step 2, decision D1):
// server-fetched manifest revisions persist as a JSON file in userData —
// This signed, re-fetchable cache stays outside the complete user-authored
// ledger-data backup unit.
// read returns { manifest: null, error: null } for a fresh install (no file
// yet — normal, not an error); real IO/parse failures populate error.
ipcMain.handle('gamedata:read-cache', async () => {
  try {
    const { app } = await import('electron');
    const { promises: fsp } = await import('fs');
    const path = await import('path');
    const file = path.join(app.getPath('userData'), 'game-data-manifest.json');
    const raw = await fsp.readFile(file, 'utf-8').catch((e: any) =>
      e?.code === 'ENOENT' ? null : Promise.reject(e));
    if (raw === null) return { manifest: null, error: null };
    return { manifest: JSON.parse(raw), error: null };
  } catch (err: any) {
    return { manifest: null, error: err?.message ?? 'cache read failed' };
  }
});

// Writer for the above — called by the renderer when a NEWER manifest revision
// arrives from the server (endpoint not live yet; the loader hook is dormant).
ipcMain.handle('gamedata:write-cache', async (_event, manifest: unknown) => {
  try {
    const { app } = await import('electron');
    const { promises: fsp } = await import('fs');
    const path = await import('path');
    const file = path.join(app.getPath('userData'), 'game-data-manifest.json');
    await fsp.writeFile(file, JSON.stringify(manifest), 'utf-8');
    return { ok: true, error: null };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'cache write failed' };
  }
});

// Game-data manifest server fetch (rollover step 2 server hook, live 2026-07).
// Routed through main like every external call (CORS). baseUrl comes from the
// renderer (same strategy-API base incl. the VITE_STRATEGY_API_URL dev
// override); validated to http(s) before use. Returns the spec's
// { revision, manifest } payload verbatim — the renderer validates content
// (isValidManifest) and decides adoption; main only moves bytes.
ipcMain.handle('gamedata:fetch-latest', async (_event, baseUrl: string) => {
  if (typeof baseUrl !== 'string' || !/^https?:\/\//.test(baseUrl))
    return { payload: null, error: 'invalid base url' };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/game-data/latest`, { signal: controller.signal });
    if (!res.ok) return { payload: null, error: `game-data ${res.status}` };
    const data = await res.json() as { revision?: number; manifest?: unknown };
    if (typeof data?.revision !== 'number' || !data?.manifest)
      return { payload: null, error: 'malformed game-data response' };
    return { payload: data as { revision: number; manifest: unknown }, error: null };
  } catch (err: any) {
    return { payload: null, error: err?.message ?? 'fetch failed' };
  } finally {
    clearTimeout(timeoutId);
  }
});

// poe.ninja icon source. Both economy families carry per-item icons, but in
// different places, so the family is passed in:
//   exchange -> top-level items[] { name, image: "/gen/image/..." (relative) }
//   stash    -> lines[] { name, icon: full web.poecdn.com url }
// Returns normalized { name, icon } pairs. Routed through main (CORS).
ipcMain.handle('poeninja:economy-icons', async (_event, family: 'exchange' | 'stash', league: string, type: string) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5_000);
  try {
    const base = family === 'exchange'
      ? 'https://poe.ninja/poe1/api/economy/exchange/current/overview'
      : 'https://poe.ninja/poe1/api/economy/stash/current/item/overview';
    const res = await fetch(
      `${base}?league=${encodeURIComponent(league)}&type=${encodeURIComponent(type)}`,
      { signal: controller.signal }
    );
    if (!res.ok) return { icons: null, slugs: [], names: [], error: `poe.ninja ${res.status}` };
    const data = await res.json() as {
      items?: { name?: string; image?: string | null }[];
      lines?: { id?: string; name?: string; baseType?: string; icon?: string }[];
    };
    const icons: { name: string; icon: string }[] = [];
    if (family === 'exchange') {
      for (const it of data.items ?? []) {
        if (it.name && it.image) {
          const icon = it.image.startsWith('http') ? it.image : `https://web.poecdn.com${it.image}`;
          icons.push({ name: it.name, icon });
        }
      }
    } else {
      for (const l of data.lines ?? []) {
        const name = l.name || l.baseType;
        if (name && l.icon) icons.push({ name, icon: l.icon });
      }
    }
    // Exchange lines[] provides ids/slugs, while items[] provides the actual
    // display names even when image is null (notably Divination Cards). Return
    // both: slugs are a compatibility fallback, but names are authoritative
    // because slug text is not always display-name congruent.
    const slugs = family === 'exchange'
      ? (data.lines ?? []).map((l) => l.id).filter((s): s is string => !!s)
      : [];
    const names = family === 'exchange'
      ? (data.items ?? []).map((it) => it.name).filter((s): s is string => !!s)
      : [];
    return { icons, slugs, names, error: null };
  } catch (err: any) {
    return { icons: null, slugs: [], names: [], error: err?.message ?? 'fetch failed' };
  } finally {
    clearTimeout(timeoutId);
  }
});

function createWindow(): void {
  rendererFlushUnavailable = false
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    title: 'WraeclastLedger',
    show: false, autoHideMenuBar: true,
    icon,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, webviewTag: true }
  });
  mainWindowRef = mainWindow;

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.on('close', (event) => {
    if (quitBypass) return
    event.preventDefault()
    void continueQuit('window-close', mainWindow)
  });
  mainWindow.on('session-end', () => { quitBypass = true });
  mainWindow.webContents.on('render-process-gone', () => {
    rendererFlushUnavailable = true
    for (const [requestId, resolve] of rendererFlushWaiters) {
      rendererFlushWaiters.delete(requestId)
      // Renderer crashes follow forced-loss semantics: the repository's last
      // acknowledged current/bak pair remains authoritative.
      resolve({ requestId, ok: true })
    }
  });
  mainWindow.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' }; });

  // Clipboard polling no longer auto-starts — the renderer drives it via
  // 'clipboard:set-watch' when the Capture toggle changes (WP13).
  watchWindow = mainWindow;

  mainWindow.on('closed', () => {
    setClipboardWatch(false);
    watchWindow = null;
    mainWindowRef = null;
  });

  ensureStatsLoaded().catch(() => {});

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  setupAutoUpdater(mainWindow);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = mainWindowRef;
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.wraeclastledger.app');
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
    createWindow();
    powerMonitor.on('suspend', () => sendOverlayAction({ type: 'timer-pause' }));
    powerMonitor.on('lock-screen', () => sendOverlayAction({ type: 'timer-pause' }));
    ipcMain.on('ping', () => console.log('pong'));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('before-quit', (event) => {
    stopProtonClipboardBridge()
    unregisterOverlayShortcuts()
    if (quitBypass) return
    const mainWindow = watchWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    event.preventDefault()
    void continueQuit('app-quit', mainWindow)
  });
}
