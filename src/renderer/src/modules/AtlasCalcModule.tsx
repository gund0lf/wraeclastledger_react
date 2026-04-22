import { Card, Text, Stack, Group, Divider, Slider, Badge, Tooltip, Button, Collapse } from '@mantine/core';
import { useSessionStore } from '../store/useSessionStore';
import { useMemo, useState, useEffect } from 'react';

type WizardStep = 'mounting' | 'fragments' | 'nodes' | 'done';

const Pill = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <div onClick={onClick} style={{
    padding: '2px 8px', borderRadius: 10, cursor: 'pointer',
    background: active ? 'rgba(255,147,43,0.15)' : 'rgba(100,100,100,0.15)',
    border: `1px solid ${active ? '#ff932b' : '#555'}`,
    color: active ? '#ff932b' : '#888',
    fontSize: 11, fontWeight: 600, transition: 'all 0.1s', whiteSpace: 'nowrap',
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
  const { maps, settings, updateSetting, activeSessionId } = useSessionStore();

  const isConfigured = settings.mountingModifiers || settings.fragmentsUsed > 0 || settings.smallNodesAllocated > 0;
  const [step, setStep] = useState<WizardStep>(isConfigured ? 'done' : 'mounting');
  const [showNodeSlider, setShowNodeSlider] = useState(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16);
  const [editingPill, setEditingPill] = useState<WizardStep | null>(null);
  const [autoDetectMsg, setAutoDetectMsg] = useState<string | null>(null);

  useEffect(() => {
    const s = useSessionStore.getState().settings;
    const configured = s.mountingModifiers || s.fragmentsUsed > 0 || s.smallNodesAllocated > 0;
    // Also skip wizard if a real tree URL is loaded — user will Apply to Calc from the tree
    let hasTree = false;
    try { hasTree = new URL(s.atlasTreeUrl ?? '').hostname === 'pathofpathing.com' && s.atlasTreeUrl.includes('#'); } catch {}
    setStep(configured || hasTree ? 'done' : 'mounting');
    setShowNodeSlider(false);
    setEditingPill(null);
  }, [activeSessionId]);

  // ── Auto-detect map type from parsed maps ─────────────────────────────────
  // Requires ≥ 4 maps. Real 8-mod maps are always corrupted — Risk scarab adds
  // mods to the map device but does NOT corrupt the map itself.
  useEffect(() => {
    if (maps.length < 4) return;
    const eightModCount = maps.filter((m) => m.modCount > 6 && m.isCorrupted).length;
    const ratio = eightModCount / maps.length;
    const inferred: '6-mod' | '8-mod' = ratio > 0.6 ? '8-mod' : ratio < 0.4 ? '6-mod' : settings.mapType;
    if (inferred !== settings.mapType) {
      updateSetting('mapType', inferred);
      setAutoDetectMsg(`Auto-detected ${inferred} from ${maps.length} maps`);
      const t = setTimeout(() => setAutoDetectMsg(null), 4000);
      return () => clearTimeout(t);
    }
  }, [maps.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const scarabOfRiskCount = useMemo(
    () => settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2,
    [settings.scarabs]
  );

  const baseModCount   = settings.mapType === '8-mod' ? 8 : 6;
  const effectiveMods  = baseModCount + scarabOfRiskCount;
  const fragmentEffect = settings.fragmentsUsed * 3;
  const nodeEffect     = settings.smallNodesAllocated * 2;
  const mountBonus     = settings.mountingModifiers ? effectiveMods * 2 : 0;
  const multiplier     = 1 + (fragmentEffect + nodeEffect + mountBonus) / 100;

  const derivedMapType = useMemo<'6-mod' | '8-mod'>(() => {
    if (maps.length < 4) return settings.mapType;
    const eightMod = maps.filter((m) => m.modCount > 6).length;
    return eightMod > maps.length / 2 ? '8-mod' : '6-mod';
  }, [maps, settings.mapType]);
  const mapTypeConflict = maps.length > 3 && derivedMapType !== settings.mapType;

  const done = () => { setEditingPill(null); setStep('done'); };

  const answerMounting  = (yes: boolean) => { updateSetting('mountingModifiers', yes); editingPill ? done() : setStep('fragments'); };
  const answerFragments = (yes: boolean) => {
    if (!yes) updateSetting('fragmentsUsed', 0);
    else if (settings.fragmentsUsed === 0) updateSetting('fragmentsUsed', 5);
    editingPill ? done() : setStep('nodes');
  };
  const answerNodes = (yes: boolean) => {
    if (yes) { updateSetting('smallNodesAllocated', 16); setShowNodeSlider(false); }
    else setShowNodeSlider(true);
    done();
  };
  const editPill = (which: WizardStep) => {
    setEditingPill(which); setStep(which);
    if (which !== 'nodes') setShowNodeSlider(false);
  };

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
      <Group justify="space-between" mb="xs">
        <Text fw={700} size="sm">Atlas Calc</Text>
        <Tooltip label={[
          fragmentEffect ? `${fragmentEffect}% frags` : '',
          nodeEffect     ? `${nodeEffect}% nodes` : '',
          mountBonus     ? `${mountBonus}% mounting` : '',
        ].filter(Boolean).join(' + ') || 'No bonuses active'}>
          <Badge color="blue" variant="light" style={{ cursor: 'default', fontVariantNumeric: 'tabular-nums' }}>
            {multiplier.toFixed(3)}×
          </Badge>
        </Tooltip>
      </Group>

      <Stack gap={8}>
        <Group justify="space-between" align="center">
          <Group gap={4}>
            <Text size="xs" fw={500}>Map Type</Text>
            {autoDetectMsg && <Text size="xs" c="teal">✓ {autoDetectMsg}</Text>}
          </Group>
          <Group gap={4}>
            {(['6-mod', '8-mod'] as const).map((v) => (
              <div key={v} onClick={() => updateSetting('mapType', v)} style={{
                padding: '2px 10px', borderRadius: 10, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: settings.mapType === v ? 'rgba(51,154,240,0.2)' : 'rgba(100,100,100,0.1)',
                border: `1px solid ${settings.mapType === v ? '#339af0' : '#555'}`,
                color: settings.mapType === v ? '#339af0' : '#888', transition: 'all 0.1s',
              }}>{v}</div>
            ))}
          </Group>
        </Group>

        {scarabOfRiskCount > 0 && (
          <Text size="xs" c="orange">Scarab of Risk: +{scarabOfRiskCount} mods → {effectiveMods} effective</Text>
        )}

        <Divider />

        {step === 'done' && (
          <Stack gap={6}>
            <Text size="xs" c="dimmed" fw={500}>Click to edit</Text>
            <Group gap={6} wrap="wrap">
              <Pill label={settings.mountingModifiers ? `Mounting +${mountBonus}%` : 'Mounting Off'}
                active={settings.mountingModifiers} onClick={() => editPill('mounting')} />
              <Pill label={settings.fragmentsUsed > 0 ? `Frags ${settings.fragmentsUsed}×3%=+${fragmentEffect}%` : 'Frags Off'}
                active={settings.fragmentsUsed > 0} onClick={() => editPill('fragments')} />
              <Pill label={settings.smallNodesAllocated > 0 ? `${settings.smallNodesAllocated} Nodes +${nodeEffect}%` : 'Nodes Off'}
                active={settings.smallNodesAllocated > 0}
                onClick={() => { setShowNodeSlider(settings.smallNodesAllocated > 0 && settings.smallNodesAllocated < 16); editPill('nodes'); }} />
            </Group>
          </Stack>
        )}

        {step === 'mounting' && (
          <>
            <Question question="Mounting Modifiers allocated?"
              hint={`Atlas passive that gives +2% IIQ per explicit mod on the map.\nWith ${effectiveMods} mods → +${mountBonus}% if active.`}
              onYes={() => answerMounting(true)} onNo={() => answerMounting(false)} />
            {!editingPill && <Text size="xs" c="dimmed" ta="center">Step 1 of 3</Text>}
          </>
        )}

        {step === 'fragments' && (
          <>
            <Question question="Using Multiplying Modifiers fragments?"
              hint="Fragments used in the map device with 'Multiplying Modifiers'. Each adds +3% IIQ. Max 5 fragments = +15%."
              onYes={() => answerFragments(true)} onNo={() => answerFragments(false)} />
            {settings.fragmentsUsed > 0 && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Fragments: {settings.fragmentsUsed} (+{fragmentEffect}%)</Text>
                <Slider value={settings.fragmentsUsed} onChange={(v) => updateSetting('fragmentsUsed', v)}
                  min={1} max={5} step={1} label={(v) => `${v} frags (+${v * 3}%)`}
                  marks={[1,2,3,4,5].map((v) => ({ value: v, label: String(v) }))}
                  size="xs" mb={6} />
                <Button size="xs" variant="subtle" onClick={() => editingPill ? done() : setStep('nodes')}>
                  {editingPill ? 'Done ✓' : 'Next →'}
                </Button>
              </Stack>
            )}
            {!editingPill && <Text size="xs" c="dimmed" ta="center">Step 2 of 3</Text>}
          </>
        )}

        {step === 'nodes' && (
          <>
            <Question question="All 16 small nodes allocated?"
              hint="16 × 2% = +32% total"
              onYes={() => answerNodes(true)} onNo={() => answerNodes(false)} />
            {showNodeSlider && (
              <Stack gap={2}>
                <Text size="xs" c="dimmed">Nodes: {settings.smallNodesAllocated} (+{nodeEffect}%)</Text>
                <Slider value={settings.smallNodesAllocated} onChange={(v) => updateSetting('smallNodesAllocated', v)}
                  min={0} max={16} step={1} label={(v) => `${v} nodes (+${v * 2}%)`}
                  marks={[{ value: 0, label: '0' }, { value: 8, label: '8' }, { value: 16, label: '16' }]}
                  size="xs" mb={6} />
                <Button size="xs" variant="subtle" onClick={done}>Done ✓</Button>
              </Stack>
            )}
            {!editingPill && <Text size="xs" c="dimmed" ta="center">Step 3 of 3</Text>}
          </>
        )}

        <Divider />

        <Stack gap={3}>
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
              <Text size="xs" c="orange">+{mountBonus}%</Text>
            </Group>
          )}
          <Group justify="space-between">
            <Text size="sm" fw={700}>Multiplier</Text>
            <Text size="sm" fw={700} c="blue">{multiplier.toFixed(3)}×</Text>
          </Group>
          {settings.atlasBonus && (
            <Group justify="space-between" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 4, marginTop: 2 }}>
              <Text size="xs" c="dimmed">Atlas Bonus (Quantity only)</Text>
              <Text size="xs" c="grape">+25% flat IIQ</Text>
            </Group>
          )}
        </Stack>
      </Stack>
    </Card>
  );
};
