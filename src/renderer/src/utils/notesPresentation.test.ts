import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const moduleSource = readFileSync(
  new URL('../modules/NotesModule.tsx', import.meta.url),
  'utf8',
);
const cssSource = readFileSync(
  new URL('../modules/NotesModule.css', import.meta.url),
  'utf8',
);

function rule(selector: string): string {
  const start = cssSource.indexOf(`${selector} {`);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const end = cssSource.indexOf('}', start);
  expect(end, `unterminated CSS rule: ${selector}`).toBeGreaterThan(start);
  return cssSource.slice(start, end + 1).replace(/\s+/g, ' ');
}

describe('Notes visual-alignment presentation contract', () => {
  it('uses one centered neutral workspace without a generic outer Card', () => {
    expect(moduleSource).toContain('<div className="notes-root">');
    expect(moduleSource).toContain('<div className="notes-workspace">');
    expect(moduleSource).not.toContain('<Card');
    expect(rule('.notes-workspace')).toContain('width: min(100%, 1180px);');
    expect(rule('.notes-toolbar')).toContain('background: var(--notes-surface);');
  });

  it('describes the file-backed working session accurately', () => {
    expect(moduleSource).toContain("activeSessionName ?? 'Working session'");
    expect(moduleSource).toContain('Auto-saved with this session.');
    expect(moduleSource).toContain('separate Notes field in Share');
    expect(moduleSource).not.toContain('unsaved session');
    expect(moduleSource).not.toContain('Save your session to persist these notes.');
  });

  it('keeps editor state and useful counts visible without layout shifts', () => {
    expect(moduleSource).toContain('data-empty={!sessionNotes || undefined}');
    expect(moduleSource).toContain('{wordLabel} · {lineLabel}');
    expect(moduleSource).toContain('disabled={!sessionNotes}');
    expect(moduleSource).toContain('aria-label="Session notes"');
    expect(rule('.notes-editor-shell')).toContain('flex: 1;');
    expect(rule('.notes-editor-input')).toContain('height: 100%;');
  });

  it('reserves blue for focus and red for direct destructive hover', () => {
    expect(rule('.notes-editor-input:focus,\n.notes-editor-input:focus-within'))
      .toContain('outline: 1px solid rgba(77, 171, 247, 0.52);');
    expect(rule('.notes-clear:hover:not([data-disabled])'))
      .toContain('color: var(--mantine-color-red-4);');
    expect(rule('.notes-toolbar')).not.toContain('blue');
    expect(rule('.notes-editor-shell')).not.toContain('blue');
  });

  it('retains the confirmed clear action and session-scoped store wiring', () => {
    expect(moduleSource).toContain("useSessionKeys('sessionNotes', 'setSessionNotes', 'activeSessionName')");
    expect(moduleSource).toContain('title="Clear notes?"');
    expect(moduleSource).toContain("setSessionNotes('')");
    expect(moduleSource).toContain('onChange={(e) => setSessionNotes(e.currentTarget.value)}');
  });
});
