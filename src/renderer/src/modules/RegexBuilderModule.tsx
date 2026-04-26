/**
 * RegexBuilderModule — K-of-N combinatorial stash regex generator
 * Product of Sums (POS) logic — confirmed working in PoE stash search.
 * PoE char limit: 250 (stash), 300 (vendor). Engine is line-by-line.
 */

import { useState, useMemo } from 'react';
import {
  Card, Text, Group, Stack, Button, TextInput, ActionIcon,
  NumberInput, Tooltip, CopyButton, Code, Divider, ScrollArea, Collapse,
  Select, Switch, Badge,
} from '@mantine/core';
import { FaPlus, FaTrash, FaCopy, FaCheck, FaChevronDown, FaChevronRight } from 'react-icons/fa';

// ─── POS Algorithm ────────────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (k > arr.length) return [];
  const [head, ...tail] = arr;
  return [
    ...combinations(tail, k - 1).map((c) => [head, ...c]),
    ...combinations(tail, k),
  ];
}

function generatePosRegex(tokens: string[], k: number): string {
  if (tokens.length === 0 || k <= 0 || k > tokens.length) return '';
  if (k === 1) return `"${tokens.join('|')}"`;
  if (k === tokens.length) return tokens.map((t) => `"${t}"`).join(' ');
  const blockSize = tokens.length - k + 1;
  return combinations(tokens, blockSize).map((c) => `"${c.join('|')}"`).join(' ');
}

// ─── Mod definitions ─────────────────────────────────────────────────────────

interface NamedMod {
  id: string;
  label: string;   // short badge label
  token: string;   // stash regex token
  detail: string;  // full tooltip: actual in-game mod text + token explanation
  tier?: 'S' | 'A' | 'B';
}

// Pack Size mods — all give +20% pack size
const PACK_SIZE_MODS: NamedMod[] = [
  {
    id: 'hap', tier: 'S',
    label: 'Shaper-Touched (+20% pack)',
    token: '-t',
    detail: '"Rare monsters in area are Shaper-Touched" · +20% Pack · 13% Quant · Token: "-t" from "Shaper**-T**ouched" (2 chars, hyphen is unique in mod text)',
  },
  {
    id: 'syn', tier: 'S',
    label: 'Synthesis Boss (+20% pack)',
    token: 'yn',
    detail: '"Map Boss is accompanied by a Synthesis Boss" · +20% Pack · 13% Quant · Extra boss drops fractured/synthesised items · Token: "yn"',
  },
  {
    id: 'rch', tier: 'A',
    label: 'Searing Exarch Runes (+20% pack)',
    token: 'rch',
    detail: '"Area contains Runes of the Searing Exarch" · +20% Pack · 13% Quant · Runes pulse fire damage and halt all recovery — dangerous for regen builds · Token: "rch"',
  },
  {
    id: 'wni', tier: 'A',
    label: 'Drowning Orbs (+20% pack)',
    token: 'wni',
    detail: '"Area contains Drowning Orbs" · +20% Pack · 13% Quant · Slow orbs stack Drowning debuff — instant death at max stacks · Token: "wni"',
  },
  {
    id: 'maxres', tier: 'A',
    label: '-20% Max Res (+20% pack)',
    token: 'ax R',
    detail: '"Players have -20% to all maximum Resistances" · +20% Pack · 19% Quant · Token: "ax R" from "m**ax R**esistances" (4 chars) — "all m" hit Afflicting+Conflagrating ("All Monster Damage"); "ax R" appears only in max Resistances context',
  },
  {
    id: 'maven', tier: 'B',
    label: 'Maven Interferes (+20% pack)',
    token: 'mav',
    detail: '"The Maven interferes with Players" · +20% Pack · 13% Quant · Token: "mav" from "**mav**en"',
  },
];

// Currency mods — ordered best to worst by currency %
const CURRENCY_MODS: NamedMod[] = [
  {
    id: 'xpir', tier: 'S',
    label: 'of Defiance — Debuffs Expire (+64%)',
    token: 'deb',
    detail: '"Debuffs on Monsters expire 100% faster" · +64% Currency · 16% Quant · BEST currency mod · Token: "deb" from "**Deb**uffs on Monsters" — "xpi" was colliding with "Buffs on Players expire" (Transience) which also contains "expire"',
  },
  {
    id: 'kat', tier: 'A',
    label: 'Stalwart — Block Attack Damage (+47%)',
    token: 'k d',
    detail: '"Monsters have +50% Chance to Block Attack Damage" · +47% Currency · 13% Quant · Token: "k d" from "bloc**k D**amage" — "k a" collides with top tier Overlord\'s "increased Attack and Cast Speed"',
  },
  {
    id: 'fph', tier: 'A',
    label: 'Punishing — Reflect Phys & Ele (+47%)',
    token: 't 20',
    detail: '"Monsters reflect 20% of Physical Damage · Monsters reflect 20% of Elemental Damage" · +47% Currency · 10% Quant · Token: "t 20" from "reflec**t 20**%" — top tier version reflects only 18%, so targeting the 20% value is unique',
  },
  {
    id: 'life', tier: 'A',
    label: 'Fecund — More Monster Life 90-100% (+47%)',
    token: '(9\\d|100)% m',
    detail: '"(90-100)% more Monster Life" · +47% Currency · Token targets the 90-100% roll only — skips the low (25-30%) Unwavering variant which shares similar text',
  },
  {
    id: 'sks', tier: 'A',
    label: 'Diluted — Less Flask Effect (+47%)',
    token: 'sks',
    detail: '"Players have 40% less effect of Flasks applied to them" · +47% Currency · 16% Quant · Token: "sks" from "flas**ks**"',
  },
  {
    id: 'wb', tier: 'A',
    label: 'Ultimate — Bloodstained Sawblades (+47%)',
    token: 'wb',
    detail: '"Players are assaulted by Bloodstained Sawblades" · +47% Currency · 13% Quant · Token: "wb" from "sa**wb**lades"',
  },
  {
    id: 'tunn', tier: 'A',
    label: 'Juggernaut — Cannot Be Stunned (+47%)',
    token: 'tun',
    detail: '"Monsters cannot be Stunned · Action Speed cannot be modified to below Base Value" · +47% Currency · 13% Quant · ⚠ Same text exists on top tier Unwavering (no currency reward) — no single token can distinguish these',
  },
  {
    id: 'eteor', tier: 'B',
    label: 'of Imbibing — Meteor on Flask Use (+45%)',
    token: 'eor',
    detail: '"Players are targeted by a Meteor when they use a Flask" · +45% Currency · 13% Quant · Token: "teor" from "me**teor**"',
  },
];

// Quantity mods — highest quant rolls (19% quant, S/A tier)
const QUANTITY_MODS: NamedMod[] = [
  {
    id: 'chain3', tier: 'S',
    label: 'Chaining — Chain 3 Times (19% quant)',
    token: 'lid',
    detail: '"Monsters\' skills Chain 3 additional times · Projectiles can Chain when colliding with Terrain" · 19% Quant · 56% Rarity · 6% Pack · Token: "lid" from "col**lid**ing"',
  },
  {
    id: 'poss', tier: 'S',
    label: 'Enthralled — Bosses Possessed (19% quant)',
    token: 'poss',
    detail: '"Unique Bosses are Possessed" · 19% Quant · 56% Rarity · 6% Pack · ⚠ Exact same text in top tier Enthralled (weaker stats) — no single token can distinguish these',
  },
  {
    id: 'aoe', tier: 'S',
    label: 'Magnifying — 100% AoE + Projectiles (19% quant)',
    token: '2 a',
    detail: '"Monsters fire 2 additional Projectiles · Monsters\' skills Chain 3 additional times" · 19% Quant · 56% Rarity · 7% Pack · ⚠ "2 a" also matches top tier Splitting and Chaining (same individual lines, uber combines both)',
  },
  {
    id: 'mondam', tier: 'S',
    label: 'Savage — Increased Monster Damage (19% quant)',
    token: 'ter D',
    detail: '"(30-40)% increased Monster Damage" · 19% Quant · 56% Rarity · 7% Pack · ⚠ "ter D" also matches Afflicting (Ignite) and Penetration uber mods, plus top tier equivalents',
  },
  {
    id: 'speed', tier: 'S',
    label: 'Fleet — Monster Speed (19% quant)',
    token: 'ter Mo',
    detail: '"(25-30)% increased Monster Movement Speed · (35-45)% increased Monster Attack Speed · (35-45)% increased Monster Cast Speed" · 19% Quant · 56% Rarity · 7% Pack · Token: "ter Mo" from "Mons**ter Mo**vement" (6 chars) — "veme" hit Juggernaut+Unstoppable ("Monsters\u2019 Movement Speed cannot be modified" also has veme); "ter Mo" requires a space before M, which "Monsters\u2019" (apostrophe) does not provide',
  },
  {
    id: 'labyhaz', tier: 'A',
    label: 'Labyrinthine — Labyrinth Hazards (19% quant)',
    token: 'az',
    detail: '"Area contains Labyrinth Hazards" · 19% Quant · 54% Rarity · 5% Pack · Token: "az" from "h**az**ards" (2 chars) — "nth" collided with top tier Synthetic (Synthesis Boss) which also contains "nth"',
  },
  {
    id: 'expres', tier: 'S',
    label: 'of Exposure — -20% Max Res (19% quant)',
    token: 'ax R',
    detail: '"Players have -20% to all maximum Resistances" · 19% Quant · 11% Rarity · 20% Pack · Token: "ax R" from "m**ax R**esistances" — avoids "-20% to amount of Suppressed Spell Damage Prevented" and "All Monster Damage" (Afflicting/Conflagrating)',
  },
  {
    id: 'penet', tier: 'S',
    label: 'of Penetration — Penetrates 15% Ele Res (19% quant)',
    token: 'net',
    detail: '"Monster Damage Penetrates 15% Elemental Resistances" · 19% Quant · 72% Rarity · 6% Pack',
  },
];

// Scarab mods
const SCARAB_MODS: NamedMod[] = [
  {
    id: 'afflict', tier: 'S',
    label: 'Afflicting — Ignite/Freeze/Shock (+60% scarabs)',
    token: 'n ig',
    detail: '"All Monster Damage can Ignite, Freeze and Shock · Monsters Ignite, Freeze and Shock on Hit" · +60% Scarabs · 13% Quant · Token: "n ig" from "ca**n ig**nite" — top tier has "chance to Ignite" ("o ig") and "always Ignites" ("ys ig"), neither contains "n ig"',
  },
  {
    id: 'volati', tier: 'A',
    label: 'Volatile — Volatile Cores (+53% scarabs)',
    token: 'vol',
    detail: '"Rare Monsters have Volatile Cores" · +53% Scarabs · 13% Quant · 11% Rarity · Token: "vola" from "**vola**tile"',
  },
  {
    id: 'curses', tier: 'A',
    label: 'of Curses — Triple Curse (+35% scarabs)',
    token: 'oral',
    detail: '"Players are Cursed with Vulnerability · Temporal Chains · Elemental Weakness" · +35% Scarabs · 13% Quant · Token: "oral" from "Temp**oral** Chains" — ⚠ also matches top-tier "of Temporal Chains" (single curse, no scarab reward); unavoidable without multi-line matching',
  },
  {
    id: 'defenc', tier: 'B',
    label: 'of Miring — Less Defences (+35% scarabs)',
    token: 'fenc',
    detail: '"Players have (25-30)% less Defences" · +35% Scarabs · 13% Quant · Token: "efenc" from "d**efenc**es"',
  },
  {
    id: 'bufscar', tier: 'B',
    label: 'of Transience — Buffs Expire (+35% scarabs)',
    token: 'yers e',
    detail: '"Buffs on Players expire 100% faster" · +35% Scarabs · 10% Quant · ⚠ Also matches top tier "Buffs on Players expire 70% faster" (same text, different %) — unavoidable without targeting the "100" value specifically',
  },
  {
    id: 'marked', tier: 'B',
    label: 'of Marking — Marked Ground (+36% scarabs)',
    token: 'rke',
    detail: '"Area contains patches of moving Marked Ground, inflicting random Marks" · +36% Scarabs · 16% Quant · Token: "rke" from "ma**rke**d"',
  },
];

// Maps mods
const MAPS_MODS: NamedMod[] = [
  {
    id: 'grasp', tier: 'S',
    label: 'Grasping — Grasping Vines (+40% maps)',
    token: 'rasp',
    detail: '"Monsters inflict 2 Grasping Vines on Hit" · +40% Maps · 13% Quant · Token: "raspin" from "g**raspin**g"',
  },
  {
    id: 'shield', tier: 'A',
    label: 'Buffered — Extra Energy Shield (+35% maps)',
    token: 'a Ma',
    detail: '"Monsters gain (70-80)% of Maximum Life as Extra Maximum Energy Shield" · +35% Maps · 13% Quant · Token: "a Ma" from "extr**a Ma**ximum" — ⚠ also matches top-tier Buffered (40-49%, same text) — unavoidable; both give the same mechanic at different values',
  },
  {
    id: 'oppress', tier: 'A',
    label: 'Oppressive — Suppress Spell Damage (+35% maps)',
    token: 'o su',
    detail: '"Monsters have +100% chance to Suppress Spell Damage" · +35% Maps · 13% Quant · ⚠ Also matches top tier (+60% chance, same text) — no clean single token to distinguish',
  },
  {
    id: 'protect', tier: 'A',
    label: 'Protected — Physical Damage Reduction (+35% maps)',
    token: 'uct',
    detail: '"+50% Monster Physical Damage Reduction · +35% Monster Chaos Resistance · +55% Monster Elemental Resistances" · +35% Maps · 13% Quant · ⚠ also matches top-tier Armoured (+40% PDR, same text) — same mechanic, different values, unavoidable',
  },
  {
    id: 'powchg', tier: 'B',
    label: 'of Power — Power Charges (+35% maps)',
    token: 'um p',
    detail: '"Monsters have +1 to Maximum Power Charges · Monsters gain a Power Charge on Hit" · +35% Maps · 13% Quant',
  },
  {
    id: 'frenzchg', tier: 'B',
    label: 'of Frenzy — Frenzy Charges (+35% maps)',
    token: 'mum f',
    detail: '"Monsters have +1 to Maximum Frenzy Charges · Monsters gain a Frenzy Charge on Hit" · +35% Maps · 13% Quant · Token: "mum f" from "maxi**mum f**renzy" — "renzy" also matched top tier "steals Power, Frenzy and Endurance charges" (of Enervation)',
  },
  {
    id: 'endchg', tier: 'B',
    label: 'of Endurance — Endurance Charges (+35% maps)',
    token: 'm End',
    detail: '"Monsters have +1 to Maximum Endurance Charges · Monsters gain an Endurance Charge when hit" · +35% Maps · 13% Quant · Token: "m End" from "Maximu**m End**urance" — "dura" matched Poison Duration + top-tier Endurance mods; "Maximum Energy" is "m Ene" (e not d) so no collision',
  },
  {
    id: 'shrine', tier: 'B',
    label: 'of Domination — Shrine Buff (+35% maps)',
    token: 'ne b',
    detail: '"Unique Monsters have a random Shrine Buff" · +35% Maps · 13% Quant · Token: "ne b" from "shri**ne b**uff"',
  },
];

const PRESET_GROUPS = [
  { id: 'packsize', label: 'Pack Size Mods',  mods: PACK_SIZE_MODS },
  { id: 'currency', label: 'Currency Mods',   mods: CURRENCY_MODS },
  { id: 'quantity', label: 'Quantity Mods',   mods: QUANTITY_MODS },
  { id: 'scarabs',  label: 'Scarab Mods',     mods: SCARAB_MODS  },
  { id: 'maps',     label: 'Maps Mods',       mods: MAPS_MODS    },
];

const CHAR_LIMIT = 250;
const charCountColor = (n: number) => n > CHAR_LIMIT ? '#ff6b6b' : n > 220 ? '#ffd43b' : '#51cf66';
const TIER_COLORS: Record<string, string> = { S: 'yellow', A: 'orange', B: 'blue' };

// ─── Mod Group Editor ─────────────────────────────────────────────────────────

interface ModGroupState {
  id: string; label: string;
  mods: { id: string; token: string; label: string; detail?: string; tier?: string }[];
  selected: string[];
  k: number;
}

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

  const selectedTokens = group.mods.filter((m) => group.selected.includes(m.id)).map((m) => m.token);
  const preview    = generatePosRegex(selectedTokens, group.k);
  const blockCount = selectedTokens.length > 0
    ? combinations(selectedTokens, selectedTokens.length - group.k + 1).length : 0;

  const tooltipStyles = {
    tooltip: {
      background: '#16171a',
      border: '1px solid #3a3b3e',
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
    <Stack gap={4} p="sm" style={{ background: '#1a1b1e', borderRadius: 8, border: '1px solid #2c2d30' }}>
      <Group justify="space-between" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <Group gap={6}>
          <ActionIcon size={16} variant="transparent" c="dimmed">
            {open ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
          </ActionIcon>
          <TextInput
            size="xs" value={group.label} style={{ width: 180 }}
            styles={{ input: { fontSize: 11, fontWeight: 600, border: 'none', background: 'transparent', padding: 0 } }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ ...group, label: e.currentTarget.value })}
          />
          {group.selected.length > 0 && (
            <Badge size="xs" color="teal" variant="light">
              ≥{group.k} of {group.selected.length} · {blockCount} block{blockCount !== 1 ? 's' : ''}
            </Badge>
          )}
        </Group>
        <ActionIcon size="xs" color="red" variant="subtle" onClick={(e) => { e.stopPropagation(); onRemove(); }}>
          <FaTrash size={8} />
        </ActionIcon>
      </Group>

      <Collapse in={open}>
        <Stack gap={8} mt={4}>
          <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>Click to toggle. Hover for mod details.</Text>
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
                      <Text style={{ fontFamily: 'monospace', fontSize: 9, background: '#2a2b2e', padding: '2px 6px', borderRadius: 3, color: '#74c0fc', display: 'inline-block' }}>
                        {mod.token}
                      </Text>
                      {mod.detail && <Text size="xs" style={{ fontSize: 9, color: '#adb5bd', lineHeight: 1.5 }}>{mod.detail}</Text>}
                    </Stack>
                  }
                  withArrow multiline>
                  <Badge
                    size="sm"
                    variant={active ? 'filled' : 'outline'}
                    color={active ? tierColor : 'gray'}
                    style={{ cursor: 'pointer', fontSize: 9, maxWidth: 280 }}
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
                        }}>×</ActionIcon>
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
                <FaPlus size={9} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {group.selected.length > 0 && (
            <Group gap={8} align="center" wrap="nowrap"
              style={{ background: '#12130e', borderRadius: 5, padding: '6px 8px', border: '1px solid #2a2d1a' }}>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontSize: 10 }}>At least</Text>
              <NumberInput size="xs" value={group.k} min={1} max={group.selected.length}
                style={{ width: 56 }}
                onChange={(v) =>
                  onChange({ ...group, k: Math.max(1, Math.min(group.selected.length, Number(v) || 1)) })
                }
              />
              <Text size="xs" c="dimmed" style={{ flexShrink: 0, fontSize: 10 }}>of {group.selected.length} selected</Text>
              {group.k === group.selected.length && <Badge size="xs" color="yellow" variant="light">ALL</Badge>}
              {group.k === 1 && <Badge size="xs" color="gray" variant="light">ANY one</Badge>}
            </Group>
          )}

          {preview && (
            <Stack gap={3} p="xs" style={{ background: '#0d0e0f', borderRadius: 5, border: '1px solid #1f2020' }}>
              <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
                {blockCount} block{blockCount !== 1 ? 's' : ''} from this group:
              </Text>
              <Text style={{ fontFamily: 'monospace', fontSize: 9, color: '#74c0fc', wordBreak: 'break-all', lineHeight: 1.7 }}>
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

function currNum(min: number): string {
  if (min <= 0) return '\\d..';
  const f = Math.floor(min / 10) * 10;
  if (f >= 200) return '[2-9]..';
  if (f >= 100) {
    const t = Math.floor((f % 100) / 10);
    return t === 0 ? '\\d..' : `1[${t}-9].|[2-9]..`;
  }
  const t = Math.floor(f / 10);
  return t >= 9 ? `9.|\\d..` : `[${t}-9].|\\d..`;
}
function sizeNum(min: number): string {
  if (min <= 0) return '\\d+';
  const t = Math.floor(min / 10);
  return t <= 0 ? '[1-9].|\\d..' : t >= 9 ? `9.|\\d..` : `[${t}-9].|\\d..`;
}

const AltAugSection = () => {
  const [currencyMin, setCurrencyMin] = useState(90);
  const [packMin,     setPackMin]     = useState(20);
  const [gigaMin,     setGigaMin]     = useState(150);
  const [chiseled,    setChiseled]    = useState(true);

  // When toggling chisel, adjust the number boxes directly so the user sees the change
  const handleChiselToggle = (nowChiseled: boolean) => {
    if (!nowChiseled) {
      // Chisel NOT yet applied — lower thresholds by 50 to match pre-chisel roll
      setCurrencyMin((v) => Math.max(0, v - 50));
      setGigaMin((v) => Math.max(0, v - 50));
    } else {
      // Chisel already applied — raise thresholds back by 50
      setCurrencyMin((v) => v + 50);
      setGigaMin((v) => v + 50);
    }
    setChiseled(nowChiseled);
  };

  // Both open-slot patterns combined — no toggle needed:
  //   " Map \(Tier" → prefix-only (open suffix): "Punishing Map (Tier 16)"
  //   "^Map of"     → suffix-only (open prefix): "Map of Defiance (Tier 16)"
  // A full 2-mod map like "Punishing Map of Defiance" matches NEITHER → no false positives.
  // ^ anchor confirmed working in PoE stash search.
  const openSlotPats = ' Map \\(Tier|^Map of';

  const gate1 = `"curr.*(${currNum(currencyMin)})"`;
  const gate2  = `"size.*(${sizeNum(packMin)})%|${openSlotPats}${gigaMin > currencyMin ? `|curr.*(${currNum(gigaMin)})` : ''}"`;
  const regex   = `${gate1} ${gate2}`;
  const charCount = regex.length;

  return (
    <Stack gap={8} p="sm" style={{ background: '#1a1b1e', borderRadius: 8, border: '1px solid #2c2d30' }}>
      <Text size="xs" fw={700}>Alt/Aug Magic Map Crafting</Text>
      <Text size="xs" c="dimmed" style={{ fontSize: 10, lineHeight: 1.5 }}>
        Highlights maps that: (1) have ≥{currencyMin}% currency AND ≥{packMin}% pack size,
        or (2) have currency as their ONLY mod (open slot — Augment it){gigaMin > currencyMin ? `, or (3) ≥${gigaMin}% currency regardless of pack (keeper)` : ''}.
      </Text>
      <Text size="xs" c="dimmed" style={{ fontSize: 9, lineHeight: 1.6 }}>
        Open suffix: <Text span style={{ fontFamily: 'monospace', fontSize: 9, color: '#74c0fc' }}> Map \(Tier</Text>
        {'  '}Open prefix: <Text span style={{ fontFamily: 'monospace', fontSize: 9, color: '#74c0fc' }}>^Map of</Text>
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
        <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Avarice chisel already applied?</Text>
        <Switch size="sm" checked={chiseled} onChange={(e) => handleChiselToggle(e.currentTarget.checked)} />
        <Text size="xs" c={chiseled ? 'green' : 'orange'} style={{ fontSize: 10 }}>
          {chiseled
            ? 'Yes — showing post-chisel values'
            : 'No — thresholds already adjusted -50 for pre-chisel rolls'}
        </Text>
      </Group>

      <Stack gap={2}>
        <Group justify="space-between">
          <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
            {charCount} chars
            {charCount > CHAR_LIMIT && <Text span c="red"> ⚠ over limit</Text>}
          </Text>
          <CopyButton value={regex} timeout={2000}>
            {({ copied, copy }) => (
              <Button size="xs" variant="light" color={copied ? 'teal' : 'orange'}
                leftSection={copied ? <FaCheck size={9} /> : <FaCopy size={9} />}
                onClick={copy} style={{ minWidth: 90 }}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            )}
          </CopyButton>
        </Group>
        <Text style={{ fontFamily: 'monospace', fontSize: 9, color: '#74c0fc', wordBreak: 'break-all', lineHeight: 1.6 }}>
          {regex}
        </Text>
      </Stack>
    </Stack>
  );
};

// ─── Main panel ───────────────────────────────────────────────────────────────

const DEFAULT_GROUPS: ModGroupState[] = [
  {
    id: 'g1', label: 'Pack Size Mods',
    mods: PACK_SIZE_MODS.map((m) => ({ id: m.id, token: m.token, label: m.label, detail: m.detail, tier: m.tier })),
    selected: [], // start empty — user selects their own mods
    k: 2,
  },
];

export const RegexBuilderModule = () => {
  const [craftingOpen, setCraftingOpen] = useState(false);
  const [howOpen,      setHowOpen]      = useState(false);
  const [groups,       setGroups]       = useState<ModGroupState[]>(DEFAULT_GROUPS);

  const updateGroup = (idx: number, g: ModGroupState) =>
    setGroups((prev) => prev.map((x, i) => (i === idx ? g : x)));
  const removeGroup = (idx: number) =>
    setGroups((prev) => prev.filter((_, i) => i !== idx));
  const addGroup = (presetId?: string) => {
    const preset = PRESET_GROUPS.find((p) => p.id === presetId);
    setGroups((prev) => [...prev, {
      id: `g_${Date.now()}`,
      label: preset?.label ?? 'New Group',
      mods: (preset?.mods ?? []).map((m) => ({ id: m.id, token: m.token, label: m.label, detail: m.detail, tier: m.tier })),
      selected: [], // always start empty
      k: 2,
    }]);
  };

  const finalRegex = useMemo(() => {
    const parts = groups
      .map((g) => {
        const tokens = g.mods.filter((m) => g.selected.includes(m.id)).map((m) => m.token);
        return generatePosRegex(tokens, g.k);
      })
      .filter(Boolean);
    return parts.join(' ');
  }, [groups]);

  const charCount  = finalRegex.length;
  const blockCount = finalRegex ? finalRegex.split('" "').length : 0;

  return (
    <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
      style={{ display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" mb="xs">
        <Stack gap={0}>
          <Text fw={700} size="sm">Regex Builder</Text>
          <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>K-of-N combinatorial stash regex · Product of Sums</Text>
        </Stack>
        {finalRegex && (
          <Badge size="xs" color={charCountColor(charCount)} variant="light">
            {charCount} / {CHAR_LIMIT} chars
          </Badge>
        )}
      </Group>

      <ScrollArea style={{ flex: 1 }} scrollbarSize={4}>
        <Stack gap={8}>

          {/* How it works — collapsed by default */}
          <Stack gap={2}>
            <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setHowOpen((v) => !v)}>
              <ActionIcon size={14} variant="transparent" c="dimmed">
                {howOpen ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
              </ActionIcon>
              <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>How this works</Text>
            </Group>
            <Collapse in={howOpen}>
              <Stack gap={2} p="xs" style={{ background: '#131416', borderRadius: 6 }}>
                <Text size="xs" c="dimmed" style={{ fontSize: 10, lineHeight: 1.5 }}>
                  PoE's engine is <Text span c="orange">line-by-line</Text> — .* across lines doesn't work.
                  <Text span c="teal"> Spaces between quoted blocks = AND</Text>, <Text span c="teal">pipes inside = OR</Text>.
                  This generates the minimum blocks so a map highlights only when it has at least K of your chosen mods.
                  Add multiple groups to require different conditions simultaneously.
                </Text>
              </Stack>
            </Collapse>
          </Stack>

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
              style={{ background: '#1a2020', borderRadius: 8, border: '1px solid #2a4040' }}>
              <Group justify="space-between">
                <Group gap={6}>
                  <Text size="xs" fw={700} c="teal">Generated Regex</Text>
                  <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
                    {blockCount} block{blockCount !== 1 ? 's' : ''}
                    {charCount > CHAR_LIMIT && <Text span c="red"> · ⚠ exceeds 250-char limit</Text>}
                  </Text>
                </Group>
                <CopyButton value={finalRegex} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="light" color={copied ? 'teal' : 'orange'}
                      leftSection={copied ? <FaCheck size={10} /> : <FaCopy size={10} />}
                      onClick={copy} style={{ minWidth: 100 }}>
                      {copied ? 'Copied!' : 'Copy Regex'}
                    </Button>
                  )}
                </CopyButton>
              </Group>
              <Text style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', lineHeight: 1.6, color: '#e0e0e0' }}>
                {finalRegex}
              </Text>
              {charCount > CHAR_LIMIT && (
                <Text size="xs" c="red" style={{ fontSize: 10 }}>
                  {charCount - CHAR_LIMIT} chars over the limit. Reduce K or the number of mods.
                </Text>
              )}
            </Stack>
          )}

          <Divider />

          {/* Alt/Aug crafting */}
          <Group gap={4} style={{ cursor: 'pointer' }} onClick={() => setCraftingOpen((v) => !v)}>
            <ActionIcon size={16} variant="transparent" c="dimmed">
              {craftingOpen ? <FaChevronDown size={9} /> : <FaChevronRight size={9} />}
            </ActionIcon>
            <Text size="xs" fw={700}>Alt/Aug Magic Map Crafting</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
              Dynamic regex for rolling blue Originator maps
            </Text>
          </Group>
          <Collapse in={craftingOpen}>
            <AltAugSection />
          </Collapse>

        </Stack>
      </ScrollArea>
    </Card>
  );
};
