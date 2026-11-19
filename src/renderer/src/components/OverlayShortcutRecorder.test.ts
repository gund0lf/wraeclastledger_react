import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { OverlayShortcutRecorder } from './OverlayShortcutRecorder';

function render(value: string, failed = '') {
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(OverlayShortcutRecorder, {
    label: 'Starfall Craters', helpId: 'global-shortcut-help', value, open: true,
    status: failed ? { accelerator: failed, registered: false, error: 'Unavailable' } : null,
    onChange: vi.fn(), onStatus: vi.fn(), conflict: () => undefined,
  })));
}

it('exposes labelled recording and clearing buttons for keyboard users', () => {
  const html = render('');
  expect(html).toContain('aria-label="Record Starfall Craters"');
  expect(html).toMatch(/aria-describedby="[^"]*\bglobal-shortcut-help\b[^"]*"/);
  expect(html).toContain('aria-label="Clear Starfall Craters"');
  expect(html).toContain('role="group"');
  expect(html).toContain('role="status"');
  expect(html).toContain('Not set');
  const clear = html.match(/<button[^>]*aria-label="Clear Starfall Craters"[^>]*>/)?.[0];
  expect(clear).toMatch(/\sdisabled(?:=|\s|>)/);
  expect(html).not.toContain('<input');
});

it('keeps existing accelerator spelling visible and shows only the matching registration failure', () => {
  const previous = 'CommandOrControl+Shift+T';
  expect(render(previous)).toContain(previous);
  expect(render(previous, previous)).toContain('This shortcut is unavailable. Choose another combination.');
  expect(render(previous, 'F9')).not.toContain('This shortcut is unavailable');
});

it.each(['1', 'W', 'Space', 'F9', 'num5'])('explains the global effect of the saved single key %s', key => {
  expect(render(key)).toContain(`other apps may not receive ${key}. Clear it to free the key.`);
  expect(render(key)).not.toContain('This shortcut is unavailable');
});

it('shows the registration error for an unavailable key and omits single-key advice for cleared or modified bindings', () => {
  expect(render('W', 'W')).toContain('This shortcut is unavailable');
  for (const html of [render('W', 'W'), render('Control+W'), render('Shift+W'), render('')]) {
    expect(html).not.toContain('Clear it to free the key.');
  }
});
