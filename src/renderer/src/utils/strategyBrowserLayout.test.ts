import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { SafeStrategyListEmpty } from '../components/SafeStrategyRow';
import {
  BROWSER_COLS,
  BROWSER_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_COLS,
  BROWSER_MAXIMIZED_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_MIN_CONTENT_WIDTH,
  BROWSER_MIN_CONTENT_WIDTH,
  BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE,
  BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE,
} from './strategyConstants';

describe('Strategy Browser panel layouts', () => {
  it.each(['current', 'frozen'] as const)('explains an empty %s list using only its available controls', scope => {
    const markup = renderToStaticMarkup(createElement(MantineProvider, null, createElement(SafeStrategyListEmpty, { scope })));
    const paragraphs = [...markup.matchAll(/<p\b[^>]*>([^<]*)<\/p>/g)].map(match => match[1]);
    expect(paragraphs).toEqual(scope === 'current'
      ? ['No matching strategies', 'Try another league or clear your filters.']
      : ['No matching strategies']);
  });

  it('preserves the established docked column minima and metric widths', () => {
    expect(BROWSER_COLS).toEqual({
      chevron: 22,
      author: 128,
      tags: 140,
      mod: 44,
      maps: 32,
      cost: 66,
      invest: 110,
      profit: 114,
      score: 36,
      dph: 46,
      dpm: 74,
    });
    expect(BROWSER_MIN_CONTENT_WIDTH).toBe(900);
    expect(BROWSER_GRID_TEMPLATE).toContain('minmax(128px, 1fr) minmax(140px, 2fr)');
  });

  it.each([
    [BROWSER_GRID_TEMPLATE, BROWSER_COLS],
    [BROWSER_SETUP_COLLAPSED_GRID_TEMPLATE, BROWSER_COLS],
    [BROWSER_MAXIMIZED_GRID_TEMPLATE, BROWSER_MAXIMIZED_COLS],
    [BROWSER_MAXIMIZED_SETUP_COLLAPSED_GRID_TEMPLATE, BROWSER_MAXIMIZED_COLS],
  ])('shares extra width between titles and tags in grid %s', (grid, cols) => {
    expect(grid).toContain(`minmax(${cols.author}px, 1fr) minmax(${cols.tags}px, 2fr)`);
    expect(grid).toContain(`${cols.mod}px ${cols.maps}px ${cols.cost}px ${cols.invest}px ${cols.profit}px ${cols.score}px ${cols.dph}px ${cols.dpm}px`);
  });

  it('uses wider identity and result columns when maximized', () => {
    expect(BROWSER_MAXIMIZED_COLS.author).toBeGreaterThan(BROWSER_COLS.author);
    expect(BROWSER_MAXIMIZED_COLS.tags).toBeGreaterThan(BROWSER_COLS.tags);
    expect(BROWSER_MAXIMIZED_COLS.profit).toBeGreaterThan(BROWSER_COLS.profit);
    expect(BROWSER_MAXIMIZED_MIN_CONTENT_WIDTH).toBeGreaterThan(BROWSER_MIN_CONTENT_WIDTH);
    expect(BROWSER_MAXIMIZED_GRID_TEMPLATE).not.toBe(BROWSER_GRID_TEMPLATE);
  });
});
