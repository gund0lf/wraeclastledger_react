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
});
