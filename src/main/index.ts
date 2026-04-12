import { app, shell, BrowserWindow, ipcMain, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { autoUpdater } from 'electron-updater'

let clipboardInterval: NodeJS.Timeout | null = null;
let lastClipboardText = '';

function setupAutoUpdater(mainWindow: BrowserWindow): void {
  if (is.dev) return;
  autoUpdater.autoDownload         = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available',  (info) => mainWindow.webContents.send('update-available', info.version));
  autoUpdater.on('update-downloaded', ()     => mainWindow.webContents.send('update-downloaded'));
  autoUpdater.on('error', (err) => console.error('[Updater]', err?.message ?? err));
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 2 * 60 * 60 * 1000);
}

ipcMain.on('install-update', () => autoUpdater.quitAndInstall(false, true));

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    show: false, autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,  // required for AtlasTreeModule <webview>
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  clipboardInterval = setInterval(() => {
    if (mainWindow.isDestroyed()) return;
    const text = clipboard.readText();
    if (text !== lastClipboardText) {
      lastClipboardText = text;
      mainWindow.webContents.send('on-clipboard-capture', text);
    }
  }, 200);

  mainWindow.on('closed', () => {
    if (clipboardInterval) { clearInterval(clipboardInterval); clipboardInterval = null; }
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  setupAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron');
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  ipcMain.on('ping', () => console.log('pong'));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
