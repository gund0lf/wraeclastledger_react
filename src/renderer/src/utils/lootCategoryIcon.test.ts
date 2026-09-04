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
  it('keeps all five Unique families visually distinct when artwork is unavailable', () => {
    expect(iconClass('Unique Weapons')).toBe('sword');
    expect(iconClass('Unique Armours')).toBe('shield');
    expect(iconClass('Unique Accessories')).toBe('rings');
    expect(iconClass('Unique Flasks')).toBe('flask');
    expect(iconClass('Unique Jewels')).toBe('hexagon');
  });

  it('uses honest non-item glyphs for the League and Other catch-alls', () => {
    expect(iconClass('League')).toBe('sparkles');
    expect(iconClass('Other')).toBe('packages');
  });
});
