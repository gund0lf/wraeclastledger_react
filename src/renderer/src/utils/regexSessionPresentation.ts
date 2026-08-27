export interface RegexSessionAverages {
  avgQuant: number;
  avgRarity: number;
  avgPack: number;
  avgCurr: number;
}

export function formatRegexAverageSummary(averages: RegexSessionAverages): string {
  const parts = [
    `${averages.avgQuant.toFixed(0)}%Q`,
    `${averages.avgRarity.toFixed(0)}%R`,
    `${averages.avgPack.toFixed(0)}%P`,
  ];

  if (averages.avgCurr > 0) {
    parts.push(`${averages.avgCurr.toFixed(0)}% Curr`);
  }

  return parts.join(' · ');
}
