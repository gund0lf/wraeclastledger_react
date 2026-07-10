import { ElectronAPI } from '@electron-toolkit/preload'

type TradeParams = {
  league: string; minIIQ: number; minPack: number; minIIR: number;
  minCurrency: number; minScarabs: number; minMaps: number;
  minTier: number; corruptedFilter: 'any' | 'yes' | 'no';
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
      setClipboardWatch:   (on: boolean) => void
      searchMapsOnTrade:   (params: TradeParams) => Promise<{ url: string | null; error: string | null }>
      getBrickMods:        () => Promise<BrickMod[]>
      fetchCurrencyOverview: (league: string) => Promise<{ lines: { id: string; primaryValue?: number }[] | null; error: string | null }>
      fetchEconomyIcons: (family: 'exchange' | 'stash', league: string, type: string) => Promise<{ icons: { name: string; icon: string }[] | null; slugs: string[]; error: string | null }>
      fetchLeagueIndex: () => Promise<{ leagues: string[] | null; error: string | null }>
      readGameDataCache: () => Promise<{ manifest: unknown | null; error: string | null }>
      writeGameDataCache: (manifest: unknown) => Promise<{ ok: boolean; error: string | null }>
    }
  }
}
