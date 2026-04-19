import { ElectronAPI } from '@electron-toolkit/preload'

type TradeParams = {
  league: string; minIIQ: number; minPack: number; minIIR: number;
  minCurrency: number; minScarabs: number; minMaps: number;
  mapType: 'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
  empowered: boolean; minDelirious: number;
  deliRewardTypes: string[]; brickExclusions: string[];
};

type BrickMod = { label: string; statId: string; regexTerm: string; category: 'regular' | 'nightmare' };

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      onClipboardCapture:  (callback: (text: string) => void) => void
      removeClipboardListener: () => void
      searchMapsOnTrade:   (params: TradeParams) => Promise<{ url: string | null; error: string | null }>
      getBrickMods:        () => Promise<BrickMod[]>
    }
  }
}
