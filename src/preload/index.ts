import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AtlasStatsReadResult } from '../shared/atlasStats'

type TradeParams = {
  league: string; minIIQ: number; minPack: number; minIIR: number;
  minCurrency: number; minScarabs: number; minMaps: number;
  minTier: number; corruptedFilter: 'any' | 'yes' | 'no';
  mapType: 'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
  empowered: boolean; minDelirious: number;
  deliRewardTypes: string[]; brickExclusions: string[];
};

type BrickMod = { id: string; label: string; regexTerm: string; category: 'regular' | 'nightmare' };
type UnavailableBrickMod = { id: string; label: string; expectedCount: number; actualCount: number };
type BrickModResult = { mods: BrickMod[]; unavailable: UnavailableBrickMod[]; error: string | null };

const api = {
  onClipboardCapture: (callback: (text: string) => void): void => {
    ipcRenderer.on('on-clipboard-capture', (_event, text) => callback(text))
  },
  removeClipboardListener: (): void => { ipcRenderer.removeAllListeners('on-clipboard-capture') },
  // WP13: renderer drives the main-process clipboard polling lifecycle.
  setClipboardWatch: (on: boolean): void => { ipcRenderer.send('clipboard:set-watch', on) },
  searchMapsOnTrade: (params: TradeParams): Promise<{ url: string | null; error: string | null }> =>
    ipcRenderer.invoke('trade:search-maps', params),
  getBrickMods: (): Promise<BrickModResult> => ipcRenderer.invoke('trade:get-brick-mods'),
  fetchCurrencyOverview: (league: string): Promise<{ lines: { id: string; primaryValue?: number }[] | null; error: string | null }> =>
    ipcRenderer.invoke('poeninja:currency-overview', league),
  fetchEconomyIcons: (family: 'exchange' | 'stash', league: string, type: string): Promise<{ icons: { name: string; icon: string }[] | null; slugs: string[]; names: string[]; error: string | null }> =>
    ipcRenderer.invoke('poeninja:economy-icons', family, league, type),
  // League-override dropdown data (league.ts fetchSelectableLeagues).
  fetchLeagueIndex: (): Promise<{ leagues: string[] | null; error: string | null }> =>
    ipcRenderer.invoke('poeninja:league-index'),
  // Game-data manifest disk cache (utils/gameData.ts loader, rollover step 2).
  readGameDataCache: (): Promise<{ manifest: unknown | null; error: string | null }> =>
    ipcRenderer.invoke('gamedata:read-cache'),
  writeGameDataCache: (manifest: unknown): Promise<{ ok: boolean; error: string | null }> =>
    ipcRenderer.invoke('gamedata:write-cache', manifest),
  fetchGameDataLatest: (baseUrl: string): Promise<{ payload: { revision: number; manifest: unknown } | null; error: string | null }> =>
    ipcRenderer.invoke('gamedata:fetch-latest', baseUrl),
  readAtlasTreeStats: (url: string): Promise<AtlasStatsReadResult> =>
    ipcRenderer.invoke('atlas-tree:read-stats', url),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) { console.error(error) }
} else {
  // @ts-ignore -- non-isolated fallback: window typing doesn't know these globals
  window.electron = electronAPI
  // @ts-ignore -- same as above
  window.api = api
}
