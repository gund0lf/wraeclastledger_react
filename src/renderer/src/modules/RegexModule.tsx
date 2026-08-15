import {
  Text, Button, Group, Stack, Badge, ActionIcon,
  TextInput, Select, MultiSelect, Modal, CopyButton, Code, Divider, ScrollArea, Tooltip,
  NumberInput, Switch, Alert, Menu, SimpleGrid, UnstyledButton, SegmentedControl,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useEffect, useRef, type KeyboardEvent } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { IconTrash, IconCopy, IconCheck, IconWand, IconX, IconExternalLink, IconStar, IconDeviceFloppy, IconChevronDown, IconPencil, IconSettings } from '@tabler/icons-react';
import {
  generateRunRegex,
  generateSlamRegex,
  generateTradeRegex,
  resolveTradeRegexExclusions,
  trimmedMean,
  sanitizeExclusionTerms,
} from '../utils/priceUtils';
import { CURRENT_LEAGUE, KNOWN_LEAGUES } from '../utils/league';
import { COLOR, FONT } from '../utils/uiTokens'
import { RegexLine } from '../components/ui/RegexLine'
import {
  buildBrickModSelectGroups,
  filterBrickModSelectOptions,
  type BrickModSelectOption,
} from '../utils/brickModSelect';

// Badge tooltips explaining how each generated regex is derived (Sad 2026-07-09).
const RUN_TOOLTIP = 'Run = maps ready to run: floors derived from your session averages — currency and pack (both required on high-currency sessions), plus quantity/rarity riders at 60% of your averages.';
const SLAM_TOOLTIP = 'Slam = near-miss maps worth upgrading: 75% of your session\u2019s currency/pack averages, either one is enough. Quantity and rarity are ignored because a slam can still add them.';

type MapType = 'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
type CorruptedFilter = 'any' | 'yes' | 'no';

const MAP_TYPE_OPTIONS: { value: MapType; label: string; description: string }[] = [
  { value: 'any',        label: 'Any',         description: 'No map type filter applied' },
  { value: 'regular',    label: 'Regular',      description: 'Non-corrupted maps, standard mod pool. Pseudo stats left at 0.' },
  { value: '8mod',       label: '8-mod',        description: 'Corrupted ordinary maps only; excludes Originator and Shaper/Elder influence. High IIQ/pack narrows to quality 8-mod maps.' },
  { value: 'nightmare',  label: 'Nightmare',    description: 'Exact Nightmare Map item type. Pseudo filters can narrow the results.' },
  { value: 'originator', label: 'Originator',   description: 'Has Originator\'s Memories implicit. Includes all variants.' },
];

const DELI_REWARD_OPTIONS = [
  { value: 'deli_currency',   label: 'Currency' },
  { value: 'deli_scarabs',    label: 'Scarabs' },
  { value: 'deli_fragments',  label: 'Fragments' },
  { value: 'deli_divcards',   label: 'Divination Cards' },
  { value: 'deli_maps',       label: 'Map Items' },
  { value: 'deli_essences',   label: 'Essences' },
  { value: 'deli_unique',     label: 'Unique Items' },
  { value: 'deli_expedition', label: 'Expedition Items' },
  { value: 'deli_breach',     label: 'Breach Items' },
  { value: 'deli_delirium',   label: 'Delirium' },
  { value: 'deli_blight',     label: 'Blight Items' },
  { value: 'deli_abyss',      label: 'Abyss Items' },
  { value: 'deli_gems',       label: 'Gems' },
  { value: 'deli_fossils',    label: 'Fossils' },
  { value: 'deli_armour',     label: 'Armour' },
  { value: 'deli_weapons',    label: 'Weapons' },
  { value: 'deli_jewellery',  label: 'Jewellery' },
  { value: 'deli_incubators', label: 'Incubators' },
  { value: 'deli_labyrinth',  label: 'Labyrinth Items' },
  { value: 'deli_catalysts',  label: 'Catalysts' },
  { value: 'deli_talismans',  label: 'Talismans' },
] as const;

const TAG_TO_MAP_TYPE: Record<string, MapType> = {
  regular: 'regular', originator: 'originator', nightmare: 'nightmare',
  '8mod': '8mod', 'empowered': 'any', 'empowered-originator': 'originator',
};

// Word-based fuzzy filter over the exact PoE Trade wording shown to the user.
const brickModFilter = ({ options, search }: { options: any[]; search: string }) => {
  return filterBrickModSelectOptions(options, search ?? '');
};

// ─── From Session tab ─────────────────────────────────────────────────────────
// WP8: the generate/exclusions/trade content of the merged Regex panel. The
// internal RegexLine/CopyLine were replaced by the shared components/ui/RegexLine.

export const FromSessionTab = () => {
  const { settings, updateSetting,
    setDefaultPreset,
    exclusionPresets, saveExclusionPreset, updateExclusionPreset,
    loadExclusionPreset, setExclusionPresetDefault, deleteExclusionPreset,
    maps, loadedStrategyInfo,
  } = useSessionKeys(
    'settings', 'updateSetting',
    'setDefaultPreset',
    'exclusionPresets', 'saveExclusionPreset', 'updateExclusionPreset',
    'loadExclusionPreset', 'setExclusionPresetDefault', 'deleteExclusionPreset',
    'maps', 'loadedStrategyInfo',
  );

  const [tradeOpen,  { open: openTrade,  close: closeTrade  }] = useDisclosure(false);

  const [presetSaveOpen, setPresetSaveOpen] = useState(false); // "Save current as…" name dialog
  const [presetSaveName, setPresetSaveName] = useState('');
  const [presetMode, setPresetMode] = useState<'structured' | 'literal'>('structured');
  const [presetLiteralRegex, setPresetLiteralRegex] = useState('');
  const [presetEditId, setPresetEditId] = useState<string | null>(null);
  const [hoveredExclTrashId, setHoveredExclTrashId] = useState<string | null>(null); // preset delete red hover

  const [tradeMapType,      setTradeMapType]      = useState<MapType>('any');
  const [tradeLeague,       setTradeLeague]       = useState(settings.leagueName?.trim() || CURRENT_LEAGUE);
  const [tradeEmpowered,    setTradeEmpowered]    = useState(false);
  const [tradeMinDelirious, setTradeMinDelirious] = useState(-1);
  const [tradeDeliRewards,  setTradeDeliRewards]  = useState<string[]>([]);
  const [tradeMinIIQ,       setTradeMinIIQ]       = useState(0);
  const [tradeMinIIR,       setTradeMinIIR]       = useState(0);
  const [tradeMinPack,      setTradeMinPack]       = useState(0);
  const [tradeMinCurrency,  setTradeMinCurrency]  = useState(0);
  const [tradeMinScarabs,   setTradeMinScarabs]   = useState(0);
  const [tradeMinMaps,      setTradeMinMaps]      = useState(0);
  const [tradeMinTier,      setTradeMinTier]      = useState(16);
  const [tradeCorrupted,    setTradeCorrupted]    = useState<CorruptedFilter>('any');
  const [tradeLoading,      setTradeLoading]      = useState(false);
  const [tradeError,        setTradeError]        = useState<string | null>(null);
  const [brickMods,         setBrickMods]         = useState<{ id: string; label: string; regexTerm: string; tradeTexts: string[]; category: 'regular' | 'nightmare' }[]>([]);
  const [brickModsError,    setBrickModsError]    = useState<string | null>(null);
  const [unavailableBricks, setUnavailableBricks] = useState<{ label: string; expectedCount: number; actualCount: number }[]>([]);
  const [tradeBrickExcl,    setTradeBrickExcl]    = useState<string[]>([]);
  const ignoreEmptySearchBackspaceRef = useRef(false);

  // Mantine removes the last selected pill on an empty-search Backspace even
  // when the native key event is prevented. Keep the controlled value stable
  // for that one synchronous change while preserving chip X / clear-all.
  const protectSelectedModsOnBackspace = (
    event: KeyboardEvent<HTMLInputElement>,
    hasSelection: boolean,
  ) => {
    if (event.key !== 'Backspace' || event.currentTarget.value.length > 0 || !hasSelection) return;
    event.preventDefault();
    ignoreEmptySearchBackspaceRef.current = true;
    queueMicrotask(() => { ignoreEmptySearchBackspaceRef.current = false; });
  };

  const applySelectedModsChange = (selected: string[], apply: (value: string[]) => void) => {
    if (!ignoreEmptySearchBackspaceRef.current) apply(selected);
  };

  const exclusions = useMemo(
    () => settings.regexExclusions ?? [],
    [settings.regexExclusions],
  );

  const removeExclusion = (term: string) =>
    updateSetting('regexExclusions', exclusions.filter((e) => e !== term));

  const is8Mod = maps.length > 0 && maps.every((m) => m.modCount > 6 || m.isNightmare);

  useEffect(() => {
    try {
      const fn = window.api?.getBrickMods;
      if (typeof fn === 'function') {
        fn()
          .then((result) => {
            setBrickMods(result.mods);
            setUnavailableBricks(result.unavailable);
            setBrickModsError(result.error);
          })
          .catch(() => setBrickModsError('PoE Trade exclusions failed to load'));
      }
    } catch { setBrickModsError('PoE Trade exclusions failed to load'); }
  }, []);

  const generatedRegex = useMemo(() => {
    if (maps.length === 0) return null;
    const avg = {
      avgQuant:   trimmedMean(maps.map((m) => m.quantity)),
      avgPack:    trimmedMean(maps.map((m) => m.packSize)),
      avgCurr:    trimmedMean(maps.map((m) => m.moreCurrency)),
      avgRarity:  trimmedMean(maps.map((m) => m.rarity)),
      avgScarabs: trimmedMean(maps.map((m) => m.moreScarabs)),
    };
    return {
      run:  generateRunRegex(avg, exclusions),
      slam: is8Mod ? null : generateSlamRegex(avg, exclusions),
      avg, n: maps.length,
    };
  }, [maps, exclusions, is8Mod]);

  const nightmareBrickIds = useMemo(
    () => new Set(brickMods.filter((m) => m.category === 'nightmare').map((m) => m.id)),
    [brickMods]
  );

  const brickModData = useMemo(() => buildBrickModSelectGroups(brickMods), [brickMods]);
  const tradeLeagueOptions = useMemo(
    () => Array.from(new Set(
      [settings.leagueName?.trim(), ...KNOWN_LEAGUES].filter((name): name is string => !!name)
    )),
    [settings.leagueName]
  );

  const renderBrickOption = ({ option, checked }: {
    option: { value: string; label: string };
    checked?: boolean;
  }) => {
    const richOption = option as BrickModSelectOption;
    return (
      <Group gap={6} wrap="nowrap" align="flex-start">
        {checked && <IconCheck size={12} style={{ flexShrink: 0, marginTop: 2 }} />}
        <Text size="xs" lineClamp={2}
          style={{ color: nightmareBrickIds.has(option.value) ? COLOR.nightmare : undefined }}>
          {richOption.tradeLabel ?? option.label}
        </Text>
      </Group>
    );
  };

  const addBrickModsToRegex = (brickIds: string[]) => {
    const terms = brickIds
      .map((id) => brickMods.find((m) => m.id === id)?.regexTerm)
      .filter((t): t is string => !!t && !exclusions.includes(t));
    if (terms.length > 0) updateSetting('regexExclusions', [...exclusions, ...terms]);
  };

  // Side-by-side category pickers (Sad 2026-07-09): each select owns ONLY its
  // category's terms — changing one must preserve the other category's picks
  // AND any custom/pasted terms that no mod list knows about.
  const handleCategoryChange = (cat: 'regular' | 'nightmare') => (selected: string[]) => {
    const catTerms = new Set(brickMods.filter((m) => m.category === cat).map((m) => m.regexTerm));
    const kept = exclusions.filter((e) => !catTerms.has(e));
    const newTerms = selected
      .map((id) => brickMods.find((m) => m.id === id)?.regexTerm)
      .filter((t): t is string => !!t);
    updateSetting('regexExclusions', [...new Set([...kept, ...newTerms])]);
  };
  const selectedIdsOf = (cat: 'regular' | 'nightmare') =>
    brickMods.filter((m) => m.category === cat && exclusions.includes(m.regexTerm)).map((m) => m.id);
  const doPresetSave = () => {
    const name = presetSaveName.trim();
    const literal = presetLiteralRegex.trim();
    if (!name || (presetMode === 'literal' && !literal)) return;
    if (presetEditId) updateExclusionPreset(presetEditId, name, presetMode === 'literal' ? literal : undefined);
    else saveExclusionPreset(name, presetMode === 'literal' ? literal : undefined);
    setPresetSaveName('');
    setPresetLiteralRegex('');
    setPresetMode('structured');
    setPresetEditId(null);
    setPresetSaveOpen(false);
  };

  const closePresetEditor = () => {
    setPresetSaveOpen(false);
    setPresetSaveName('');
    setPresetLiteralRegex('');
    setPresetMode('structured');
    setPresetEditId(null);
  };

  const openPresetEditor = (preset?: (typeof exclusionPresets)[number]) => {
    setPresetEditId(preset?.id ?? null);
    setPresetSaveName(preset?.name ?? '');
    setPresetMode(preset?.kind === 'literal' ? 'literal' : 'structured');
    setPresetLiteralRegex(preset?.literalRegex ?? '');
    setPresetSaveOpen(true);
  };

  useEffect(() => {
    setTradeLeague(settings.leagueName?.trim() || CURRENT_LEAGUE);
    const src = generatedRegex ?? (loadedStrategyInfo ? {
      avg: {
        avgQuant:  loadedStrategyInfo.avgQuant,
        avgRarity: loadedStrategyInfo.avgRarity,
        avgPack:   loadedStrategyInfo.avgPack,
        avgCurr:   loadedStrategyInfo.avgCurr,
      }
    } : null);
    if (src) {
      setTradeMinIIQ(Math.floor(src.avg.avgQuant / 10) * 10);
      setTradeMinIIR(Math.floor(src.avg.avgRarity / 10) * 10);
      setTradeMinPack(Math.floor(src.avg.avgPack  / 10) * 10);
      const avgCurr = src.avg.avgCurr;
      setTradeMinCurrency(avgCurr > 0 ? Math.floor(avgCurr / 10) * 10 : 0);
      setTradeMinScarabs(0); setTradeMinMaps(0);
    }
    // Map type from parsed maps
    if (maps.length > 0) {
      const hasOrig  = maps.some((m) => m.isOriginator);
      const hasEmp   = maps.some((m) => m.isEmpoweredMirage);
      const hasNight = maps.some((m) => m.isNightmare);
      const hasCorr  = maps.some((m) => m.isCorrupted && m.modCount > 6);
      if (hasOrig)        { setTradeMapType('originator'); setTradeEmpowered(hasEmp); }
      else if (hasNight)  { setTradeMapType('nightmare');  setTradeEmpowered(false); }
      else if (hasCorr)   { setTradeMapType('8mod');       setTradeEmpowered(hasEmp); }
      else                { setTradeMapType('regular');    setTradeEmpowered(false); }
    } else if (loadedStrategyInfo?.mapType) {
      // Map type from loaded strategy
      const mt = TAG_TO_MAP_TYPE[loadedStrategyInfo.mapType] ?? 'any';
      setTradeMapType(mt);
      setTradeEmpowered(loadedStrategyInfo.mapType.includes('empowered'));
    } else {
      setTradeMapType('any');
      setTradeEmpowered(false);
    }
    setTradeCorrupted('any');
    setTradeMinTier(16);
    setTradeError(null);
    const autoSelected = brickMods.filter((m) => exclusions.includes(m.regexTerm)).map((m) => m.id);
    setTradeBrickExcl(autoSelected);
  }, [settings.leagueName, generatedRegex, loadedStrategyInfo, maps, brickMods, exclusions]);

  const handleOpenTradeModal = () => {
    setTradeError(null);
    openTrade();
  };

  const handleSearch = async () => {
    const league = tradeLeague;
    setTradeLoading(true); setTradeError(null);
    try {
      const result = await window.api.searchMapsOnTrade({
        league, minIIQ: tradeMinIIQ, minIIR: tradeMinIIR, minPack: tradeMinPack,
        minCurrency: tradeMinCurrency, minScarabs: tradeMinScarabs, minMaps: tradeMinMaps,
        minTier: tradeMinTier, corruptedFilter: tradeCorrupted,
        mapType: tradeMapType, empowered: tradeLeague.toLowerCase() === 'allflame' ? false : tradeEmpowered,
        minDelirious: tradeMinDelirious, deliRewardTypes: tradeDeliRewards,
        brickExclusions: tradeBrickExcl,
      });
      if (result.url) { window.open(result.url, '_blank'); }
      else setTradeError(result.error ?? 'Failed to create trade search');
    } catch (err: any) { setTradeError(err.message ?? 'IPC error'); }
    finally { setTradeLoading(false); }
  };

  const selectedMapTypeInfo = MAP_TYPE_OPTIONS.find((o) => o.value === tradeMapType);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: 8 }}>
      {/* ── Trade search modal ── */}
      <Modal opened={tradeOpen} onClose={closeTrade} title="PoE Trade Map Search" size="md" scrollAreaComponent={ScrollArea.Autosize}>
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            League:{' '}
            <Menu position="bottom-start" withinPortal>
              <Menu.Target>
                <UnstyledButton
                  aria-label={`Trade league: ${tradeLeague}. Click to change for this search only.`}
                  style={{
                    color: 'var(--mantine-color-teal-4)',
                    fontWeight: 600,
                    fontSize: 'inherit',
                    lineHeight: 'inherit',
                  }}>
                  {tradeLeague}
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                {tradeLeagueOptions.map((league) => (
                  <Menu.Item key={league} onClick={() => {
                    setTradeLeague(league);
                    if (league.toLowerCase() === 'allflame') setTradeEmpowered(false);
                  }}>
                    {league}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
            {' · '}Any Non-Unique{' · '}<Text span c="green" fw={600}>Instant Buyout</Text>
          </Text>

          <Stack gap={4}>
            <Text size="xs" fw={600}>Map type</Text>
            <Select size="xs"
              data={MAP_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={tradeMapType}
              onChange={(v) => {
                const t = (v ?? 'any') as MapType;
                setTradeMapType(t);
                if (t === 'regular' || t === '8mod') {
                  setTradeMinCurrency(0); setTradeMinScarabs(0); setTradeMinMaps(0);
                }
              }} />
            {selectedMapTypeInfo && (
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>{selectedMapTypeInfo.description}</Text>
            )}
          </Stack>

          {tradeLeague.toLowerCase() !== 'allflame' && (
            <Group justify="space-between" align="center">
              <Stack gap={0}>
                <Text size="xs" fw={600}>Empowered Mirage enchant</Text>
                <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Require Empowered Mirage enchant</Text>
              </Stack>
              <Switch size="sm" checked={tradeEmpowered} onChange={(e) => setTradeEmpowered(e.currentTarget.checked)} />
            </Group>
          )}

          <Stack gap={4}>
            <Text size="xs" fw={600}>Delirium</Text>
            <Group gap="md" grow>
              <Select size="xs" label="Delirium state"
                data={[
                  { value: '-1',  label: 'Any (no filter)' },
                  { value: '0',   label: 'None (exclude Delirious maps)' },
                  { value: '20',  label: 'Exactly 20% (1 orb)' },
                  { value: '40',  label: 'Exactly 40% (2 orbs)' },
                  { value: '60',  label: 'Exactly 60% (3 orbs)' },
                  { value: '80',  label: 'Exactly 80% (4 orbs)' },
                  { value: '100', label: 'Exactly 100% (5 orbs)' },
                ]}
                value={String(tradeMinDelirious)}
                onChange={(v) => {
                  const next = Number(v ?? '-1');
                  setTradeMinDelirious(next);
                  if (next === 0) setTradeDeliRewards([]);
                }} />
              <MultiSelect size="xs" label="Reward types (optional)" placeholder="Any"
                clearable searchable
                disabled={tradeMinDelirious === 0}
                data={DELI_REWARD_OPTIONS}
                value={tradeDeliRewards} onChange={setTradeDeliRewards} maxDropdownHeight={200}
                styles={{
                  // Match the Brick Exclusions pickers: the field grows with
                  // its pills, while clear/chevron stay pinned at top right.
                  section: { alignItems: 'flex-start', paddingTop: 5 },
                }} />
            </Group>
          </Stack>

          <Divider label="Map filters" labelPosition="left" />
          <Group gap="xs" grow>
            <NumberInput size="xs" label="Min IIQ" min={0} max={300} step={10} value={tradeMinIIQ} onChange={(v) => setTradeMinIIQ(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min IIR" min={0} max={300} step={10} value={tradeMinIIR} onChange={(v) => setTradeMinIIR(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min Pack" min={0} max={200} step={10} value={tradeMinPack} onChange={(v) => setTradeMinPack(Number(v) || 0)} suffix="%" />
          </Group>
          <Group gap="xs" grow>
            <NumberInput size="xs" label="Min Tier" min={0} max={16} step={1} value={tradeMinTier} onChange={(v) => setTradeMinTier(Number(v) || 0)} />
            <Select size="xs" label="Corrupted"
              data={[
                { value: 'any', label: 'Any (map type decides)' },
                { value: 'yes', label: 'Corrupted only' },
                { value: 'no',  label: 'Not corrupted' },
              ]}
              value={tradeCorrupted} onChange={(v) => setTradeCorrupted((v ?? 'any') as CorruptedFilter)} />
          </Group>

          <Divider label="Pseudo stat filters" labelPosition="left" />
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
            {tradeMapType === 'regular' || tradeMapType === '8mod'
              ? 'Regular and 8-mod maps have no uber pseudo stats — keep these at 0.'
              : tradeMapType === 'nightmare'
                ? 'Optional for Nightmare maps: these combine chisel quality + explicit mods.'
                : 'These combine chisel quality + explicit mods.'}
          </Text>
          <Group gap="xs" grow>
            <NumberInput size="xs" label="Min Currency" min={0} step={10}
              disabled={tradeMapType === 'regular' || tradeMapType === '8mod'}
              value={tradeMinCurrency} onChange={(v) => setTradeMinCurrency(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min Scarabs" min={0} step={10}
              disabled={tradeMapType === 'regular' || tradeMapType === '8mod'}
              value={tradeMinScarabs} onChange={(v) => setTradeMinScarabs(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min Maps" min={0} step={10}
              disabled={tradeMapType === 'regular' || tradeMapType === '8mod'}
              value={tradeMinMaps} onChange={(v) => setTradeMinMaps(Number(v) || 0)} suffix="%" />
          </Group>

          <Divider label="Brick exclusions (NOT filter)" labelPosition="left" />
          <Stack gap={4}>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
              Exclude maps with these mods. <Text span style={{ color: COLOR.nightmare, fontSize: FONT.small }}>Purple = Nightmare mods.</Text>
            </Text>
            {brickModsError && (
              <Alert color="orange" variant="light" p="xs">
                <Text size="xs">{brickModsError} — restart the app to retry. Brick exclusions by regex term still work.</Text>
              </Alert>
            )}
            {unavailableBricks.length > 0 && (
              <Alert color="orange" variant="light" p="xs">
                <Text size="xs">
                  {unavailableBricks.length} exclusion{unavailableBricks.length === 1 ? '' : 's'} unavailable because the current PoE Trade definitions did not match exactly: {unavailableBricks.map((brick) => `${brick.label} (expected ${brick.expectedCount}, found ${brick.actualCount})`).join(', ')}.
                </Text>
              </Alert>
            )}
            <MultiSelect size="xs"
              placeholder={brickModsError || unavailableBricks.length > 0 && brickMods.length === 0
                ? 'Unavailable'
                : brickMods.length === 0 ? 'Loading…' : 'Search and select mods to exclude'}
              searchable clearable filter={brickModFilter}
              data={brickModData} value={tradeBrickExcl}
              onChange={(selected) => applySelectedModsChange(selected, setTradeBrickExcl)}
              onKeyDownCapture={(event) => protectSelectedModsOnBackspace(event, tradeBrickExcl.length > 0)}
              renderOption={renderBrickOption}
              maxDropdownHeight={240} disabled={brickMods.length === 0}
              style={{ maxWidth: '100%' }}
              styles={{
                input: { overflow: 'hidden' },
                pillsList: { maxWidth: '100%', overflow: 'hidden' },
                pill: { maxWidth: '100%' },
              }} />
            {tradeBrickExcl.length > 0 && (
              <Group gap={4} align="center">
                <Text size="xs" c="red" style={{ fontSize: FONT.small }}>
                  NOT: {tradeBrickExcl.length} mod{tradeBrickExcl.length > 1 ? 's' : ''} excluded
                </Text>
                <Button size="xs" variant="subtle" color="gray"
                  onClick={() => addBrickModsToRegex(tradeBrickExcl)}
                  style={{ fontSize: FONT.label, padding: '0 6px', height: 18 }}>
                  Sync to Regex Exclusions
                </Button>
              </Group>
            )}
          </Stack>

          {tradeError && <Text size="xs" c="red">{tradeError}</Text>}

          <Group gap={8}>
            <Button color="orange" loading={tradeLoading}
              leftSection={<IconExternalLink size={13} />} onClick={handleSearch} style={{ flex: 1 }}>
              Search on PoE Trade
            </Button>
            {(() => {
              const modalExclusions = resolveTradeRegexExclusions(
                tradeBrickExcl,
                brickMods,
                exclusions,
              );
              const r = generateTradeRegex(
                modalExclusions,
                tradeMinIIQ,
                tradeMinPack,
                tradeMinCurrency,
                tradeMinIIR,
                tradeMinDelirious,
              );
              if (!r) return null;
              return (
                <CopyButton value={r} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied!' : 'Copy approximate stash regex from these controls'} withArrow>
                      <Button variant={copied ? 'light' : 'default'} color={copied ? 'teal' : undefined} onClick={copy}
                        style={{ minWidth: 110 }}
                        leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}>
                        {copied ? 'Copied' : 'Copy Regex'}
                      </Button>
                    </Tooltip>
                  )}
                </CopyButton>
              );
            })()}
          </Group>
        </Stack>
      </Modal>

      {/* Named structured-exclusion and literal-regex preset editor. */}
      <Modal opened={presetSaveOpen} onClose={closePresetEditor}
        title={presetEditId ? 'Edit Regex Preset' : 'Create Regex Preset'} size="sm">
        <Stack gap="sm">
          <TextInput label="Name" placeholder="e.g. Originator maps" autoFocus
            value={presetSaveName} onChange={(e) => setPresetSaveName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && doPresetSave()} />
          <SegmentedControl fullWidth size="xs" value={presetMode}
            onChange={(value) => setPresetMode(value as 'structured' | 'literal')}
            data={[
              { value: 'structured', label: 'Current exclusions' },
              { value: 'literal', label: 'Complete regex' },
            ]} />
          {presetMode === 'structured' ? (
            <>
              <Text size="xs" c="dimmed">
                Dynamic preset: stores the selected exclusions. Session thresholds are regenerated from the current maps.
              </Text>
              <Code style={{ fontSize: FONT.label, wordBreak: 'break-all', color: COLOR.textFaint }}>
                {exclusions.length > 0 ? `"!${exclusions.join('|')}"` : '(no exclusions selected)'}
              </Code>
            </>
          ) : (
            <>
              <Text size="xs" c="dimmed">
                Literal preset: copies this complete regex exactly. It is never combined with generated thresholds or exclusions.
              </Text>
              <TextInput label="Complete regex" placeholder='"!non-c|te of" "ack.*..."'
                value={presetLiteralRegex}
                onChange={(event) => setPresetLiteralRegex(event.currentTarget.value)}
                styles={{ input: { fontFamily: 'monospace', fontSize: FONT.small } }} />
            </>
          )}
          <Button onClick={doPresetSave}
            disabled={!presetSaveName.trim() || (presetMode === 'literal' && !presetLiteralRegex.trim()) || (presetMode === 'structured' && exclusions.length === 0)}>
            {presetEditId ? 'Save changes' : 'Create preset'}
          </Button>
        </Stack>
      </Modal>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Stack gap="xs">

          {/* ── OUTPUT FIRST (Sad 2026-07-11): the generated/loaded regex +
              copy/save/Open Trade actions are what the tab exists for, so they
              stay pinned at the top; growing Brick Exclusions config can no
              longer push them out of view. ── */}

          {/* ── Generated from session ── */}
          {generatedRegex && (
            <Stack gap="xs" p="xs" style={{ background: COLOR.tintTealBg, borderRadius: 6, border: `1px solid ${COLOR.tintTealBorder}` }}>
              <Group gap="xs">
                <IconWand size={12} color={COLOR.accentStrong} />
                <Text size="xs" fw={700} c="blue">Generated from {generatedRegex.n} maps (trimmed avg)</Text>
              </Group>
              <Text size="xs" c="dimmed">
                {generatedRegex.avg.avgQuant.toFixed(0)}%Q · {generatedRegex.avg.avgRarity.toFixed(0)}%R · {generatedRegex.avg.avgPack.toFixed(0)}%P · {generatedRegex.avg.avgCurr.toFixed(0)}% Curr
              </Text>
              <Stack gap={4}>
                <RegexLine value={generatedRegex.run} badge="Run" badgeColor="green" badgeTooltip={RUN_TOOLTIP} />
                {generatedRegex.slam ? (
                  <RegexLine value={generatedRegex.slam} badge="Slam" badgeColor="orange" badgeTooltip={SLAM_TOOLTIP} />
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">8-mod / Nightmare maps are corrupted — slam not applicable.</Text>
                )}
              </Stack>
              <Group gap={4}>
                <CopyButton value={generatedRegex.run} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="default" onClick={copy}
                      leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}>
                      {copied ? 'Copied' : 'Copy Regex'}
                    </Button>
                  )}
                </CopyButton>
                <Button size="xs" variant="light" color="orange" loading={tradeLoading}
                  leftSection={<IconExternalLink size={12} />} onClick={handleSearch}>
                  Search Trade
                </Button>
                <Button size="xs" variant="default" leftSection={<IconSettings size={12} />}
                  onClick={handleOpenTradeModal}>
                  Trade settings
                </Button>
              </Group>
            </Stack>
          )}

          {/* ── Loaded from strategy ── */}
          {!generatedRegex && loadedStrategyInfo && (() => {
            const run  = applyUserExclusionsToRegex(loadedStrategyInfo.runRegex, exclusions);
            const slam = loadedStrategyInfo.slamRegex ? applyUserExclusionsToRegex(loadedStrategyInfo.slamRegex, exclusions) : null;
            return (
              <Stack gap="xs" p="xs" style={{ background: COLOR.tintTealBg, borderRadius: 6, border: `1px solid ${COLOR.tintTealBorder}` }}>
                <Group gap="xs">
                  <IconWand size={12} color={COLOR.accentStrong} />
                  <Text size="xs" fw={700} c="blue">From {loadedStrategyInfo.authorName} · {loadedStrategyInfo.mapCount} maps</Text>
                  {loadedStrategyInfo.mapType && (
                    <Badge size="xs" color="gray" variant="outline">{loadedStrategyInfo.mapType}</Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {loadedStrategyInfo.avgQuant.toFixed(0)}%Q · {loadedStrategyInfo.avgRarity.toFixed(0)}%R · {loadedStrategyInfo.avgPack.toFixed(0)}%P · {loadedStrategyInfo.avgCurr.toFixed(0)}% Curr
                </Text>
                <Stack gap={4}>
                  <RegexLine value={run} badge="Run" badgeColor="green" badgeTooltip={RUN_TOOLTIP} />
                  {slam && <RegexLine value={slam} badge="Slam" badgeColor="orange" badgeTooltip={SLAM_TOOLTIP} />}
                </Stack>
                {exclusions.length > 0
                  ? <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>Your exclusions applied. Click Set Default to make these permanent.</Text>
                  : <Text size="xs" c="orange" style={{ fontSize: FONT.label }}>No exclusions set — set a default preset or pick mods below.</Text>
                }
                <Group gap={4}>
                  <CopyButton value={run} timeout={2000}>
                    {({ copied, copy }) => (
                      <Button size="xs" variant="default" onClick={copy}
                        leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}>
                        {copied ? 'Copied' : 'Copy Regex'}
                      </Button>
                    )}
                  </CopyButton>
                  <Button size="xs" variant="light" color="orange" loading={tradeLoading}
                    leftSection={<IconExternalLink size={12} />} onClick={handleSearch}>
                    Search Trade
                  </Button>
                  <Button size="xs" variant="default" leftSection={<IconSettings size={12} />}
                    onClick={handleOpenTradeModal}>
                    Trade settings
                  </Button>
                </Group>
              </Stack>
            );
          })()}

          {/* session-16: Open Trade lives with the regex boxes above when one is
              showing; this standalone fallback only renders when neither is. */}
          {!generatedRegex && !loadedStrategyInfo && (
            <Group gap={4} justify="flex-end">
              <Button size="xs" variant="light" color="orange" loading={tradeLoading}
                leftSection={<IconExternalLink size={12} />} onClick={handleSearch}>
                Search Trade
              </Button>
              <Button size="xs" variant="default" leftSection={<IconSettings size={12} />}
                onClick={handleOpenTradeModal}>
                Trade settings
              </Button>
            </Group>
          )}

          {/* ── Brick Exclusions ── */}
          <Stack gap={4} p="xs" style={{ background: COLOR.tintOliveBg, borderRadius: 6, border: `1px solid ${COLOR.tintOliveBorder}` }}>
            <Group justify="space-between">
              <Group gap={4}>
                <Text size="xs" fw={700} c="yellow">Your Regex</Text>
                <Tooltip multiline w={280}
                  label={
                    <Stack gap={3} p={2}>
                      <Text size="xs" fw={700}>Mods you refuse to run.</Text>
                      <Text size="xs">These terms are prepended to every generated regex as &quot;!a|b&quot;, so maps with a matching mod never highlight in your stash.</Text>
                      <Text size="xs">Choose exclusions below. They are prepended to the thresholds generated from the current session.</Text>
                      <Text size="xs">Presets can store either dynamic exclusions or a complete literal regex. Literal presets are copied exactly and never mixed with generated output.</Text>
                    </Stack>
                  } withArrow>
                  <Badge size="xs" color="gray" variant="outline" style={{ cursor: 'help' }}>?</Badge>
                </Tooltip>
              </Group>
              <Group gap={4}>
                <CopyButton value={exclusions.length > 0 ? `"!${exclusions.join('|')}"` : ''} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="default" disabled={exclusions.length === 0} onClick={copy}
                      leftSection={copied ? <IconCheck size={12} /> : <IconCopy size={12} />}>
                      {copied ? 'Copied' : 'Copy exclusions'}
                    </Button>
                  )}
                </CopyButton>
                <Menu shadow="md" width={300} position="bottom-end">
                <Menu.Target>
                  <Button size="xs" variant="default" rightSection={<IconChevronDown size={10} />}>Presets</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconDeviceFloppy size={13} />}
                    onClick={() => openPresetEditor()}>
                    Create preset…
                  </Menu.Item>
                  <Menu.Item leftSection={<IconStar size={13} />} disabled={exclusions.length === 0}
                    onClick={setDefaultPreset}>
                    <Tooltip label="Auto-applied whenever you load a strategy" withArrow position="left">
                      <Text size="xs">Set current as default</Text>
                    </Tooltip>
                  </Menu.Item>
                  {exclusionPresets.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Label>Load preset</Menu.Label>
                      {exclusionPresets.map((p) => (
                        <Menu.Item key={p.id}
                          rightSection={
                            <Group gap={2} wrap="nowrap">
                              {p.kind !== 'literal' && (
                                <ActionIcon size="sm" variant="subtle" aria-label={`Set ${p.name} as default`}
                                  onClick={(e) => { e.stopPropagation(); setExclusionPresetDefault(p.id); }}>
                                  <IconStar size={13} />
                                </ActionIcon>
                              )}
                              <ActionIcon size="sm" variant="subtle" aria-label={`Edit preset ${p.name}`}
                                onClick={(e) => { e.stopPropagation(); openPresetEditor(p); }}>
                                <IconPencil size={13} />
                              </ActionIcon>
                              <ActionIcon size="sm" variant="subtle" aria-label={`Delete preset ${p.name}`}
                                onMouseEnter={() => setHoveredExclTrashId(p.id)}
                                onMouseLeave={() => setHoveredExclTrashId(null)}
                                style={{ color: hoveredExclTrashId === p.id ? 'var(--mantine-color-red-4)' : 'var(--mantine-color-dimmed)' }}
                                onClick={(e) => { e.stopPropagation(); setHoveredExclTrashId(null); deleteExclusionPreset(p.id); }}>
                                <IconTrash size={13} />
                              </ActionIcon>
                            </Group>
                          }
                          onClick={() => {
                            if (p.kind === 'literal' && p.literalRegex) navigator.clipboard.writeText(p.literalRegex);
                            else loadExclusionPreset(p.id);
                          }}>
                          <Tooltip label={p.kind === 'literal' ? p.literalRegex : p.terms.map((t) => `!${t}`).join(' ')} withArrow position="left">
                            <Text size="xs" lineClamp={1}>
                              {p.name} · {p.kind === 'literal' ? 'copy complete regex' : `${p.terms.length} exclusions`}
                            </Text>
                          </Tooltip>
                        </Menu.Item>
                      ))}
                    </>
                  )}
                </Menu.Dropdown>
                </Menu>
              </Group>
            </Group>

            {exclusions.length > 0 && (
              <Group gap={4} wrap="wrap">
                {exclusions.map((term) => (
                  <Badge key={term} size="sm" color="yellow" variant="light"
                    rightSection={
                      <ActionIcon size={12} variant="transparent" color="yellow"
                        onClick={() => removeExclusion(term)} style={{ marginLeft: 2 }}>
                        <IconX size={10} />
                      </ActionIcon>
                    }
                    style={{ paddingRight: 2 }}>
                    !{term}
                  </Badge>
                ))}
              </Group>
            )}

            {brickMods.length > 0 && (
              /* Side-by-side category pickers — no scroll-past-Regular to reach
                 Nightmare, and the headers make the old purple note redundant. */
              <SimpleGrid cols={2} spacing={6}>
                <MultiSelect size="xs" label="Regular / shared mods" placeholder="Search…" searchable clearable
                  data={brickModData.find((group) => group.group === 'Regular / shared')?.items ?? []}
                  filter={brickModFilter}
                  value={selectedIdsOf('regular')}
                  onChange={(selected) => applySelectedModsChange(selected, handleCategoryChange('regular'))}
                  onKeyDownCapture={(event) => protectSelectedModsOnBackspace(event, selectedIdsOf('regular').length > 0)}
                  renderOption={renderBrickOption}
                  maxDropdownHeight={220}
                  styles={{
                    label: { fontSize: FONT.label, color: 'var(--mantine-color-dimmed)' },
                    // Pin clear ×/chevron to the TOP right — the section is
                    // absolutely positioned full-height and centers its content,
                    // so it drifted as picked mods grew the field (Sad 2026-07-10).
                    section: { alignItems: 'flex-start', paddingTop: 5 },
                  }} />
                <MultiSelect size="xs" label="Nightmare mods" placeholder="Search…" searchable clearable
                  data={brickModData.find((group) => group.group === 'Nightmare')?.items ?? []}
                  filter={brickModFilter}
                  value={selectedIdsOf('nightmare')}
                  onChange={(selected) => applySelectedModsChange(selected, handleCategoryChange('nightmare'))}
                  onKeyDownCapture={(event) => protectSelectedModsOnBackspace(event, selectedIdsOf('nightmare').length > 0)}
                  renderOption={renderBrickOption}
                  maxDropdownHeight={220}
                  styles={{
                    label: { fontSize: FONT.label, color: COLOR.nightmare },
                    section: { alignItems: 'flex-start', paddingTop: 5 }, // see Regular picker note
                  }} />
              </SimpleGrid>
            )}

            <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
              Preview: <Code style={{ fontSize: FONT.small }}>
                {exclusions.length > 0 ? `"!${exclusions.join('|')}"` : '(no exclusions)'}
              </Code>
            </Text>
          </Stack>

        </Stack>
      </ScrollArea>
    </div>
  );
};

export function applyUserExclusionsToRegex(regex: string, exclusions: string[]): string {
  if (!regex) return regex;
  const cleanExcl = sanitizeExclusionTerms(exclusions);
  // Strip ALL leading exclusion blocks (handles malformed double-quoted cases like "!"!nsta|eche"")
  const stripped = regex.replace(/^("![^"]*"|"!"[^"]*""?)\s*/g, '').trim();
  if (cleanExcl.length === 0) return stripped;
  return `"!${cleanExcl.join('|')}" ${stripped}`;
}
