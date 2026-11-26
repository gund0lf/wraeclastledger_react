import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { LootCategory } from '../types';
import { LootCategoryGlyph } from '../components/ui/LootCategoryIcon';

const iconClass = (category: LootCategory): string => {
  const markup = renderToStaticMarkup(createElement(LootCategoryGlyph, { category }));
  return /tabler-icon-([a-z-]+)/.exec(markup)?.[1] ?? '';
};

describe('loot category artwork fallbacks', () => {
  it('shows painted Thread artwork for the category', () => {
    expect(renderToStaticMarkup(createElement(LootCategoryGlyph, { category: 'Threads' }))).toContain('wl_thread.png');
  });

  it('keeps all five Unique families visually distinct when artwork is unavailable', () => {
    expect(iconClass('Unique Weapons')).toBe('sword');
    expect(iconClass('Unique Armours')).toBe('shield');
    expect(iconClass('Unique Accessories')).toBe('rings');
    expect(iconClass('Unique Flasks')).toBe('flask');
    expect(iconClass('Unique Jewels')).toBe('hexagon');
  });

  it('uses honest non-item glyphs for the League and Other catch-alls', () => {
    const league = renderToStaticMarkup(createElement(LootCategoryGlyph, { category: 'League' }));
    const other = renderToStaticMarkup(createElement(LootCategoryGlyph, { category: 'Other' }));
    expect(league).toContain('wl_loot_league.png');
    expect(other).toContain('wl_loot_other.png');
    expect(league).not.toBe(other);
    expect(league + other).not.toContain('poecdn.com');
  });
});
