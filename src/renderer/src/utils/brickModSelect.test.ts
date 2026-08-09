import { describe, expect, it } from 'vitest';
import { buildBrickModSelectGroups, filterBrickModSelectOptions } from './brickModSelect';

const groups = buildBrickModSelectGroups([
  {
    id: 'thorns_reflection',
    label: 'Thorns Reflection (all tiers)',
    tradeTexts: [
      'Rare Monsters have Elemental Thorns reflecting # Elemental Damage',
      'Rare Monsters have Physical Thorns reflecting # Physical Damage',
    ],
    category: 'regular',
  },
  {
    id: 'reduced_max_res',
    label: 'Reduced Max Resistances',
    tradeTexts: ['Players have #% to all maximum Resistances'],
    category: 'nightmare',
  },
]);

describe('brick modifier select presentation', () => {
  it('keeps selected labels compact while preserving exact trade wording', () => {
    expect(groups[0].items[0]).toMatchObject({
      value: 'thorns_reflection',
      label: 'Thorns Reflection (all tiers)',
      tradeLabel: 'Rare Monsters have Elemental Thorns reflecting # Elemental Damage / Rare Monsters have Physical Thorns reflecting # Physical Damage',
    });
  });

  it('searches both catalogue names and exact trade text', () => {
    expect(filterBrickModSelectOptions(groups, 'physical thorns')[0].items.map((item) => item.value))
      .toEqual(['thorns_reflection']);
    expect(filterBrickModSelectOptions(groups, 'reduced max')[0].items.map((item) => item.value))
      .toEqual(['reduced_max_res']);
  });

  it('drops groups that have no matching options', () => {
    const filtered = filterBrickModSelectOptions(groups, 'elemental thorns');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].group).toBe('Regular / shared');
  });
});
