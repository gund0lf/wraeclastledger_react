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

import { useState, useMemo } from 'react';
import {
  Text, Group, Stack, Button, TextInput, ActionIcon,
  NumberInput, Tooltip, CopyButton, Divider, ScrollArea, Collapse,
  Select, Switch, Badge, Modal,
} from '@mantine/core';
import { IconPlus, IconTrash, IconCopy, IconCheck, IconChevronDown, IconChevronRight, IconX, IconDeviceFloppy } from '@tabler/icons-react';
import { useSessionKeys } from '../store/useSessionStore';
import { PRESET_GROUPS, type ModGroupState } from '../utils/regexBuilderPresets';
import {
  adjustAltAugChisel,
  generateAltAugRegex,
  generateBuilderRegex,
  generatePosRegex,
  REGEX_CHAR_LIMIT,
} from '../utils/regexBuilder';
import { COLOR, FONT } from '../utils/uiTokens';

// ─── POS Algorithm ────────────────────────────────────────────────────────────

const charCountColor = (n: number) =>
  n > REGEX_CHAR_LIMIT ? COLOR.loss : n > 220 ? COLOR.warning : COLOR.profit;
const TIER_COLORS: Record<string, string> = { S: 'yellow', A: 'orange', B: 'blue' };

// ─── Mod Group Editor ─────────────────────────────────────────────────────────

const ModGroupEditor = ({
  group, onChange, onRemove,
}: {
  group: ModGroupState;
  onChange: (g: ModGroupState) => void;
  onRemove: () => void;
}) => {
  const [newToken, setNewToken] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [open, setOpen] = useState(true);
  const [hoveredTrash, setHoveredTrash] = useState(false); // group-delete red hover (Sessions pattern)

  const selectedTokens = group.mods.filter((m) => group.selected.includes(m.id)).map((m) => m.token);
  const preview    = generatePosRegex(selectedTokens, group.k);
  const blockCount = preview ? preview.split('" "').length : 0;

  const tooltipStyles = {
    tooltip: {
      background: COLOR.bgPanel,
      border: `1px solid ${COLOR.bgHoverStrong}`,
      padding: '8px 10px',
      maxWidth: 280,
      borderRadius: 6,
    },
  };

  const addCustomMod = () => {
    const t = newToken.trim();
    if (!t) return;
    const id = `custom_${Date.now()}`;
    onChange({
      ...group,
      mods: [...group.mods, { id, token: t, label: newLabel.trim() || t }],
      selected: [...group.selected, id],
    });
    setNewToken(''); setNewLabel('');
  };

  return (
    <Stack gap={4} p="sm" style={{ background: COLOR.bgInset, borderRadius: 8, border: `1px solid ${COLOR.border}` }}>
      <Group justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <Group gap={6}>
          <ActionIcon size={16} variant="transparent" c="dimmed">
            {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
          </ActionIcon>
          <TextInput
            size="xs" value={group.label} style={{ width: 180 }}
            styles={{ input: { fontSize: FONT.body, fontWeight: 600, border: 'none', background: 'transparent', padding: 0 } }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ ...group, label: e.currentTarget.value })}
          />
          {group.selected.length > 0 && (
            <Badge size="xs" color="teal" variant="light">
              ≥{group.k} of {group.selected.length} · {blockCount} block{blockCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </Group>
        <ActionIcon size="md" variant="default" aria-label={`Delete group ${group.label}`}
          onMouseEnter={() => setHoveredTrash(true)}
          onMouseLeave={() => setHoveredTrash(false)}
          style={hoveredTrash ? { color: 'var(--mantine-color-red-4)', borderColor: 'var(--mantine-color-red-7)' } : undefined}
          onClick={(e) => { e.stopPropagation(); setHoveredTrash(false); onRemove(); }}>
          <IconTrash size={15} />
        </ActionIcon>
      </Group>

      <Collapse in={open}>
        <Stack gap={8} mt={4}>
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>Click to toggle. Hover for mod details.</Text>
          <Group gap={4} wrap="wrap">
            {group.mods.map((mod) => {
              const active   = group.selected.includes(mod.id);
              const isCustom = mod.id.startsWith('custom_');
              const tierColor = mod.tier ? (TIER_COLORS[mod.tier] ?? 'gray') : 'gray';
              return (
                <Tooltip
                  key={mod.id}
                  styles={tooltipStyles}
                  label={
                    <Stack gap={4}>
                      <Text size="xs" fw={600} c="white">{mod.label}</Text>
                      <Text style={{ fontFamily: 'monospace', fontSize: FONT.label, background: COLOR.bgHover, padding: '2px 6px', borderRadius: 3, color: COLOR.accent, display: 'inline-block' }}>
                        {mod.token}
                      </Text>
                      {mod.detail && <Text size="xs" style={{ fontSize: FONT.label, color: COLOR.textDim, lineHeight: 1.5 }}>{mod.detail}</Text>}
                    </Stack>
                  }
                  withArrow multiline>
                  <Badge
                    size="sm"
                    variant={active ? 'filled' : 'outline'}
                    color={active ? tierColor : 'gray'}
                    style={{ cursor: 'pointer', fontSize: FONT.label, maxWidth: 280 }}
                    onClick={() =>
                      onChange({
                        ...group,
                        selected: active
                          ? group.selected.filter((id) => id !== mod.id)
                          : [...group.selected, mod.id],
                        k: Math.min(group.k, group.selected.length + (active ? -1 : 1) || 1),
                      })
                    }
                    rightSection={isCustom ? (
                      <ActionIcon size={10} variant="transparent" color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChange({
                            ...group,
                            mods: group.mods.filter((m) => m.id !== mod.id),
                            selected: group.selected.filter((id) => id !== mod.id),
                          });
                        }}><IconX size={9} /></ActionIcon>
                    ) : undefined}
                  >
                    {mod.label}
                  </Badge>
                </Tooltip>
              );
            })}
          </Group>

          <Group gap={4}>
            <TextInput size="xs" placeholder="Token (e.g. syn)" value={newToken}
              onChange={(e) => setNewToken(e.currentTarget.value)}
              style={{ width: 120 }}
              onKeyDown={(e) => e.key === 'Enter' && addCustomMod()} />
            <TextInput size="xs" placeholder="Label (optional)" value={newLabel}
              onChange={(e) => setNewLabel(e.currentTarget.value)}
              style={{ flex: 1 }}
              onKeyDown={(e) => e.key === 'Enter' && addCustomMod()} />
            <Tooltip label="Add custom mod token">
              <ActionIcon size="sm" variant="light" color="blue" onClick={addCustomMod} disabled={!newToken.trim()}>
                <IconPlus size={11} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {group.selected.length > 0 && (
            <Group gap={8} align="center" wrap="nowrap"
              style={{ background: COLOR.tintYellowBg, borderRadius: 5, padding: '6px 8px', border: `1px solid ${COLOR.tintYellowBorder}` }}>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontSize: FONT.small }}>At least</Text>
              <NumberInput size="xs" value={group.k} min={1} max={group.selected.length}
                style={{ width: 56 }}
                onChange={(v) =>
                  onChange({ ...group, k: Math.max(1, Math.min(group.selected.length, Number(v) || 1)) })
                }
              />
              <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontSize: FONT.small }}>of {group.selected.length} selected</Text>
              {group.k === group.selected.length && <Badge size="xs" color="yellow" variant="light">ALL</Badge>}
              {group.k === 1 && <Badge size="xs" color="gray" variant="light">ANY one</Badge>}
            </Group>
          )}

          {preview && (
            <Stack gap={3} p="xs" style={{ background: COLOR.bgDeep, borderRadius: 5, border: `1px solid ${COLOR.borderDeep}` }}>
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
                {blockCount} block{blockCount !== 1 ? 's' : ''} from this group:
              </Text>
              <Text style={{ fontFamily: 'monospace', fontSize: FONT.label, color: COLOR.accent, wordBreak: 'break-all', lineHeight: 1.7 }}>
                {preview}
              </Text>
            </Stack>
          )}
        </Stack>
      </Collapse>
    </Stack>
  );
};

// ─── Alt/Aug Crafting ─────────────────────────────────────────────────────────

const AltAugSection = () => {
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

  return (
    <Stack gap={8} p="sm" style={{ background: COLOR.bgInset, borderRadius: 8, border: `1px solid ${COLOR.border}` }}>
      <Text size="xs" fw={700}>Alt/Aug Magic Map Crafting</Text>
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

// ─── Builder tab ──────────────────────────────────────────────────────────────

export const BuilderTab = () => {
  const { regexBuilderGroups, setRegexBuilderGroups, saveRegexSet } =
    useSessionKeys('regexBuilderGroups', 'setRegexBuilderGroups', 'saveRegexSet');
  const groups = regexBuilderGroups;

  const [craftingOpen, setCraftingOpen] = useState(false);
  const [builderOpen,  setBuilderOpen]  = useState(true); // density-pass rider: K-of-N collapsible like Alt/Aug
  const [howOpen,      setHowOpen]      = useState(false);
  const [saveOpen,     setSaveOpen]     = useState(false);
  const [saveName,     setSaveName]     = useState('');

  const updateGroup = (idx: number, g: ModGroupState) =>
    setRegexBuilderGroups(groups.map((x, i) => (i === idx ? g : x)));
  const removeGroup = (idx: number) =>
    setRegexBuilderGroups(groups.filter((_, i) => i !== idx));
  const addGroup = (presetId?: string) => {
    const preset = PRESET_GROUPS.find((p) => p.id === presetId);
    setRegexBuilderGroups([...groups, {
      id: `g_${Date.now()}`,
      label: preset?.label ?? 'New Group',
      mods: (preset?.mods ?? []).map((m) => ({ id: m.id, token: m.token, label: m.label, detail: m.detail, tier: m.tier })),
      selected: [], // always start empty
      k: 2,
    }]);
  };

  const generated = useMemo(() => generateBuilderRegex(groups), [groups]);
  const finalRegex = generated.regex;
  const charCount = generated.charCount;
  const blockCount = generated.blockCount;

  const doSave = () => {
    const label = saveName.trim();
    if (!label || !finalRegex) return;
    saveRegexSet({ label, type: 'other', lines: [finalRegex] });
    setSaveOpen(false);
    setSaveName('');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: 8 }}>
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

      <Group justify="space-between" mb="xs" style={{ flexShrink: 0 }}>
        <Stack gap={0}>
          <Text fw={700} size="sm">Regex Builder</Text>
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>K-of-N combinatorial stash regex · Product of Sums</Text>
        </Stack>
        {finalRegex && (
          <Badge size="xs" color={charCountColor(charCount)} variant="light">
            {charCount} / {REGEX_CHAR_LIMIT} chars
          </Badge>
        )}
      </Group>

      <ScrollArea style={{ flex: 1, minHeight: 0 }} scrollbarSize={4}>
        <Stack gap={8}>

          {/* How it works — collapsed by default */}
          <Stack gap={2}>
            <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setHowOpen((v) => !v)}>
              <ActionIcon size={14} variant="transparent" c="dimmed">
                {howOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
              </ActionIcon>
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>How this works</Text>
            </Group>
            <Collapse in={howOpen}>
              <Stack gap={2} p="xs" style={{ background: COLOR.bgSunken, borderRadius: 6 }}>
                <Text size="xs" c="dimmed" style={{ fontSize: FONT.small, lineHeight: 1.5 }}>
                  PoE&apos;s engine is <Text span c="orange">line-by-line</Text> — .* across lines doesn&apos;t work.
                  <Text span c="teal"> Spaces between quoted blocks = AND</Text>, <Text span c="teal">pipes inside = OR</Text>.
                  This generates the minimum blocks so a map highlights only when it has at least K of your chosen mods.
                  Add multiple groups to require different conditions simultaneously.
                </Text>
              </Stack>
            </Collapse>
          </Stack>

          {/* K-of-N builder — collapsible for consistency with Alt/Aug below */}
          <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setBuilderOpen((v) => !v)}>
            <ActionIcon size={16} variant="transparent" c="dimmed">
              {builderOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            </ActionIcon>
            <Text size="xs" fw={700}>K-of-N Mod Groups</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
              highlight maps with at least K of your chosen mods
            </Text>
          </Group>
          <Collapse in={builderOpen}>
            <Stack gap={8}>
          {/* Mod groups */}
          {groups.map((g, idx) => (
            <ModGroupEditor key={g.id} group={g}
              onChange={(updated) => updateGroup(idx, updated)}
              onRemove={() => removeGroup(idx)}
            />
          ))}

          {/* Add group */}
          <Select size="xs" placeholder="+ Add mod group…"
            data={[
              { value: 'empty', label: '+ Empty group (custom tokens)' },
              ...PRESET_GROUPS.map((p) => ({ value: p.id, label: `+ ${p.label}` })),
            ]}
            value={null}
            onChange={(v) => v && addGroup(v === 'empty' ? undefined : v)}
          />

          {/* Combined result */}
          {finalRegex && (
            <Stack gap={4} p="sm"
              style={{ background: COLOR.tintTealBg, borderRadius: 8, border: `1px solid ${COLOR.tintTealBorder}` }}>
              <Group justify="space-between">
                <Group gap={6}>
                  <Text size="xs" fw={700} c="teal">Generated Regex</Text>
                  <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
                    {blockCount} block{blockCount !== 1 ? 's' : ''}
                    {charCount > REGEX_CHAR_LIMIT && <Text span c="red"> · exceeds 250-char limit</Text>}
                  </Text>
                </Group>
                <Group gap={4}>
                  <Button size="xs" variant="default"
                    leftSection={<IconDeviceFloppy size={12} />}
                    onClick={() => setSaveOpen(true)}>
                    Save as Set
                  </Button>
                  <CopyButton value={finalRegex} timeout={2000}>
                    {({ copied, copy }) => (
                      <Button size="xs" variant="light" color={copied ? 'teal' : 'orange'}
                        leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
                        onClick={copy} style={{ minWidth: 100 }}>
                        {copied ? 'Copied!' : 'Copy Regex'}
                      </Button>
                    )}
                  </CopyButton>
                </Group>
              </Group>
              <Text style={{ fontFamily: 'monospace', fontSize: FONT.small, wordBreak: 'break-all', lineHeight: 1.6, color: COLOR.text }}>
                {finalRegex}
              </Text>
              {charCount > REGEX_CHAR_LIMIT && (
                <Text size="xs" c="red" style={{ fontSize: FONT.small }}>
                  {charCount - REGEX_CHAR_LIMIT} chars over the limit. Reduce K or the number of mods.
                </Text>
              )}
            </Stack>
          )}
            </Stack>
          </Collapse>

          <Divider />

          {/* Alt/Aug crafting */}
          <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setCraftingOpen((v) => !v)}>
            <ActionIcon size={16} variant="transparent" c="dimmed">
              {craftingOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
            </ActionIcon>
            <Text size="xs" fw={700}>Alt/Aug Magic Map Crafting</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>
              Dynamic regex for rolling blue Originator maps
            </Text>
          </Group>
          <Collapse in={craftingOpen}>
            <AltAugSection />
          </Collapse>

        </Stack>
      </ScrollArea>
    </div>
  );
};
