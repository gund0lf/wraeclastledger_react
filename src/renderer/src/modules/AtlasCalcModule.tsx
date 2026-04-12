import {
  Card, Text, SegmentedControl, Stack, Group, Divider,
  Slider, Badge, Switch, Tooltip, Collapse,
} from '@mantine/core';
import { useSessionStore } from '../store/useSessionStore';
import { useMemo, useState } from 'react';

export const AtlasCalcModule = () => {
  const { maps, settings, updateSetting } = useSessionStore();
  const [showFragSlider, setShowFragSlider] = useState(settings.fragmentsUsed > 0);

  // ── Auto-derived from investment settings ─────────────────────────────────
  // Scarab of Risk: detected from scarab slots
  const scarabOfRiskCount = useMemo(
    () => settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2,
    [settings.scarabs]
  );

  // Map type: most common from parsed maps; falls back to setting
  const derivedMapType = useMemo<'6-mod' | '8-mod'>(() => {
    if (maps.length === 0) return settings.mapType;
    // Maps with modCount > 6 are 8-mod
    const eightMod = maps.filter((m) => m.modCount > 6).length;
    return eightMod > maps.length / 2 ? '8-mod' : '6-mod';
  }, [maps, settings.mapType]);

  // If parsed maps disagree with setting, show a note
  const mapTypeConflict = maps.length > 3 && derivedMapType !== settings.mapType;

  // ── Multiplier math ────────────────────────────────────────────────────────
  const baseModCount   = settings.mapType === '8-mod' ? 8 : 6;
  const effectiveMods  = baseModCount + scarabOfRiskCount;
  const fragmentEffect = settings.fragmentsUsed * 3;
  const nodeEffect     = settings.smallNodesAllocated * 2;
  const mountBonus     = settings.mountingModifiers ? effectiveMods * 2 : 0;
  const multiplier     = 1 + (fragmentEffect + nodeEffect + mountBonus) / 100;

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
        {/* 6-mod / 8-mod — user sets this; shown as auto-detected if maps available */}
        <Stack gap={2}>
          <Group justify="space-between">
            <Text size="xs" fw={500}>Map Type</Text>
            {maps.length > 3 && (
              <Text size="xs" c="dimmed">
                {mapTypeConflict
                  ? `⚠ Parsed maps suggest ${derivedMapType}`
                  : `✓ Matches parsed maps`}
              </Text>
            )}
          </Group>
          <SegmentedControl
            value={settings.mapType}
            onChange={(v) => updateSetting('mapType', v as '6-mod' | '8-mod')}
            data={['6-mod', '8-mod']}
            size="xs"
          />
        </Stack>

        {/* Mounting Modifiers */}
        <Group justify="space-between" align="center">
          <Stack gap={0}>
            <Text size="xs" fw={500}>Mounting Modifiers</Text>
            <Text size="xs" c="dimmed">
              {settings.mountingModifiers
                ? `${effectiveMods} mods × 2% = +${mountBonus}%`
                : `+2% per explicit mod when on`}
            </Text>
          </Stack>
          <SegmentedControl
            value={settings.mountingModifiers ? 'on' : 'off'}
            onChange={(v) => updateSetting('mountingModifiers', v === 'on')}
            data={[{ label: 'On', value: 'on' }, { label: 'Off', value: 'off' }]}
            size="xs"
            color={settings.mountingModifiers ? 'orange' : undefined}
          />
        </Group>

        {/* Scarab of Risk — auto-read from investment */}
        {scarabOfRiskCount > 0 && (
          <Group justify="space-between">
            <Text size="xs" c="dimmed">Scarab of Risk (from Investment)</Text>
            <Text size="xs" c="orange">+{scarabOfRiskCount} mods → {effectiveMods}</Text>
          </Group>
        )}

        <Divider />

        {/* Fragments — only manual input left besides nodes */}
        <Group justify="space-between">
          <Stack gap={0}>
            <Text size="xs" fw={500}>Fragments (Uncharted Realms)</Text>
            <Text size="xs" c="dimmed">3% per fragment, up to 5</Text>
          </Stack>
          <Switch size="xs" checked={showFragSlider}
            onChange={(e) => {
              setShowFragSlider(e.currentTarget.checked);
              if (!e.currentTarget.checked) updateSetting('fragmentsUsed', 0);
            }} />
        </Group>
        <Collapse in={showFragSlider}>
          <Slider
            value={settings.fragmentsUsed}
            onChange={(v) => updateSetting('fragmentsUsed', v)}
            min={0} max={5} step={1}
            label={(v) => `${v} frag${v !== 1 ? 's' : ''} (+${v * 3}%)`}
            marks={[0,1,2,3,4,5].map((v) => ({ value: v, label: String(v) }))}
            size="xs" mb={6}
          />
        </Collapse>

        {/* Small nodes — the main manual input */}
        <Stack gap={2}>
          <Group justify="space-between">
            <Text size="xs" fw={500}>Small Nodes Allocated</Text>
            <Text size="xs" c="dimmed">2% each, up to 16</Text>
          </Group>
          <Slider
            value={settings.smallNodesAllocated}
            onChange={(v) => updateSetting('smallNodesAllocated', v)}
            min={0} max={16} step={1}
            label={(v) => `${v} nodes (+${v * 2}%)`}
            marks={[{ value: 0, label: '0' }, { value: 8, label: '8' }, { value: 16, label: '16' }]}
            size="xs" mb={6}
          />
        </Stack>

        <Divider />

        {/* Clean summary — no redundant math */}
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
        </Stack>
      </Stack>
    </Card>
  );
};
