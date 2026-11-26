export interface DeliriumRewardSummary {
  name: string;
  count: number;
}

export interface ObservedDeliriumSummary {
  sampleSize: number;
  levelCounts: Array<{ percentage: number; count: number }>;
  rewardCounts: DeliriumRewardSummary[];
}

export interface DeliriumMapObservation {
  deliriousPct?: number;
  deliriumRewardTypes?: readonly string[];
}

// Older readers store independent level and reward counts. A readable note
// preserves their association for mixed single-reward maps.
export function pairedDeliriumNote(maps: readonly DeliriumMapObservation[]): string | null {
  const pairs = new Map<string, number>();
  const types = new Set<string>();
  const levels = new Set<number>();
  for (const { deliriousPct, deliriumRewardTypes } of maps) {
    if (deliriousPct == null || !Number.isInteger(deliriousPct) || deliriousPct < 0 || deliriousPct > 100
      || deliriumRewardTypes?.length !== 1) continue;
    const type = deliriumRewardTypes[0].trim();
    if (!/^[A-Za-z][A-Za-z '’-]{0,59}$/.test(type)) continue;
    types.add(type);
    levels.add(deliriousPct);
    const key = `${deliriousPct}% ${type}`;
    pairs.set(key, (pairs.get(key) ?? 0) + 1);
  }
  if (types.size < 2 || levels.size < 2) return null;
  return 'Observed Delirium by reward: ' + [...pairs].map(([pair, count]) => `${pair} x${count}`).join(', ');
}

export function isPairedDeliriumNote(text: string): boolean {
  return /^Observed Delirium by reward: \d{1,3}% [A-Za-z '’-]+ x\d+(?:, \d{1,3}% [A-Za-z '’-]+ x\d+)*$/.test(text);
}

export const DELIRIUM_COLUMN_MIN_WIDTH = 1050;

/** The wide column is based on the actual Map Log panel, not the window. */
export function useDedicatedDeliriumColumn(panelWidth: number): boolean {
  return panelWidth >= DELIRIUM_COLUMN_MIN_WIDTH;
}

/**
 * Compact repeated Delirium reward tracks without losing their multiplicity.
 * Groups keep the order in which each reward first appeared in the clipboard.
 */
export function summarizeDeliriumRewards(
  rewards: readonly string[] | undefined,
): DeliriumRewardSummary[] {
  const result: DeliriumRewardSummary[] = [];
  const byName = new Map<string, DeliriumRewardSummary>();

  for (const rawReward of rewards ?? []) {
    const name = rawReward.trim();
    if (!name) continue;
    const existing = byName.get(name);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const summary = { name, count: 1 };
    byName.set(name, summary);
    result.push(summary);
  }

  return result;
}

export function formatDeliriumRewards(rewards: readonly string[] | undefined): string {
  return summarizeDeliriumRewards(rewards)
    .map(({ name, count }) => count > 1 ? `${name} ×${count}` : name)
    .join(' · ');
}

/** Aggregate only maps that carry an explicit clipboard Delirium level. */
export function summarizeObservedDelirium(
  maps: readonly DeliriumMapObservation[],
): ObservedDeliriumSummary | null {
  const levelCounts = new Map<number, number>();
  const rewardCounts = new Map<string, DeliriumRewardSummary>();
  const orderedRewards: DeliriumRewardSummary[] = [];
  let sampleSize = 0;

  for (const map of maps) {
    const percentage = map.deliriousPct;
    if (!Number.isInteger(percentage) || percentage! < 0 || percentage! > 100) continue;
    sampleSize += 1;
    levelCounts.set(percentage!, (levelCounts.get(percentage!) ?? 0) + 1);

    for (const rawReward of map.deliriumRewardTypes ?? []) {
      const name = rawReward.trim();
      if (!name) continue;
      const existing = rewardCounts.get(name);
      if (existing) {
        existing.count += 1;
      } else {
        const summary = { name, count: 1 };
        rewardCounts.set(name, summary);
        orderedRewards.push(summary);
      }
    }
  }

  if (sampleSize === 0) return null;
  return {
    sampleSize,
    levelCounts: [...levelCounts.entries()]
      .sort(([left], [right]) => left - right)
      .map(([percentage, count]) => ({ percentage, count })),
    rewardCounts: orderedRewards,
  };
}

/** Older share readers accept eleven exact percentages. Describe a wider
 * distribution in plain text so a range cannot be read as an exact level. */
export function isGroupedDeliriumNote(text: string): boolean {
  return /^Delirium distribution \(\d+\/\d+ maps\): (?:\d+(?:-\d+)?% x\d+(?:, |\. Reward tracks: ))+(?:none|[^|\n]+ x\d+)\.$/.test(text);
}

export function groupedDeliriumNote(summary: ObservedDeliriumSummary, mapCount: number): string {
  const bands = new Map<number, number>();
  for (const { percentage, count } of summary.levelCounts) {
    const lower = Math.floor(percentage / 10) * 10;
    bands.set(lower, (bands.get(lower) ?? 0) + count);
  }
  const levels = [...bands].map(([lower, count]) =>
    (lower === 100 ? '100' : lower + '-' + (lower + 9)) + '% x' + count);
  const rewards = summary.rewardCounts.map(({ name, count }) => name + ' x' + count);
  return 'Delirium distribution (' + summary.sampleSize + '/' + mapCount + ' maps): '
    + levels.join(', ') + '. Reward tracks: ' + (rewards.join(', ') || 'none') + '.';
}

export function formatObservedDeliriumLine(
  summary: ObservedDeliriumSummary,
  mapCount: number,
): string {
  const levels = summary.levelCounts
    .map(({ percentage, count }) => `${percentage}%x${count}`)
    .join(', ');
  const rewards = summary.rewardCounts.length > 0
    ? summary.rewardCounts.map(({ name, count }) => `${name} x${count}`).join(', ')
    : 'None';
  return `Observed Delirium: ${summary.sampleSize}/${mapCount} maps | Levels: ${levels} | Rewards: ${rewards}`;
}

/** Parse the bounded readable aggregate used by Discord cards and raw_export. */
export function parseObservedDeliriumLine(
  raw: string,
  expectedMapCount?: number,
): ObservedDeliriumSummary | null {
  const normalized = raw.replace(/\*\*/g, '');
  const match = normalized.match(
    /^\s*Observed Delirium:\s*(\d+)\s*\/\s*(\d+)\s+maps\s*\|\s*Levels:\s*([^|]+?)\s*\|\s*Rewards:\s*([^\r\n]+?)\s*$/im,
  );
  if (!match) return null;

  const sampleSize = Number.parseInt(match[1], 10);
  const mapCount = Number.parseInt(match[2], 10);
  if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > mapCount
    || mapCount < 1 || mapCount > 100_000
    || (expectedMapCount != null && mapCount !== expectedMapCount)) return null;

  const levelParts = match[3].split(',').map((part) => part.trim()).filter(Boolean);
  if (levelParts.length < 1 || levelParts.length > 11) return null;
  const levelCounts: ObservedDeliriumSummary['levelCounts'] = [];
  const seenLevels = new Set<number>();
  for (const part of levelParts) {
    const level = part.match(/^(\d{1,3})%x(\d+)$/);
    if (!level) return null;
    const percentage = Number.parseInt(level[1], 10);
    const count = Number.parseInt(level[2], 10);
    if (percentage < 0 || percentage > 100 || count < 1 || count > sampleSize
      || seenLevels.has(percentage)) return null;
    seenLevels.add(percentage);
    levelCounts.push({ percentage, count });
  }
  if (levelCounts.reduce((sum, level) => sum + level.count, 0) !== sampleSize) return null;
  levelCounts.sort((left, right) => left.percentage - right.percentage);

  const rewardCounts: DeliriumRewardSummary[] = [];
  if (match[4].trim().toLowerCase() !== 'none') {
    const rewardParts = match[4].split(',').map((part) => part.trim()).filter(Boolean);
    if (rewardParts.length < 1 || rewardParts.length > 16) return null;
    const seenRewards = new Set<string>();
    for (const part of rewardParts) {
      const reward = part.match(/^(.+?)\s+x(\d+)$/);
      if (!reward) return null;
      const name = reward[1].trim();
      const count = Number.parseInt(reward[2], 10);
      const key = name.toLowerCase();
      if (!name || name.length > 64 || count < 1 || count > sampleSize * 10
        || seenRewards.has(key)) return null;
      seenRewards.add(key);
      rewardCounts.push({ name, count });
    }
  }

  return { sampleSize, levelCounts, rewardCounts };
}
