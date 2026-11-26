export interface RegexSessionAverages {
  avgQuant: number;
  avgRarity: number;
  avgPack: number;
  avgCurr: number;
  avgScarabs?: number;
  atlasDrops?: boolean;
  avgThreads?: number;
}

export function formatRegexAverageSummary(averages: RegexSessionAverages): string {
  const avgScarabs = averages.avgScarabs ?? 0;
  const parts = [
    `${averages.avgQuant.toFixed(0)}%${averages.atlasDrops ? ' Atlas Drops' : 'Q'}`,
    `${averages.avgRarity.toFixed(0)}%R`,
    `${averages.avgPack.toFixed(0)}%P`,
  ];

  if (averages.avgCurr > 0) {
    parts.push(`${averages.avgCurr.toFixed(0)}% Curr`);
  }
  if (averages.atlasDrops && averages.avgThreads !== undefined) {
    parts.push(`${averages.avgThreads.toFixed(0)}% More Threads`);
  }
  if (!averages.atlasDrops && avgScarabs > 0) {
    parts.push(`${avgScarabs.toFixed(0)}% Scarabs`);
  }

  return parts.join(' · ');
}

export interface RegexSlamMapState {
  isCorrupted: boolean;
  isNightmare: boolean;
}

export function isSlamUnavailableForSession(maps: RegexSlamMapState[]): boolean {
  return maps.length > 0 && maps.every((map) => map.isCorrupted || map.isNightmare);
}
