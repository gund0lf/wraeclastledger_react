import { describe, expect, it } from 'vitest';
import {
  DELIRIUM_COLUMN_MIN_WIDTH,
  formatDeliriumRewards,
  formatObservedDeliriumLine,
  parseObservedDeliriumLine,
  summarizeDeliriumRewards,
  summarizeObservedDelirium,
  useDedicatedDeliriumColumn,
} from './deliriumMetadata';

describe('Delirium reward display', () => {
  it('keeps first-appearance order while exposing repeated tracks', () => {
    const rewards = ['Jewellery', 'Jewellery', 'Armour', 'Armour', 'Currency'];
    expect(summarizeDeliriumRewards(rewards)).toEqual([
      { name: 'Jewellery', count: 2 },
      { name: 'Armour', count: 2 },
      { name: 'Currency', count: 1 },
    ]);
    expect(formatDeliriumRewards(rewards)).toBe('Jewellery ×2 · Armour ×2 · Currency');
  });

  it('ignores blank legacy values without mutating the input', () => {
    const rewards = ['Weapons', ' ', 'Unique Items'];
    expect(formatDeliriumRewards(rewards)).toBe('Weapons · Unique Items');
    expect(rewards).toEqual(['Weapons', ' ', 'Unique Items']);
  });

  it('formats absent metadata as an empty label', () => {
    expect(formatDeliriumRewards(undefined)).toBe('');
  });

  it('switches layout from the measured panel width', () => {
    expect(useDedicatedDeliriumColumn(0)).toBe(false);
    expect(useDedicatedDeliriumColumn(DELIRIUM_COLUMN_MIN_WIDTH - 1)).toBe(false);
    expect(useDedicatedDeliriumColumn(DELIRIUM_COLUMN_MIN_WIDTH)).toBe(true);
  });
});

describe('observed Delirium sharing', () => {
  it('summarizes explicit map observations without treating missing legacy data as zero', () => {
    const summary = summarizeObservedDelirium([
      { deliriousPct: 100, deliriumRewardTypes: ['Jewellery', 'Jewellery', 'Armour'] },
      { deliriousPct: 80, deliriumRewardTypes: ['Armour', 'Currency'] },
      {},
    ]);
    expect(summary).toEqual({
      sampleSize: 2,
      levelCounts: [
        { percentage: 80, count: 1 },
        { percentage: 100, count: 1 },
      ],
      rewardCounts: [
        { name: 'Jewellery', count: 2 },
        { name: 'Armour', count: 2 },
        { name: 'Currency', count: 1 },
      ],
    });
  });

  it('round-trips the readable aggregate with its partial sample disclosed', () => {
    const summary = summarizeObservedDelirium([
      { deliriousPct: 100, deliriumRewardTypes: ['Jewellery', 'Armour'] },
      { deliriousPct: 100, deliriumRewardTypes: ['Jewellery'] },
    ]);
    expect(summary).not.toBeNull();
    const line = formatObservedDeliriumLine(summary!, 3);
    expect(line).toBe(
      'Observed Delirium: 2/3 maps | Levels: 100%x2 | Rewards: Jewellery x2, Armour x1',
    );
    expect(parseObservedDeliriumLine(`**${line}**`, 3)).toEqual(summary);
  });

  it('rejects inconsistent counts and map totals', () => {
    expect(parseObservedDeliriumLine(
      'Observed Delirium: 2/3 maps | Levels: 100%x1 | Rewards: Armour x1',
      3,
    )).toBeNull();
    expect(parseObservedDeliriumLine(
      'Observed Delirium: 2/4 maps | Levels: 100%x2 | Rewards: None',
      3,
    )).toBeNull();
  });
});
