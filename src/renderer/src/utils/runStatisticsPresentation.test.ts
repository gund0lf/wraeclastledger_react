import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const moduleSource = readFileSync(
  new URL('../modules/RunStatisticsModule.tsx', import.meta.url),
  'utf8',
);
const timerSource = readFileSync(
  new URL('../components/RunTimerPanel.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../modules/RunStatisticsModule.css', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const start = cssSource.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const end = cssSource.indexOf('}', start);
  expect(end, `unterminated CSS rule: ${selector}`).toBeGreaterThan(start);
  return cssSource.slice(start, end + 1).replace(/\s+/g, ' ');
}

describe('Run Statistics visual-alignment presentation contract', () => {
  it('uses one neutral workspace rather than a redundant titled outer card', () => {
    expect(moduleSource).toContain('<div className="run-statistics-root">');
    expect(moduleSource).not.toContain('<ModuleHeader');
    expect(moduleSource).not.toContain('<Card');
    expect(rule('.run-statistics-section'))
      .toContain('background: var(--run-statistics-surface);');
    expect(rule(".run-statistics-section[data-open='true']"))
      .toContain('background: var(--run-statistics-surface-raised);');
  });

  it('keeps scope and destructive clearing in a stable compact toolbar', () => {
    expect(moduleSource).toContain('className="run-statistics-toolbar"');
    expect(moduleSource).toContain("{ label: 'Session', value: 'session' }");
    expect(moduleSource).toContain("{ label: 'All sessions', value: 'all' }");
    expect(moduleSource).toContain('className="run-statistics-destructive"');
    expect(rule('.run-statistics-destructive,\n.run-statistics-row-delete'))
      .toContain('color: var(--mantine-color-gray-5);');
  });

  it('keeps observed results visible and nests technical detail once per mechanic', () => {
    expect(moduleSource.split('<TechnicalDetails').length - 1).toBe(5);
    expect(moduleSource.split('className="run-statistics-observed"').length - 1).toBe(5);
    expect(moduleSource).toContain('Setup &amp; data quality');
    expect(moduleSource).toContain("{ label: 'Mixed setup', color: 'yellow' }");
    expect(moduleSource).toContain("{ label: 'Legacy evidence', color: 'yellow' }");
    expect(cssSource).toContain(".run-statistics-technical-details[open] .run-statistics-technical-chevron");
  });

  it('provides a deliberate wide two-column mechanic workspace with a narrow fallback', () => {
    expect(rule('.run-statistics-sections'))
      .toContain('grid-template-columns: minmax(0, 1fr);');
    expect(cssSource).toContain('@container (min-width: 920px)');
    expect(cssSource).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(cssSource).toContain('width: min(100%, 1500px);');
  });

  it('turns the manual timer into a compact intentional control strip', () => {
    expect(timerSource).toContain('className="run-timer-panel"');
    expect(timerSource).toContain('className="run-timer-layout"');
    expect(timerSource).toContain('className="run-timer-value"');
    expect(timerSource).toContain('className="run-timer-controls"');
    expect(timerSource).toContain('automatic clipboard Pace remains the default');
    expect(cssSource).toContain("'heading value controls'");
  });

  it('retains the existing statistics and timer behavior entry points', () => {
    expect(moduleSource).toContain('setManualStatistic(');
    expect(moduleSource).toContain('addManualAtlasAnomalyCount(');
    expect(moduleSource).toContain('addManualMercenaryCount(');
    expect(moduleSource).toContain('aggregateRunStatisticsSessions(');
    expect(timerSource).toContain('startManualTimer');
    expect(timerSource).toContain('finishManualTimer');
    expect(timerSource).toContain('setOverlayPreferences');
  });
});
