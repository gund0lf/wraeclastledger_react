import { Card, Text, Stack, Group, Divider, Slider, Badge, Tooltip, Button } from '@mantine/core';
import { useSessionKeys } from '../store/useSessionStore';
import { useMemo, useState, useEffect, useRef } from 'react';
import { computeMultiplier } from '../utils/profit';
import { confirmedLeagueSync } from '../utils/league';
import { ModuleHeader } from '../components/ui/ModuleHeader';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { COLOR, FONT } from '../utils/uiTokens'

// session-16 density pass 2: config pills share the map-type selector's blue
// active treatment — one accent per panel instead of the old orange/blue mix.
const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <div onClick={onClick} style={{
    padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
    background: active ? 'rgba(51,154,240,0.2)' : 'rgba(100,100,100,0.15)',
    border: `1px solid ${active ? COLOR.info : COLOR.dim}`,
    color: active ? COLOR.info : COLOR.textFaint,
    fontSize: FONT.body, fontWeight: 600, transition: 'all 0.1s', whiteSpace: 'nowrap',
  }}>
    {label}
  </div>
);

const Question = ({ question, hint, onYes, onNo }: {
  question: string; hint?: string; onYes: () => void; onNo: () => void;
}) => (
  <Stack gap={4} p="xs"
    style={{ background: 'rgba(100,100,255,0.06)', borderRadius: 6, border: '1px solid rgba(100,100,255,0.2)' }}>
    <Text size="sm" fw={600}>{question}</Text>
    {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    <Group gap="xs" mt={2}>
      <Button size="xs" variant="filled" color="orange" onClick={onYes}>Yes</Button>
      <Button size="xs" variant="default" onClick={onNo}>No</Button>
    </Group>
  </Stack>
);

export const AtlasCalcModule = () => {
  const { maps, settings, updateSetting, setAtlasBonus, atlasBonusByLeague, activeSessionId, sessionNonce } =
    useSessionKeys('maps', 'settings', 'updateSetting', 'setAtlasBonus', 'atlasBonusByLeague', 'activeSessionId', 'sessionNonce');

  // ── Derived: always fresh from real settings ──────────────────────────────
  const isConfigured = settings.mountingModifiers || settings.fragmentsUsed > 0 || settings.smallNodesAllocated > 0;
  // Note: we deliberately do NOT check atlasTreeUrl here — pathofpathing always
  // emits a hash even for a blank tree, which would wrongly skip the wizard.
  // The wizard should only hide when actual calc values are set, or dismissed.
  const effectivelyConfigured = isConfigured;

  // ── Wizard local state ────────────────────────────────────────────────────
  const [wizardStep,  setWizardStep]  = useState<'mounting' | 'fragments' | 'nodes' | 'atlasBonus'>('mounting');
  const [dismissed,   setDismissed]   = useState(false);
  const [editingPill, setEditingPill] = useState<'mounting' | 'fragments' | 'nodes' | null>(null);
  const [showNodeSlider, setShowNodeSlider] = useState(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16);
  const [autoDetectMsg, setAutoDetectMsg]   = useState<string | null>(null);
  // True once the user answers any wizard step. Lets the wizard keep running through
  // all steps even though each answer sets a config value (which would otherwise flip
  // effectivelyConfigured and hide the wizard mid-walk).
  const [userAnswered, setUserAnswered]     = useState(false);
  const prevSessionRef = useRef(activeSessionId);
  const prevNonceRef   = useRef(sessionNonce);

  // Reset wizard completely on session change OR new session. The nonce is required
  // because newSession() leaves activeSessionId as null when you were already on an
  // unsaved session (null -> null), so keying on the id alone would miss it.
  useEffect(() => {
    if (prevSessionRef.current === activeSessionId && prevNonceRef.current === sessionNonce) return;
    prevSessionRef.current = activeSessionId;
    prevNonceRef.current   = sessionNonce;
    setWizardStep('mounting');
    setDismissed(false);
    setShowNodeSlider(false);
    setEditingPill(null);
    setUserAnswered(false);
  }, [activeSessionId, sessionNonce]);

  // When configuration appears externally (tree loaded / Load Build), stop any in-progress editing
  const prevConfigured = useRef(effectivelyConfigured);
  useEffect(() => {
    if (!prevConfigured.current && effectivelyConfigured) {
      setEditingPill(null);
      setShowNodeSlider(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16);
    }
    prevConfigured.current = effectivelyConfigured;
  }, [effectivelyConfigured, settings.smallNodesAllocated]);

  // ── Show logic ────────────────────────────────────────────────────────────
  // The wizard keeps running once the user starts answering (userAnswered), even
  // though their answers set config values. When config appears WITHOUT the user
  // answering -- a tree autofills via Apply to Calc, or a saved session loads -- the
  // wizard stays hidden and the pills show instead.
  const showWizard  = (!effectivelyConfigured || userAnswered) && !dismissed;
  const showPills   = !showWizard;
  const activeStep  = editingPill ?? (showWizard ? wizardStep : null);

  // ── Auto-detect map type ──────────────────────────────────────────────────
  // 8-mod content includes:
  //   - Corrupted maps with chaos rolls (which forces 8 mods on a previously rare-rolled map)
  //   - Nightmare maps (always 6+ mods, can drop with 8-9 mods natively, NOT inherently corrupted)
  // We count both so a session of pure uncorrupted Nightmare maps still
  // auto-detects as 8-mod content correctly.
  useEffect(() => {
    if (maps.length < 4) return undefined;
    const eightModCount = maps.filter((m) => m.modCount > 6 && (m.isCorrupted || m.isNightmare)).length;
    const ratio = eightModCount / maps.length;
    const inferred: '6-mod' | '8-mod' = ratio > 0.6 ? '8-mod' : ratio < 0.4 ? '6-mod' : settings.mapType;
    if (inferred !== settings.mapType) {
      updateSetting('mapType', inferred);
      setAutoDetectMsg(`Auto-detected ${inferred} from ${maps.length} maps`);
      const t = setTimeout(() => setAutoDetectMsg(null), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [maps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // WP1: single source of truth for multiplier math (utils/profit.ts)
  const { multiplier, fragmentEffect, nodeEffect, scarabOfRiskMods, effectiveMods, mountBonus } = useMemo(
    () => computeMultiplier(settings),
    [settings.fragmentsUsed, settings.smallNodesAllocated, settings.mountingModifiers, settings.mapType, settings.scarabs] // eslint-disable-line react-hooks/exhaustive-deps
    );

  // ── Wizard answer handlers ────────────────────────────────────────────────
  const finishWizard = () => {
    setEditingPill(null);
    setDismissed(true);
  };

  const answerMounting = (yes: boolean) => {
    setUserAnswered(true);
    updateSetting('mountingModifiers', yes);
    if (editingPill) { finishWizard(); return; }
    setWizardStep('fragments');
  };

  const answerFragments = (yes: boolean) => {
    setUserAnswered(true);
    if (!yes) updateSetting('fragmentsUsed', 0);
    else if (settings.fragmentsUsed === 0) updateSetting('fragmentsUsed', 5);
    if (editingPill) { finishWizard(); return; }
    setWizardStep('nodes');
  };

  // Nodes is the last CONFIG step; in the wizard walk it advances to the Atlas
  // Bonus step, but when editing a single pill it just finishes.
  const afterNodes = () => {
    if (editingPill) { finishWizard(); return; }
    setWizardStep('atlasBonus');
  };

  const answerNodes = (yes: boolean) => {
    setUserAnswered(true);
    if (yes) { updateSetting('smallNodesAllocated', 16); setShowNodeSlider(false); }
    else setShowNodeSlider(true);
    afterNodes();
  };

  // All Atlas Bonus writes go through the store's setAtlasBonus, which records
  // per-league progress for a live session under the KNOWN active league only.
  const answerAtlasBonus = (yes: boolean) => {
    setUserAnswered(true);
    setAtlasBonus(yes);
    finishWizard();
  };

  const toggleAtlasBonus = () => setAtlasBonus(!settings.atlasBonus);

  // Dismissing the nudge = "deliberately off for this league" (records false).
  const dismissBonusHint = () => setAtlasBonus(false);

  // Show the nudge ONLY on a live session (activeSessionId null — never on a
  // loaded historical session), when the ACTIVE league is known, the bonus is
  // OFF, and this league has no recorded choice yet. Per-league: re-appears each
  // new league (Atlas resets), never when the bonus is on or after a choice, and
  // never under an unknown/guessed league.
  const activeLeague = confirmedLeagueSync();
  const showBonusHint =
    showPills && activeSessionId === null && !!activeLeague &&
    !settings.atlasBonus && atlasBonusByLeague[activeLeague] === undefined;

  const editPill = (which: 'mounting' | 'fragments' | 'nodes') => {
    setEditingPill(which);
    if (which !== 'nodes') setShowNodeSlider(false);
  };

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
      <ModuleHeader
        mb="xs"
        title={
          /* session-16: Map Type moved into the header slot — the in-panel
             "Atlas Calc" title was redundant with the tab label. */
          <Group gap={4} wrap="nowrap">
            <Text size="xs" fw={500}>Map Type</Text>
            {(['6-mod', '8-mod'] as const).map((v) => (
              <div key={v} onClick={() => updateSetting('mapType', v)} style={{
                padding: '2px 10px', borderRadius: 10, cursor: 'pointer', fontSize: FONT.body, fontWeight: 600,
                background: settings.mapType === v ? 'rgba(51,154,240,0.2)' : 'rgba(100,100,100,0.1)',
                border: `1px solid ${settings.mapType === v ? COLOR.info : COLOR.dim}`,
                color: settings.mapType === v ? COLOR.info : COLOR.textFaint, transition: 'all 0.1s',
              }}>{v}</div>
            ))}
          </Group>
        }
        right={
          <Tooltip label={[
            fragmentEffect ? `${fragmentEffect}% frags` : '',
            nodeEffect     ? `${nodeEffect}% nodes` : '',
            mountBonus     ? `${mountBonus}% mounting` : '',
            settings.atlasBonus ? '+25% flat IIQ (atlas bonus)' : '',
          ].filter(Boolean).join(' + ') || 'No bonuses active'}>
            <Badge color="blue" variant="outline" size="sm" style={{ cursor: 'default', fontVariantNumeric: 'tabular-nums' }}>
              {multiplier.toFixed(3)}×
            </Badge>
          </Tooltip>
        }
      />

      <Stack gap={8}>
        {autoDetectMsg && <Text size="xs" c="teal">{autoDetectMsg}</Text>}

        {showPills && (
          /* session-16: configuration collapses once set up — saves vertical
             space; the title doubles as the instruction. Atlas Bonus is now a
             pill here too (direct toggle) instead of a bottom-row switch. */
          <CollapsibleSection variant="group" title="Click to edit" defaultOpen={false}>
            <Group gap={6} wrap="wrap">
              <Pill label={settings.mountingModifiers ? `Mounting +${mountBonus}%` : 'Mounting Off'}
                active={settings.mountingModifiers} onClick={() => editPill('mounting')} />
              <Pill label={settings.fragmentsUsed > 0 ? `Frags ${settings.fragmentsUsed}×3%=+${fragmentEffect}%` : 'Frags Off'}
                active={settings.fragmentsUsed > 0} onClick={() => editPill('fragments')} />
              <Pill label={settings.smallNodesAllocated > 0 ? `${settings.smallNodesAllocated} Nodes +${nodeEffect}%` : 'Nodes Off'}
                active={settings.smallNodesAllocated > 0}
                onClick={() => {
                  setShowNodeSlider(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16);
                  editPill('nodes');
                }} />
              <Tooltip multiline w={230}
                label="Completing all 100 Atlas Bonus Objectives grants a flat +25% IIQ (Quantity only). Turn this on once your Atlas is complete. It starts off each new league/event because Atlas progress resets to zero.">
                <div>
                  <Pill label={settings.atlasBonus ? 'Atlas Bonus +25% IIQ' : 'Atlas Bonus Off'}
                    active={settings.atlasBonus}
                    onClick={toggleAtlasBonus} />
                </div>
              </Tooltip>
            </Group>
          </CollapsibleSection>
        )}

        {showBonusHint && (
          <Group gap={6} wrap="nowrap" align="center">
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, flex: 1 }}>
              Atlas Bonus not set for {activeLeague} — open &quot;Click to edit&quot; above and turn it on if your Atlas is complete (+25% IIQ Quantity).
            </Text>
            <Tooltip label="Dismiss for this league (marks Atlas Bonus off until next league)" withArrow>
              <Button size="compact-xs" variant="subtle" color="gray" onClick={dismissBonusHint}>Dismiss</Button>
            </Tooltip>
          </Group>
        )}

        {showWizard && !editingPill && (
          <Group justify="flex-end">
            <Tooltip label="Skip the setup — configure manually by clicking the Atlas Tree and using Apply to Calc, or click the pills above after loading a build" withArrow multiline w={240}>
              <Button size="xs" variant="subtle" color="gray" onClick={() => setDismissed(true)}>
                Skip
              </Button>
            </Tooltip>
          </Group>
        )}

        {activeStep === 'mounting' && (
          <>
            <Question question="Mounting Modifiers allocated?"
              hint={`2% increased effect of Explicit Modifiers on your Maps per Explicit Modifier.\nWith ${effectiveMods} explicit modifiers → ${effectiveMods * 2}% increased effect.`}
              onYes={() => answerMounting(true)} onNo={() => answerMounting(false)} />
            {showWizard && !editingPill && <Text size="xs" c="dimmed" ta="center">Step 1 of 4</Text>}
          </>
        )}

        {activeStep === 'fragments' && (
          <>
            <Question question="Using Multiplying Modifiers fragments?"
              hint="3% increased effect of Explicit Modifiers on your Maps per Fragment used with the Map. Up to 5 fragments → 15% increased effect."
              onYes={() => answerFragments(true)} onNo={() => answerFragments(false)} />
            {settings.fragmentsUsed > 0 && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Fragments: {settings.fragmentsUsed} (+{fragmentEffect}%)</Text>
                <Slider value={settings.fragmentsUsed} onChange={(v) => updateSetting('fragmentsUsed', v)}
                  min={1} max={5} step={1} label={(v) => `${v} frags (+${v * 3}%)`}
                  marks={[1,2,3,4,5].map((v) => ({ value: v, label: String(v) }))}
                  size="xs" mb={6} />
                <Button size="xs" variant="subtle" onClick={() => editingPill ? finishWizard() : setWizardStep('nodes')}>
                  {editingPill ? 'Done' : 'Next'}
                </Button>
              </Stack>
            )}
            {showWizard && !editingPill && <Text size="xs" c="dimmed" ta="center">Step 2 of 4</Text>}
          </>
        )}

        {activeStep === 'nodes' && (
          <>
            <Question question="All 16 small nodes allocated?"
              hint="Each grants 2% increased effect of Explicit Modifiers on your Maps. All 16 → 32% increased effect."
              onYes={() => answerNodes(true)} onNo={() => answerNodes(false)} />
            {showNodeSlider && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Nodes: {settings.smallNodesAllocated} (+{nodeEffect}%)</Text>
                <Slider value={settings.smallNodesAllocated} onChange={(v) => updateSetting('smallNodesAllocated', v)}
                  min={0} max={16} step={1} label={(v) => `${v} nodes (+${v * 2}%)`}
                  marks={[{ value: 0, label: '0' }, { value: 8, label: '8' }, { value: 16, label: '16' }]}
                  size="xs" mb={6} />
                <Button size="xs" variant="subtle" onClick={afterNodes}>{editingPill ? 'Done' : 'Next'}</Button>
              </Stack>
            )}
            {showWizard && !editingPill && <Text size="xs" c="dimmed" ta="center">Step 3 of 4</Text>}
          </>
        )}

        {activeStep === 'atlasBonus' && (
          <>
            <Question question="Atlas Bonus complete?"
              hint={'Completing all 100 Atlas Bonus Objectives grants a flat +25% IIQ (Quantity only).\nStarts off each new league/event — Atlas progress resets to zero.'}
              onYes={() => answerAtlasBonus(true)} onNo={() => answerAtlasBonus(false)} />
            {showWizard && !editingPill && <Text size="xs" c="dimmed" ta="center">Step 4 of 4</Text>}
          </>
        )}

        <Divider />

        <Stack gap={3}>
          {scarabOfRiskMods > 0 && (
            <Group justify="space-between">
              {/* session-16: subtle accent — this row appears by scarab choice,
                  not panel config, so it reads as "external" at a glance */}
              <Text size="xs" style={{ color: COLOR.accent }}>Scarab of Risk (+{scarabOfRiskMods} mods)</Text>
              <Text size="xs" style={{ color: COLOR.accent }}>{effectiveMods} effective</Text>
            </Group>
          )}
          {fragmentEffect > 0 && (
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Fragments ({settings.fragmentsUsed} × 3%)</Text>
              <Text size="xs">+{fragmentEffect}%</Text>
            </Group>
          )}
          {nodeEffect > 0 && (
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Small Nodes ({settings.smallNodesAllocated} × 2%)</Text>
              <Text size="xs">+{nodeEffect}%</Text>
            </Group>
          )}
          {mountBonus > 0 && (
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Mounting ({effectiveMods} mods × 2%)</Text>
              <Text size="xs">+{mountBonus}%</Text>
            </Group>
          )}
          {settings.atlasBonus && (
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Atlas Bonus (Quantity only)</Text>
              <Text size="xs">+25% flat IIQ</Text>
            </Group>
          )}
          <Group justify="space-between">
            <Text size="sm" fw={700}>Multiplier</Text>
            <Text size="sm" fw={700} c="blue">{multiplier.toFixed(3)}×</Text>
          </Group>
        </Stack>
      </Stack>
    </Card>
  );
};
