import { Card, ActionIcon, Group, Tooltip, CopyButton, Text, Badge, ScrollArea, Stack, TextInput, Button } from '@mantine/core';
import { useState, useRef, useEffect, useCallback } from 'react';
import { IconRefresh, IconCopy, IconCheck, IconChartBar, IconLink, IconX } from '@tabler/icons-react';
import { useSessionStore, useSessionKeys } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { getManifest } from '../utils/gameData';
import { atlasVersionOf } from '../utils/strategyCompat';
import { isCrossLeagueSession } from '../utils/historicalSession';
import { SectionLabel } from '../components/ui/SectionLabel';
import { COLOR, FONT } from '../utils/uiTokens'
import { deriveAtlasCalcSettings, type AtlasStatGroup } from '../../../shared/atlasStats';

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

export const AtlasTreeModule = () => {
  const { activeSessionId, sessionNonce, updateSetting } =
    useSessionKeys('activeSessionId', 'sessionNonce', 'updateSetting');
  // Scalar selector: this panel hosts a webview — it must NOT re-render on
  // unrelated settings edits (scarab typing etc.), only when the tree URL moves.
  const atlasTreeUrl = useSessionStore((s) => s.settings.atlasTreeUrl);
  const atlasApplyNonce = useUIStore((s) => s.atlasApplyNonce);
  const atlasApplySessionNonce = useUIStore((s) => s.atlasApplySessionNonce);
  const webviewRef     = useRef<Electron.WebviewTag>(null);
  const webviewHostRef = useRef<HTMLDivElement>(null);
  const visibleRef     = useRef(false);
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
  const [statGroups,  setStatGroups]  = useState<AtlasStatGroup[]>([]);
  const [statsError,  setStatsError]  = useState<string | null>(null);
  const [importUrl,   setImportUrl]   = useState('');
  const [showImport,  setShowImport]  = useState(false);
  const [calcApplied, setCalcApplied] = useState<string | null>(null);
  const [webviewReady, setWebviewReady] = useState(false);

  // A key change alone reloads immediately and can still let Pixi construct
  // while FlexLayout is settling after a session/strategy switch. Deliberate
  // reloads therefore unmount the guest first, then remount it only after two
  // frames with real host bounds — the same protection as hidden-tab activation.
  const remountAfterLayout = useCallback(() => {
    setWebviewReady(false);
    visibleRef.current = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const host = webviewHostRef.current;
        if (!host) return;
        const rect = host.getBoundingClientRect();
        if (rect.width < 80 || rect.height < 80) return;
        visibleRef.current = true;
        setKey((k) => k + 1);
        setWebviewReady(true);
      });
    });
  }, []);

  // FlexLayout keeps inactive tabs mounted but gives their content display:none.
  // Path of Pathing's Pixi viewport centres only at construction, so loading the
  // guest at 0x0 permanently puts the tree off-screen. Unmount while hidden and
  // mount only after two frames at a real size, allowing layout + Electron's
  // guest bounds to settle before Pixi reads window.innerWidth/innerHeight.
  useEffect(() => {
    const host = webviewHostRef.current;
    if (!host) return;
    let frame1 = 0;
    let frame2 = 0;

    const cancelFrames = () => {
      if (frame1) cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
      frame1 = 0;
      frame2 = 0;
    };
    const observeSize = () => {
      const rect = host.getBoundingClientRect();
      const visible = rect.width >= 80 && rect.height >= 80;
      if (!visible) {
        cancelFrames();
        visibleRef.current = false;
        setWebviewReady(false);
        return;
      }
      if (visibleRef.current) return;
      visibleRef.current = true;
      cancelFrames();
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(() => {
          const settled = host.getBoundingClientRect();
          if (visibleRef.current && settled.width >= 80 && settled.height >= 80) {
            setWebviewReady(true);
          }
        });
      });
    };

    const observer = new ResizeObserver(observeSize);
    observer.observe(host);
    observeSize();
    return () => {
      observer.disconnect();
      cancelFrames();
      visibleRef.current = false;
    };
  }, []);

  // ── Reload when session changes ────────────────────────────────────────────
  useEffect(() => {
    if (prevSessionRef.current === activeSessionId && prevNonceRef.current === sessionNonce) return;
    prevSessionRef.current = activeSessionId;
    prevNonceRef.current   = sessionNonce;
    // A strategy load creates a new session and requests an Atlas Calc apply in
    // adjacent store updates. Tie that request to the resulting session nonce so
    // effect scheduling cannot let this reset erase a legitimate pending apply.
    autoApplyRef.current = atlasApplySessionNonce === sessionNonce;
    const url = useSessionStore.getState().settings.atlasTreeUrl;
    const next = isPathofpathingUrl(url) ? url : BASE_URL;
    setSrcUrl(next);
    setCapturedUrl(next);
    remountAfterLayout();
    setStatGroups([]);
    setStatsOpen(false); // close stats panel on session change
  }, [activeSessionId, sessionNonce, atlasApplySessionNonce, remountAfterLayout]);

  // ── Reload when atlasTreeUrl is set externally (Load Build Settings) ───────
  useEffect(() => {
    const stored = atlasTreeUrl;
    if (!stored || stored === capturedUrl || stored === srcUrl) return;
    if (!isPathofpathingUrl(stored)) return;
    setSrcUrl(stored);
    setCapturedUrl(stored);
    autoApplyRef.current = true; // auto-apply calc after load
    remountAfterLayout();
    setStatGroups([]);
  }, [atlasTreeUrl, remountAfterLayout]);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Force re-apply on Load Build even when the URL is UNCHANGED ────────────
  // Loading the same strategy twice sets atlasTreeUrl to the same value, so the
  // effect above (which bails on an unchanged URL) never fires — yet newSession()
  // has already zeroed the calc config, so the calc would sit empty and the setup
  // wizard would reappear. StrategyBrowserModule bumps this nonce on every Load
  // Build; we honour it by forcing a webview reload + auto-apply. The request is
  // session-bound, so either effect order reaches the same result and a stale
  // request can never apply to a later session.
  const prevApplyNonceRef = useRef(0);
  useEffect(() => {
    if (prevApplyNonceRef.current === atlasApplyNonce) return;
    prevApplyNonceRef.current = atlasApplyNonce;
    const current = useSessionStore.getState();
    if (atlasApplySessionNonce !== current.sessionNonce) return;
    const url = current.settings.atlasTreeUrl;
    if (!isPathofpathingUrl(url)) return;
    setSrcUrl(url);
    setCapturedUrl(url);
    autoApplyRef.current = true;
    remountAfterLayout();
    setStatGroups([]);
  }, [atlasApplyNonce, atlasApplySessionNonce, remountAfterLayout]);

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
      await readStats(true);
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
  }, [key, webviewReady, updateSetting]);

  // Close pathofpathing's own stats panel after we scraped it - OUR overlay
  // presents the data, so theirs must never stay stuck open behind it
  // (previously only the auto-apply path closed it; Sad, 2026-07-20).
  const closeUpstreamStatsPanel = async (wv: Electron.WebviewTag) => {
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
  };

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

      await closeUpstreamStatsPanel(wv);

      if (!result || (result as any).error) {
        setStatsError((result as any)?.error
          ?? 'No stats found. Select some nodes in the atlas tree first — if nodes ARE selected and this keeps happening, pathofpathing may have changed its layout; please report it.');
        setStatGroups([]);
        if (!autoApply) setStatsOpen(true);
        return;
      }

      const groups: AtlasStatGroup[] = Array.isArray(result)
        ? result as AtlasStatGroup[]
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
      if (autoApply) applyGroupsToCalc(groups);
    } catch {
      setStatsError('Could not read stats — try navigating the tree first. If this keeps happening, pathofpathing may have changed its layout; please report it.');
      if (!autoApply) setStatsOpen(true);
    }
  };

  // Recenter must reload the tree AS IT IS NOW. srcUrl is frozen at
  // mount/import time (in-page allocation navs only advance capturedUrl +
  // settings.atlasTreeUrl), so a bare remount silently rewound every
  // allocation made since load - and the post-remount navigation event then
  // re-captured the STALE url into the session, destroying the newer one
  // (found 2026-07-20). Re-source from the live captured state instead.
  const reload = () => {
    const url = useSessionStore.getState().settings.atlasTreeUrl;
    if (isPathofpathingUrl(url)) { setSrcUrl(url); setCapturedUrl(url); }
    remountAfterLayout();
    setStatGroups([]);
  };

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
    remountAfterLayout();
    setStatGroups([]);
    setImportUrl('');
    setShowImport(false);
  };

  // ── Apply stats to Atlas Calc ─────────────────────────────────────────────
  // applyGroupsToCalc takes groups directly (avoids stale-state issues when
  // called right after readStats resolves)
  const applyGroupsToCalc = (groups: AtlasStatGroup[]) => {
    const patch = deriveAtlasCalcSettings(groups);
    const appliedParts: string[] = [];
    if (patch.smallNodesAllocated !== undefined) {
      updateSetting('smallNodesAllocated', patch.smallNodesAllocated);
      appliedParts.push(`${patch.smallNodesAllocated} small nodes`);
    }
    if (patch.mountingModifiers) {
      updateSetting('mountingModifiers', true);
      appliedParts.push('Mounting Modifiers');
    }
    if (patch.fragmentsUsed) {
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
        <Tooltip label="Recenter tree (reload)">
          <ActionIcon size="md" variant="subtle" color="gray" onClick={reload}
            aria-label="Recenter atlas tree">
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
            <Group gap={4} wrap="nowrap">
              {/* Viewing never mutates the calc; applying is this explicit
                  click - now available right where the stats are read
                  (Sad, 2026-07-20). */}
              {statGroups.length > 0 && (
                <Button size="compact-xs" variant="light"
                  onClick={() => applyGroupsToCalc(statGroups)}>
                  Apply to Calc
                </Button>
              )}
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setStatsOpen(false)}><IconX size={11} /></ActionIcon>
            </Group>
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

      {/* Keep the host mounted so ResizeObserver can detect tab activation;
          mount the guest only after the host has stable non-zero bounds. */}
      <div ref={webviewHostRef} style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {webviewReady && (
          <webview
            key={key}
            ref={webviewRef}
            src={srcUrl}
            style={{ flex: 1 }}
            // @ts-ignore — webview is Electron-only JSX
            allowpopups="false"
          />
        )}
      </div>
    </Card>
  );
};
