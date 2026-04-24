import { Card, ActionIcon, Group, Tooltip, CopyButton, Text, Badge, ScrollArea, Stack, TextInput, Button } from '@mantine/core';
import { useState, useRef, useEffect } from 'react';
import { FaSync, FaCopy, FaCheck, FaChartBar } from 'react-icons/fa';
import { useSessionStore } from '../store/useSessionStore';

const BASE_URL = 'https://pathofpathing.com';

// Safely check that a URL belongs to the pathofpathing.com host
function isPathofpathingUrl(url: string): boolean {
  try { return new URL(url).hostname === 'pathofpathing.com'; }
  catch { return false; }
}

interface StatGroup {
  title: string;
  stats: string[];
}

export const AtlasTreeModule = () => {
  const { settings, activeSessionId, updateSetting } = useSessionStore();
  const webviewRef     = useRef<any>(null);
  const prevSessionRef = useRef<string | null>(activeSessionId);
  const autoApplyRef   = useRef(false); // set true when URL imported — triggers auto readStats+apply

  const [srcUrl,      setSrcUrl]      = useState(() => {
    const stored = settings.atlasTreeUrl;
    return isPathofpathingUrl(stored) ? stored : BASE_URL;
  });
  const [capturedUrl, setCapturedUrl] = useState(srcUrl);
  const [key,         setKey]         = useState(0);
  const [statsOpen,   setStatsOpen]   = useState(false);
  const [statGroups,  setStatGroups]  = useState<StatGroup[]>([]);
  const [statsError,  setStatsError]  = useState<string | null>(null);
  const [importUrl,   setImportUrl]   = useState('');
  const [showImport,  setShowImport]  = useState(false);
  const [calcApplied, setCalcApplied] = useState<string | null>(null);

  // ── Reload when session changes ────────────────────────────────────────────
  useEffect(() => {
    if (prevSessionRef.current === activeSessionId) return;
    prevSessionRef.current = activeSessionId;
    autoApplyRef.current = false; // never auto-read stats on New Session
    const url = useSessionStore.getState().settings.atlasTreeUrl;
    const next = isPathofpathingUrl(url) ? url : BASE_URL;
    setSrcUrl(next);
    setCapturedUrl(next);
    setKey((k) => k + 1);
    setStatGroups([]);
    setStatsOpen(false); // close stats panel on session change
  }, [activeSessionId]);

  // ── Reload when atlasTreeUrl is set externally (Load Build Settings) ───────
  useEffect(() => {
    const stored = settings.atlasTreeUrl;
    if (!stored || stored === capturedUrl || stored === srcUrl) return;
    if (!isPathofpathingUrl(stored)) return;
    setSrcUrl(stored);
    setCapturedUrl(stored);
    autoApplyRef.current = true; // auto-apply calc after load
    setKey((k) => k + 1);
    setStatGroups([]);
  }, [settings.atlasTreeUrl]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Attach navigation + finish-load listeners ─────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    const handleNav = (e: any) => {
      const url: string = e.url ?? '';
      if (!isPathofpathingUrl(url)) return;
      setCapturedUrl(url);
      updateSetting('atlasTreeUrl', url);
    };
    // Auto-apply to calc when URL is loaded externally (Load Build Settings / import URL)
    const handleFinishLoad = () => {
      if (!autoApplyRef.current) return;
      autoApplyRef.current = false;
      // Wait for the page to fully render before reading stats
      setTimeout(() => readStats(true), 1500);
    };
    wv.addEventListener('did-navigate', handleNav);
    wv.addEventListener('did-navigate-in-page', handleNav);
    wv.addEventListener('did-finish-load', handleFinishLoad);
    return () => {
      wv.removeEventListener('did-navigate', handleNav);
      wv.removeEventListener('did-navigate-in-page', handleNav);
      wv.removeEventListener('did-finish-load', handleFinishLoad);
    };
  }, [key, updateSetting]);

  // ── Read atlas tree stats via JS injection ─────────────────────────────────
  const readStats = async (autoApply = false) => {
    const wv = webviewRef.current;
    if (!wv) return;
    setStatsError(null);
    try {
      const result = await wv.executeJavaScript(`
        (async function() {
          try {
            var btn = document.getElementById('skillTreeStats_ShowHide');
            if (btn && btn.textContent && btn.textContent.trim() === 'Show stats') {
              btn.click();
              await new Promise(function(r) { setTimeout(r, 300); });
            }
            var container = document.getElementById('skillTreeStats');
            if (container) {
              var orig = container.scrollTop;
              container.scrollTop = container.scrollHeight;
              await new Promise(function(r) { setTimeout(r, 150); });
              container.scrollTop = orig;
            }
            var statEls = Array.from(document.querySelectorAll('#skillTreeStats_Content .stat[data-group-name]'));
            if (statEls.length > 0) {
              var groups = {};
              var order = [];
              statEls.forEach(function(el) {
                var g = el.getAttribute('data-group-name');
                if (!groups[g]) { groups[g] = []; order.push(g); }
                var t = el.textContent.trim();
                if (t) groups[g].push(t);
              });
              return order.map(function(g) { return { title: g, stats: groups[g] }; });
            }
            var content = document.getElementById('skillTreeStats_Content');
            if (!content) return null;
            var result = [];
            content.querySelectorAll('.group').forEach(function(g) {
              var titleEl = g.querySelector('span.title') || g.querySelector('.title');
              var title = titleEl ? titleEl.textContent.trim() : 'Other';
              var stats = Array.from(g.querySelectorAll('.stat')).map(function(s) { return s.textContent.trim(); }).filter(Boolean);
              if (stats.length > 0) result.push({ title: title, stats: stats });
            });
            return result.length > 0 ? result : null;
          } catch(e) { return { error: e.message }; }
        })()
      `);

      if (!result || (result as any).error) {
        setStatsError((result as any)?.error ?? 'No stats found. Select some nodes in the atlas tree first.');
        setStatGroups([]);
        if (!autoApply) setStatsOpen(true);
        return;
      }

      const groups: StatGroup[] = Array.isArray(result)
        ? result as StatGroup[]
        : Object.entries(result as Record<string, string[]>).map(([title, stats]) => ({ title, stats }));

      setStatGroups(groups);
      if (!autoApply) setStatsOpen(true);

      const TITLE_TO_TAG: Record<string, string> = {
        'delirium': 'delirium', 'beyond': 'beyond', 'legion': 'legion',
        'breach': 'breach', 'harbinger': 'harbinger', 'abyss': 'abyss',
        'ritual': 'ritual', 'expedition': 'expedition', 'incursion': 'incursion',
        'betrayal': 'betrayal', 'essence': 'essence', 'harvest': 'harvest',
        'blight': 'blight', 'heist': 'heist', 'metamorph': 'metamorph',
        'ultimatum': 'ultimatum', 'torment': 'torment',
        'cartography': 'cartography', 'titanic': 'titanic',
        'eater of worlds': 'eater', 'the eater': 'eater',
        'the searing exarch': 'exarch', 'searing exarch': 'exarch',
      };
      const detected = groups
        .map((g) => TITLE_TO_TAG[g.title.toLowerCase()])
        .filter(Boolean) as string[];
      if (detected.length > 0) updateSetting('atlasDetectedTags', detected);

      // Auto-apply calc if triggered by external URL load
      if (autoApply) {
        applyGroupsToCalc(groups);
        // Silently close the pathofpathing stats panel after auto-read
        try {
          await wv.executeJavaScript(`
            (function() {
              var btn = document.getElementById('skillTreeStats_ShowHide');
              if (btn && btn.textContent && btn.textContent.trim() === 'Hide stats') btn.click();
            })()
          `);
        } catch {}
      }
    } catch (err: any) {
      setStatsError('Could not read stats — try navigating the tree first.');
      if (!autoApply) setStatsOpen(true);
    }
  };

  const reload  = () => { setKey((k) => k + 1); setStatGroups([]); };
  const hasTree = capturedUrl !== BASE_URL && capturedUrl.includes('#');
  const urlShort = capturedUrl.replace('https://pathofpathing.com', '') || '/';

  // ── Import URL from text input ───────────────────────────────────────
  const loadImportUrl = () => {
    const url = importUrl.trim();
    if (!isPathofpathingUrl(url)) return;
    setSrcUrl(url);
    setCapturedUrl(url);
    updateSetting('atlasTreeUrl', url);
    autoApplyRef.current = true; // auto-apply calc after load
    setKey((k) => k + 1);
    setStatGroups([]);
    setImportUrl('');
    setShowImport(false);
  };

  // ── Apply stats to Atlas Calc ─────────────────────────────────────────────
  // applyGroupsToCalc takes groups directly (avoids stale-state issues when
  // called right after readStats resolves)
  const applyGroupsToCalc = (groups: StatGroup[]) => {
    const allStats = groups.flatMap((g) => g.stats);
    const appliedParts: string[] = [];
    const flatMod = allStats.find((s) =>
      /^(\d+)% increased effect of Explicit Modifiers on your Maps$/.test(s.trim()));
    if (flatMod) {
      const match = flatMod.match(/(\d+)%/);
      if (match) {
        const nodes = Math.round(parseInt(match[1]) / 2);
        updateSetting('smallNodesAllocated', Math.min(16, nodes));
        appliedParts.push(`${nodes} small nodes`);
      }
    }
    if (allStats.some((s) => s.includes('per Explicit Modifier'))) {
      updateSetting('mountingModifiers', true);
      appliedParts.push('Mounting Modifiers');
    }
    if (allStats.some((s) => s.includes('per Fragment used with Map'))) {
      updateSetting('fragmentsUsed', 5);
      appliedParts.push('5 fragments');
    }
    if (appliedParts.length > 0) {
      setCalcApplied(appliedParts.join(', '));
      setTimeout(() => setCalcApplied(null), 5000);
    } else {
      setCalcApplied('No matching stats found');
      setTimeout(() => setCalcApplied(null), 3000);
    }
  };

  // applyToAtlasCalc is the manual toolbar button — reads from current state
  const applyToAtlasCalc = () => applyGroupsToCalc(statGroups);

  return (
    <Card shadow="sm" padding={0} radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>

      {/* Toolbar */}
      <Group px={8} py={4} gap="xs" style={{ flexShrink: 0, borderBottom: '1px solid #2a2b2e' }}>
        <Text size="xs" c="dimmed"
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10 }}>
          {urlShort.length > 60 ? urlShort.slice(0, 60) + '…' : urlShort}
        </Text>
        {hasTree && <Badge size="xs" color="green" variant="dot">Tree saved</Badge>}
        {statGroups.length > 0 && (
          <Tooltip label="Apply node stats to Atlas Calc (small nodes, Mounting Modifiers, fragments)">
            <Button size="xs" variant="light" color="teal"
              onClick={applyToAtlasCalc}
              style={{ height: 18, fontSize: 9, padding: '0 5px' }}>
              Apply to Calc
            </Button>
          </Tooltip>
        )}
        <Tooltip label="Import tree from URL">
          <ActionIcon size="xs" variant={showImport ? 'filled' : 'subtle'} color="orange"
            onClick={() => setShowImport((v) => !v)}>
            📎
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Read allocated node stats">
          <ActionIcon size="xs" variant="subtle" color="blue" onClick={readStats}>
            <FaChartBar size={10} />
          </ActionIcon>
        </Tooltip>
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

      {/* URL import row */}
      {showImport && (
        <Group px={8} py={4} gap={4} style={{ flexShrink: 0, borderBottom: '1px solid #2a2b2e', background: 'rgba(255,147,43,0.05)' }}>
          <TextInput
            size="xs" style={{ flex: 1 }}
            placeholder="Paste pathofpathing.com URL..."
            value={importUrl}
            onChange={(e) => setImportUrl(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadImportUrl()}
          />
          <Button size="xs" variant="light" color="orange"
            disabled={!isPathofpathingUrl(importUrl.trim())}
            onClick={loadImportUrl}>
            Load
          </Button>
        </Group>
      )}

      {/* Stats panel — floats over the webview as an overlay */}
      {statsOpen && (
        <div style={{
          position: 'absolute', top: showImport ? 65 : 33, left: 0, right: 0, zIndex: 10,
          background: '#0d0e10', borderBottom: '1px solid #2a2b2e',
          maxHeight: '65%', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
        }}>
          <Group justify="space-between" px={8} pt={6} pb={4} style={{ flexShrink: 0 }}>
            <Text size="xs" fw={700} c="blue">Atlas Node Stats</Text>
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setStatsOpen(false)}>×</ActionIcon>
          </Group>
          {calcApplied && (
            <Text size="xs" c="teal" px={8} pb={4} style={{ flexShrink: 0 }}>
              ✓ Applied to Calc: {calcApplied}
            </Text>
          )}
          {statsError && (
            <Text size="xs" c="dimmed" px={8} pb={6}>{statsError}</Text>
          )}
          {statGroups.length > 0 && (
            <ScrollArea style={{ flex: 1, minHeight: 0 }} p="xs" scrollbarSize={6} type="always">
              <Stack gap={8} pb={8}>
                {statGroups.map((group) => (
                  <Stack key={group.title} gap={3}>
                    <Text size="xs" fw={700} c="dimmed"
                      style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 9 }}>
                      {group.title}
                    </Text>
                    {group.stats.map((stat, i) => (
                      <Text key={i} size="xs" style={{ fontSize: 10, color: '#aaa', lineHeight: 1.3 }}>
                        {stat}
                      </Text>
                    ))}
                  </Stack>
                ))}
              </Stack>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Webview */}
      <webview
        key={key}
        ref={webviewRef}
        src={srcUrl}
        style={{ flex: 1 }}
        // @ts-ignore — webview is Electron-only JSX
        allowpopups="false"
      />
    </Card>
  );
};
