import {
  Text, Button, Group, Stack, Badge, ActionIcon,
  TextInput, Select, MultiSelect, Modal, CopyButton, Code, Divider, ScrollArea, Tooltip,
  NumberInput, Switch, Alert, Menu, SimpleGrid,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useEffect } from 'react';
import { useSessionStore, useSessionKeys } from '../store/useSessionStore';
import { IconTrash, IconCopy, IconCheck, IconWand, IconX, IconExternalLink, IconStar, IconDeviceFloppy, IconChevronDown } from '@tabler/icons-react';
import { generateRunRegex, generateSlamRegex, trimmedMean, sanitizeExclusionTerms } from '../utils/priceUtils';
import { CURRENT_LEAGUE } from '../utils/league';
import { COLOR, FONT } from '../utils/uiTokens'
import { RegexLine } from '../components/ui/RegexLine'

// Generate an approximate stash regex from the trade search parameters
function generateTradeRegex(exclusions: string[], minIIQ: number, minPack: number, minCurr: number, minIIR: number): string {
  const avg = { avgQuant: minIIQ || 0, avgPack: minPack || 0, avgCurr: minCurr || 0, avgRarity: minIIR || 0, avgScarabs: 0 };
  if (avg.avgQuant === 0 && avg.avgPack === 0 && avg.avgCurr === 0) return '';
  return generateRunRegex(avg, exclusions);
}

const TYPE_COLORS: Record<string, string> = { run: 'green', slam: 'orange', other: 'gray' };
const TYPE_LABELS: Record<string, string> = { run: 'Run', slam: 'Slam', other: 'Other' };

// Badge tooltips explaining how each generated regex is derived (Sad 2026-07-09).
const RUN_TOOLTIP = 'Run = maps ready to run: floors derived from your session averages — currency and pack (both required on high-currency sessions), plus quantity/rarity riders at 60% of your averages.';
const SLAM_TOOLTIP = 'Slam = near-miss maps worth upgrading: 75% of your session\u2019s currency/pack averages, either one is enough. Quantity and rarity are ignored because a slam can still add them.';

type MapType = 'any' | 'regular' | '8mod' | 'nightmare' | 'originator';
type CorruptedFilter = 'any' | 'yes' | 'no';

const MAP_TYPE_OPTIONS: { value: MapType; label: string; description: string }[] = [
  { value: 'any',        label: 'Any',         description: 'No map type filter applied' },
  { value: 'regular',    label: 'Regular',      description: 'Non-corrupted maps, standard mod pool. Pseudo stats left at 0.' },
  { value: '8mod',       label: '8-mod',        description: 'Corrupted maps only, NOT Originator. High IIQ/pack narrows to quality 8-mod maps.' },
  { value: 'nightmare',  label: 'Nightmare',    description: 'Has uber pseudo stats (currency/scarabs/maps > 0) and is NOT Originator. Set at least one pseudo min.' },
  { value: 'originator', label: 'Originator',   description: 'Has Originator\'s Memories implicit. Includes all variants.' },
];

const TAG_TO_MAP_TYPE: Record<string, MapType> = {
  regular: 'regular', originator: 'originator', nightmare: 'nightmare',
  '8mod': '8mod', 'empowered': 'any', 'empowered-originator': 'originator',
};

function parseExclusionsFromRegex(text: string): string[] {
  const m = text.match(/"!([^"]+)"/);
  if (!m) return [];
  return m[1].split('|').map((t) => t.trim()).filter(Boolean);
}

// Word-based fuzzy filter — "boss life" finds "Boss More Life + AoE"
const brickModFilter = ({ options, search }: { options: any[]; search: string }) => {
  const words = (search ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  const matchItem = (item: { value: string; label: string }) =>
    words.every((word) => item.label.toLowerCase().includes(word.toLowerCase()));
  return options
    .map((opt) => {
      if (opt.items) {
        const filtered = opt.items.filter(matchItem);
        return filtered.length > 0 ? { ...opt, items: filtered } : null;
      }
      return matchItem(opt) ? opt : null;
    })
    .filter(Boolean);
};

// ─── From Session tab ─────────────────────────────────────────────────────────
// WP8: the generate/exclusions/trade content of the merged Regex panel. The
// saved-sets list now lives in SavedSetsTab; the internal RegexLine/CopyLine
// were replaced by the shared components/ui/RegexLine.

export const FromSessionTab = () => {
  const { settings, updateSetting, saveRegexSet,
    setDefaultPreset,
    exclusionPresets, saveExclusionPreset, loadExclusionPreset, deleteExclusionPreset,
    maps, initDivinePrice, loadedStrategyInfo, activeSessionId,
  } = useSessionKeys(
    'settings', 'updateSetting', 'saveRegexSet',
    'setDefaultPreset',
    'exclusionPresets', 'saveExclusionPreset', 'loadExclusionPreset', 'deleteExclusionPreset',
    'maps', 'initDivinePrice', 'loadedStrategyInfo', 'activeSessionId',
  );

  const [saveAsOpen, { open: openSaveAs, close: closeSaveAs }] = useDisclosure(false);
  const [tradeOpen,  { open: openTrade,  close: closeTrade  }] = useDisclosure(false);

  const [saveAsLabel,  setSaveAsLabel]  = useState('');
  const [saveAsRegex,  setSaveAsRegex]  = useState(''); // the regex being saved, not editable
  const [saveAsType,   setSaveAsType]   = useState<'run' | 'slam' | 'other'>('run');
  const [presetSaveOpen, setPresetSaveOpen] = useState(false); // "Save current as…" name dialog
  const [presetSaveName, setPresetSaveName] = useState('');
  const [hoveredExclTrashId, setHoveredExclTrashId] = useState<string | null>(null); // preset delete red hover

  const [parsedRegex,  setParsedRegex]  = useState('');
  const [parsedTerms,  setParsedTerms]  = useState<string[]>([]);

  const [tradeMapType,      setTradeMapType]      = useState<MapType>('any');
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
  const [brickMods,         setBrickMods]         = useState<{ label: string; statId: string; regexTerm: string; category: 'regular' | 'nightmare' }[]>([]);
  const [brickModsError,    setBrickModsError]    = useState(false);
  const [tradeBrickExcl,    setTradeBrickExcl]    = useState<string[]>([]);

  const exclusions: string[]  = settings.regexExclusions ?? [];

  const removeExclusion = (term: string) =>
    updateSetting('regexExclusions', exclusions.filter((e) => e !== term));

  const is8Mod = maps.length > 0 && maps.every((m) => m.modCount > 6 || m.isNightmare);

  // Clear paste preview on session change or strategy load
  useEffect(() => {
    setParsedRegex('');
    setParsedTerms([]);
  }, [activeSessionId, loadedStrategyInfo]);

  useEffect(() => {
    try {
      const fn = window.api?.getBrickMods;
      if (typeof fn === 'function') fn().then(setBrickMods).catch(() => setBrickModsError(true));
    } catch { setBrickModsError(true); }
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

  const nightmareStatIds = useMemo(
    () => new Set(brickMods.filter((m) => m.category === 'nightmare').map((m) => m.statId)),
    [brickMods]
  );

  const brickModData = useMemo(() => {
    const regular   = brickMods.filter((m) => m.category === 'regular').map((m) => ({ value: m.statId, label: m.label }));
    const nightmare = brickMods.filter((m) => m.category === 'nightmare').map((m) => ({ value: m.statId, label: m.label }));
    const result: { group: string; items: { value: string; label: string }[] }[] = [];
    if (regular.length   > 0) result.push({ group: 'Regular',   items: regular });
    if (nightmare.length > 0) result.push({ group: 'Nightmare', items: nightmare });
    return result;
  }, [brickMods]);

  const renderBrickOption = ({ option }: { option: { value: string; label: string } }) => (
    <Text size="xs" style={{ color: nightmareStatIds.has(option.value) ? COLOR.nightmare : undefined }}>
      {option.label}
    </Text>
  );

  const addBrickModsToRegex = (statIds: string[]) => {
    const terms = statIds
      .map((id) => brickMods.find((m) => m.statId === id)?.regexTerm)
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
      .map((id) => brickMods.find((m) => m.statId === id)?.regexTerm)
      .filter((t): t is string => !!t);
    updateSetting('regexExclusions', [...new Set([...kept, ...newTerms])]);
  };
  const selectedIdsOf = (cat: 'regular' | 'nightmare') =>
    brickMods.filter((m) => m.category === cat && exclusions.includes(m.regexTerm)).map((m) => m.statId);
  const doPresetSave = () => {
    const name = presetSaveName.trim();
    if (!name) return;
    saveExclusionPreset(name);
    setPresetSaveName('');
    setPresetSaveOpen(false);
  };

  // Add a single parsed term to current exclusions
  const addSingleTerm = (term: string) => {
    if (!exclusions.includes(term))
      updateSetting('regexExclusions', [...exclusions, term]);
  };

  const openSaveAsModal = (regex: string, type: 'run' | 'slam' | 'other' = 'run') => {
    setSaveAsRegex(regex);
    setSaveAsType(type);
    setSaveAsLabel('');
    openSaveAs();
  };

  const handleOpenTradeModal = () => {
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
    const autoSelected = brickMods.filter((m) => exclusions.includes(m.regexTerm)).map((m) => m.statId);
    setTradeBrickExcl(autoSelected);
    openTrade();
  };

  const handleSearch = async () => {
    const league = settings.leagueName?.trim() || await (async () => {
      await initDivinePrice();
      return useSessionStore.getState().settings.leagueName || CURRENT_LEAGUE;
    })();
    setTradeLoading(true); setTradeError(null);
    try {
      const result = await window.api.searchMapsOnTrade({
        league, minIIQ: tradeMinIIQ, minIIR: tradeMinIIR, minPack: tradeMinPack,
        minCurrency: tradeMinCurrency, minScarabs: tradeMinScarabs, minMaps: tradeMinMaps,
        minTier: tradeMinTier, corruptedFilter: tradeCorrupted,
        mapType: tradeMapType, empowered: tradeEmpowered,
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
      {/* ── Save As modal (name only, regex is pre-filled) ── */}
      <Modal opened={saveAsOpen} onClose={closeSaveAs} title="Save Regex Set" size="sm">
        <Stack gap="sm">
          <TextInput label="Name" placeholder="e.g. My 8-mod setup" autoFocus
            value={saveAsLabel} onChange={(e) => setSaveAsLabel(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && saveAsLabel.trim()) {
                saveRegexSet({ label: saveAsLabel.trim(), type: saveAsType, lines: [saveAsRegex] });
                closeSaveAs();
              }
            }} />
          <Code style={{ fontSize: FONT.label, wordBreak: 'break-all', color: COLOR.textFaint }}>{saveAsRegex}</Code>
          <Button onClick={() => {
            if (!saveAsLabel.trim()) return;
            saveRegexSet({ label: saveAsLabel.trim(), type: saveAsType, lines: [saveAsRegex] });
            closeSaveAs();
          }} disabled={!saveAsLabel.trim()}>Save</Button>
        </Stack>
      </Modal>

      {/* ── Trade search modal ── */}
      <Modal opened={tradeOpen} onClose={closeTrade} title="PoE Trade Map Search" size="md" scrollAreaComponent={ScrollArea.Autosize}>
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            League: <Text span fw={600} c="teal">{settings.leagueName || CURRENT_LEAGUE}</Text>
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

          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Text size="xs" fw={600}>Empowered Mirage enchant</Text>
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>Require Empowered Mirage enchant</Text>
            </Stack>
            <Switch size="sm" checked={tradeEmpowered} onChange={(e) => setTradeEmpowered(e.currentTarget.checked)} />
          </Group>

          <Stack gap={4}>
            <Text size="xs" fw={600}>Delirium</Text>
            <Group gap="md" grow>
              <Select size="xs" label="Min % Delirious"
                data={[
                  { value: '-1',  label: 'Any (no filter)' },
                  { value: '0',   label: '0% (has delirium enchant)' },
                  { value: '20',  label: '20% (1 orb)' },
                  { value: '40',  label: '40% (2 orbs)' },
                  { value: '60',  label: '60% (3 orbs)' },
                  { value: '80',  label: '80% (4 orbs)' },
                  { value: '100', label: '100% (5 orbs)' },
                ]}
                value={String(tradeMinDelirious)}
                onChange={(v) => setTradeMinDelirious(Number(v ?? '-1'))} />
              <MultiSelect size="xs" label="Reward types (optional)" placeholder="Any"
                clearable searchable
                data={[
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
                ]}
                value={tradeDeliRewards} onChange={setTradeDeliRewards} maxDropdownHeight={200} />
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
              : 'These combine chisel quality + explicit mods. Set >0 on Nightmare to identify uber-mod maps.'}
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

          {tradeMapType === 'nightmare' && tradeMinCurrency === 0 && tradeMinScarabs === 0 && tradeMinMaps === 0 && (
            <Text size="xs" c="orange" style={{ fontSize: FONT.small }}>
              ⚠ Set at least one pseudo stat minimum to identify nightmare maps
            </Text>
          )}

          <Divider label="Brick exclusions (NOT filter)" labelPosition="left" />
          <Stack gap={4}>
            <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
              Exclude maps with these mods. <Text span style={{ color: COLOR.nightmare, fontSize: FONT.small }}>Purple = Nightmare mods.</Text>
            </Text>
            {brickModsError && (
              <Alert color="orange" variant="light" p="xs">
                <Text size="xs">Mod list failed to load — restart the app to retry. Brick exclusions by regex term still work.</Text>
              </Alert>
            )}
            <MultiSelect size="xs"
              placeholder={brickModsError ? 'Unavailable' : brickMods.length === 0 ? 'Loading…' : 'Search and select mods to exclude'}
              searchable clearable filter={brickModFilter}
              data={brickModData} value={tradeBrickExcl} onChange={setTradeBrickExcl}
              renderOption={renderBrickOption}
              maxDropdownHeight={240} disabled={brickMods.length === 0} />
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
              const r = generateTradeRegex(exclusions, tradeMinIIQ, tradeMinPack, tradeMinCurrency, tradeMinIIR);
              if (!r) return null;
              return (
                <CopyButton value={r} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied!' : 'Copy matching stash regex'} withArrow>
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

      {/* ── Exclusion-preset save modal (name only) ── */}
      <Modal opened={presetSaveOpen} onClose={() => { setPresetSaveOpen(false); setPresetSaveName(''); }} title="Save Exclusion Preset" size="sm">
        <Stack gap="sm">
          <TextInput label="Name" placeholder="e.g. Nightmare bricks" autoFocus
            value={presetSaveName} onChange={(e) => setPresetSaveName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && doPresetSave()} />
          <Code style={{ fontSize: FONT.label, wordBreak: 'break-all', color: COLOR.textFaint }}>
            {exclusions.map((t) => `!${t}`).join(' ')}
          </Code>
          <Button onClick={doPresetSave} disabled={!presetSaveName.trim()}>Save</Button>
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
                <Button size="xs" variant="default"
                  onClick={() => openSaveAsModal(generatedRegex.run, 'run')}>
                  Save Run As…
                </Button>
                {generatedRegex.slam && (
                  <Button size="xs" variant="default"
                    onClick={() => openSaveAsModal(generatedRegex.slam!, 'slam')}>
                    Save Slam As…
                  </Button>
                )}
                <Button size="xs" variant="light" color="orange" ml="auto"
                  leftSection={<IconExternalLink size={12} />} onClick={handleOpenTradeModal}>
                  Open Trade
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
                  <Button size="xs" variant="default"
                    onClick={() => {
                      setParsedRegex(loadedStrategyInfo.runRegex);
                      setParsedTerms(parseExclusionsFromRegex(loadedStrategyInfo.runRegex));
                    }}>
                    Show their exclusions
                  </Button>
                  <Button size="xs" variant="default"
                    onClick={() => openSaveAsModal(run, 'run')}>
                    Save Run As…
                  </Button>
                  {slam && (
                    <Button size="xs" variant="default"
                      onClick={() => openSaveAsModal(slam, 'slam')}>
                      Save Slam As…
                    </Button>
                  )}
                  <Button size="xs" variant="light" color="orange" ml="auto"
                    leftSection={<IconExternalLink size={12} />} onClick={handleOpenTradeModal}>
                    Open Trade
                  </Button>
                </Group>
              </Stack>
            );
          })()}

          {/* session-16: Open Trade lives with the regex boxes above when one is
              showing; this standalone fallback only renders when neither is. */}
          {!generatedRegex && !loadedStrategyInfo && (
            <Group gap={4} justify="flex-end">
              <Button size="xs" variant="light" color="orange"
                leftSection={<IconExternalLink size={12} />} onClick={handleOpenTradeModal}>
                Open Trade
              </Button>
            </Group>
          )}

          {/* ── Brick Exclusions ── */}
          <Stack gap={4} p="xs" style={{ background: COLOR.tintOliveBg, borderRadius: 6, border: `1px solid ${COLOR.tintOliveBorder}` }}>
            <Group justify="space-between">
              <Group gap={4}>
                <Text size="xs" fw={700} c="yellow">Brick Exclusions</Text>
                <Tooltip multiline w={280}
                  label={
                    <Stack gap={3} p={2}>
                      <Text size="xs" fw={700}>Mods you refuse to run.</Text>
                      <Text size="xs">These terms are prepended to every generated regex as &quot;!a|b&quot;, so maps with a matching mod never highlight in your stash.</Text>
                      <Text size="xs">Add them from the mod pickers below, or paste an existing regex to import its exclusions.</Text>
                      <Text size="xs">Presets (top right): save named term lists to rotate between setups; &quot;Set current as default&quot; auto-applies the current terms whenever you load a strategy.</Text>
                    </Stack>
                  } withArrow>
                  <Badge size="xs" color="gray" variant="outline" style={{ cursor: 'help' }}>?</Badge>
                </Tooltip>
              </Group>
              <Menu shadow="md" width={240} position="bottom-end">
                <Menu.Target>
                  <Button size="xs" variant="default" rightSection={<IconChevronDown size={10} />}>Presets</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconDeviceFloppy size={13} />} disabled={exclusions.length === 0}
                    onClick={() => setPresetSaveOpen(true)}>
                    Save current as…
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
                          rightSection={<ActionIcon size="sm" variant="subtle" aria-label={`Delete preset ${p.name}`}
                            onMouseEnter={() => setHoveredExclTrashId(p.id)}
                            onMouseLeave={() => setHoveredExclTrashId(null)}
                            style={{ color: hoveredExclTrashId === p.id ? 'var(--mantine-color-red-4)' : 'var(--mantine-color-dimmed)' }}
                            onClick={(e) => { e.stopPropagation(); setHoveredExclTrashId(null); deleteExclusionPreset(p.id); }}>
                            <IconTrash size={13} /></ActionIcon>}
                          onClick={() => loadExclusionPreset(p.id)}>
                          <Tooltip label={p.terms.map((t) => `!${t}`).join(' ')} withArrow position="left">
                            <Text size="xs" lineClamp={1}>{p.name} ({p.terms.length})</Text>
                          </Tooltip>
                        </Menu.Item>
                      ))}
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
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
                <MultiSelect size="xs" label="Regular mods" placeholder="Search…" searchable clearable
                  data={brickMods.filter((m) => m.category === 'regular').map((m) => ({ value: m.statId, label: m.label }))}
                  filter={brickModFilter}
                  value={selectedIdsOf('regular')}
                  onChange={handleCategoryChange('regular')}
                  maxDropdownHeight={220}
                  styles={{
                    label: { fontSize: FONT.label, color: 'var(--mantine-color-dimmed)' },
                    // Pin clear ×/chevron to the TOP right — the section is
                    // absolutely positioned full-height and centers its content,
                    // so it drifted as picked mods grew the field (Sad 2026-07-10).
                    section: { alignItems: 'flex-start', paddingTop: 5 },
                  }} />
                <MultiSelect size="xs" label="Nightmare mods" placeholder="Search…" searchable clearable
                  data={brickMods.filter((m) => m.category === 'nightmare').map((m) => ({ value: m.statId, label: m.label }))}
                  filter={brickModFilter}
                  value={selectedIdsOf('nightmare')}
                  onChange={handleCategoryChange('nightmare')}
                  renderOption={({ option }) => (
                    <Text size="xs" style={{ color: COLOR.nightmare }}>{option.label}</Text>
                  )}
                  maxDropdownHeight={220}
                  styles={{
                    label: { fontSize: FONT.label, color: COLOR.nightmare },
                    section: { alignItems: 'flex-start', paddingTop: 5 }, // see Regular picker note
                  }} />
              </SimpleGrid>
            )}

            {/* Regex paste preview — boxed so it reads as its own import tool,
                not stray helper text (Sad 2026-07-09). Position kept: parsed
                terms are clickable to add them to the exclusions above. */}
            <Stack gap={3} p={6}
              style={{ background: 'rgba(255,255,255,0.03)', border: `1px dashed ${COLOR.borderSoft}`, borderRadius: 5 }}>
              <Text size="xs" fw={600} c="dimmed">Import from a pasted regex</Text>
              <TextInput size="xs" placeholder='"!vola|eche|nsta" "(urr.*..."'
                value={parsedRegex}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setParsedRegex(val);
                  setParsedTerms(val.trim() ? parseExclusionsFromRegex(val) : []);
                }}
                styles={{ input: { fontFamily: 'monospace', fontSize: FONT.small } }} />
              {parsedTerms.length > 0 && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
                    Click a mod to add it to your exclusions:
                  </Text>
                  <Group gap={4} wrap="wrap">
                    {parsedTerms.map((t) => {
                      const mod = brickMods.find((m) => m.regexTerm === t);
                      const alreadyAdded = exclusions.includes(t);
                      return (
                        <Tooltip key={t} label={alreadyAdded ? 'Already in your exclusions' : 'Click to add'} withArrow>
                          <Badge
                            size="xs"
                            color={mod ? (mod.category === 'nightmare' ? 'grape' : 'yellow') : 'gray'}
                            variant={alreadyAdded ? 'filled' : 'light'}
                            style={{ cursor: alreadyAdded ? 'default' : 'pointer' }}
                            onClick={() => !alreadyAdded && addSingleTerm(t)}>
                            {mod ? mod.label : `!${t} (custom)`}
                          </Badge>
                        </Tooltip>
                      );
                    })}
                  </Group>
                </Stack>
              )}
            </Stack>

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

// ─── Saved Sets tab ───────────────────────────────────────────────────────────
// WP8: the shared saved-sets list both the From Session tab and the Builder tab
// save into (via saveRegexSet).

export const SavedSetsTab = () => {
  const { regexSets, deleteRegexSet } = useSessionKeys('regexSets', 'deleteRegexSet');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null); // session-16: delete confirm (persistent cross-session data)
  const [hoveredTrashId, setHoveredTrashId] = useState<string | null>(null);
  const targetSet = deleteTarget ? regexSets.find((s) => s.id === deleteTarget) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, padding: 8 }}>
      <Modal opened={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title="Delete Regex Set" size="sm">
        <Stack gap="sm">
          <Text size="sm">
            Permanently delete <Text span fw={700}>{targetSet?.label ?? ''}</Text>? This cannot be undone.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="red" onClick={() => { if (deleteTarget) deleteRegexSet(deleteTarget); setDeleteTarget(null); }}>Delete</Button>
          </Group>
        </Stack>
      </Modal>
      <Text fw={700} size="sm" mb="xs" style={{ flexShrink: 0 }}>Saved Sets</Text>
      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Stack gap="xs">
          {regexSets.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No regex sets saved. Generate one in From Session or Builder, then Save it here.
            </Text>
          )}

          {regexSets.map((set) => (
            <Stack key={set.id} gap={4} p="xs"
              style={{ background: COLOR.bgRaised, borderRadius: 6 }}>
              <Group justify="space-between">
                <Group gap="xs">
                  <Badge color={TYPE_COLORS[set.type] ?? 'gray'} size="xs" variant="light">{TYPE_LABELS[set.type] ?? set.type}</Badge>
                  <Text size="xs" fw={600}>{set.label}</Text>
                </Group>
                <ActionIcon size="md" variant="default" aria-label={`Delete regex set ${set.label}`}
                  onMouseEnter={() => setHoveredTrashId(set.id)}
                  onMouseLeave={() => setHoveredTrashId(null)}
                  style={{
                    color: hoveredTrashId === set.id ? 'var(--mantine-color-red-4)' : undefined,
                    borderColor: hoveredTrashId === set.id ? 'var(--mantine-color-red-7)' : undefined,
                  }}
                  onClick={() => { setHoveredTrashId(null); setDeleteTarget(set.id); }}>
                  <IconTrash size={15} />
                </ActionIcon>
              </Group>
              {set.lines.map((line, i) => <RegexLine key={i} value={line} />)}
            </Stack>
          ))}
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
