import { describe, it, expect } from 'vitest';
import { categorise, buildCategoryBreakdown } from './lootCategories';

// The categorise rules cascade in order — first rule that matches wins.
// Tests reflect that ordering: anything with a tab hint short-circuits the
// regex rules; otherwise name-based regex rules apply in declaration order.

describe('categorise — by tab hint', () => {
  // The five tab-typed rules at the top of RULES win immediately when set.
  it('routes to Currency when tab is "curr"', () => {
    expect(categorise('Whatever', 'curr')).toBe('Currency');
  });
  it('routes to Essences when tab is "ess"', () => {
    expect(categorise('Whatever', 'ess')).toBe('Essences');
  });
  it('routes to Oils when tab is "oil"', () => {
    expect(categorise('Whatever', 'oil')).toBe('Oils');
  });
  it('routes to Incubators when tab is "inc"', () => {
    expect(categorise('Whatever', 'inc')).toBe('Incubators');
  });
  it('routes to Divination Cards when tab is "card"', () => {
    expect(categorise('Whatever', 'card')).toBe('Divination Cards');
  });
  it('routes to Gems when tab is "gem"', () => {
    expect(categorise('Whatever', 'gem')).toBe('Gems');
  });
  it('routes to Maps when tab is "map"', () => {
    expect(categorise('Whatever', 'map')).toBe('Maps');
  });
});

describe('categorise — by name regex', () => {
  it('catches scarabs by name', () => {
    expect(categorise('Delirium Scarab of Mania', '')).toBe('Scarabs');
    expect(categorise('Horned Scarab of Awakening', '')).toBe('Scarabs');
  });

  it('catches delirium orbs as Deliriums (specific) before Currency or Other', () => {
    // The /delirium orb/i rule sits before /chisel|orb|.../ so it wins.
    expect(categorise("Armoursmith's Delirium Orb", '')).toBe('Deliriums');
  });

  it('catches essences by name when tab is unset', () => {
    expect(categorise('Deafening Essence of Greed', '')).toBe('Essences');
  });

  it('catches fragments and splinters', () => {
    expect(categorise('Splinter of Esh', '')).toBe('Fragments');
    expect(categorise("Maven's Writ", '')).toBe('Other');
    expect(categorise('Fragment of Knowledge', '')).toBe('Fragments');
    expect(categorise('Timeless Templar Emblem', '')).toBe('Fragments');
    expect(categorise('Sacred Vessel', '')).toBe('Fragments');
  });

  it('catches common currency by name', () => {
    expect(categorise('Divine Orb', '')).toBe('Currency');
    expect(categorise('Chaos Orb', '')).toBe('Currency');
    expect(categorise('Exalted Orb', '')).toBe('Currency');
    expect(categorise('Orb of Scouring', '')).toBe('Currency');
    expect(categorise('Cartographers Chisel', '')).toBe('Currency');
  });

  it('catches league-specific items', () => {
    expect(categorise('Sacred Crystallised Lifeforce', '')).toBe('Other');
    expect(categorise('Allflame Ember of Rebirth', '')).toBe('League');
    expect(categorise('Omen of Reinforcement', '')).toBe('League');
    expect(categorise("Ancient Wombgift", '')).toBe('League');
  });

  it('catches fossils and resonators as League', () => {
    expect(categorise('Pristine Fossil', '')).toBe('League');
    expect(categorise('Powerful Chaotic Resonator', '')).toBe('League');
  });

  it('catches gems with specific suffixes', () => {
    // "Lifetap Support" — matches /support$/i
    expect(categorise('Lifetap Support', '')).toBe('Gems');
    // "Vaal Burning Arrow" — matches /vaal /
    expect(categorise('Vaal Burning Arrow', '')).toBe('Gems');
    // "Awakened Cast On Critical Strike Support" — matches /awakened /
    expect(categorise('Awakened Cast On Critical Strike Support', '')).toBe('Gems');
  });

  it('catches plain Map items by suffix', () => {
    // /map$/i — anything ending in "Map" without tab hint
    expect(categorise('Atoll Map', '')).toBe('Maps');
  });

  it('falls back to Other when nothing matches', () => {
    expect(categorise('Astral Plate', '')).toBe('Other');
    expect(categorise("Inpulsa's Broken Heart", '')).toBe('Other');
  });
});

describe('categorise — rule ordering', () => {
  it('tab hint wins over name pattern', () => {
    // Name "Divine Orb" would match Currency by regex, but tab='card' wins first.
    expect(categorise('Divine Orb', 'card')).toBe('Divination Cards');
  });

  it('scarab regex wins over generic Currency regex', () => {
    // /scarab/i is declared before /chisel|orb|chaos|.../i, so a scarab name
    // doesn't get pulled into Currency by accident.
    expect(categorise('Sulphite Scarab', '')).toBe('Scarabs');
  });

  it('delirium orb wins over generic orb pattern', () => {
    // /delirium orb/i is before /chisel|orb|.../
    expect(categorise("Diviner's Delirium Orb", '')).toBe('Deliriums');
  });

  it('fossil wins over Currency even though fossil contains no currency keyword', () => {
    // Defensive — guards against someone reordering rules and putting Currency first
    expect(categorise('Encrusted Fossil', '')).toBe('League');
  });
});

// ─── buildCategoryBreakdown ───────────────────────────────────────────────────
describe('buildCategoryBreakdown', () => {
  it('sums totals per category', () => {
    const items = [
      { name: 'Divine Orb',       tab: '', total: 100, excluded: false },
      { name: 'Chaos Orb',        tab: '', total:  20, excluded: false },
      { name: 'Splinter of Esh',  tab: '', total:  15, excluded: false },
    ];
    const breakdown = buildCategoryBreakdown(items);
    expect(breakdown.get('Currency')).toBe(120);
    expect(breakdown.get('Fragments')).toBe(15);
  });

  it('skips excluded items', () => {
    const items = [
      { name: 'Divine Orb', tab: '', total: 100, excluded: false },
      { name: 'Divine Orb', tab: '', total:  50, excluded: true  }, // dropped
    ];
    const breakdown = buildCategoryBreakdown(items);
    expect(breakdown.get('Currency')).toBe(100);
  });

  it('returns an empty map for an empty input', () => {
    expect(buildCategoryBreakdown([]).size).toBe(0);
  });

  it('lumps unmatched items under Other', () => {
    const items = [
      { name: 'Astral Plate',          tab: '', total: 50, excluded: false },
      { name: "Inpulsa's Broken Heart", tab: '', total: 200, excluded: false },
    ];
    const breakdown = buildCategoryBreakdown(items);
    expect(breakdown.get('Other')).toBe(250);
  });
});
