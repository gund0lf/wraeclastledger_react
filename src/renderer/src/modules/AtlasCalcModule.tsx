import { Card, Text, Stack, Group, Slider, Tooltip, Button, UnstyledButton } from '@mantine/core';
import { useSessionKeys } from '../store/useSessionStore';
import { useElementSize } from '@mantine/hooks';
import { useMemo, useState, useEffect, useRef } from 'react';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { computeMultiplier } from '../utils/profit';
import { inferMapType } from '../utils/mapTypeDetection';
import { confirmedLeagueSync } from '../utils/league';
import { COLOR, FONT } from '../utils/uiTokens';
import { MAP_DEVICE_SLOT_COUNT, MULTIPLYING_EFFECT_PER_FRAGMENT } from '../../../shared/mapDevice';

type ConfigStep = 'mounting' | 'fragments' | 'nodes' | 'atlasBonus';

const SectionBar = ({ title, meta, open, onClick }: {
  title: string;
  meta: string;
  open: boolean;
  onClick: () => void;
}) => (
  <UnstyledButton
    onClick={onClick}
    aria-expanded={open}
    style={{
      alignItems: 'center',
      background: COLOR.surfaceSectionBg,
      border: `1px solid ${COLOR.border}`,
      borderRadius: open ? '7px 7px 0 0' : 7,
      display: 'flex',
      gap: 6,
      minHeight: 28,
      padding: '5px 8px',
      width: '100%',
    }}
  >
    {open
      ? <IconChevronDown size={12} color={COLOR.textMuted} />
      : <IconChevronRight size={12} color={COLOR.textMuted} />}
    <Text size="xs" fw={600}>{title}</Text>
    <Text
      size="xs"
      c="dimmed"
      ml="auto"
      style={{
        fontSize: FONT.label,
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {meta}
    </Text>
  </UnstyledButton>
);

const SectionContent = ({ children }: { children: React.ReactNode }) => (
  <div style={{
    background: COLOR.surfaceSectionContent,
    border: `1px solid ${COLOR.border}`,
    borderRadius: '0 0 7px 7px',
    borderTop: 'none',
    padding: 8,
  }}>
    {children}
  </div>
);

const ConfigTile = ({ name, value, active, onClick }: {
  name: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) => (
  <UnstyledButton
    onClick={onClick}
    aria-pressed={active}
    style={{
      background: active ? COLOR.surfaceInfoBg : COLOR.bgRaised,
      border: `1px solid ${active ? COLOR.info : COLOR.border}`,
      borderRadius: 6,
      color: active ? COLOR.info : COLOR.textFaint,
      minWidth: 0,
      padding: '6px 4px',
      textAlign: 'center',
      width: '100%',
    }}
  >
    <Text size="xs" fw={600} truncate>{name}</Text>
    <Text size="xs" style={{ fontSize: FONT.label, opacity: active ? 0.85 : 0.65 }} truncate>
      {value}
    </Text>
  </UnstyledButton>
);

const Question = ({ question, hint, onYes, onNo }: {
  question: string; hint?: string; onYes: () => void; onNo: () => void;
}) => (
  <Stack gap={6} p="xs" style={{
    background: COLOR.surfaceSectionBg,
    borderRadius: 7,
    border: `1px solid ${COLOR.border}`,
  }}>
    <Text size="sm" fw={600}>{question}</Text>
    {hint && <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-line' }}>{hint}</Text>}
    <Group gap="xs" mt={2} justify="center">
      <Button size="xs" variant="light" color="blue" onClick={onYes}>Yes</Button>
      <Button size="xs" variant="default" onClick={onNo}>No</Button>
    </Group>
  </Stack>
);

const StepDots = ({ active }: { active: ConfigStep }) => {
  const steps: ConfigStep[] = ['mounting', 'fragments', 'nodes', 'atlasBonus'];
  return (
    <Group gap={4} justify="center">
      {steps.map((step) => (
        <div key={step} style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: step === active ? COLOR.info : COLOR.border,
        }} />
      ))}
    </Group>
  );
};

export const AtlasCalcModule = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const { ref: panelRef, width: panelWidth } = useElementSize();
  const compactPanel = panelWidth > 0 && panelWidth < 280;
  const { maps, settings, updateSetting, setAtlasBonus, atlasBonusByLeague, activeSessionId, sessionNonce } =
    useSessionKeys('maps', 'settings', 'updateSetting', 'setAtlasBonus', 'atlasBonusByLeague', 'activeSessionId', 'sessionNonce');

  // ── Derived: always fresh from real settings ──────────────────────────────
  const isConfigured = settings.mountingModifiers || settings.multiplyingModifiersAllocated || settings.smallNodesAllocated > 0;
  // Note: we deliberately do NOT check atlasTreeUrl here — pathofpathing always
  // emits a hash even for a blank tree, which would wrongly skip the wizard.
  // The wizard should only hide when actual calc values are set, or dismissed.
  const effectivelyConfigured = isConfigured;

  // ── Wizard local state ────────────────────────────────────────────────────
  const [wizardStep,  setWizardStep]  = useState<ConfigStep>('mounting');
  const [dismissed,   setDismissed]   = useState(false);
  const [editingPill, setEditingPill] = useState<'mounting' | 'fragments' | 'nodes' | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
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
    setBreakdownOpen(false);
    setConfigurationOpen(false);
  }, [activeSessionId, sessionNonce]);

  // When configuration appears externally (tree loaded / Load Build), stop any in-progress editing
  const prevConfigured = useRef(effectivelyConfigured);
  useEffect(() => {
    if (!prevConfigured.current && effectivelyConfigured) {
      setEditingPill(null);
      setShowNodeSlider(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16);
      setConfigurationOpen(false);
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
    const inferred = inferMapType(maps, settings.mapType);
    if (inferred !== settings.mapType) {
      updateSetting('mapType', inferred);
      setAutoDetectMsg(`Auto-detected ${inferred} from ${maps.length} maps`);
      const t = setTimeout(() => setAutoDetectMsg(null), 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [maps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // WP1: single source of truth for multiplier math (utils/profit.ts)
  const {
    multiplier, fragmentCount, fragmentCountSource, fragmentEffect, nodeEffect, scarabOfRiskMods, effectiveMods, mountBonus,
    observedModAverage, observedSampleSize, usesObservedMods,
  } = useMemo(
    () => computeMultiplier(settings, maps),
    [settings.multiplyingModifiersAllocated, settings.fragmentCountOverride, settings.smallNodesAllocated, settings.mountingModifiers, settings.mapType, settings.scarabs, maps] // eslint-disable-line react-hooks/exhaustive-deps
    );

  // ── Wizard answer handlers ────────────────────────────────────────────────
  const finishWizard = () => {
    setEditingPill(null);
    setDismissed(true);
    setConfigurationOpen(false);
  };

  const answerMounting = (yes: boolean) => {
    setUserAnswered(true);
    updateSetting('mountingModifiers', yes);
    if (editingPill) { finishWizard(); return; }
    setWizardStep('fragments');
  };

  const answerFragments = (yes: boolean) => {
    setUserAnswered(true);
    updateSetting('multiplyingModifiersAllocated', yes);
    if (!yes) updateSetting('fragmentCountOverride', null);
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
    setConfigurationOpen(true);
    if (which !== 'nodes') setShowNodeSlider(false);
  };

  const configCount = [
    settings.mountingModifiers,
    settings.multiplyingModifiersAllocated,
    settings.smallNodesAllocated > 0,
    settings.atlasBonus,
  ].filter(Boolean).length;
  const presentationConfigured = effectivelyConfigured || (dismissed && userAnswered);
  const modifierEffect = mountBonus + fragmentEffect + nodeEffect;
  // Observed averages produce fractional mod counts (e.g. 5.8 -> 7.79485...
  // effective). Display rounds to one decimal everywhere; integers stay bare.
  // The MATH is untouched - multiplier precision is unchanged (BACKLOG
  // "Atlas Calc breakdown shows unrounded floats", fixed 2026-07-20).
  const fmt1 = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const heroContext = usesObservedMods && observedModAverage != null
    ? `Observed ${observedModAverage.toFixed(1)} mods · ${effectiveMods.toFixed(1)} effective (Risk +${scarabOfRiskMods})`
    : `${settings.mapType} · ${fmt1(effectiveMods)} effective mods${scarabOfRiskMods > 0 ? ` (Risk +${scarabOfRiskMods})` : ''}`;
  const breakdownMeta = `+${fmt1(modifierEffect)}% mods · ${settings.atlasBonus ? '+25% IIQ' : 'no flat IIQ'}`;
  const configMeta = `${usesObservedMods && observedModAverage != null ? `Observed ${observedModAverage.toFixed(1)}` : settings.mapType} · ${configCount} on`;
  const fragmentSourceLabel = fragmentCountSource === 'override'
    ? `Override · ${fragmentCount} fragments`
    : fragmentCountSource === 'observed'
      ? `Observed from Investment · ${fragmentCount} fragments`
      : `Default · ${fragmentCount} fragments`;

  const questionContent = activeStep && (
    <Stack gap={6}>
      {activeStep === 'mounting' && (
        <Question question="Mounting Modifiers allocated?"
          hint={`2% increased effect of Explicit Modifiers on your Maps per Explicit Modifier.\nWith ${effectiveMods} explicit modifiers → ${effectiveMods * 2}% increased effect.`}
          onYes={() => answerMounting(true)} onNo={() => answerMounting(false)} />
      )}
      {activeStep === 'fragments' && (
        <>
          <Question question="Using Multiplying Modifiers fragments?"
            hint={`${MULTIPLYING_EFFECT_PER_FRAGMENT}% increased effect of Explicit Modifiers on your Maps per Fragment used with the Map. Up to ${MAP_DEVICE_SLOT_COUNT} fragments → ${MAP_DEVICE_SLOT_COUNT * MULTIPLYING_EFFECT_PER_FRAGMENT}% increased effect.`}
            onYes={() => answerFragments(true)} onNo={() => answerFragments(false)} />
          {settings.multiplyingModifiersAllocated && (
            <Stack gap={2}>
              <Text size="xs" c="dimmed">{fragmentSourceLabel} (+{fragmentEffect}%)</Text>
              <Slider value={fragmentCount} onChange={(v) => updateSetting('fragmentCountOverride', v)}
                min={0} max={MAP_DEVICE_SLOT_COUNT} step={1} label={(v) => `${v} frags (+${v * MULTIPLYING_EFFECT_PER_FRAGMENT}%)`}
                marks={Array.from({ length: MAP_DEVICE_SLOT_COUNT + 1 }, (_, value) => ({ value, label: String(value) }))}
                size="xs" mb={18} />
              {settings.fragmentCountOverride !== null && (
                <Button
                  size="compact-xs"
                  variant="default"
                  style={{ alignSelf: 'center' }}
                  onClick={() => updateSetting('fragmentCountOverride', null)}
                >
                  Reset to observed/default
                </Button>
              )}
              <Button size="xs" variant="subtle" onClick={() => editingPill ? finishWizard() : setWizardStep('nodes')}>
                {editingPill ? 'Done' : 'Next'}
              </Button>
            </Stack>
          )}
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
        </>
      )}
      {activeStep === 'atlasBonus' && (
        <Question question="Atlas Bonus complete?"
          hint={'Completing all 100 Atlas Bonus Objectives grants a flat +25% IIQ (Quantity only).\nStarts off each new league/event — Atlas progress resets to zero.'}
          onYes={() => answerAtlasBonus(true)} onNo={() => answerAtlasBonus(false)} />
      )}
      {showWizard && !editingPill && <StepDots active={activeStep} />}
    </Stack>
  );

  return (
    <Card
      ref={panelRef}
      shadow={embedded ? undefined : 'sm'}
      padding={embedded ? 0 : 'sm'}
      radius="md"
      withBorder={!embedded}
      h={embedded ? 'auto' : '100%'}
      style={{ background: embedded ? 'transparent' : undefined, overflow: embedded ? 'visible' : 'auto' }}
    >
      <Stack gap={8}>
        {/* Toned down 2026-07-20 (Sad): the info-blue surface made the hero
            dominate the whole panel; neutral section surface + the softer
            accent token keep it the headline without shouting. */}
        <div style={{
          background: COLOR.surfaceSectionBg,
          border: `1px solid ${COLOR.border}`,
          borderRadius: 8,
          padding: compactPanel ? '7px 8px' : '8px 10px',
          textAlign: 'center',
        }}>
          <Text
            fw={700}
            style={{
              color: presentationConfigured ? COLOR.accent : COLOR.textMuted,
              fontSize: compactPanel ? FONT.xl : 24,
              lineHeight: 1.15,
            }}
          >
            {multiplier.toFixed(3)}×
          </Text>
          <Text tt="uppercase" c="dimmed" style={{ fontSize: FONT.tiny, letterSpacing: 0.5 }}>
            Atlas Multiplier
          </Text>
          <Text
            c={presentationConfigured ? 'dimmed' : undefined}
            title={presentationConfigured ? heroContext : undefined}
            style={{
              color: presentationConfigured ? undefined : COLOR.warning,
              fontSize: FONT.label,
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: compactPanel ? 'nowrap' : 'normal',
            }}
          >
            {presentationConfigured
              ? heroContext
              : 'Not configured — answer 4 quick questions, or skip and import from your Atlas Tree later'}
          </Text>
        </div>

        {autoDetectMsg && <Text size="xs" c="teal">{autoDetectMsg}</Text>}

        {showWizard && !editingPill ? (
          <>
            <Group justify="flex-end">
              <Tooltip label="Skip setup and configure later with Apply to Calc from the Atlas Tree" withArrow>
                <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setDismissed(true)}>
                  Skip setup ›
                </Button>
              </Tooltip>
            </Group>
            {questionContent}
          </>
        ) : (
          <>
            <Stack gap={0}>
              <SectionBar
                title="Breakdown"
                meta={breakdownMeta}
                open={breakdownOpen}
                onClick={() => setBreakdownOpen((open) => !open)}
              />
              {breakdownOpen && (
                <SectionContent>
                  <Stack gap={3}>
                    {scarabOfRiskMods > 0 && (
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" style={{ color: COLOR.accent }}>Scarab of Risk (+{scarabOfRiskMods} mods)</Text>
                        <Text size="xs" style={{ color: COLOR.accent }}>{fmt1(effectiveMods)} effective</Text>
                      </Group>
                    )}
                    {mountBonus > 0 && (
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed">Mounting ({fmt1(effectiveMods)} mods × 2%)</Text>
                        <Text size="xs">+{fmt1(mountBonus)}%</Text>
                      </Group>
                    )}
                    {settings.multiplyingModifiersAllocated && (
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed">Multiplying ({fragmentCount} fragments × {MULTIPLYING_EFFECT_PER_FRAGMENT}%)</Text>
                        <Text size="xs">+{fmt1(fragmentEffect)}%</Text>
                      </Group>
                    )}
                    {nodeEffect > 0 && (
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed">Small Nodes ({settings.smallNodesAllocated} × 2%)</Text>
                        <Text size="xs">+{nodeEffect}%</Text>
                      </Group>
                    )}
                    {settings.atlasBonus && (
                      <Group justify="space-between" wrap="nowrap">
                        <Text size="xs" c="dimmed">Atlas Bonus (Quantity only)</Text>
                        <Text size="xs">+25% flat IIQ</Text>
                      </Group>
                    )}
                  </Stack>
                </SectionContent>
              )}
            </Stack>

            <Stack gap={0}>
              <SectionBar
                title="Configuration"
                meta={configMeta}
                open={configurationOpen}
                onClick={() => {
                  setConfigurationOpen((open) => !open);
                  if (configurationOpen) setEditingPill(null);
                }}
              />
              {configurationOpen && (
                <SectionContent>
                  <Stack gap={8}>
                    <Group justify="space-between" gap={6} wrap="nowrap">
                      <Text size="xs" fw={500}>Map Type</Text>
                      {observedModAverage != null ? (
                        <Tooltip multiline w={280} label={`Exact advanced-copy coverage: ${observedSampleSize}/${maps.length} maps. Scarab of Risk modifiers are added after this observed average.`}>
                          <div style={{
                            padding: '2px 8px',
                            borderRadius: 10,
                            cursor: 'help',
                            fontSize: FONT.body,
                            fontWeight: 600,
                            background: usesObservedMods ? COLOR.surfaceInfoBg : COLOR.bgRaised,
                            border: `1px solid ${usesObservedMods ? COLOR.info : COLOR.dim}`,
                            color: usesObservedMods ? COLOR.info : COLOR.textFaint,
                            whiteSpace: 'nowrap',
                          }}>
                            Observed {observedModAverage.toFixed(1)}
                          </div>
                        </Tooltip>
                      ) : (
                        <Group gap={4} wrap="nowrap">
                          {(['6-mod', '8-mod'] as const).map((mapType) => {
                            const active = settings.mapType === mapType;
                            return (
                              <UnstyledButton
                                key={mapType}
                                onClick={() => updateSetting('mapType', mapType)}
                                aria-pressed={active}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: 10,
                                  fontSize: FONT.body,
                                  fontWeight: 600,
                                  background: active ? COLOR.surfaceInfoBg : COLOR.bgRaised,
                                  border: `1px solid ${active ? COLOR.info : COLOR.dim}`,
                                  color: active ? COLOR.info : COLOR.textFaint,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {mapType}
                              </UnstyledButton>
                            );
                          })}
                        </Group>
                      )}
                    </Group>

                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 5 }}>
                      <ConfigTile
                        name="Mounting"
                        value={settings.mountingModifiers ? `+${mountBonus}%` : 'Off'}
                        active={settings.mountingModifiers}
                        onClick={() => editPill('mounting')}
                      />
                      <ConfigTile
                        name="Fragments"
                        value={settings.multiplyingModifiersAllocated ? `${fragmentSourceLabel} · +${fmt1(fragmentEffect)}%` : 'Off'}
                        active={settings.multiplyingModifiersAllocated}
                        onClick={() => editPill('fragments')}
                      />
                      <ConfigTile
                        name="Small Nodes"
                        value={settings.smallNodesAllocated > 0 ? `${settings.smallNodesAllocated} · +${nodeEffect}%` : 'Off'}
                        active={settings.smallNodesAllocated > 0}
                        onClick={() => {
                          setShowNodeSlider(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16);
                          editPill('nodes');
                        }}
                      />
                      <Tooltip multiline w={230} label="Completing all 100 Atlas Bonus Objectives grants a flat +25% IIQ. Atlas progress resets each league.">
                        <div>
                          <ConfigTile
                            name="Atlas Bonus"
                            value={settings.atlasBonus ? '+25% IIQ' : 'Off'}
                            active={settings.atlasBonus}
                            onClick={toggleAtlasBonus}
                          />
                        </div>
                      </Tooltip>
                    </div>

                    {editingPill && questionContent}
                  </Stack>
                </SectionContent>
              )}
            </Stack>

            {showBonusHint && (
              <Group gap={6} wrap="nowrap" align="center">
                <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, flex: 1 }}>
                  Atlas Bonus not set for {activeLeague}. Turn it on if your Atlas is complete (+25% IIQ).
                </Text>
                <Tooltip label="Dismiss for this league (marks Atlas Bonus off until next league)" withArrow>
                  <Button size="compact-xs" variant="subtle" color="gray" onClick={dismissBonusHint}>Dismiss</Button>
                </Tooltip>
              </Group>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
};
