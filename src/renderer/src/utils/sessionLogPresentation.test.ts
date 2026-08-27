import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('../modules/SessionLogModule.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../modules/SessionLogModule.css', import.meta.url),
  'utf8',
);
const surfaceCss = readFileSync(
  new URL('../ui-surfaces.css', import.meta.url),
  'utf8',
);
const dashboardSource = readFileSync(
  new URL('../modules/DashboardModule.tsx', import.meta.url),
  'utf8',
);
const onboardingSource = readFileSync(
  new URL('../components/GettingStartedCard.tsx', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const start = cssSource.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const end = cssSource.indexOf('}', start);
  expect(end, `unterminated CSS rule: ${selector}`).toBeGreaterThan(start);
  return cssSource.slice(start, end + 1).replace(/\s+/g, ' ');
}

describe('Map Log visual-alignment presentation contract', () => {
  it('keeps Automatic Pace visible without adding a per-map time column', () => {
    expect(componentSource).toContain('className="session-log-pace-guide"');
    expect(componentSource).toContain('<span>How timing works</span>');
    expect(componentSource).toContain('Run, loot &amp; prepare');
    expect(componentSource).toContain('longer than 3× your session&apos;s median capture interval');
    expect(componentSource).not.toContain('<Table.Th>Time</Table.Th>');
    expect(componentSource).not.toContain('<Table.Th>Duration</Table.Th>');
  });

  it('retains the neutral refined surface and opaque sticky-header boundary', () => {
    expect(componentSource).toContain('className="session-log-card session-log-refined"');
    expect(rule('.session-log-card.session-log-refined'))
      .toContain('background: var(--wl-data-module-surface);');
    expect(surfaceCss)
      .toContain('linear-gradient(180deg, rgba(24, 24, 26, 0.98), rgba(16, 17, 19, 0.98));');
    expect(rule('.session-log-card.session-log-refined'))
      .toContain('border-color: rgba(255, 255, 255, 0.09);');
    expect(rule('.session-log-table thead th'))
      .toContain('background: rgb(25, 26, 28);');
    expect(rule('.session-log-table thead th'))
      .toContain('border-bottom: 1px solid var(--session-log-border-strong);');
    expect(rule('.session-log-table tbody tr:hover'))
      .toContain('background: rgba(255, 255, 255, 0.035);');
  });

  it('keeps the table scannable and the destructive row action hover-revealed', () => {
    expect(rule('.session-log-number')).toContain('text-align: right !important;');
    expect(rule('.session-log-metric')).toContain('font-size: inherit;');
    expect(rule('.session-log-delete')).toContain('opacity: 0;');
    expect(cssSource).toContain('.session-log-table tbody tr:hover .session-log-delete');
  });

  it('supports narrow toolbar wrapping and preserves a structured empty state', () => {
    expect(cssSource).toContain('@container (max-width: 760px)');
    expect(cssSource).toContain('flex-wrap: wrap !important;');
    expect(componentSource).toContain('Ready to capture your first map');
    expect(componentSource).toContain('full run-to-ready interval');
  });

  it('adds concise Dashboard guidance before and during pace collection', () => {
    expect(dashboardSource).toContain('Pace (collecting)');
    expect(dashboardSource).toContain('Building a reliable 10m sample');
    expect(dashboardSource).toContain('the next capture completes its automatic Pace interval');
    expect(onboardingSource).toContain('including looting and stash preparation');
    expect(onboardingSource).toContain('clearly abnormal AFK gaps are excluded');
  });
});
