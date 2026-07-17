/**
 * RegexBuilderModule — K-of-N combinatorial stash regex generator
 * Product of Sums (POS) logic — confirmed working in PoE stash search.
 * PoE char limit: 250 (stash), 300 (vendor). Engine is line-by-line.
 *
 * WP8: this file now exports `BuilderTab` (no outer Card) — the Builder tab of
 * the merged Regex panel (see RegexPanelModule). Mod-preset data lives in
 * utils/regexBuilderPresets.ts; the builder's group workspace is persisted in
 * the store (`regexBuilderGroups`) so it survives session switches.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Text, Group, Stack, Button, TextInput, ActionIcon,
  NumberInput, Tooltip, CopyButton, ScrollArea, Collapse,
  Switch, Badge, Modal, Menu, Progress,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDeviceFloppy,
  IconMinus,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { useSessionKeys } from '../store/useSessionStore';
import { PRESET_GROUPS, type ModGroupState } from '../utils/regexBuilderPresets';
import {
  adjustAltAugChisel,
  findPresetIdForGroup,
  generateAltAugRegex,
  generateBuilderRegex,
  getAvailablePresetIds,
  REGEX_CHAR_LIMIT,
} from '../utils/regexBuilder';
import { COLOR, FONT } from '../utils/uiTokens';

// ─── POS Algorithm ────────────────────────────────────────────────────────────

const charCountColor = (n: number) =>
  n > REGEX_CHAR_LIMIT ? COLOR.loss : n > 220 ? COLOR.warning : COLOR.profit;
const TIER_COLORS: Record<string, string> = { S: 'yellow', A: 'orange', B: 'blue' };

// ─── Mod Group Editor ─────────────────────────────────────────────────────────

const displayGroupName = (label: string) => label.replace(/\s+Mods$/i, '');

const canonicalGroupLabel = (group: ModGroupState) => {
  const presetId = findPresetIdForGroup(group, PRESET_GROUPS);
  return PRESET_GROUPS.find((preset) => preset.id === presetId)?.label ?? group.label;
};

const displayModLabel = (label: string, isCustom: boolean) => {
  if (isCustom) return label;
  const match = label.match(/^(.*?)\s+\(([^()]+)\)$/);
  return match ? `(${match[2]}) ${match[1]}` : label;
};

const ModGroupEditor = ({
  group,
  isPreset,
  displayLabel,
  onChange,
  onRemove,
}: {
  group: ModGroupState;
  isPreset: boolean;
  displayLabel: string;
  onChange: (group: ModGroupState) => void;
  onRemove: () => void;
}) => {
  const [customOpen, setCustomOpen] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [removeHover, setRemoveHover] = useState(false);
  const tooltipStyles = {
    tooltip: {
      background: COLOR.bgPanel,
      border: `1px solid ${COLOR.bgHoverStrong}`,
      padding: '8px 10px',
      maxWidth: 280,
      borderRadius: 6,
    },
  };

  const toggleMod = (modId: string) => {
    const active = group.selected.includes(modId);
    const selected = active
      ? group.selected.filter((id) => id !== modId)
      : [...group.selected, modId];
    onChange({
      ...group,
      selected,
      k: Math.max(1, Math.min(group.k, selected.length || 1)),
    });
  };

  const removeCustomMod = (modId: string) => {
    const selected = group.selected.filter((id) => id !== modId);
    onChange({
      ...group,
      mods: group.mods.filter((mod) => mod.id !== modId),
      selected,
      k: Math.max(1, Math.min(group.k, selected.length || 1)),
    });
  };

  const addCustomMod = () => {
    const token = newToken.trim();
    if (!token) return;
    const id = `custom_${Date.now()}`;
    onChange({
      ...group,
      mods: [...group.mods, { id, token, label: newLabel.trim() || token }],
      selected: [...group.selected, id],
    });
    setNewToken('');
    setNewLabel('');
    setCustomOpen(false);
  };

  const changeMinimum = (difference: number) => {
    if (group.selected.length === 0) return;
    onChange({
      ...group,
      k: Math.max(1, Math.min(group.selected.length, group.k + difference)),
    });
  };

  return (
    <Stack
      gap={8}
      p="sm"
      style={{
        background: COLOR.bgInset,
        borderRadius: 8,
        border: `1px solid ${COLOR.border}`,
      }}
    >
      <Group gap={8} wrap="nowrap">
        {isPreset ? (
          <Text size="xs" fw={600} style={{ flex: 1, minWidth: 0 }}>
            {displayLabel}
          </Text>
        ) : (
          <TextInput
            size="xs"
            value={group.label}
            aria-label="Custom group name"
            style={{ flex: 1, minWidth: 0 }}
            styles={{
              input: {
                fontSize: FONT.body,
                fontWeight: 600,
                border: 'none',
                background: 'transparent',
                padding: 0,
              },
            }}
            onChange={(event) => onChange({ ...group, label: event.currentTarget.value })}
          />
        )}
        <Group gap={4} wrap="nowrap">
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>K</Text>
          <ActionIcon
            size="xs"
            variant="default"
            aria-label="Decrease minimum"
            disabled={group.selected.length === 0 || group.k <= 1}
            onClick={() => changeMinimum(-1)}
          >
            <IconMinus size={11} />
          </ActionIcon>
          <Text size="xs" fw={700} style={{ minWidth: 12, textAlign: 'center' }}>
            {group.selected.length > 0 ? group.k : '—'}
          </Text>
          <ActionIcon
            size="xs"
            variant="default"
            aria-label="Increase minimum"
            disabled={group.selected.length === 0 || group.k >= group.selected.length}
            onClick={() => changeMinimum(1)}
          >
            <IconPlus size={11} />
          </ActionIcon>
        </Group>
        <Tooltip label={`Delete ${displayLabel}`}>
          <ActionIcon
            size="sm"
            variant="default"
            aria-label={`Delete group ${displayLabel}`}
            onMouseEnter={() => setRemoveHover(true)}
            onMouseLeave={() => setRemoveHover(false)}
            style={removeHover
              ? { color: 'var(--mantine-color-red-4)', borderColor: 'var(--mantine-color-red-7)' }
              : undefined}
            onClick={() => {
              setRemoveHover(false);
              onRemove();
            }}
          >
            <IconX size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
        Click a chip to select it. Selected preset X deselects; custom X removes it.
      </Text>

      <Group
        gap={4}
        align="flex-start"
        style={{ padding: 2 }}
      >
        {group.mods.map((mod) => {
          const active = group.selected.includes(mod.id);
          const isCustom = mod.id.startsWith('custom_');
          const tierColor = mod.tier ? (TIER_COLORS[mod.tier] ?? 'gray') : 'gray';
          const removeAction = isCustom
            ? () => removeCustomMod(mod.id)
            : active
              ? () => toggleMod(mod.id)
              : undefined;
          return (
            <Tooltip
              key={mod.id}
              styles={tooltipStyles}
              label={
                <Stack gap={4}>
                  <Text size="xs" fw={600} c="white">{mod.label}</Text>
                  <Text
                    style={{
                      fontFamily: 'monospace',
                      fontSize: FONT.label,
                      background: COLOR.bgHover,
                      padding: '2px 6px',
                      borderRadius: 3,
                      color: COLOR.accent,
                      display: 'inline-block',
                    }}
                  >
                    {mod.token}
                  </Text>
                  {mod.detail && (
                    <Text
                      size="xs"
                      style={{ fontSize: FONT.label, color: COLOR.textDim, lineHeight: 1.5 }}
                    >
                      {mod.detail}
                    </Text>
                  )}
                </Stack>
              }
              withArrow
              multiline
            >
              <Badge
                size="sm"
                variant={active ? 'filled' : 'outline'}
                color={active ? tierColor : 'gray'}
                style={{ cursor: 'pointer', fontSize: FONT.label, maxWidth: 300 }}
                onClick={() => toggleMod(mod.id)}
                rightSection={removeAction ? (
                  <ActionIcon
                    size={12}
                    variant="transparent"
                    color={isCustom ? 'red' : 'gray'}
                    aria-label={isCustom ? `Remove ${mod.label}` : `Deselect ${mod.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      removeAction();
                    }}
                  >
                    <IconX size={9} />
                  </ActionIcon>
                ) : undefined}
              >
                {displayModLabel(mod.label, isCustom)}
              </Badge>
            </Tooltip>
          );
        })}
        {group.mods.length === 0 && (
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
            Add a custom token to this group.
          </Text>
        )}
      </Group>

      <Group gap={6} justify="flex-end">
        <Button
          size="xs"
          variant="default"
          leftSection={<IconPlus size={12} />}
          onClick={() => setCustomOpen((open) => !open)}
        >
          custom token
        </Button>
      </Group>

      <Collapse in={customOpen}>
        <Group gap={6} align="flex-end" wrap="nowrap">
          <TextInput
            size="xs"
            label="Token"
            placeholder="e.g. syn"
            value={newToken}
            onChange={(event) => setNewToken(event.currentTarget.value)}
            style={{ width: 130 }}
            onKeyDown={(event) => event.key === 'Enter' && addCustomMod()}
          />
          <TextInput
            size="xs"
            label="Label (optional)"
            value={newLabel}
            onChange={(event) => setNewLabel(event.currentTarget.value)}
            style={{ flex: 1 }}
            onKeyDown={(event) => event.key === 'Enter' && addCustomMod()}
          />
          <Button
            size="xs"
            variant="light"
            onClick={addCustomMod}
            disabled={!newToken.trim()}
          >
            Add
          </Button>
        </Group>
      </Collapse>
    </Stack>
  );
};

// ─── Alt/Aug Crafting ─────────────────────────────────────────────────────────

const AltAugSection = ({ onCharCountChange }: { onCharCountChange: (count: number) => void }) => {
  const [currencyMin, setCurrencyMin] = useState(90);
  const [packMin,     setPackMin]     = useState(20);
  const [gigaMin,     setGigaMin]     = useState(150);
  const [chiseled,    setChiseled]    = useState(true);

  // When toggling chisel, adjust the number boxes directly so the user sees the change
  const handleChiselToggle = (nowChiseled: boolean) => {
    const adjusted = adjustAltAugChisel(
      { currencyMin, packMin, gigaMin, chiseled },
      nowChiseled,
    );
    setCurrencyMin(adjusted.currencyMin);
    setGigaMin(adjusted.gigaMin);
    setChiseled(adjusted.chiseled);
  };

  // Both open-slot patterns combined — no toggle needed:
  //   " Map \(Tier" → prefix-only (open suffix): "Punishing Map (Tier 16)"
  //   "^Map of"     → suffix-only (open prefix): "Map of Defiance (Tier 16)"
  // A full 2-mod map like "Punishing Map of Defiance" matches NEITHER → no false positives.
  // ^ anchor confirmed working in PoE stash search.
  const { regex, charCount } = generateAltAugRegex({
    currencyMin,
    packMin,
    gigaMin,
    chiseled,
  });

  useEffect(() => onCharCountChange(charCount), [charCount, onCharCountChange]);

  return (
    <Stack gap={8}>
      <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, lineHeight: 1.5 }}>
        Highlights maps that: (1) have ≥{currencyMin}% currency AND ≥{packMin}% pack size,
        or (2) have currency as their ONLY mod (open slot — Augment it){gigaMin > currencyMin ? `, or (3) ≥${gigaMin}% currency regardless of pack (keeper)` : ''}.
      </Text>
      <Text size="xs" c="dimmed" style={{ fontSize: FONT.label, lineHeight: 1.6 }}>
        Open suffix: <Text span style={{ fontFamily: 'monospace', fontSize: FONT.label, color: COLOR.accent }}> Map \(Tier</Text>
        {'  '}Open prefix: <Text span style={{ fontFamily: 'monospace', fontSize: FONT.label, color: COLOR.accent }}>^Map of</Text>
        {'  '}Neither matches a full 2-mod map → no false positives.
      </Text>

      <Group gap="md" wrap="wrap" align="flex-end">
        <NumberInput size="xs" label="Min currency %" value={currencyMin} min={0} max={400} step={10}
          style={{ width: 120 }}
          onChange={(v) => setCurrencyMin(Number(v) || 0)} />
        <NumberInput size="xs" label="Min pack size %" value={packMin} min={0} max={100} step={5}
          style={{ width: 120 }}
          onChange={(v) => setPackMin(Number(v) || 0)} />
        <NumberInput size="xs" label="Currency Floor (Ignore Pack Size)" description="Highlight regardless of pack"
          value={gigaMin} min={0} max={500} step={10}
          style={{ width: 200 }}
          onChange={(v) => setGigaMin(Number(v) || 0)} />
      </Group>

      <Group gap={8} align="center">
        <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Avarice chisel already applied?</Text>
        <Switch size="sm" checked={chiseled} onChange={(e) => handleChiselToggle(e.currentTarget.checked)} />
        <Text size="xs" c={chiseled ? 'green' : 'orange'} style={{ fontSize: FONT.small }}>
          {chiseled
            ? 'Yes — showing post-chisel values'
            : 'No — thresholds already adjusted -50 for pre-chisel rolls'}
        </Text>
      </Group>

      <Stack gap={2}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
            {charCount} chars
            {charCount > REGEX_CHAR_LIMIT && <Text span c="red"> over limit</Text>}
          </Text>
          <CopyButton value={regex} timeout={2000}>
            {({ copied, copy }) => (
              <Button size="xs" variant="light" color={copied ? 'teal' : 'orange'}
                leftSection={copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
                onClick={copy} style={{ minWidth: 90 }}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Text style={{ fontFamily: 'monospace', fontSize: FONT.label, color: COLOR.accent, wordBreak: 'break-all', lineHeight: 1.6 }}>
          {regex}
        </Text>
      </Stack>
    </Stack>
  );
};

const SectionBar = ({
  open,
  title,
  description,
  meta,
  onToggle,
  helpOpen,
  onHelpToggle,
}: {
  open: boolean;
  title: string;
  description: string;
  meta: string;
  onToggle: () => void;
  helpOpen?: boolean;
  onHelpToggle?: () => void;
}) => (
  <Group
    gap={8}
    wrap="nowrap"
    onClick={onToggle}
    style={{
      cursor: 'pointer',
      userSelect: 'none',
      background: COLOR.bgRaised,
      border: `1px solid ${COLOR.border}`,
      borderRadius: open ? '8px 8px 0 0' : 8,
      padding: '7px 10px',
    }}
  >
    <ActionIcon size={16} variant="transparent" c="dimmed" aria-hidden>
      {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
    </ActionIcon>
    <Text size="xs" fw={700} style={{ flexShrink: 0 }}>{title}</Text>
    <Text size="xs" c="dimmed" style={{ fontSize: FONT.label, minWidth: 0 }}>
      {description}
    </Text>
    <div style={{ flex: 1 }} />
    {onHelpToggle && (
      <Tooltip label="How this works">
        <ActionIcon
          size="xs"
          radius="xl"
          variant={helpOpen ? 'light' : 'default'}
          color={helpOpen ? 'teal' : 'gray'}
          aria-label="Toggle how K-of-N works"
          onClick={(event) => {
            event.stopPropagation();
            onHelpToggle();
          }}
        >
          ?
        </ActionIcon>
      </Tooltip>
    )}
    <Text size="xs" c="dimmed" style={{ fontSize: FONT.label, flexShrink: 0 }}>
      {meta}
    </Text>
  </Group>
);

// ─── Builder tab ──────────────────────────────────────────────────────────────

export const BuilderTab = () => {
  const { regexBuilderGroups, setRegexBuilderGroups, saveRegexSet } =
    useSessionKeys('regexBuilderGroups', 'setRegexBuilderGroups', 'saveRegexSet');
  const groups = regexBuilderGroups;
  const rootRef = useRef<HTMLDivElement>(null);
  const [craftingOpen, setCraftingOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(true);
  const [howOpen, setHowOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [altAugCharCount, setAltAugCharCount] = useState(84);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(
    () => groups[0]?.id ?? null,
  );
  const [wideLayout, setWideLayout] = useState(false);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const updateWidth = (width: number) => setWideLayout(width >= 680);
    updateWidth(Math.max(0, root.clientWidth - 16));
    const observer = new ResizeObserver((entries) => {
      updateWidth(entries[0]?.contentRect.width ?? Math.max(0, root.clientWidth - 16));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (groups.some((group) => group.id === activeGroupId)) return;
    setActiveGroupId(groups[0]?.id ?? null);
  }, [activeGroupId, groups]);

  const availablePresetIds = useMemo(
    () => getAvailablePresetIds(groups, PRESET_GROUPS),
    [groups],
  );
  const availablePresets = PRESET_GROUPS.filter((preset) =>
    availablePresetIds.includes(preset.id));

  const updateGroup = (idx: number, g: ModGroupState) =>
    setRegexBuilderGroups(groups.map((x, i) => (i === idx ? g : x)));
  const removeGroup = (idx: number) => {
    const remaining = groups.filter((_, groupIndex) => groupIndex !== idx);
    setRegexBuilderGroups(remaining);
    if (groups[idx]?.id === activeGroupId) {
      setActiveGroupId(remaining[Math.min(idx, remaining.length - 1)]?.id ?? null);
    }
  };
  const addGroup = (presetId?: string) => {
    if (presetId && !availablePresetIds.includes(presetId)) return;
    const preset = PRESET_GROUPS.find((p) => p.id === presetId);
    const newGroup: ModGroupState = {
      id: `g_${Date.now()}`,
      label: preset?.label ?? 'New Group',
      mods: (preset?.mods ?? []).map((m) => ({ id: m.id, token: m.token, label: m.label, detail: m.detail, tier: m.tier })),
      selected: [],
      k: 2,
    };
    setRegexBuilderGroups([...groups, newGroup]);
    setActiveGroupId(newGroup.id);
    setBuilderOpen(true);
  };

  const generated = useMemo(() => generateBuilderRegex(groups), [groups]);
  const finalRegex = generated.regex;
  const charCount = generated.charCount;
  const blockCount = generated.blockCount;
  const activeGroupIndex = groups.findIndex((group) => group.id === activeGroupId);
  const activeGroup = activeGroupIndex >= 0 ? groups[activeGroupIndex] : undefined;
  const activeGroupIsPreset = activeGroup
    ? findPresetIdForGroup(activeGroup, PRESET_GROUPS) !== undefined
    : false;
  const groupSummary = generated.groups
    .map((generatedGroup) => {
      const source = groups.find((group) => group.id === generatedGroup.id);
      const label = source ? canonicalGroupLabel(source) : generatedGroup.label;
      return `${displayGroupName(label)} ≥${generatedGroup.minimum} of ${generatedGroup.selectedCount}`;
    })
    .join(' · ');
  const budgetPercent = Math.min(100, (charCount / REGEX_CHAR_LIMIT) * 100);

  const doSave = () => {
    const label = saveName.trim();
    if (!label || !finalRegex) return;
    saveRegexSet({ label, type: 'other', lines: [finalRegex] });
    setSaveOpen(false);
    setSaveName('');
  };

  return (
    <div
      ref={rootRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: 8 }}
    >
      {/* Save-as-Set modal */}
      <Modal opened={saveOpen} onClose={() => setSaveOpen(false)} title="Save as Regex Set" size="sm">
        <Stack gap="sm">
          <TextInput label="Name" placeholder="e.g. My K-of-N setup" autoFocus
            value={saveName} onChange={(e) => setSaveName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && saveName.trim()) doSave(); }} />
          <Text style={{ fontFamily: 'monospace', fontSize: FONT.label, wordBreak: 'break-all', color: COLOR.textFaint }}>{finalRegex}</Text>
          <Button onClick={doSave} disabled={!saveName.trim()}>Save</Button>
        </Stack>
      </Modal>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={4}>
        <Stack gap={10}>
          <Stack gap={0}>
            <SectionBar
              open={builderOpen}
              title="K-of-N Mod Groups"
              description="highlight maps with at least K of your chosen mods"
              meta={`${generated.groups.length} active · ${blockCount} block${blockCount !== 1 ? 's' : ''}`}
              onToggle={() => setBuilderOpen((open) => !open)}
              helpOpen={howOpen}
              onHelpToggle={() => setHowOpen((open) => !open)}
            />
            <Collapse in={builderOpen}>
              <Stack
                gap={10}
                style={{
                  background: COLOR.bgPanel,
                  border: `1px solid ${COLOR.border}`,
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: 10,
                }}
              >
                <Collapse in={howOpen}>
                  <Text
                    size="xs"
                    c="dimmed"
                    style={{
                      fontSize: FONT.small,
                      lineHeight: 1.55,
                      background: COLOR.bgSunken,
                      border: `1px solid ${COLOR.borderDeep}`,
                      borderRadius: 6,
                      padding: '9px 11px',
                    }}
                  >
                    PoE&apos;s engine is <Text span c="orange">line-by-line</Text> — .* across lines doesn&apos;t work.
                    <Text span c="teal"> Spaces between quoted blocks = AND</Text>, <Text span c="teal">pipes inside = OR</Text>.
                    This generates the minimum blocks so a map highlights only when it has at least K of your chosen mods.
                    Add multiple groups to require different conditions simultaneously.
                  </Text>
                </Collapse>

                <Group gap={6} wrap="wrap">
                  {groups.map((group) => {
                    const active = group.id === activeGroupId;
                    const configured = group.selected.length > 0;
                    return (
                      <Button
                        key={group.id}
                        size="xs"
                        radius="xl"
                        variant={active ? 'light' : 'default'}
                        color={active ? 'teal' : 'gray'}
                        onClick={() => setActiveGroupId(group.id)}
                      >
                        {displayGroupName(canonicalGroupLabel(group))}
                        {configured ? ` · ≥${group.k} of ${group.selected.length}` : ''}
                      </Button>
                    );
                  })}
                  {availablePresets.length > 0 && (
                    <Menu position="bottom-start" withinPortal>
                      <Menu.Target>
                        <Button
                          size="xs"
                          radius="xl"
                          variant="default"
                          leftSection={<IconPlus size={12} />}
                          style={{ borderStyle: 'dashed' }}
                        >
                          group
                        </Button>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item onClick={() => addGroup()}>
                          Empty group (custom tokens)
                        </Menu.Item>
                        {availablePresets.map((preset) => (
                          <Menu.Item key={preset.id} onClick={() => addGroup(preset.id)}>
                            {preset.label}
                          </Menu.Item>
                        ))}
                      </Menu.Dropdown>
                    </Menu>
                  )}
                </Group>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: wideLayout ? 'row' : 'column',
                    gap: 10,
                    alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      flex: wideLayout ? 1.5 : undefined,
                      width: wideLayout ? undefined : '100%',
                      minWidth: 0,
                    }}
                  >
                    {activeGroup ? (
                      <ModGroupEditor
                        group={activeGroup}
                        isPreset={activeGroupIsPreset}
                        displayLabel={canonicalGroupLabel(activeGroup)}
                        onChange={(updated) => updateGroup(activeGroupIndex, updated)}
                        onRemove={() => removeGroup(activeGroupIndex)}
                      />
                    ) : (
                      <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
                        Add a group to start building a regex.
                      </Text>
                    )}
                  </div>

                  <Stack
                    gap={8}
                    p="sm"
                    style={{
                      flex: wideLayout ? 1 : undefined,
                      width: wideLayout ? undefined : '100%',
                      minWidth: 0,
                      position: wideLayout ? 'sticky' : 'static',
                      top: wideLayout ? 8 : undefined,
                      background: COLOR.tintTealBg,
                      borderRadius: 8,
                      border: `1px solid ${COLOR.tintTealBorder}`,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="xs" fw={700} c="teal">Generated Regex</Text>
                      <Badge size="xs" color={charCountColor(charCount)} variant="light">
                        {charCount} / {REGEX_CHAR_LIMIT}
                      </Badge>
                    </Group>
                    <Text
                      style={{
                        fontFamily: 'monospace',
                        fontSize: FONT.small,
                        wordBreak: 'break-all',
                        lineHeight: 1.6,
                        color: finalRegex ? COLOR.text : COLOR.textFaint,
                        minHeight: 36,
                      }}
                    >
                      {finalRegex || 'Select mods in a group to generate a stash regex.'}
                    </Text>
                    <Progress
                      value={budgetPercent}
                      color={charCountColor(charCount)}
                      size="xs"
                      radius="xl"
                    />
                    <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
                      {blockCount} block{blockCount !== 1 ? 's' : ''}
                      {groupSummary ? ` · ${groupSummary}` : ' · no active group output'}
                    </Text>
                    {charCount > REGEX_CHAR_LIMIT && (
                      <Text size="xs" c="red" style={{ fontSize: FONT.small }}>
                        {charCount - REGEX_CHAR_LIMIT} chars over the limit. Increase K or select fewer mods.
                      </Text>
                    )}
                    <Group gap={6} grow>
                      <Button
                        size="xs"
                        variant="default"
                        leftSection={<IconDeviceFloppy size={12} />}
                        disabled={!finalRegex}
                        onClick={() => setSaveOpen(true)}
                      >
                        Save as Set
                      </Button>
                      <CopyButton value={finalRegex} timeout={2000}>
                        {({ copied, copy }) => (
                          <Button
                            size="xs"
                            variant="light"
                            color={copied ? 'teal' : 'orange'}
                            leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                            disabled={!finalRegex}
                            onClick={copy}
                          >
                            {copied ? 'Copied!' : 'Copy Regex'}
                          </Button>
                        )}
                      </CopyButton>
                    </Group>
                  </Stack>
                </div>
              </Stack>
            </Collapse>
          </Stack>

          <Stack gap={0}>
            <SectionBar
              open={craftingOpen}
              title="Alt/Aug Magic Map Crafting"
              description="dynamic regex for rolling blue Originator maps"
              meta={`${altAugCharCount} chars`}
              onToggle={() => setCraftingOpen((open) => !open)}
            />
            <Collapse in={craftingOpen}>
              <div
                style={{
                  background: COLOR.bgPanel,
                  border: `1px solid ${COLOR.border}`,
                  borderTop: 'none',
                  borderRadius: '0 0 8px 8px',
                  padding: 10,
                }}
              >
                <AltAugSection onCharCountChange={setAltAugCharCount} />
              </div>
            </Collapse>
          </Stack>
        </Stack>
      </ScrollArea>
    </div>
  );
};
