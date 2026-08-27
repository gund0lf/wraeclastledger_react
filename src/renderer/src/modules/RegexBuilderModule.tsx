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
  Switch, Badge, Modal, Menu, Progress, SegmentedControl, Alert, Select,
} from '@mantine/core';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDeviceFloppy,
  IconPlus,
  IconX,
} from '@tabler/icons-react';
import { useSessionKeys } from '../store/useSessionStore';
import { PRESET_GROUPS, type ModGroupState } from '../utils/regexBuilderPresets';
import {
  type MagicMapNumericStat,
  type MagicMapPredicate,
  findPresetIdForGroup,
  generateBuilderRegex,
  generateMagicMapRegex,
  getAvailablePresetIds,
  MAGIC_MAP_STAT_LABELS,
  REGEX_CHAR_LIMIT,
} from '../utils/regexBuilder';
import { activeChiselTypes } from '../utils/gameData';
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

  const logicMode = group.k <= 1
    ? 'any'
    : group.selected.length > 1 && group.k >= group.selected.length
      ? 'all'
      : 'at-least';

  return (
    <Stack
      className="regex-builder-group-editor"
      gap={8}
      p="sm"
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
        <Tooltip label={`Delete ${displayLabel}`}>
          <ActionIcon
            className="regex-destructive-icon"
            size="sm"
            variant="default"
            aria-label={`Delete group ${displayLabel}`}
            onClick={onRemove}
          >
            <IconX size={13} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group gap={6} align="flex-end" wrap="wrap">
        <SegmentedControl size="xs" value={logicMode}
          data={[
            { value: 'any', label: 'Any' },
            { value: 'all', label: 'All' },
            { value: 'at-least', label: 'At least N' },
          ]}
          onChange={(mode) => {
            const selectedCount = Math.max(1, group.selected.length);
            const nextK = mode === 'any' ? 1 : mode === 'all' ? selectedCount : Math.min(2, selectedCount);
            onChange({ ...group, k: nextK });
          }} />
        {logicMode === 'at-least' && (
          <NumberInput size="xs" label="N" min={1} max={Math.max(1, group.selected.length)}
            value={group.k} style={{ width: 72 }}
            onChange={(value) => onChange({
              ...group,
              k: Math.max(1, Math.min(group.selected.length || 1, Number(value) || 1)),
            })} />
        )}
        <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
          {logicMode === 'any' ? 'Match at least one selected mod.'
            : logicMode === 'all' ? 'Require every selected mod.'
              : `Require at least ${group.k} selected mods.`}
        </Text>
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
                    className="regex-destructive-icon"
                    size={12}
                    variant="transparent"
                    color="gray"
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

// ─── Magic-map workflow ───────────────────────────────────────────────────────

type EditableMagicMapPredicate = MagicMapPredicate & { id: string };

const MAGIC_MAP_STAT_OPTIONS = Object.entries(MAGIC_MAP_STAT_LABELS)
  .map(([value, label]) => ({ value: `stat:${value}`, label: `${label} threshold` }));
const MAGIC_MAP_CONDITION_OPTIONS = [
  ...MAGIC_MAP_STAT_OPTIONS,
  { value: 'token', label: 'Text / regex token' },
  { value: 'open:either', label: 'Either open affix' },
  { value: 'open:prefix', label: 'Open prefix' },
  { value: 'open:suffix', label: 'Open suffix' },
];

const chiselTypes = activeChiselTypes();
const MAGIC_MAP_CHISELS = Object.entries(chiselTypes).flatMap(([name, chisel]) =>
  chisel.statKey in MAGIC_MAP_STAT_LABELS
    ? [{
        value: name,
        label: chisel.label,
        stat: chisel.statKey as MagicMapNumericStat,
        bonus: chisel.bonusAt20,
      }]
    : []);
const MAGIC_MAP_CHISEL_OPTIONS = [
  { value: '', label: 'No chisel adjustment' },
  ...MAGIC_MAP_CHISELS.map(({ value, label }) => ({ value, label })),
];

const conditionTypeValue = (condition: EditableMagicMapPredicate): string => {
  if (condition.kind === 'stat') return `stat:${condition.stat}`;
  if (condition.kind === 'open-affix') return `open:${condition.side}`;
  return 'token';
};

const replaceConditionType = (
  condition: EditableMagicMapPredicate,
  value: string,
): EditableMagicMapPredicate => {
  if (value.startsWith('stat:')) {
    return {
      id: condition.id,
      kind: 'stat',
      stat: value.slice(5) as MagicMapNumericStat,
      minimum: condition.kind === 'stat' ? condition.minimum : 20,
    };
  }
  if (value.startsWith('open:')) {
    return {
      id: condition.id,
      kind: 'open-affix',
      side: value.slice(5) as 'prefix' | 'suffix' | 'either',
    };
  }
  return {
    id: condition.id,
    kind: 'token',
    token: condition.kind === 'token' ? condition.token : '',
  };
};

const predicateWithoutId = ({ id: _id, ...predicate }: EditableMagicMapPredicate): MagicMapPredicate =>
  predicate as MagicMapPredicate;

const conditionDescription = (condition: EditableMagicMapPredicate): string => {
  if (condition.kind === 'stat') {
    return `${MAGIC_MAP_STAT_LABELS[condition.stat]} ≥${condition.minimum}%`;
  }
  if (condition.kind === 'token') return condition.token.trim() ? `“${condition.token.trim()}”` : 'unfinished token';
  if (condition.side === 'either') return 'either open affix';
  return `open ${condition.side}`;
};

const MagicMapConditionEditor = ({
  condition,
  onChange,
  onRemove,
}: {
  condition: EditableMagicMapPredicate;
  onChange: (condition: EditableMagicMapPredicate) => void;
  onRemove: () => void;
}) => (
  <Group className="regex-magic-condition" gap={6} wrap="wrap" align="flex-end">
    <Select
      size="xs"
      label="Condition"
      data={MAGIC_MAP_CONDITION_OPTIONS}
      value={conditionTypeValue(condition)}
      allowDeselect={false}
      style={{ flex: 1.15, minWidth: 150 }}
      onChange={(value) => value && onChange(replaceConditionType(condition, value))}
    />
    {condition.kind === 'stat' && (
      <NumberInput
        size="xs"
        label="Minimum"
        min={1}
        max={999}
        step={1}
        suffix="%"
        value={condition.minimum}
        style={{ width: 112 }}
        onChange={(value) => onChange({
          ...condition,
          minimum: Math.max(0, Number(value) || 0),
        })}
      />
    )}
    {condition.kind === 'token' && (
      <TextInput
        size="xs"
        label="Token"
        description="e.g. deb or size.+40"
        placeholder="deb"
        value={condition.token}
        style={{ flex: 1, minWidth: 130 }}
        onChange={(event) => onChange({ ...condition, token: event.currentTarget.value })}
      />
    )}
    {condition.kind === 'open-affix' && (
      <Text size="xs" c="dimmed" style={{ flex: 1, minWidth: 130, paddingBottom: 6, fontSize: FONT.label }}>
        {condition.side === 'prefix'
          ? 'Map of …'
          : condition.side === 'suffix'
            ? '… Map (Tier …)'
            : 'Map of … or … Map (Tier …)'}
      </Text>
    )}
    <Tooltip label="Remove condition">
      <ActionIcon
        className="regex-destructive-icon"
        size="sm"
        variant="default"
        aria-label="Remove condition"
        onClick={onRemove}
        style={{ marginBottom: 2 }}
      >
        <IconX size={13} />
      </ActionIcon>
    </Tooltip>
  </Group>
);

const MagicMapWorkflowSection = ({ onCharCountChange }: { onCharCountChange: (count: number) => void }) => {
  const [required, setRequired] = useState<EditableMagicMapPredicate[]>([
    { id: 'required-pack-20', kind: 'stat', stat: 'packSize', minimum: 20 },
  ]);
  const [alternatives, setAlternatives] = useState<EditableMagicMapPredicate[]>([
    { id: 'alternative-open', kind: 'open-affix', side: 'either' },
    { id: 'alternative-deb', kind: 'token', token: 'deb' },
    { id: 'alternative-pack-40', kind: 'stat', stat: 'packSize', minimum: 40 },
  ]);
  const [chiselName, setChiselName] = useState('');
  const [chiselApplied, setChiselApplied] = useState(true);
  const nextConditionId = useRef(0);

  const selectedChisel = MAGIC_MAP_CHISELS.find((chisel) => chisel.value === chiselName);
  const generated = generateMagicMapRegex({
    required: required.map(predicateWithoutId),
    alternatives: alternatives.map(predicateWithoutId),
    chisel: selectedChisel
      ? { stat: selectedChisel.stat, bonus: selectedChisel.bonus, applied: chiselApplied }
      : undefined,
  });
  const { regex, charCount, blockCount, invalidCount } = generated;
  const overLimit = charCount > REGEX_CHAR_LIMIT;
  const canCopy = !!regex && invalidCount === 0 && !overLimit;

  useEffect(() => onCharCountChange(charCount), [charCount, onCharCountChange]);

  const updateCondition = (
    list: EditableMagicMapPredicate[],
    setList: (conditions: EditableMagicMapPredicate[]) => void,
    id: string,
    condition: EditableMagicMapPredicate,
  ) => setList(list.map((entry) => entry.id === id ? condition : entry));
  const removeCondition = (
    list: EditableMagicMapPredicate[],
    setList: (conditions: EditableMagicMapPredicate[]) => void,
    id: string,
  ) => setList(list.filter((entry) => entry.id !== id));
  const addCondition = (
    list: EditableMagicMapPredicate[],
    setList: (conditions: EditableMagicMapPredicate[]) => void,
  ) => {
    nextConditionId.current += 1;
    setList([...list, {
      id: `magic-condition-${nextConditionId.current}`,
      kind: 'stat',
      stat: 'moreCurrency',
      minimum: 20,
    }]);
  };

  return (
    <Stack gap={10}>
      <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, lineHeight: 1.5 }}>
        Every required condition must match. The map must then match at least one highlight condition.
        Use an exact numeric floor or a shorter known mod token such as <Text span c="teal" ff="monospace">deb</Text>.
      </Text>

      <Stack className="regex-magic-rule" gap={7} p="sm">
        <Group justify="space-between" gap={8}>
          <div>
            <Text size="xs" fw={700}>Required baseline</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>Every row is required (AND).</Text>
          </div>
          <Button size="compact-xs" variant="default" leftSection={<IconPlus size={11} />}
            onClick={() => addCondition(required, setRequired)}>
            condition
          </Button>
        </Group>
        {required.map((condition) => (
          <MagicMapConditionEditor
            key={condition.id}
            condition={condition}
            onChange={(updated) => updateCondition(required, setRequired, condition.id, updated)}
            onRemove={() => removeCondition(required, setRequired, condition.id)}
          />
        ))}
        {required.length === 0 && (
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>No universal baseline.</Text>
        )}
      </Stack>

      <Stack className="regex-magic-rule" gap={7} p="sm">
        <Group justify="space-between" gap={8}>
          <div>
            <Text size="xs" fw={700}>Highlight when any</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>These rows share one OR block.</Text>
          </div>
          <Button size="compact-xs" variant="default" leftSection={<IconPlus size={11} />}
            onClick={() => addCondition(alternatives, setAlternatives)}>
            condition
          </Button>
        </Group>
        {alternatives.map((condition) => (
          <MagicMapConditionEditor
            key={condition.id}
            condition={condition}
            onChange={(updated) => updateCondition(alternatives, setAlternatives, condition.id, updated)}
            onRemove={() => removeCondition(alternatives, setAlternatives, condition.id)}
          />
        ))}
        {alternatives.length === 0 && (
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>No alternative highlight condition.</Text>
        )}
      </Stack>

      <Stack className="regex-magic-rule" gap={7} p="sm">
        <Group gap={8} align="flex-end" wrap="wrap">
          <Select
            size="xs"
            label="Optional chisel adjustment"
            data={MAGIC_MAP_CHISEL_OPTIONS}
            value={chiselName}
            allowDeselect={false}
            style={{ flex: 1, minWidth: 220 }}
            onChange={(value) => setChiselName(value ?? '')}
          />
          {selectedChisel && (
            <Switch
              size="sm"
              label="Applied to maps"
              checked={chiselApplied}
              onChange={(event) => setChiselApplied(event.currentTarget.checked)}
              style={{ paddingBottom: 4 }}
            />
          )}
        </Group>
        {selectedChisel && (
          <Text size="xs" c={chiselApplied ? 'dimmed' : 'orange'} style={{ fontSize: FONT.label }}>
            {chiselApplied
              ? `Searching chiseled maps: ${MAGIC_MAP_STAT_LABELS[selectedChisel.stat]} floors include the +${selectedChisel.bonus}% chisel bonus.`
              : `Searching unchiseled maps: the entered ${MAGIC_MAP_STAT_LABELS[selectedChisel.stat]} minimum is used exactly.`}
          </Text>
        )}
      </Stack>

      <Stack className="regex-builder-output" gap={7} p="sm">
        <Group justify="space-between" wrap="nowrap">
          <div>
            <Text size="xs" fw={700}>Generated Regex</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
              {required.map(conditionDescription).join(' AND ') || 'No baseline'}
              {alternatives.length > 0 ? ` · then any: ${alternatives.map(conditionDescription).join(', ')}` : ''}
            </Text>
          </div>
          <Badge size="xs" color={charCountColor(charCount)} variant="light">
            {charCount} / {REGEX_CHAR_LIMIT}
          </Badge>
        </Group>
        <Text style={{ fontFamily: 'monospace', fontSize: FONT.label, color: regex ? COLOR.accent : COLOR.textFaint, wordBreak: 'break-all', lineHeight: 1.6 }}>
          {regex || 'Add at least one complete condition.'}
        </Text>
        <Progress value={Math.min(100, (charCount / REGEX_CHAR_LIMIT) * 100)}
          color={charCountColor(charCount)} size="xs" radius="xl" />
        <Group justify="space-between" gap={8}>
          <Text size="xs" c={invalidCount > 0 || overLimit ? 'red' : 'dimmed'} style={{ fontSize: FONT.label }}>
            {invalidCount > 0
              ? `${invalidCount} unfinished condition${invalidCount === 1 ? '' : 's'}`
              : overLimit
                ? `${charCount - REGEX_CHAR_LIMIT} chars over the stash limit`
                : `${blockCount} AND block${blockCount === 1 ? '' : 's'}`}
          </Text>
          <CopyButton value={regex} timeout={2000}>
            {({ copied, copy }) => (
              <Button size="xs" variant="light" color={copied ? 'teal' : 'orange'}
                leftSection={copied ? <IconCheck size={11} /> : <IconCopy size={11} />}
                disabled={!canCopy}
                onClick={copy} style={{ minWidth: 100 }}>
                {copied ? 'Copied!' : 'Copy Regex'}
              </Button>
            )}
          </CopyButton>
        </Group>
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
    className="regex-builder-section-bar"
    data-open={open || undefined}
    gap={8}
    wrap="nowrap"
    onClick={onToggle}
    style={{
      cursor: 'pointer',
      userSelect: 'none',
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
  const { regexBuilderGroups, setRegexBuilderGroups, saveExclusionPreset } =
    useSessionKeys('regexBuilderGroups', 'setRegexBuilderGroups', 'saveExclusionPreset');
  const groups = regexBuilderGroups;
  const rootRef = useRef<HTMLDivElement>(null);
  const [craftingOpen, setCraftingOpen] = useState(true);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [magicMapCharCount, setMagicMapCharCount] = useState(0);
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
    saveExclusionPreset(label, finalRegex);
    setSaveOpen(false);
    setSaveName('');
  };

  return (
    <div
      ref={rootRef}
      className="regex-tab-workspace regex-builder"
    >
      <Modal opened={saveOpen} onClose={() => setSaveOpen(false)} title="Save Complete Regex Preset" size="sm">
        <Stack gap="sm">
          <TextInput label="Name" placeholder="e.g. My K-of-N setup" autoFocus
            value={saveName} onChange={(e) => setSaveName(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && saveName.trim()) doSave(); }} />
          <Text style={{ fontFamily: 'monospace', fontSize: FONT.label, wordBreak: 'break-all', color: COLOR.textFaint }}>{finalRegex}</Text>
          <Text size="xs" c="dimmed">
            This is saved as a literal complete regex and will be copied exactly, never merged with session-generated thresholds.
          </Text>
          <Button onClick={doSave} disabled={!saveName.trim()}>Save preset</Button>
        </Stack>
      </Modal>

      <ScrollArea className="regex-tab-scroll" scrollbarSize={4}>
        <Stack className="regex-tab-content" gap={10}>
          <Alert className="regex-builder-intro" color="gray" variant="light" p="xs">
            <Text size="xs">
              Magic Map Workflow combines exact thresholds, open affixes, and known mod tokens.
              K-of-N groups remain available for symmetric mod-count rules.
            </Text>
          </Alert>
          <Stack gap={0}>
            <SectionBar
              open={craftingOpen}
              title="Magic Map Workflow"
              description="build candidate and keeper rules for rolling blue maps"
              meta={`${magicMapCharCount} chars`}
              onToggle={() => setCraftingOpen((open) => !open)}
            />
            <Collapse in={craftingOpen}>
              <div
                className="regex-builder-section-content"
              >
                <MagicMapWorkflowSection onCharCountChange={setMagicMapCharCount} />
              </div>
            </Collapse>
          </Stack>
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
                className="regex-builder-section-content"
                gap={10}
              >
                <Collapse in={howOpen}>
                  <Text
                    className="regex-builder-help"
                    size="xs"
                    c="dimmed"
                    style={{
                      fontSize: FONT.small,
                      lineHeight: 1.55,
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
                  className="regex-builder-main-split"
                  data-wide={wideLayout || undefined}
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
                    className="regex-builder-output"
                    gap={8}
                    p="sm"
                    style={{
                      flex: wideLayout ? 1 : undefined,
                      width: wideLayout ? undefined : '100%',
                      minWidth: 0,
                      position: wideLayout ? 'sticky' : 'static',
                      top: wideLayout ? 8 : undefined,
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <Text size="xs" fw={700}>Generated Regex</Text>
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
                        Save preset
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

        </Stack>
      </ScrollArea>
    </div>
  );
};
