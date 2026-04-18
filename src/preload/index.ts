import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type TradeParams = {
  league:      string;
  minIIQ:      number;
  minPack:     number;
  minIIR:      number;
  minCurrency: number;
  minScarabs:  number;
  minMaps:     number;
  mapType:     'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
  empowered:   boolean;
  minDelirious:    number;
  deliRewardTypes: string[];
  brickExclusions: string[];
};

const api = {
  onClipboardCapture: (callback: (text: string) => void): void => {
    ipcRenderer.on('on-clipboard-capture', (_event, text) => callback(text))
  },
  removeClipboardListener: (): void => {
    ipcRenderer.removeAllListeners('on-clipboard-capture')
  },
  searchMapsOnTrade: (params: TradeParams): Promise<{ url: string | null; error: string | null }> =>
    ipcRenderer.invoke('trade:search-maps', params),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
