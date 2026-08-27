import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../modules/AtlasCalcModule.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../modules/AtlasCalcModule.css', import.meta.url), 'utf8');

describe('Atlas Calc source-derived presentation contract', () => {
  it('keeps Atlas Bonus as the sole direct editor', () => {
    expect(source).toContain('<Switch');
    expect(source).not.toContain('<Slider');
    expect(source).not.toContain('aria-pressed');
    expect(source).not.toContain('answerMounting');
  });

  it('exposes concise sync/setup actions and names every required source', () => {
    expect(source).toContain('Sync');
    expect(source).toContain('Open Atlas Tree');
    expect(source).toContain("requestPanel('atlas-tree')");
    expect(source).toContain('Map Log');
    expect(source).toContain('Investment');
    expect(source).toContain('Legacy/imported counts');
  });

  it('keeps the authoritative Atlas sync visible while details remain collapsible', () => {
    expect(source.indexOf('className="atlas-calc-hero-status"')).toBeLessThan(
      source.indexOf('title="Inputs"'),
    );
    expect(source).toContain('className={`atlas-calc-guidance');
    expect(source).toContain('className="atlas-calc-guidance atlas-calc-bonus-guidance"');
    expect(source).toContain('title="Inputs"');
    expect(source).toContain('meta={inputsMeta}');
    expect(source).toContain('title="Calculation"');
    expect(source).toContain('meta={breakdownMeta}');
    expect(source).toContain("'+25% IIQ' : 'Bonus off'");
  });

  it('keeps collapsed summaries inside their available width', () => {
    expect(css).toContain('.atlas-calc-section-meta');
    expect(css).toContain('flex: 1 1 0;');
    expect(css).toContain('padding-right: 8px;');
    expect(css).toContain('.atlas-calc-section-meta-text');
    expect(css).toContain('text-overflow: ellipsis;');
  });
});
