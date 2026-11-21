import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider, Modal } from '@mantine/core';
import { expect, it, vi } from 'vitest';
import { UpdateBanner } from './UpdateBanner';

const mount = vi.hoisted(() => ({ runFirstEffect: false }));
vi.mock('./repository/sessionRepositoryRuntime', () => ({
  repositoryLastSeenVersion: () => null,
  setRepositoryLastSeenVersion: () => {},
}));
vi.mock('./store/useUIStore', () => ({
  useUIStore: () => ({ changelogRequested: false }),
}));
vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    // Static rendering skips mount effects and requires a server snapshot.
    // Run UpdateBanner's real first-launch effect once to open the panel.
    useEffect(effect: () => void, deps?: readonly unknown[]) {
      if (mount.runFirstEffect && deps?.length === 0) {
        mount.runFirstEffect = false;
        effect();
      }
    },
    useSyncExternalStore: <T>(subscribe: (cb: () => void) => () => void,
      snapshot: () => T, serverSnapshot = snapshot) =>
      react.useSyncExternalStore(subscribe, snapshot, serverSnapshot),
  };
});

it('renders the open release notes below the modal containing Copy', () => {
  mount.runFirstEffect = true;
  const banner = renderToStaticMarkup(createElement(MantineProvider, null, createElement(UpdateBanner)));
  const dialog = renderToStaticMarkup(createElement(MantineProvider, null,
    createElement(Modal, { opened: true, onClose: () => {}, withinPortal: false,
      transitionProps: { duration: 0 }, title: 'Share My Session' }, createElement('button', null, 'Copy to Discord'))));
  expect(banner).toContain('Got it');
  expect(dialog).toContain('Copy to Discord');
  const panelLayer = banner.match(/<div style="position:fixed;[^"]*?z-index:(\d+)/)?.[1];
  const modalLayer = dialog.match(/--mb-z-index:(\d+)/)?.[1];
  expect(panelLayer).toBeDefined();
  expect(modalLayer).toBeDefined();
  expect(Number(panelLayer)).toBeLessThan(Number(modalLayer));
});

// Both alerts can arrive asynchronously while Share is already open.
it.each([
  ['share-result', new URL('./components/ShareResultNotice.tsx', import.meta.url), "position: 'fixed', right: 16, bottom: 16"],
  ['save-failure', new URL('./App.tsx', import.meta.url), "position: 'absolute', bottom: 32, right: 16"],
] as const)('keeps the %s alert below open dialogs', (_notice, file, position) => {
  const source = readFileSync(file, 'utf8');
  const alerts = source.match(/<Alert\b[\s\S]*?style=\{\{[^}]*\}\}/g) ?? [];
  const notice = alerts.filter((alert) => alert.includes(position));
  expect(notice).toHaveLength(1);
  expect(notice[0]).toContain("zIndex: getDefaultZIndex('modal') - 1");
});
