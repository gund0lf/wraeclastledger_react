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

ipcMain.on('install-update', () => autoUpdater.quitAndInstall(false, true));
ipcMain.on('check-for-updates', () => {
  if (is.dev) return;
  autoUpdater.checkForUpdates().catch(() => {});
});

// ── PoE Trade stat ID cache ───────────────────────────────────────────────────
// Fetched once from PoE stats API and cached for the session.
const STATS_CACHE = new Map<string, string>();
let statsFetchPromise: Promise<void> | null = null;

// Well-known pseudo stat IDs — stable across patches.
const PSEUDO_IDS: Record<string, string> = {
  currency: 'pseudo.pseudo_map_more_currency_drops',
  scarabs:  'pseudo.pseudo_map_more_scarab_drops',
  maps:     'pseudo.pseudo_map_more_map_drops',
};

// Text substrings to match in the PoE stats API.
// Keys prefixed with 'enchant:' only match within enchant groups.
const STAT_LOOKUPS: Record<string, string> = {
  originator:          "Originator's Memories",
  empowered:           'Empowered Mirage which covers the entire Map',
  // Delirium — all enchants
  delirious_pct:       'enchant:Players in Area are #% Delirious',
  deli_currency:       'enchant:Delirium Reward Type: Currency',
  deli_scarabs:        'enchant:Delirium Reward Type: Scarabs',
  deli_fragments:      'enchant:Delirium Reward Type: Fragments',
  deli_divcards:       'enchant:Delirium Reward Type: Divination Cards',
  deli_maps:           'enchant:Delirium Reward Type: Map Items',
  deli_essences:       'enchant:Delirium Reward Type: Essences',
  deli_unique:         'enchant:Delirium Reward Type: Unique Items',
  deli_expedition:     'enchant:Delirium Reward Type: Expedition Items',
  deli_breach:         'enchant:Delirium Reward Type: Breach Items',
  deli_delirium:       'enchant:Delirium Reward Type: Delirium',
  deli_blight:         'enchant:Delirium Reward Type: Blight Items',
  deli_abyss:          'enchant:Delirium Reward Type: Abyss Items',
  deli_gems:           'enchant:Delirium Reward Type: Gems',
  deli_fossils:        'enchant:Delirium Reward Type: Fossils',
  deli_armour:         'enchant:Delirium Reward Type: Armour',
  deli_weapons:        'enchant:Delirium Reward Type: Weapons',
  deli_jewellery:      'enchant:Delirium Reward Type: Jewellery',
  deli_incubators:     'enchant:Delirium Reward Type: Incubators',
  deli_labyrinth:      'enchant:Delirium Reward Type: Labyrinth Items',
  deli_catalysts:      'enchant:Delirium Reward Type: Catalysts',
  deli_talismans:      'enchant:Delirium Reward Type: Talismans',
};

async function ensureStatsLoaded(): Promise<void> {
  if (STATS_CACHE.size > 0) return;
  if (statsFetchPromise) return statsFetchPromise;
  statsFetchPromise = (async () => {
    try {
      const res = await fetch('https://www.pathofexile.com/api/trade/data/stats', {
        headers: { 'User-Agent': 'WraeclastLedger/1.0 (github.com/gund0lf/wraeclastledger_react)' },
      });
      if (!res.ok) return;
      const data = await res.json() as { result: { id: string; entries: { id: string; text: string }[] }[] };
      for (const group of data.result) {
        // Skip PoE2-specific groups to avoid picking up duplicate stat IDs
        if (group.id.includes('2')) continue;
        for (const entry of group.entries) {
          for (const [key, rawNeedle] of Object.entries(STAT_LOOKUPS)) {
            if (STATS_CACHE.has(key)) continue; // first match wins
            const enchantOnly = rawNeedle.startsWith('enchant:');
            const needle = enchantOnly ? rawNeedle.slice(8) : rawNeedle;
            if (enchantOnly && group.id !== 'enchant') continue;
            if (entry.text.includes(needle)) {
              STATS_CACHE.set(key, entry.id);
            }
          }
        }
      }
    } catch { /* silently fail */ }
  })();
  return statsFetchPromise;
}

// ── Trade params ──────────────────────────────────────────────────────────────
// mapType:
//   'regular'    — non-corrupted, no uber mods expected, no originator implicit
//   '8mod'       — corrupted=yes, still regular mod pool (not uber)
//   'nightmare'  — has uber pseudo stats (currency/scarabs/maps > 0), NOT originator
//   'originator' — has originator implicit stat
// empowered: adds the Empowered Mirage enchant stat regardless of mapType
interface TradeParams {
  league:      string;
  minIIQ:      number;
  minPack:     number;
  minIIR:      number;
  minCurrency: number;
  minScarabs:  number;
  minMaps:     number;
  mapType:     'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
  empowered:   boolean;
  minDelirious:    number;       // 0 = any, 20/40/60/80/100
  deliRewardTypes: string[];    // cache keys like 'deli_currency', 'deli_scarabs' etc
  brickExclusions: string[];
}

ipcMain.handle('trade:search-maps', async (_event, params: TradeParams) => {
  await ensureStatsLoaded();

  const { league, minIIQ, minPack, minIIR, minCurrency, minScarabs, minMaps,
          mapType, empowered, minDelirious, deliRewardTypes, brickExclusions } = params;

  // ── Corrupted filter ───────────────────────────────────────────────────────
  let corruptedOption: string | null = null;
  if (mapType === '8mod')    corruptedOption = 'true';
  if (mapType === 'regular') corruptedOption = 'false';
  // nightmare/originator/any: don't filter by corrupted

  // ── Map filters ────────────────────────────────────────────────────────────
  const mapFilters: Record<string, { min?: number }> = {};
  if (minIIQ  > 0) mapFilters['map_iiq']     = { min: minIIQ };
  if (minPack > 0) mapFilters['map_packsize'] = { min: minPack };
  if (minIIR  > 0) mapFilters['map_iir']      = { min: minIIR };

  // ── Stat filters ───────────────────────────────────────────────────────────
  const statsArray: unknown[] = [];

  // AND group: pseudo stats (currency, scarabs, maps)
  // For nightmare these serve double duty — they identify uber mod maps AND filter quality.
  // For regular/8mod these should be 0 (set to 0 in UI since regular maps have no uber pseudo stats).
  const pseudoFilters: { id: string; value: { min: number } }[] = [];
  if (minCurrency > 0) pseudoFilters.push({ id: PSEUDO_IDS.currency, value: { min: minCurrency } });
  if (minScarabs  > 0) pseudoFilters.push({ id: PSEUDO_IDS.scarabs,  value: { min: minScarabs  } });
  if (minMaps     > 0) pseudoFilters.push({ id: PSEUDO_IDS.maps,     value: { min: minMaps     } });
  if (pseudoFilters.length > 0) statsArray.push({ type: 'and', filters: pseudoFilters });

  // AND group: originator implicit (for originator type)
  if (mapType === 'originator' && STATS_CACHE.has('originator')) {
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('originator')! }] });
  }

  // AND group: empowered mirage enchant (toggle, applies to any mapType)
  if (empowered && STATS_CACHE.has('empowered')) {
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('empowered')! }] });
  }

  // NOT group: nightmare → exclude originator implicit so only nightmare (non-originator) maps show
  if (mapType === 'nightmare' && STATS_CACHE.has('originator')) {
    statsArray.push({ type: 'not', filters: [{ id: STATS_CACHE.get('originator')! }] });
  }

  // AND group: delirium percentage min
  if (minDelirious > 0 && STATS_CACHE.has('delirious_pct')) {
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('delirious_pct')!, value: { min: minDelirious } }] });
  }

  // OR group: delirium reward types — map needs ANY one of the selected types
  if (deliRewardTypes.length > 0) {
    const resolvedIds = deliRewardTypes
      .map((key) => STATS_CACHE.get(key))
      .filter((id): id is string => !!id)
      .map((id) => ({ id }));
    if (resolvedIds.length > 0) {
      statsArray.push({ type: 'if', filters: resolvedIds });
    }
  }

  // NOT group: brick exclusions (stat IDs passed directly from renderer)
  if (brickExclusions.length > 0) {
    statsArray.push({ type: 'not', filters: brickExclusions.map((id) => ({ id })) });
  }

  const query = {
    query: {
      status: { option: 'any' },
      filters: {
        type_filters: {
          filters: {
            category: { option: 'map' },
            rarity:   { option: 'nonunique' },
          },
        },
        map_filters: { filters: mapFilters },
        ...(corruptedOption ? {
          misc_filters: { filters: { corrupted: { option: corruptedOption } } },
        } : {}),
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
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'WraeclastLedger/1.0 (github.com/gund0lf/wraeclastledger_react)',
        },
        body: JSON.stringify(query),
      }
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Trade API ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json() as { id?: string };
    if (!data.id) throw new Error('No search ID in response');
    return {
      url: `https://www.pathofexile.com/trade/search/${encodeURIComponent(league)}/${data.id}`,
      error: null,
    };
  } catch (err: any) {
    return { url: null, error: err.message ?? 'Unknown error' };
  }
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    title: 'WraeclastLedger',
    show: false, autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
    }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
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

  // Pre-warm the stats cache so trade searches are instant
  ensureStatsLoaded().catch(() => {});

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  setupAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.wraeclastledger.app');
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
  createWindow();
  ipcMain.on('ping', () => console.log('pong'));
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
