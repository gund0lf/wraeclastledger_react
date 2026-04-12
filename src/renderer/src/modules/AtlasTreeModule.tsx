import { Card, ActionIcon, Group, Tooltip, CopyButton, Text, Badge } from '@mantine/core';
import { useState, useRef, useEffect } from 'react';
import { FaSync, FaCopy, FaCheck } from 'react-icons/fa';
import { useSessionStore } from '../store/useSessionStore';

const BASE_URL = 'https://pathofpathing.com';

/**
 * Uses Electron's <webview> tag so that did-navigate-in-page fires on every
 * hash change (which is how pathofpathing encodes the tree state).
 *
 * Loop-break strategy:
 *   - webview src = initialUrl (useState initializer — captured ONCE, never updated)
 *   - capturedUrl = separate React state updated by navigation events
 *   - capturedUrl is NEVER written back into the webview src
 *   - This breaks the previous loop: event → state → re-render → src change → abort
 *
 * Requires webviewTag: true in main/index.ts webPreferences (already set).
 */
export const AtlasTreeModule = () => {
  const { settings, updateSetting } = useSessionStore();
  const webviewRef = useRef<any>(null);
  const [key, setKey] = useState(0);

  // Captured ONCE — the initial src never changes after mount
  const [initialUrl] = useState(() => {
    const stored = settings.atlasTreeUrl;
    // Only use stored if it's a real pathofpathing URL
    return stored?.startsWith('https://pathofpathing.com') ? stored : BASE_URL;
  });

  // Display / export URL — updated by navigation events, NEVER fed back into src
  const [capturedUrl, setCapturedUrl] = useState(initialUrl);

  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;

    const handleNav = (e: any) => {
      const url: string = e.url ?? '';
      if (!url.startsWith('https://pathofpathing.com')) return;
      setCapturedUrl(url);
      updateSetting('atlasTreeUrl', url);
    };

    wv.addEventListener('did-navigate', handleNav);
    wv.addEventListener('did-navigate-in-page', handleNav);

    return () => {
      wv.removeEventListener('did-navigate', handleNav);
      wv.removeEventListener('did-navigate-in-page', handleNav);
    };
    // key in deps so we re-attach after reload; updateSetting is stable
  }, [key, updateSetting]);

  const reload = () => setKey((k) => k + 1);

  const hasTree = capturedUrl !== BASE_URL && capturedUrl.includes('#');
  const urlShort = capturedUrl.replace('https://pathofpathing.com', '') || '/';

  return (
    <Card shadow="sm" padding={0} radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>

      <Group px={8} py={4} gap="xs" style={{ flexShrink: 0, borderBottom: '1px solid #2a2b2e' }}>
        <Text size="xs" c="dimmed" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
          {urlShort.length > 60 ? urlShort.slice(0, 60) + '…' : urlShort}
        </Text>
        {hasTree && <Badge size="xs" color="green" variant="dot">Tree saved</Badge>}
        <CopyButton value={capturedUrl}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy tree URL'}>
              <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <FaCheck size={10} /> : <FaCopy size={10} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
        <Tooltip label="Reload">
          <ActionIcon size="xs" variant="subtle" color="gray" onClick={reload}>
            <FaSync size={10} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/*
        src={initialUrl} — static, captured once, never updated.
        key forces full remount on reload only.
        capturedUrl is never passed here — that breaks the abort loop.
      */}
      <webview
        key={key}
        ref={webviewRef}
        src={initialUrl}
        style={{ flex: 1 }}
        // @ts-ignore — webview is Electron-only JSX
        allowpopups="false"
      />
    </Card>
  );
};
