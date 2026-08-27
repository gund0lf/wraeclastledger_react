import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const dashboardSource = readFileSync(
  new URL('../modules/DashboardModule.tsx', import.meta.url),
  'utf8',
);
const dashboardCss = readFileSync(
  new URL('../modules/DashboardModule.css', import.meta.url),
  'utf8',
);
const browserSource = readFileSync(
  new URL('../modules/StrategyBrowserModule.tsx', import.meta.url),
  'utf8',
);
const cardSource = readFileSync(
  new URL('../components/StrategyCard.tsx', import.meta.url),
  'utf8',
);
const setupSource = readFileSync(
  new URL('../modules/SetupModule.tsx', import.meta.url),
  'utf8',
);
const setupCss = readFileSync(
  new URL('../modules/SetupModule.css', import.meta.url),
  'utf8',
);
const investmentSource = readFileSync(
  new URL('../modules/InvestmentModule.tsx', import.meta.url),
  'utf8',
);
const investmentCss = readFileSync(
  new URL('../modules/InvestmentModule.css', import.meta.url),
  'utf8',
);
const atlasCalcSource = readFileSync(
  new URL('../modules/AtlasCalcModule.tsx', import.meta.url),
  'utf8',
);
const atlasCalcCss = readFileSync(
  new URL('../modules/AtlasCalcModule.css', import.meta.url),
  'utf8',
);
const sessionManagerSource = readFileSync(
  new URL('../modules/SessionManagerModule.tsx', import.meta.url),
  'utf8',
);
const sessionManagerCss = readFileSync(
  new URL('../modules/SessionManagerModule.css', import.meta.url),
  'utf8',
);
const appSource = readFileSync(
  new URL('../App.tsx', import.meta.url),
  'utf8',
);
const flexLayoutCss = readFileSync(
  new URL('../flexlayout-overrides.css', import.meta.url),
  'utf8',
);
const surfaceCss = readFileSync(
  new URL('../ui-surfaces.css', import.meta.url),
  'utf8',
);

describe('reviewed visual alignment corrections', () => {
  it('protects compact loot status actions before dropping optional detail', () => {
    expect(dashboardSource).toContain('className="dashboard-loot-title-row"');
    expect(dashboardSource).toContain('className="dashboard-loot-status-detail"');
    expect(dashboardCss).toContain('container-type: inline-size;');
    expect(dashboardCss).toContain('@container (max-width: 240px)');
  });

  it('keeps the per-item saved total in the label row instead of shifting one input', () => {
    expect(dashboardSource).toContain('Saved total: {fcSep(manualDraft.total, false, 1)}');
    expect(dashboardSource).not.toContain("description={manualValueMode === 'perItem'");
    expect(
      dashboardSource.split("styles={{ label: { display: 'block', width: '100%' } }}").length - 1,
    ).toBe(2);
  });

  it('uses the same readable secondary contrast for both quiet profit tiles', () => {
    expect(dashboardSource).toContain(
      '<Text size="xs" c="dimmed">({(profit.lootGain / profit.div).toFixed(2)}d)</Text>',
    );
  });

  it('centres Strategy Browser cost-per-map headings and values together', () => {
    expect(browserSource).toContain(
      "width: browserCols.cost, textAlign: 'center'",
    );
    expect(cardSource).toContain(
      "width: browserCols.cost, textAlign: 'center'",
    );
  });

  it('shares one pinned summary treatment between List and Diff', () => {
    expect(dashboardSource.split('className="dashboard-loot-summary"').length - 1).toBe(2);
    expect(dashboardCss).toContain('.dashboard-loot-summary');
    expect(dashboardSource).toContain('{activeDiff.length} items');
  });

  it('removes the inherited extra bottom padding from Profit Overview', () => {
    expect(dashboardSource).toContain(
      '<Section title="Profit Overview" contentPaddingBottom={0}>',
    );
  });

  it('keeps all three Setup tools inside the shared refined section treatment', () => {
    expect(setupSource.split('className="setup-panel-section"').length - 1).toBe(3);
    expect(setupSource).toContain("usePanelMaximized('setup')");
    expect(setupCss).toContain(".setup-panel-section[data-open='true']");
    expect(setupCss).toContain('--setup-surface: var(--wl-surface);');
    expect(setupCss).toContain('--setup-surface-raised: var(--wl-surface-raised);');
    expect(surfaceCss).toContain('--wl-surface: rgba(255, 255, 255, 0.018);');
    expect(surfaceCss).toContain('--wl-surface-raised: rgba(255, 255, 255, 0.032);');
    expect(setupCss).toContain('background: var(--setup-surface-raised);');
    expect(setupCss).toContain('.setup-panel-root.is-maximized .setup-panel-layout');
    expect(setupCss).toContain('grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);');
    expect(sessionManagerCss).not.toContain('rgba(17, 25, 32, 0.92)');
    expect(investmentCss).not.toContain('rgba(24, 29, 35');
  });

  it('keeps the reviewed live-style Investment context and two-value overview', () => {
    expect(investmentSource).toContain('className="investment-cost-per-map"');
    expect(investmentSource).toContain('<InvestmentMetric label="Session costs">');
    expect(investmentSource).toContain('className="investment-divine-input"');
    expect(investmentCss).toContain('grid-template-columns: minmax(0, 170px) auto;');
    expect(investmentCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(investmentCss).toContain('--investment-summary-control-height: 34px;');
    expect(investmentCss).toContain('height: var(--investment-summary-control-height);');
    expect(investmentSource).not.toContain('<InvestmentMetric label="All-in / map"');
  });

  it('presents Investment scarabs as one labelled aligned list', () => {
    expect(investmentSource).toContain('<SectionLabel>Map-device scarabs</SectionLabel>');
    expect(investmentSource).toContain('className="investment-scarab-row"');
    expect(investmentSource).toContain('wrap="wrap" justify="center"');
    expect(investmentSource).toContain('previewWidth={compactPanel ? 38 : 52} compactSpacing={compactPanel}');
    expect(investmentSource).toContain('isMaximized ? 120 : compactPanel ? 68 : 100');
    expect(investmentCss).toContain('.investment-price-input-compact-input');
    expect(investmentCss).toContain('.investment-price-input-compact-section');
    expect(investmentCss).toContain('.investment-scarab-list');
    expect(investmentCss).toContain('justify-content: center;');
  });

  it('aligns Atlas Calc and Sessions with the same refined Setup surfaces', () => {
    expect(atlasCalcSource).toContain('className="atlas-calc-card atlas-calc-refined"');
    expect(atlasCalcSource).toContain('className="atlas-calc-section-content"');
    expect(atlasCalcCss).toContain('.atlas-calc-source-list');
    expect(atlasCalcCss).not.toContain('.atlas-calc-hero.is-configured');
    expect(sessionManagerSource).toContain('className="session-manager-overview"');
    expect(sessionManagerSource).toContain('className="session-manager-saved-section"');
    expect(sessionManagerCss).toContain('.session-manager-saved-row.is-selected');
  });

  it('gives native left-border panels reversible maximize controls', () => {
    expect(appSource).toContain('onRenderTab={onRenderTab}');
    expect(appSource).toContain('onRenderTabSet={onRenderTabSet}');
    expect(appSource).toContain('aria-label={label}');
    expect(appSource).toContain("if (event.key === 'Escape') setLeftBorderMaximized(false);");
    expect(flexLayoutCss).toContain('.wl-layout-shell--left-border-maximized .flexlayout__layout_main');
    expect(flexLayoutCss).toContain('flex: 1 1 auto !important;');
  });
});
