import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('../components/StrategyCard.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../components/StrategyCard.css', import.meta.url),
  'utf8',
);
const surfaceCss = readFileSync(
  new URL('../ui-surfaces.css', import.meta.url),
  'utf8',
);
const compactCss = cssSource.replace(/\s+/g, ' ');

function rule(selector: string): string {
  const start = cssSource.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const end = cssSource.indexOf('}', start);
  expect(end, `unterminated CSS rule: ${selector}`).toBeGreaterThan(start);
  return cssSource.slice(start, end + 1).replace(/\s+/g, ' ');
}

describe('Strategy Card production presentation contract', () => {
  it('keeps the approved lab selection without disposable lab controls', () => {
    expect(componentSource).toContain(
      'className="strategy-card-expanded strategy-card-triptych strategy-card-refined"',
    );
    expect(componentSource).not.toContain('data-lab-layout');
    expect(componentSource).not.toContain('data-lab-skin');
    expect(componentSource).not.toContain('strategy-card-lab-toolbar');
  });

  it('retains strong selectors for Mantine Stack and Group overrides', () => {
    expect(rule('.strategy-card-expanded.strategy-card-triptych .strategy-card-hero-tags'))
      .toContain('justify-content: center;');
    expect(rule('.strategy-card-expanded.strategy-card-triptych .strategy-card-hero-meta'))
      .toContain('display: contents;');

    const scarabGrid = rule(
      '.strategy-card-expanded.strategy-card-triptych .strategy-card-scarab-list',
    );
    expect(scarabGrid).toContain('display: grid !important;');
    expect(scarabGrid).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));',
    );

    expect(rule('.strategy-card-expanded.strategy-card-refined .strategy-card-setup-item'))
      .toContain('align-items: flex-start;');
  });

  it('keeps the expanded evidence hierarchy neutral while data retains semantic colour', () => {
    expect(rule('.strategy-card-expanded.strategy-card-refined'))
      .toContain('background: var(--wl-detail-surface);');
    expect(rule('.strategy-card-expanded.strategy-card-refined .strategy-card-header'))
      .toContain('border-color: var(--wl-border-strong) !important;');
    expect(rule('.strategy-card-expanded.strategy-card-refined .strategy-card-hero-identity > :first-child'))
      .toContain('letter-spacing: 0.012em;');
    expect(rule('.strategy-card-expanded.strategy-card-refined .strategy-card-loot-panel'))
      .toContain('background: var(--wl-surface-raised) !important;');
    expect(rule('.strategy-card-expanded.strategy-card-refined .strategy-card-loot-panel'))
      .toContain('border-color: var(--wl-border-strong) !important;');
    expect(rule('.strategy-card-expanded.strategy-card-refined .loot-evidence-category'))
      .toContain('background: var(--wl-surface-sunken) !important;');
    expect(componentSource).not.toContain('background: COLOR.surfaceInfoBg');
    expect(cssSource).not.toContain('rgba(77, 171, 247');
    expect(cssSource).not.toContain('rgba(116, 192, 252');
    expect(surfaceCss).toContain('--wl-detail-surface:');
  });

  it('keeps pooled and per-run loot grids plus the audited responsive collapse', () => {
    expect(rule('.strategy-card-expanded .loot-evidence-categories'))
      .toContain('grid-template-columns: repeat(auto-fit, minmax(116px, 1fr));');
    expect(compactCss).toContain(
      '.strategy-card-expanded.strategy-card-triptych .strategy-card-lower-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }',
    );
    expect(compactCss).not.toContain(
      'grid-template-columns: minmax(330px, 1.2fr) minmax(250px, 0.8fr);',
    );
  });

  it('keeps the responsive hero and lower detail grid compact and aligned', () => {
    expect(rule('.strategy-card-lower-grid')).not.toContain('grid-template-rows');
    expect(rule('.strategy-card-regex-wide')).toContain('margin-top: 10px;');
    expect(rule('.strategy-card-setup-scarabs')).toContain('padding-top: 10px;');
    expect(compactCss).toContain(
      '@container (max-width: 1100px) { .strategy-card-expanded.strategy-card-triptych .strategy-card-hero { grid-template-columns: minmax(0, 1fr); gap: 8px; }',
    );
    expect(compactCss).toContain(
      '.strategy-card-expanded.strategy-card-triptych .strategy-card-hero-identity, .strategy-card-expanded.strategy-card-triptych .strategy-card-hero-attribution, .strategy-card-expanded.strategy-card-triptych .strategy-card-hero-facts { grid-column: 1; grid-row: auto; justify-self: center; align-items: center; text-align: center; }',
    );
    expect(compactCss).toContain(
      '.strategy-card-map-panel { grid-column: 1 / -1; grid-row: auto; }',
    );
  });
});
