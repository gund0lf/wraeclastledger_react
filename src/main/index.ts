import { app, shell, BrowserWindow, ipcMain, clipboard } from 'electron'
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
  buildDeliriumTradeStatFilter,
  SPECIAL_MAP_STAT_TEXT,
  resolveEightModSpecialStatIds,
  resolveSpecialMapTradeStats,
} from '../shared/tradeMapFilters'

// The installed build and `npm run dev` used to share one Chromium profile.
// Their file:// and localhost origins could then touch the same LevelDB while
// both processes were running. Isolate development before Chromium storage is
// initialised; ProcessSingleton is scoped to this userData directory, so each
// profile permits one writer while dev and installed builds may coexist.
app.setPath('userData', resolveUserDataPath(app.getPath('userData'), is.dev));
const hasSingleInstanceLock = app.requestSingleInstanceLock({
  profile: is.dev ? 'development' : 'installed',
});

let clipboardInterval: NodeJS.Timeout | null = null;
let lastClipboardText = '';
let watchWindow: BrowserWindow | null = null;

// ── WP13: clipboard polling lifecycle ────────────────────────────────────────
// Polling only runs while the renderer's Capture toggle is ON (previously it
// ran every 200ms forever and the renderer filtered by isWatching). Turning
// Capture ON primes the current clipboard as the baseline without emitting it:
// stale map text must not populate a freshly cleared log. Copying the SAME map
// twice in a row while watching still yields identical text and is skipped —
// the manual Paste button remains the explicit answer for that case.
function setClipboardWatch(on: boolean): void {
  if (on) {
    if (clipboardInterval) return; // already polling
    lastClipboardText = clipboard.readText();
    clipboardInterval = setInterval(() => {
      const win = watchWindow;
      if (!win || win.isDestroyed()) return;
      const text = clipboard.readText();
      if (text !== lastClipboardText) {
        lastClipboardText = text;
        win.webContents.send('on-clipboard-capture', text);
      }
    }, 200);
  } else if (clipboardInterval) {
    clearInterval(clipboardInterval);
    clipboardInterval = null;
  }
}

ipcMain.on('clipboard:set-watch', (_event, on: boolean) => setClipboardWatch(!!on));

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

ipcMain.on('install-update', () => autoUpdater.quitAndInstall(false, true));
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
      const allEntries = data.result.flatMap((group) => group.entries);
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
  if ((mapType === 'originator' || mapType === 'nightmare') && !originatorStatId) {
    return {
      url: null,
      error: `Special-map exclusion unavailable: ${SPECIAL_MAP_STAT_TEXT.originator}`,
    };
  }

  if (mapType === 'originator')
    statsArray.push({ type: 'and', filters: [{ id: originatorStatId! }] });

  if (empowered && STATS_CACHE.has('empowered'))
    statsArray.push({ type: 'and', filters: [{ id: STATS_CACHE.get('empowered')! }] });

  if (mapType === 'nightmare')
    statsArray.push({ type: 'not', filters: [{ id: originatorStatId! }] });

  if (mapType === '8mod') {
    const specialMapStats = resolveEightModSpecialStatIds(SPECIAL_MAP_STAT_IDS);
    if (specialMapStats.missing.length > 0) {
      return {
        url: null,
        error: `8-mod special-map exclusions unavailable: ${specialMapStats.missing
          .map((key) => SPECIAL_MAP_STAT_TEXT[key])
          .join(', ')}`,
      };
    }
    statsArray.push({
      type: 'not',
      filters: specialMapStats.ids.map((id) => ({ id })),
    });
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

  const query = {
    query: {
      // 'securable' = Instant Buyout only (PoB source: LISTED_STATUS_OPTIONS)
      // 'available' = Instant Buyout & In Person (broader — was incorrectly used before)
      status: { option: 'securable' },
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
// NOT localStorage (its budget is already strained by saved sessions).
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
  const mainWindow = new BrowserWindow({
    width: 1280, height: 800,
    title: 'WraeclastLedger',
    show: false, autoHideMenuBar: true,
    icon,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, webviewTag: true }
  });

  mainWindow.on('ready-to-show', () => mainWindow.show());
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler((details) => { shell.openExternal(details.url); return { action: 'deny' }; });

  // Clipboard polling no longer auto-starts — the renderer drives it via
  // 'clipboard:set-watch' when the Capture toggle changes (WP13).
  watchWindow = mainWindow;

  mainWindow.on('closed', () => { setClipboardWatch(false); watchWindow = null; });

  ensureStatsLoaded().catch(() => {});

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'));

  setupAutoUpdater(mainWindow);
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.wraeclastledger.app');
    app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window));
    createWindow();
    ipcMain.on('ping', () => console.log('pong'));
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
