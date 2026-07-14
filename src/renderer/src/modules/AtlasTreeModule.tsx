import { Card, ActionIcon, Group, Tooltip, CopyButton, Text, Badge, ScrollArea, Stack, TextInput, Button } from '@mantine/core';
import { useState, useRef, useEffect } from 'react';
import { IconRefresh, IconCopy, IconCheck, IconChartBar, IconLink, IconX } from '@tabler/icons-react';
import { useSessionStore, useSessionKeys } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { getManifest } from '../utils/gameData';
import { atlasVersionOf } from '../utils/strategyCompat';
import { isCrossLeagueSession } from '../utils/historicalSession';
import { SectionLabel } from '../components/ui/SectionLabel';
import { COLOR, FONT } from '../utils/uiTokens'

const BASE_URL = 'https://pathofpathing.com';

// Safely check that a URL belongs to the pathofpathing.com host
function isPathofpathingUrl(url: string): boolean {
  try { return new URL(url).hostname === 'pathofpathing.com'; }
  catch { return false; }
}

// Polls a predicate (via async check fn) until it returns true or the timeout expires.
// Used to wait for pathofpathing page elements to render before injecting JS.
async function pollUntil(
  check: () => Promise<boolean>,
  intervalMs = 200,
  maxMs = 5000,
): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
}

interface StatGroup {
  title: string;
  stats: string[];
}

export const AtlasTreeModule = () => {
  const { activeSessionId, sessionNonce, updateSetting } =
    useSessionKeys('activeSessionId', 'sessionNonce', 'updateSetting');
  // Scalar selector: this panel hosts a webview — it must NOT re-render on
  // unrelated settings edits (scarab typing etc.), only when the tree URL moves.
  const atlasTreeUrl = useSessionStore((s) => s.settings.atlasTreeUrl);
  const webviewRef     = useRef<any>(null);
  const prevSessionRef = useRef<string | null>(activeSessionId);
  const prevNonceRef   = useRef(sessionNonce);
  const autoApplyRef   = useRef(false); // set true when URL imported — triggers auto readStats+apply

  const [srcUrl,      setSrcUrl]      = useState(() => {
    const stored = atlasTreeUrl;
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
    if (prevSessionRef.current === activeSessionId && prevNonceRef.current === sessionNonce) return;
    prevSessionRef.current = activeSessionId;
    prevNonceRef.current   = sessionNonce;
    autoApplyRef.current = false; // never auto-read stats on New Session
    const url = useSessionStore.getState().settings.atlasTreeUrl;
    const next = isPathofpathingUrl(url) ? url : BASE_URL;
    setSrcUrl(next);
    setCapturedUrl(next);
    setKey((k) => k + 1);
    setStatGroups([]);
    setStatsOpen(false); // close stats panel on session change
  }, [activeSessionId, sessionNonce]);

  // ── Reload when atlasTreeUrl is set externally (Load Build Settings) ───────
  useEffect(() => {
    const stored = atlasTreeUrl;
    if (!stored || stored === capturedUrl || stored === srcUrl) return;
    if (!isPathofpathingUrl(stored)) return;
    setSrcUrl(stored);
    setCapturedUrl(stored);
    autoApplyRef.current = true; // auto-apply calc after load
    setKey((k) => k + 1);
    setStatGroups([]);
  }, [atlasTreeUrl]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Force re-apply on Load Build even when the URL is UNCHANGED ────────────
  // Loading the same strategy twice sets atlasTreeUrl to the same value, so the
  // effect above (which bails on an unchanged URL) never fires — yet newSession()
  // has already zeroed the calc config, so the calc would sit empty and the setup
  // wizard would reappear. StrategyBrowserModule bumps this nonce on every Load
  // Build; we honour it unconditionally by forcing a webview reload + auto-apply.
  // This runs AFTER the session-change effect (which sets autoApplyRef=false), so
  // its autoApplyRef=true wins for the load.
  const atlasApplyNonce = useUIStore((s) => s.atlasApplyNonce);
  const prevApplyNonceRef = useRef(atlasApplyNonce);
  useEffect(() => {
    if (prevApplyNonceRef.current === atlasApplyNonce) return;
    prevApplyNonceRef.current = atlasApplyNonce;
    const url = useSessionStore.getState().settings.atlasTreeUrl;
    if (!isPathofpathingUrl(url)) return;
    setSrcUrl(url);
    setCapturedUrl(url);
    autoApplyRef.current = true;
    setKey((k) => k + 1);
    setStatGroups([]);
  }, [atlasApplyNonce]);

  // ── Attach navigation + finish-load listeners ─────────────────────────────
  useEffect(() => {
    const wv = webviewRef.current;
    if (!wv) return;
    // Capture atlas points (allocated/max) from the pathofpathing counter
    // spans (#skillTreeNormalNodeCount / ...Maximum — feasibility confirmed
    // session 13). Fired on every tree edit (nav events change the hash) and
    // on load; the small delay lets the spans update after the nav event.
    // Author-declared share context ONLY — never load-bearing (batch 2026-07).
    const readPoints = () => {
      setTimeout(async () => {
        try {
          const r = await (wv as any).executeJavaScript(`
            (function() {
              var a = document.getElementById('skillTreeNormalNodeCount');
              var m = document.getElementById('skillTreeNormalNodeCountMaximum');
              if (!a || !m) return null;
              var av = parseInt(a.textContent, 10);
              var mv = parseInt(m.textContent, 10);
              if (isNaN(av) || isNaN(mv) || mv <= 0) return null;
              return { allocated: av, max: mv };
            })()
          `);
          if (r && typeof r.allocated === 'number' && typeof r.max === 'number') {
            const st = useSessionStore.getState();
            // Phase 1.5 historical guard (rollover plan, 2026-07-11): a
            // cross-league loaded session's stored tree may render under a
            // NEWER patch's ?v= — its point counts must never overwrite the
            // historical session's data. Same-league tree edits still
            // capture (a deliberate user action on their own session).
            if (isCrossLeagueSession(st.activeSessionId, st.settings.leagueName)) {
              console.log('[AtlasTree] point capture skipped — historical session');
              return;
            }
            const s = st.settings;
            if (s.atlasPoints !== r.allocated || s.atlasPointsMax !== r.max) {
              updateSetting('atlasPoints', r.allocated);
              updateSetting('atlasPointsMax', r.max);
            }
          }
        } catch (err) {
          console.error('[AtlasTree] failed to read atlas points:', err);
        }
      }, 250);
    };
    const handleNav = (e: any) => {
      const url: string = e.url ?? '';
      if (!isPathofpathingUrl(url)) return;
      setCapturedUrl(url);
      updateSetting('atlasTreeUrl', url);
      readPoints(); // node toggles change the hash — capture the new count
    };
    // Auto-apply to calc when URL is loaded externally (Load Build Settings / import URL)
    // Block any navigation that would leave pathofpathing.com (e.g. ad/link clicks on the page)
    const handleWillNavigate = (e: any) => {
      if (!isPathofpathingUrl(e.url ?? '')) e.preventDefault();
    };
    const handleFinishLoad = async () => {
      readPoints(); // restored sessions: capture points once the page is up
      if (!autoApplyRef.current) return;
      autoApplyRef.current = false;
      // Poll until the stats button exists — more reliable than a fixed timeout
      await pollUntil(() =>
        (wv as any).executeJavaScript(
          `Promise.resolve(!!document.getElementById('skillTreeStats_ShowHide'))`,
        ).catch(() => false),
      );
      readStats(true);
    };
    wv.addEventListener('will-navigate', handleWillNavigate);
    wv.addEventListener('did-navigate', handleNav);
    wv.addEventListener('did-navigate-in-page', handleNav);
    wv.addEventListener('did-finish-load', handleFinishLoad);
    return () => {
      wv.removeEventListener('will-navigate', handleWillNavigate);
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
        setStatsError((result as any)?.error
          ?? 'No stats found. Select some nodes in the atlas tree first — if nodes ARE selected and this keeps happening, pathofpathing may have changed its layout; please report it.');
        setStatGroups([]);
        if (!autoApply) setStatsOpen(true);
        else {
          // Auto-apply opened the pathofpathing stats panel to read it; nothing was found
          // (e.g. an empty/blank tree), so close it again so it does not stay stuck open.
          try {
            await wv.executeJavaScript(`
              (function() {
                var btn = document.getElementById('skillTreeStats_ShowHide');
                if (btn && btn.textContent && btn.textContent.trim() === 'Hide stats') btn.click();
              })()
            `);
          } catch (closeErr) {
            console.error('[AtlasTree] failed to close stats panel after empty auto-read:', closeErr);
          }
        }
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
        } catch (closeErr) {
          console.error('[AtlasTree] failed to close stats panel:', closeErr);
        }
      }
    } catch {
      setStatsError('Could not read stats — try navigating the tree first. If this keeps happening, pathofpathing may have changed its layout; please report it.');
      if (!autoApply) setStatsOpen(true);
    }
  };

  const reload  = () => { setKey((k) => k + 1); setStatGroups([]); };

  const hasTree = capturedUrl !== BASE_URL && capturedUrl.includes('#');
  const urlShort = capturedUrl.replace('https://pathofpathing.com', '') || '/';

  // Atlas-tree version flag (rollover §5.4 Tier 1). Compare the loaded tree's
  // ?v= against the manifest's atlasTreeVersion — but ONLY when BOTH are known.
  // Manifest '' = unobserved for this patch -> stay silent (no false 'outdated',
  // matching the strategyCompat discipline). Lights up at 3.29 once the version
  // is recorded in the manifest.
  const treeVersion    = atlasVersionOf(capturedUrl);
  const currentVersion = getManifest().atlasTreeVersion;
  const versionMismatch = !!treeVersion && !!currentVersion && treeVersion !== currentVersion;

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
      <Group px={8} py={4} gap="xs" style={{ flexShrink: 0, borderBottom: `1px solid ${COLOR.bgHover}` }}>
        <Text size="xs" c="dimmed"
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: FONT.small }}>
          {urlShort.length > 60 ? urlShort.slice(0, 60) + '…' : urlShort}
        </Text>
        {hasTree && <Badge size="xs" color="green" variant="dot">Tree saved</Badge>}
        {versionMismatch && (
          <Tooltip label={`This tree was built for atlas version ${treeVersion}; current is ${currentVersion}. Node values may differ under the new patch.`} withArrow multiline w={230}>
            <Badge size="xs" color="yellow" variant="light" style={{ cursor: 'help' }}>v{treeVersion}</Badge>
          </Tooltip>
        )}
        {statGroups.length > 0 && (
          <Tooltip label="Apply node stats to Atlas Calc (small nodes, Mounting Modifiers, fragments)">
            <Button size="compact-xs" variant="default"
              onClick={applyToAtlasCalc}>
              Apply to Calc
            </Button>
          </Tooltip>
        )}
        <Tooltip label="Import tree from URL">
          <ActionIcon size="md" variant={showImport ? 'light' : 'subtle'} color="gray"
            onClick={() => setShowImport((v) => !v)}>
            <IconLink size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Read allocated node stats">
          {/* Wrap in arrow function so the click MouseEvent isn't passed as the
              `autoApply` parameter — that would always be truthy and silently
              put readStats into auto-apply mode on every manual click. */}
          <ActionIcon size="md" variant="subtle" color="gray" onClick={() => readStats()}>
            <IconChartBar size={14} />
          </ActionIcon>
        </Tooltip>
        <CopyButton value={capturedUrl}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'Copied!' : 'Copy tree URL'}>
              <ActionIcon size="md" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
        <Tooltip label="Reload (re-centers the tree)">
          <ActionIcon size="md" variant="subtle" color="gray" onClick={reload}>
            <IconRefresh size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      {/* URL import row */}
      {showImport && (
        <Group px={8} py={4} gap={4} style={{ flexShrink: 0, borderBottom: `1px solid ${COLOR.bgHover}`, background: 'rgba(255,147,43,0.05)' }}>
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
          background: COLOR.bgDeep, borderBottom: `1px solid ${COLOR.bgHover}`,
          maxHeight: '65%', display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.8)',
        }}>
          <Group justify="space-between" px={8} pt={6} pb={4} style={{ flexShrink: 0 }}>
            <Text size="xs" fw={700} c="blue">Atlas Node Stats</Text>
            <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setStatsOpen(false)}><IconX size={11} /></ActionIcon>
          </Group>
          {calcApplied && (
            <Text size="xs" c="teal" px={8} pb={4} style={{ flexShrink: 0 }}>
              Applied to Calc: {calcApplied}
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
                    <SectionLabel fw={700}>
                      {group.title}
                    </SectionLabel>
                    {group.stats.map((stat, i) => (
                      <Text key={i} size="xs" style={{ fontSize: FONT.small, color: COLOR.textDim, lineHeight: 1.3 }}>
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
