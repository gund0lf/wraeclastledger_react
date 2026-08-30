import { describe, expect, it } from 'vitest';
import {
  buildBrickModCatalogues,
  filterBrickModSelectOptions,
  prioritizeActiveFamilyOptions,
  selectedBrickIdsForContext,
  toggleBrickExclusion,
  toggleBrickSelectionState,
} from './brickModSelect';

const mods = [
  {
    id: 'brick_thorns_physical_regular',
    label: 'Physical Thorns',
    regexTerm: 'ting 800 p',
    affixLines: ['Rare Monsters have Physical Thorns reflecting 800 Physical Damage'],
    tradeTexts: ['Rare Monsters have Physical Thorns reflecting # Physical Damage'],
    category: 'regular',
    familyId: 'thorns',
    inclusionEligible: true,
  },
  {
    id: 'brick_thorns_elemental_regular',
    label: 'Elemental Thorns',
    regexTerm: 'ting 1500 e',
    affixLines: ['Rare Monsters have Elemental Thorns reflecting 1500 Elemental Damage'],
    tradeTexts: ['Rare Monsters have Elemental Thorns reflecting # Elemental Damage'],
    category: 'regular',
    familyId: 'thorns',
  },
  {
    id: 'brick_thorns_combined_nightmare',
    label: 'Thorns Reflection',
    regexTerm: 'ting 2500 e',
    affixLines: [
      'Rare Monsters have Physical Thorns reflecting 1500 Physical Damage',
      'Rare Monsters have Elemental Thorns reflecting 2500 Elemental Damage',
    ],
    tradeTexts: ['Rare Monsters have Elemental Thorns reflecting # Elemental Damage'],
    category: 'nightmare',
    familyId: 'thorns',
  },
  {
    id: 'uber_triple_curse_vuln_temporal_elem',
    label: 'Triple Curse (Vuln/Temporal/Elem)',
    regexTerm: 'oral',
    tradeTexts: ['Players are Cursed with Temporal Chains'],
    category: 'nightmare',
  },
] satisfies Parameters<typeof buildBrickModCatalogues>[0];

const catalogues = buildBrickModCatalogues(mods);

describe('brick modifier select presentation', () => {
  it('shows each leaf only in its native catalogue with value-aware wording', () => {
    expect(catalogues.regular.map((item) => item.value)).toEqual([
      'brick_thorns_physical_regular',
      'brick_thorns_elemental_regular',
    ]);
    expect(catalogues.nightmare.map((item) => item.value)).toEqual([
      'brick_thorns_combined_nightmare',
      'uber_triple_curse_vuln_temporal_elem',
    ]);
    expect(catalogues.regular[0]).toMatchObject({
      label: 'Physical Thorns',
      tradeLabel: 'Rare Monsters have Physical Thorns reflecting 800 Physical Damage',
      affixLines: ['Rare Monsters have Physical Thorns reflecting 800 Physical Damage'],
      shared: true,
    });
    expect(catalogues.nightmare[0].tradeLabel).toBe(
      'Rare Monsters have Physical Thorns reflecting 1500 Physical Damage · ' +
      'Rare Monsters have Elemental Thorns reflecting 2500 Elemental Damage',
    );
  });

  it('keeps every Regular and Nightmare checkbox semantically independent', () => {
    const physicalOnly = toggleBrickExclusion(
      mods,
      [],
      'brick_thorns_physical_regular',
    );
    expect(physicalOnly).toEqual([
      'brick:brick_thorns_physical_regular',
    ]);
    expect(selectedBrickIdsForContext(mods, physicalOnly, 'regular')).toEqual([
      'brick_thorns_physical_regular',
    ]);
    expect(selectedBrickIdsForContext(mods, physicalOnly, 'nightmare')).toEqual([]);

    const withoutPhysical = toggleBrickExclusion(
      mods,
      physicalOnly,
      'brick_thorns_physical_regular',
    );
    expect(withoutPhysical).toEqual([]);

    expect(toggleBrickExclusion(
      mods,
      [],
      'brick_thorns_combined_nightmare',
    )).toEqual(['brick:brick_thorns_combined_nightmare']);
  });

  it('pins every sibling while a family is active and restores canonical order when inactive', () => {
    const nightmare = [...catalogues.nightmare].reverse();
    expect(prioritizeActiveFamilyOptions(
      nightmare,
      mods,
      ['brick_thorns_physical_regular'],
    ).map((item) => item.value)).toEqual([
      'brick_thorns_combined_nightmare',
      'uber_triple_curse_vuln_temporal_elem',
    ]);
    expect(prioritizeActiveFamilyOptions(nightmare, mods, []).map((item) => item.value)).toEqual([
      'uber_triple_curse_vuln_temporal_elem',
      'brick_thorns_combined_nightmare',
    ]);
  });

  it('does not link Triple Curse to separate curse exclusions', () => {
    expect(toggleBrickExclusion(mods, [], 'uber_triple_curse_vuln_temporal_elem'))
      .toEqual(['brick:uber_triple_curse_vuln_temporal_elem']);
    expect(selectedBrickIdsForContext(mods, ['oral'], 'regular')).toEqual([]);
  });

  it('retains custom terms while one exact leaf is toggled', () => {
    expect(toggleBrickExclusion(
      mods,
      ['custom'],
      'brick_thorns_elemental_regular',
    )).toEqual(['custom', 'brick:brick_thorns_elemental_regular']);
  });

  it('enforces neutral/excluded/included as mutually exclusive states', () => {
    const id = 'brick_thorns_physical_regular';
    const included = toggleBrickSelectionState(mods, [], [], id, 'include');
    expect(included).toEqual({
      exclusions: [],
      inclusions: ['brick:brick_thorns_physical_regular'],
    });

    const switched = toggleBrickSelectionState(
      mods,
      included.exclusions,
      included.inclusions,
      id,
      'exclude',
    );
    expect(switched).toEqual({
      exclusions: ['brick:brick_thorns_physical_regular'],
      inclusions: [],
    });

    expect(toggleBrickSelectionState(
      mods,
      switched.exclusions,
      switched.inclusions,
      id,
      'exclude',
    )).toEqual({ exclusions: [], inclusions: [] });
  });

  it('keeps non-curated brick rows exclusion-only', () => {
    expect(toggleBrickSelectionState(
      mods,
      [],
      [],
      'uber_triple_curse_vuln_temporal_elem',
      'include',
    )).toEqual({ exclusions: [], inclusions: [] });
  });

  it('searches catalogue names and value-aware mod text', () => {
    expect(filterBrickModSelectOptions(catalogues.regular, '800 physical').map((item) => item.value))
      .toEqual(['brick_thorns_physical_regular']);
    expect(filterBrickModSelectOptions(catalogues.nightmare, '2500 elemental')
      .map((item) => item.value)).toEqual(['brick_thorns_combined_nightmare']);
    expect(filterBrickModSelectOptions(catalogues.nightmare, 'temporal chains').map((item) => item.value))
      .toEqual(['uber_triple_curse_vuln_temporal_elem']);
  });
});
