import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { OverlayVisibilityButton } from './OverlayVisibilityButton';
import { useSessionStore } from '../store/useSessionStore';

describe('overlay visibility control', () => {
  it('is available from the main toolbar and the settings dialog', () => {
    for (const source of ['../App.tsx', './RunTimerPanel.tsx']) {
      expect(readFileSync(new URL(source, import.meta.url), 'utf8')).toContain('<OverlayVisibilityButton');
    }
  });

  it.each([false, true])('shows the action for visibility %s', (visible) => {
    const state = useSessionStore.getState();
    const initial = useSessionStore.getInitialState();
    const previous = initial.overlayPreferences;
    try {
      initial.overlayPreferences = { ...state.overlayPreferences, visible };
      const markup = renderToStaticMarkup(createElement(MantineProvider, null, createElement(OverlayVisibilityButton)));
      expect(markup).toContain(visible ? 'Hide overlay' : 'Show overlay');
    } finally { initial.overlayPreferences = previous; }
  });
});
