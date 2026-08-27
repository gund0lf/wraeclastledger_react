import {
  Text, Button, Group, Stack, Badge, ActionIcon,
  TextInput, Select, MultiSelect, Modal, CopyButton, Code, Divider, ScrollArea, Tooltip,
  NumberInput, Switch, Alert, Menu, SimpleGrid, UnstyledButton, SegmentedControl, Checkbox,
  Popover,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useEffect } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import { IconTrash, IconCopy, IconCheck, IconWand, IconX, IconExternalLink, IconStar, IconDeviceFloppy, IconChevronDown, IconPencil, IconSettings, IconSearch, IconInfoCircle } from '@tabler/icons-react';
import {
  generateRunRegex,
  generateSlamRegex,
  generateTradeRegex,
  resolveTradeRegexExclusions,
  trimmedMean,
  sanitizeExclusionTerms,
  buildExclusionRegexBlock,
  buildExclusionRegexPattern,
} from '../utils/priceUtils';
import { CURRENT_LEAGUE, KNOWN_LEAGUES } from '../utils/league';
import { COLOR, FONT } from '../utils/uiTokens'
import { RegexLine } from '../components/ui/RegexLine'
import {
  buildBrickModCatalogues,
  filterBrickModSelectOptions,
  prioritizeActiveFamilyOptions,
  selectedBrickIds,
  selectedBrickIdsForContext,
  toggleBrickExclusion,
  type BrickModCatalogueContext,
  type BrickModSelectOption,
  type BrickModSelectSource,
} from '../utils/brickModSelect';
import {
  formatRegexAverageSummary,
  isSlamUnavailableForSession,
} from '../utils/regexSessionPresentation';
import { normalizeBrickExclusionEntries } from '../../../shared/brickMods';

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
  { value: 'deli_currency',   label: 'Currency',         stashTerm: 'curr' },
  { value: 'deli_scarabs',    label: 'Scarabs',          stashTerm: 'scar' },
  { value: 'deli_fragments',  label: 'Fragments',        stashTerm: 'frag' },
  { value: 'deli_divcards',   label: 'Divination Cards', stashTerm: 'div' },
  { value: 'deli_maps',       label: 'Map Items',        stashTerm: 'map' },
  { value: 'deli_essences',   label: 'Essences',         stashTerm: 'ess' },
  { value: 'deli_unique',     label: 'Unique Items',     stashTerm: 'uniq' },
  { value: 'deli_expedition', label: 'Expedition Items', stashTerm: 'exp' },
  { value: 'deli_breach',     label: 'Breach Items',     stashTerm: 'brea' },
  { value: 'deli_delirium',   label: 'Delirium',         stashTerm: 'deli' },
  { value: 'deli_blight',     label: 'Blight Items',     stashTerm: 'blig' },
  { value: 'deli_abyss',      label: 'Abyss Items',      stashTerm: 'aby' },
  { value: 'deli_gems',       label: 'Gems',             stashTerm: 'gems' },
  { value: 'deli_fossils',    label: 'Fossils',          stashTerm: 'foss' },
  { value: 'deli_armour',     label: 'Armour',           stashTerm: 'armo' },
  { value: 'deli_weapons',    label: 'Weapons',          stashTerm: 'weap' },
  { value: 'deli_jewellery',  label: 'Jewellery',        stashTerm: 'jew' },
  { value: 'deli_incubators', label: 'Incubators',       stashTerm: 'incu' },
  { value: 'deli_labyrinth',  label: 'Labyrinth Items',  stashTerm: 'laby' },
  { value: 'deli_catalysts',  label: 'Catalysts',        stashTerm: 'cata' },
  { value: 'deli_talismans',  label: 'Talismans',        stashTerm: 'tali' },
] as const;

const DELI_REWARD_STASH_TERMS: ReadonlyMap<string, string> = new Map(
  DELI_REWARD_OPTIONS.map((option) => [option.value, option.stashTerm]),
);

const TAG_TO_MAP_TYPE: Record<string, MapType> = {
  regular: 'regular', originator: 'originator', nightmare: 'nightmare',
  '8mod': '8mod', 'empowered': 'any', 'empowered-originator': 'originator',
};

// Word-based fuzzy filter over the exact PoE Trade wording shown to the user.
const structuredExclusionCount = (entries: readonly string[]): number => {
  const normalized = normalizeBrickExclusionEntries(sanitizeExclusionTerms([...entries]));
  return normalized.selectedIds.length + normalized.customTerms.length;
};

const FullscreenBrickModList = ({
  label,
  options,
  selected,
  allSelected,
  allMods,
  search,
  nightmare = false,
  onToggle,
}: {
  label: string;
  options: BrickModSelectOption[];
  selected: string[];
  allSelected: string[];
  allMods: BrickModSelectSource[];
  search: string;
  nightmare?: boolean;
  onToggle: (id: string) => void;
}) => {
  const selectedSet = new Set(selected);
  const activeFamilies = new Set(allMods
    .filter((mod) => mod.familyId && allSelected.includes(mod.id))
    .map((mod) => mod.familyId));
  const visibleOptions = prioritizeActiveFamilyOptions(
    filterBrickModSelectOptions(options, search),
    allMods,
    allSelected,
  );

  return (
    <Stack gap={5}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text size="sm" fw={600} style={{ color: nightmare ? COLOR.nightmare : COLOR.textDim }}>
          {label}
        </Text>
        <Text size="xs" c="dimmed">{selected.length} selected</Text>
      </Group>
      <Stack gap={3}>
        {visibleOptions.map((option) => {
          const checked = selectedSet.has(option.value);
          const related = !checked && !!option.familyId && activeFamilies.has(option.familyId);
          const outlineColor = nightmare ? COLOR.nightmare : COLOR.info;
          return (
            <UnstyledButton
              key={option.value}
              aria-pressed={checked}
              aria-label={`${checked ? 'Remove' : 'Add'} ${option.label}`}
              onClick={() => onToggle(option.value)}
              style={{
                width: '100%',
                padding: '7px 9px',
                borderRadius: 5,
                border: `1px solid ${checked ? outlineColor : COLOR.border}`,
                borderLeft: related && nightmare ? `2px solid ${outlineColor}` : undefined,
                borderRight: related && !nightmare ? `2px solid ${outlineColor}` : undefined,
                background: checked ? COLOR.bgHover : COLOR.bgSunken,
                textAlign: 'left',
              }}
            >
              <Group gap={8} wrap="nowrap" align="flex-start">
                <Checkbox
                  checked={checked}
                  readOnly
                  tabIndex={-1}
                  size="sm"
                  color={nightmare ? 'grape' : 'blue'}
                  style={{ pointerEvents: 'none', marginTop: 2, flexShrink: 0 }}
                />
                <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                  <Text size="sm" style={{ color: nightmare ? COLOR.nightmare : COLOR.text }}>
                    {option.tradeLabel}
                  </Text>
                  {(option.label !== option.tradeLabel || option.shared) && (
                    <Group gap={5} wrap="nowrap" justify="space-between">
                      <Group gap={5} wrap="nowrap" style={{ minWidth: 0 }}>
                        {option.shared && (
                          <Badge size="xs" color="gray" variant="outline">Shared</Badge>
                        )}
                        {option.label !== option.tradeLabel && (
                          <Text size="xs" c="dimmed">{option.label}</Text>
                        )}
                      </Group>
                      {related && (
                        <Badge size="xs" color={nightmare ? 'grape' : 'blue'} variant="light"
                          style={{ flexShrink: 0 }}
                          title="Related variant — select separately if you also want to exclude it">
                          Related
                        </Badge>
                      )}
                    </Group>
                  )}
                </Stack>
              </Group>
            </UnstyledButton>
          );
        })}
        {visibleOptions.length === 0 && (
          <Text size="sm" c="dimmed" py={8} ta="center">No matching mods</Text>
        )}
      </Stack>
    </Stack>
  );
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
  const [brickMods,         setBrickMods]         = useState<BrickModSelectSource[]>([]);
  const [brickModsError,    setBrickModsError]    = useState<string | null>(null);
  const [unavailableBricks, setUnavailableBricks] = useState<{ label: string; expectedCount: number; actualCount: number }[]>([]);
  const [brickSearch,       setBrickSearch]       = useState('');

  const exclusions = useMemo(
    () => settings.regexExclusions ?? [],
    [settings.regexExclusions],
  );
  const selectedCatalogueIds = useMemo(() => selectedBrickIds(exclusions), [exclusions]);
  const tradeBrickExcl = useMemo(
    () => selectedCatalogueIds.filter((id) => brickMods.some((mod) => mod.id === id)),
    [selectedCatalogueIds, brickMods],
  );
  const exclusionPattern = useMemo(() => buildExclusionRegexPattern(exclusions), [exclusions]);
  const exclusionBlock = exclusionPattern ? `"!${exclusionPattern}"` : '';
  const customExclusions = useMemo(() => normalizeBrickExclusionEntries(
    sanitizeExclusionTerms([...exclusions]),
  ).customTerms, [exclusions]);

  const removeExclusion = (term: string) =>
    updateSetting('regexExclusions', exclusions.filter((e) => e !== term));

  const slamUnavailable = isSlamUnavailableForSession(maps);

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
      slam: slamUnavailable ? null : generateSlamRegex(avg, exclusions),
      avg, n: maps.length,
    };
  }, [maps, exclusions, slamUnavailable]);

  const brickModCatalogues = useMemo(() => buildBrickModCatalogues(brickMods), [brickMods]);
  const tradeLeagueOptions = useMemo(
    () => Array.from(new Set(
      [settings.leagueName?.trim(), ...KNOWN_LEAGUES].filter((name): name is string => !!name)
    )),
    [settings.leagueName]
  );

  const selectedIdsOf = (context: BrickModCatalogueContext) =>
    selectedBrickIdsForContext(brickMods, exclusions, context);
  const toggleSelectedMod = (id: string) =>
    updateSetting('regexExclusions', toggleBrickExclusion(brickMods, exclusions, id));
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
    } else {
      setTradeMinIIQ(0);
      setTradeMinIIR(0);
      setTradeMinPack(0);
      setTradeMinCurrency(0);
      setTradeMinScarabs(0);
      setTradeMinMaps(0);
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
  }, [settings.leagueName, generatedRegex, loadedStrategyInfo, maps]);

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
  const tradeRegex = generateTradeRegex(
    resolveTradeRegexExclusions(tradeBrickExcl, brickMods, exclusions),
    tradeMinIIQ,
    tradeMinPack,
    tradeMinCurrency,
    tradeMinIIR,
    tradeMinDelirious,
    tradeDeliRewards.flatMap((key) => {
      const term = DELI_REWARD_STASH_TERMS.get(key);
      return term ? [term] : [];
    }),
  );

  return (
    <div className="regex-tab-workspace regex-from-session">
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
              <MultiSelect size="xs" label="Reward types (match any)" placeholder="Any reward"
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
            <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
              {tradeBrickExcl.length > 0 ? (
                <Group gap={5} wrap="wrap" style={{ minWidth: 0 }}>
                  {tradeBrickExcl.map((id) => {
                    const mod = brickMods.find((candidate) => candidate.id === id);
                    if (!mod) return null;
                    return (
                      <Tooltip key={id} label={mod.displayText ?? mod.tradeTexts.join(' / ')} withArrow>
                        <Badge size="sm" variant="light"
                          color={mod.category === 'nightmare' ? 'grape' : 'gray'}>
                          {mod.label}
                        </Badge>
                      </Tooltip>
                    );
                  })}
                </Group>
              ) : (
                <Text size="xs" c="dimmed" fs="italic">
                  No modifier exclusions selected.
                </Text>
              )}
              <Badge size="xs" variant="light" style={{ flexShrink: 0 }}
                color={tradeRegex.length > 250 ? 'red' : tradeRegex.length > 220 ? 'yellow' : 'green'}>
                {tradeRegex.length} / 250
              </Badge>
            </Group>
          </Stack>

          {tradeError && <Text size="xs" c="red">{tradeError}</Text>}

          <Group gap={8}>
            <Button color="orange" loading={tradeLoading}
              leftSection={<IconExternalLink size={13} />} onClick={handleSearch} style={{ flex: 1 }}>
              Search on PoE Trade
            </Button>
            {tradeRegex && (
              <CopyButton value={tradeRegex} timeout={2000}>
                {({ copied, copy }) => (
                  <Tooltip label={tradeRegex.length > 250 ? 'Regex exceeds the 250-character stash limit' : copied ? 'Copied!' : 'Copy approximate stash regex from these controls'} withArrow>
                    <Button variant={copied ? 'light' : 'default'} color={copied ? 'teal' : undefined}
                      disabled={tradeRegex.length > 250} onClick={copy}
                      style={{ minWidth: 110 }}
                      leftSection={copied ? <IconCheck size={13} /> : <IconCopy size={13} />}>
                      {copied ? 'Copied' : 'Copy Regex'}
                    </Button>
                  </Tooltip>
                )}
              </CopyButton>
            )}
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
                {exclusionBlock || '(no exclusions selected)'}
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

      <ScrollArea className="regex-tab-scroll">
        <Stack className="regex-tab-content" gap="xs">

          {/* ── OUTPUT FIRST (Sad 2026-07-11): the generated/loaded regex +
              copy/save/Open Trade actions are what the tab exists for, so they
              stay pinned at the top; growing Brick Exclusions config can no
              longer push them out of view. ── */}

          {/* ── Generated from session ── */}
          {generatedRegex && (
            <Stack className="regex-session-output" gap="xs" p="xs">
              <Group gap="xs">
                <IconWand size={12} color={COLOR.accentStrong} />
                <Text className="regex-output-source" size="xs" fw={700}>Generated from {generatedRegex.n} maps (trimmed avg)</Text>
              </Group>
              <Text size="xs" c="dimmed">
                {formatRegexAverageSummary(generatedRegex.avg)}
              </Text>
              <Stack gap={4}>
                <RegexLine value={generatedRegex.run} badge="Run" badgeColor="green" badgeTooltip={RUN_TOOLTIP} charLimit={250} />
                {generatedRegex.slam ? (
                  <RegexLine value={generatedRegex.slam} badge="Slam" badgeColor="orange" badgeTooltip={SLAM_TOOLTIP} charLimit={250} />
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">
                    No Slam regex generated — all captured maps are corrupted or Nightmare maps, so an Exalted Orb cannot add a modifier.
                  </Text>
                )}
              </Stack>
              <Group className="regex-output-actions" gap={4}>
                <CopyButton value={generatedRegex.run} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="default" onClick={copy} disabled={generatedRegex.run.length > 250}
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
            const neutralSlam = loadedStrategyInfo.slamRegex
              || (loadedStrategyInfo.mapType === '8mod'
                ? null
                : generateSlamRegex({
                  avgQuant: loadedStrategyInfo.avgQuant,
                  avgRarity: loadedStrategyInfo.avgRarity,
                  avgPack: loadedStrategyInfo.avgPack,
                  avgCurr: loadedStrategyInfo.avgCurr,
                  avgScarabs: 0,
                }, []));
            const slam = neutralSlam ? applyUserExclusionsToRegex(neutralSlam, exclusions) : null;
            return (
              <Stack className="regex-session-output" gap="xs" p="xs">
                <Group gap="xs">
                  <IconWand size={12} color={COLOR.accentStrong} />
                  <Text className="regex-output-source" size="xs" fw={700}>From {loadedStrategyInfo.authorName} · {loadedStrategyInfo.mapCount} maps</Text>
                  {loadedStrategyInfo.mapType && (
                    <Badge size="xs" color="gray" variant="outline">{loadedStrategyInfo.mapType}</Badge>
                  )}
                </Group>
                <Text size="xs" c="dimmed">
                  {formatRegexAverageSummary(loadedStrategyInfo)}
                </Text>
                <Stack gap={4}>
                  <RegexLine value={run} badge="Run" badgeColor="green" badgeTooltip={RUN_TOOLTIP} charLimit={250} />
                  {slam && <RegexLine value={slam} badge="Slam" badgeColor="orange" badgeTooltip={SLAM_TOOLTIP} charLimit={250} />}
                </Stack>
                {exclusionBlock
                  ? <Text size="xs" c="dimmed" style={{ fontSize: FONT.label }}>Your exclusions applied. Click Set Default to make these permanent.</Text>
                  : <Text size="xs" c="orange" style={{ fontSize: FONT.label }}>No exclusions set — set a default preset or pick mods below.</Text>
                }
                <Group className="regex-output-actions" gap={4}>
                  <CopyButton value={run} timeout={2000}>
                    {({ copied, copy }) => (
                      <Button size="xs" variant="default" onClick={copy} disabled={run.length > 250}
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
            <Stack className="regex-empty-output" gap="xs" align="center">
              <IconWand size={20} />
              <div>
                <Text size="sm" fw={700} ta="center">No session regex yet</Text>
                <Text size="xs" c="dimmed" ta="center">
                  Capture maps or load a strategy to generate Run and Slam thresholds.
                </Text>
              </div>
              <Group className="regex-output-actions" gap={4} justify="center">
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

          {/* ── Brick Exclusions ── */}
          <Stack className="regex-exclusions-panel" gap="xs" p="xs">
            <Group justify="space-between">
              <Stack gap={2} align="flex-start">
                <Popover width={410} position="bottom-start" shadow="md" withArrow>
                  <Popover.Target>
                    <UnstyledButton className="regex-catalogue-help">
                      <IconInfoCircle size={14} />
                      <span>How this works</span>
                    </UnstyledButton>
                  </Popover.Target>
                  <Popover.Dropdown>
                    <Stack gap="xs">
                      <div>
                        <Text size="sm" fw={700}>Exclude modifiers you refuse to run</Text>
                        <Text size="xs" c="dimmed">
                          Checked modifiers are prepended to every generated stash regex as a negative match, so maps carrying them do not highlight.
                        </Text>
                      </div>
                      <Divider />
                      <div>
                        <Text size="sm" fw={700}>Shared means related, not automatically selected</Text>
                        <Text size="xs" c="dimmed">
                          Every checkbox excludes only that exact modifier and numeric range. Selecting one Shared row pins its family to the top and marks unchecked counterparts Related.
                        </Text>
                      </div>
                      <Text size="xs">
                        Regular modifiers can still roll on Nightmare and Originator maps. Nightmare Thorns combines the separate Regular Physical and Elemental rows; Protected similarly combines Regular Armoured and Resistant.
                      </Text>
                      <Text size="xs" c="dimmed">
                        PoE Trade receives exact stat IDs and numeric bounds. Copy Regex uses the reviewed stash expression shown above and enforces the 250-character limit.
                      </Text>
                      <Text size="xs" c="dimmed">
                        Presets can store these dynamic exclusions or a complete literal regex. Literal presets are copied exactly and never mixed with generated output.
                      </Text>
                    </Stack>
                  </Popover.Dropdown>
                </Popover>
                <Text size="xs" fw={700}>Exclusions &amp; presets</Text>
              </Stack>
              <Group gap={4}>
                <CopyButton value={exclusionBlock} timeout={2000}>
                  {({ copied, copy }) => (
                    <Button size="xs" variant="default" disabled={!exclusionBlock || exclusionBlock.length > 250} onClick={copy}
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
                  <Menu.Item leftSection={<IconStar size={13} />} disabled={!exclusionBlock}
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
                          <Tooltip label={p.kind === 'literal' ? p.literalRegex : buildExclusionRegexBlock(p.terms)} withArrow position="left">
                            <Text size="xs" lineClamp={1}>
                              {p.name} · {p.kind === 'literal' ? 'copy complete regex' : `${structuredExclusionCount(p.terms)} exclusions`}
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

            <div className="regex-exclusions-summary"
              data-empty={!exclusionBlock ? 'true' : undefined}>
              {customExclusions.length > 0 && (
                <Group className="regex-exclusion-chips" gap={4} wrap="wrap">
                  {customExclusions.map((term) => (
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
              <Text component="div" className="regex-exclusions-exact" size="xs" c="dimmed"
                style={{ fontSize: FONT.small }}>
                Exclusion regex: <Code style={{ fontSize: FONT.small }}>
                  {exclusionBlock || '(no exclusions)'}
                </Code>
                {exclusionBlock && (
                  <Badge size="xs" ml={5}
                    color={exclusionBlock.length > 250 ? 'red' : exclusionBlock.length > 220 ? 'yellow' : 'green'}
                    variant="light">
                    {exclusionBlock.length} / 250
                  </Badge>
                )}
              </Text>
            </div>

            {brickMods.length > 0 && (
              /* Persistent catalogues keep the complete mod pools visible and
                 searchable without opening a separate scrolling menu. */
              <Stack gap="xs">
                <Stack gap={3}>
                  <TextInput
                    className="regex-catalogue-search"
                    size="sm"
                    aria-label="Search regular and Nightmare modifier catalogues"
                    placeholder="Search regular and Nightmare mods…"
                    leftSection={<IconSearch size={14} />}
                    value={brickSearch}
                    onChange={(event) => setBrickSearch(event.currentTarget.value)}
                    rightSection={brickSearch ? (
                      <ActionIcon size="sm" variant="subtle" color="gray"
                        aria-label="Clear modifier search" onClick={() => setBrickSearch('')}>
                        <IconX size={13} />
                      </ActionIcon>
                    ) : undefined}
                  />
                  <Text size="xs" c="dimmed">
                    Each checkbox is independent. Selecting a Shared row pins and marks its related variants for easy comparison.
                  </Text>
                </Stack>
                <SimpleGrid className="regex-exclusion-catalogues" cols={2} spacing="md">
                  <FullscreenBrickModList
                    label="Regular / shared mods"
                    options={brickModCatalogues.regular}
                    selected={selectedIdsOf('regular')}
                    allSelected={selectedCatalogueIds}
                    allMods={brickMods}
                    search={brickSearch}
                    onToggle={toggleSelectedMod}
                  />
                  <FullscreenBrickModList
                    label="Nightmare mods"
                    options={brickModCatalogues.nightmare}
                    selected={selectedIdsOf('nightmare')}
                    allSelected={selectedCatalogueIds}
                    allMods={brickMods}
                    search={brickSearch}
                    nightmare
                    onToggle={toggleSelectedMod}
                  />
                </SimpleGrid>
              </Stack>
            )}

          </Stack>

        </Stack>
      </ScrollArea>
    </div>
  );
};

export function applyUserExclusionsToRegex(regex: string, exclusions: string[]): string {
  if (!regex) return regex;
  const exclusionBlock = buildExclusionRegexBlock(exclusions);
  // Strip ALL leading exclusion blocks (handles malformed double-quoted cases like "!"!nsta|eche"")
  const stripped = regex.replace(/^("![^"]*"|"!"[^"]*""?)\s*/g, '').trim();
  if (!exclusionBlock) return stripped;
  return `${exclusionBlock} ${stripped}`;
}
