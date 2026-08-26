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
const evidenceSource = readFileSync(
  new URL('../components/LootEvidenceSummary.tsx', import.meta.url),
  'utf8',
);
const sharedSource = readFileSync(
  new URL('../components/ui/LootCurrencyDisplay.tsx', import.meta.url),
  'utf8',
);
const runtimeSource = readFileSync(
  new URL('../repository/sessionRepositoryRuntime.ts', import.meta.url),
  'utf8',
);

describe('shared loot currency presentation contract', () => {
  it('keeps Dashboard and Strategy Card item values on the same shared primitives', () => {
    for (const source of [dashboardSource, evidenceSource]) {
      expect(source).toContain('LootCurrencyToggle');
      expect(source).toContain('LootCurrencyValue');
      expect(source).toContain('LootCurrencyPair');
    }
    expect(sharedSource).toContain('lootCurrencyPresentation');
    expect(dashboardSource).not.toContain('itemDivines');
    expect(dashboardSource).not.toContain('deltaDivines');
    expect(evidenceSource).not.toContain('rowDivines');
  });

  it('persists one user-scoped mode through the file repository preference record', () => {
    expect(runtimeSource).toContain(
      'lootCurrencyMode: normalizeLootCurrencyMode(preferences.lootCurrencyMode)',
    );
    expect(runtimeSource).toContain('lootCurrencyMode: state.lootCurrencyMode');
    expect(runtimeSource).toContain(
      'state.lootCurrencyMode !== previous.lootCurrencyMode',
    );
  });

  it('keeps the Dashboard loot surface responsive and visually tied to the refined card', () => {
    expect(dashboardSource).toContain('className="dashboard-loot-panel"');
    expect(dashboardSource).toContain('className="dashboard-loot-status-grid"');
    expect(dashboardSource).toContain('compact');
    expect(dashboardCss).toContain('background: rgba(17, 25, 32, 0.92);');
    expect(dashboardCss).toContain('border: 1px solid rgba(116, 192, 252, 0.24);');
    expect(dashboardCss).toContain('@container (max-width: 540px)');
    expect(dashboardCss).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(138px, 1fr));',
    );
    expect(dashboardCss).toContain(
      'grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));',
    );
  });

  it('keeps pooled evidence honest when no single Divine snapshot exists', () => {
    expect(evidenceSource).toContain(
      'Pooled evidence spans several authored Divine snapshots',
    );
    expect(evidenceSource).toContain('divineAvailable={hasDivinePrice(divinePrice)}');
  });
});
