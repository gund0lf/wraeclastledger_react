import { describe, it, expect } from 'vitest';
import {
  assignLootCategories, categorise, buildCategoryBreakdown, lootCategoryLabel,
} from './lootCategories';

// The categorise rules cascade in order — first rule that matches wins.
// WealthyExile's Tab value is provenance only. Name-based fallback rules apply
// in declaration order when an exact economy-catalog identity is unavailable.

describe('loot category presentation', () => {
  it('shortens the accessory bucket without changing its stored category key', () => {
    expect(lootCategoryLabel('Unique Accessories')).toBe('Unique Jewellery');
    expect(lootCategoryLabel('Unique Jewels')).toBe('Unique Jewels');
  });
});

describe('categorise — stash tab provenance', () => {
  it('never treats user-named stash tabs as item taxonomy', () => {
    for (const tab of ['curr', 'ess', 'oil', 'inc', 'card', 'gem', 'map']) {
      expect(categorise('Whatever', tab)).toBe('Other');
    }
  });

  it('uses the item name even when the stash tab suggests another category', () => {
    expect(categorise('Divine Orb', 'card')).toBe('Currency');
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
    expect(categorise('Vial of Sacrifice', '')).toBe('Fragments');
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
    expect(categorise('Templar Astrolabe', '')).toBe('League');
    expect(categorise('Allflame Ember of Rebirth', '')).toBe('League');
    expect(categorise('Omen of Reinforcement', '')).toBe('League');
    expect(categorise('Journey Tattoo of the Body', '')).toBe('League');
    expect(categorise('Broken Circle Artifact', '')).toBe('League');
    expect(categorise("Ancient Wombgift", '')).toBe('League');
    expect(categorise("Brinehook's Ducat", '')).toBe('League');
    expect(categorise('Imperial Enshrouding Crystal', '')).toBe('League');
  });

  it('catches only the current exact valuable-beast shortlist', () => {
    expect(categorise('Black Mórrigan', '9')).toBe('Beasts');
    expect(categorise('Craicic Croaker', '9')).toBe('Beasts');
    expect(categorise('Craicic Croaker Replica', '9')).toBe('Other');
    expect(categorise('Craicic Maw', '9')).toBe('Other');
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
    // poe.ninja's UniqueTincture names omit the type (for example Mightblood
    // Ire), so no name-only rule can prove a narrower category. Artwork still
    // resolves exactly from the bounded identity feed.
    expect(categorise('Mightblood Ire', '')).toBe('Other');
  });
});

describe('categorise — rule ordering', () => {
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

  it('uses a persisted exact category before the legacy name fallback', () => {
    const breakdown = buildCategoryBreakdown([{
      name: "Brother's Gift",
      tab: 'curr',
      total: 120,
      excluded: false,
      category: 'Divination Cards',
    }]);
    expect(breakdown.get('Divination Cards')).toBe(120);
    expect(breakdown.get('Other')).toBeUndefined();
  });
});

describe('assignLootCategories', () => {
  it('persists exact catalog authority and ignores the tracked stash tab', () => {
    const items = assignLootCategories(
      [{ name: "Brother's Gift", tab: 'curr' }, { name: 'Unknown Prize', tab: 'card' }],
      (name) => name === "Brother's Gift" ? 'Divination Cards' : undefined,
    );
    expect(items).toEqual([
      { name: "Brother's Gift", tab: 'curr', category: 'Divination Cards' },
      { name: 'Unknown Prize', tab: 'card', category: 'Other' },
    ]);
  });
});
