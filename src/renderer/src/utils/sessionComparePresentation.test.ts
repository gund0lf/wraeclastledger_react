import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string): string => readFileSync(
  new URL(relativePath, import.meta.url),
  'utf8',
);

const modalSource = read('../components/SessionCompareModal.tsx');
const modalStyles = read('../components/SessionCompareModal.css');
const retrospectivesSource = read('../components/PersonalRetrospectives.tsx');
const sessionsSource = read('../modules/SessionManagerModule.tsx');

describe('Sessions Compare presentation contract', () => {
  it('uses the shared six-session bound everywhere the picker presents it', () => {
    expect(modalSource).toContain('MAX_COMPARE_SESSIONS');
    expect(modalSource).not.toContain('const MAX_COMPARE = 3');
    expect(sessionsSource).toContain('Compare up to 6 saved sessions side by side');
  });

  it('keeps wide comparisons readable through horizontal scroll and sticky metrics', () => {
    expect(modalSource).toContain('className="session-compare-results-scroll"');
    expect(modalSource).toContain('aria-label="Session comparison results"');
    expect(modalSource).toContain('className="session-compare-metric-cell"');
    expect(modalStyles).toContain('overflow-x: auto');
    expect(modalStyles).toContain('position: sticky');
    expect(modalStyles).toContain('min-width: 156px');
  });

  it('shows valid capture Pace and discloses oversized Retrospectives seeds', () => {
    expect(modalSource).toContain('label="Pace (estimate)"');
    expect(modalSource).toContain('most recently active of');
    expect(retrospectivesSource).toContain('setCompareIds(ids);');
    expect(retrospectivesSource).not.toContain('setCompareIds(ids.slice(0, 3));');
  });
});
