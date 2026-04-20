import {
  Card, Text, Button, Group, Stack, Badge, ActionIcon,
  TextInput, Select, MultiSelect, Modal, CopyButton, Code, Divider, ScrollArea, Tooltip,
  NumberInput, Switch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo, useEffect } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { RegexSet } from '../types';
import { FaTrash, FaPlus, FaCopy, FaCheck, FaMagic, FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import { generateRunRegex, generateSlamRegex, trimmedMean } from '../utils/priceUtils';

const TYPE_COLORS: Record<string, string> = { run: 'green', slam: 'orange', other: 'gray' };
const TYPE_LABELS: Record<string, string> = { run: 'Run', slam: 'Slam', other: 'Other' };

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

export const RegexModule = () => {
  const { settings, updateSetting, saveRegexSet, deleteRegexSet,
    setDefaultPreset, defaultExclusionPreset,
    maps, initDivinePrice, loadedStrategyInfo, activeSessionId,
  } = useSessionStore();

  const [saveAsOpen, { open: openSaveAs, close: closeSaveAs }] = useDisclosure(false);
  const [tradeOpen,  { open: openTrade,  close: closeTrade  }] = useDisclosure(false);

  const [saveAsLabel,  setSaveAsLabel]  = useState('');
  const [saveAsRegex,  setSaveAsRegex]  = useState(''); // the regex being saved, not editable
  const [saveAsType,   setSaveAsType]   = useState<'run' | 'slam' | 'other'>('run');

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
  const [tradeBrickExcl,    setTradeBrickExcl]    = useState<string[]>([]);

  const regexSets: RegexSet[] = settings.regexSets ?? [];
  const exclusions: string[]  = settings.regexExclusions ?? [];

  const removeExclusion = (term: string) =>
    updateSetting('regexExclusions', exclusions.filter((e) => e !== term));
  const resetExclusions = () => updateSetting('regexExclusions', []);

  const is8Mod = maps.length > 0 && maps.every((m) => m.modCount > 6 || m.isNightmare);

  // Clear paste preview on session change or strategy load
  useEffect(() => {
    setParsedRegex('');
    setParsedTerms([]);
  }, [activeSessionId, loadedStrategyInfo]);

  useEffect(() => {
    try {
      const fn = window.api?.getBrickMods;
      if (typeof fn === 'function') fn().then(setBrickMods).catch(() => {});
    } catch { /* preload not ready */ }
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
    <Text size="xs" style={{ color: nightmareStatIds.has(option.value) ? '#cc88ff' : undefined }}>
      {option.label}
    </Text>
  );

  const addBrickModsToRegex = (statIds: string[]) => {
    const terms = statIds
      .map((id) => brickMods.find((m) => m.statId === id)?.regexTerm)
      .filter((t): t is string => !!t && !exclusions.includes(t));
    if (terms.length > 0) updateSetting('regexExclusions', [...exclusions, ...terms]);
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
      return useSessionStore.getState().settings.leagueName || 'Mirage';
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
      if (result.url) { window.open(result.url, '_blank'); closeTrade(); }
      else setTradeError(result.error ?? 'Failed to create trade search');
    } catch (err: any) { setTradeError(err.message ?? 'IPC error'); }
    finally { setTradeLoading(false); }
  };

  const CopyLine = ({ value }: { value: string }) => (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <ActionIcon size="xs" variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
          {copied ? <FaCheck size={8} /> : <FaCopy size={8} />}
        </ActionIcon>
      )}
    </CopyButton>
  );

  const RegexLine = ({ value }: { value: string }) => (
    <Group gap={4} wrap="nowrap">
      <CopyLine value={value} />
      <Code style={{ fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{value}</Code>
    </Group>
  );

  const selectedMapTypeInfo = MAP_TYPE_OPTIONS.find((o) => o.value === tradeMapType);

  return (
    <>
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
          <Code style={{ fontSize: 9, wordBreak: 'break-all', color: '#888' }}>{saveAsRegex}</Code>
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
            League: <Text span fw={600} c="teal">{settings.leagueName || 'Mirage'}</Text>
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
              <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>{selectedMapTypeInfo.description}</Text>
            )}
          </Stack>

          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Text size="xs" fw={600}>Empowered Mirage enchant</Text>
              <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Require Empowered Mirage enchant</Text>
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
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
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
            <Text size="xs" c="orange" style={{ fontSize: 10 }}>
              ⚠ Set at least one pseudo stat minimum to identify nightmare maps
            </Text>
          )}

          <Divider label="Brick exclusions (NOT filter)" labelPosition="left" />
          <Stack gap={4}>
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
              Exclude maps with these mods. <Text span style={{ color: '#cc88ff', fontSize: 10 }}>Purple = Nightmare mods.</Text>
            </Text>
            <MultiSelect size="xs"
              placeholder={brickMods.length === 0 ? 'Loading…' : 'Search and select mods to exclude'}
              searchable clearable filter={brickModFilter}
              data={brickModData} value={tradeBrickExcl} onChange={setTradeBrickExcl}
              renderOption={renderBrickOption}
              maxDropdownHeight={240} disabled={brickMods.length === 0} />
            {tradeBrickExcl.length > 0 && (
              <Group gap={4} align="center">
                <Text size="xs" c="red" style={{ fontSize: 10 }}>
                  NOT: {tradeBrickExcl.length} mod{tradeBrickExcl.length > 1 ? 's' : ''} excluded
                </Text>
                <Button size="xs" variant="subtle" color="yellow"
                  onClick={() => addBrickModsToRegex(tradeBrickExcl)}
                  style={{ fontSize: 9, padding: '0 6px', height: 18 }}>
                  → Sync to Regex Exclusions
                </Button>
              </Group>
            )}
          </Stack>

          {tradeError && <Text size="xs" c="red">{tradeError}</Text>}
          <Button color="orange" loading={tradeLoading}
            leftSection={<FaExternalLinkAlt size={11} />} onClick={handleSearch} fullWidth>
            Search on PoE Trade (Instant Buyout)
          </Button>
        </Stack>
      </Modal>

      {/* ── Main card ── */}
      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        style={{ display: 'flex', flexDirection: 'column' }}>
        <Group justify="space-between" mb="xs">
          <Text fw={700} size="sm">Regex Sets</Text>
          {defaultExclusionPreset.length > 0 && (
            <Tooltip label={`Default preset: ${defaultExclusionPreset.map((t) => `!${t}`).join(' ')}`} withArrow>
              <Badge size="xs" color="teal" variant="dot" style={{ cursor: 'default' }}>
                ⭐ Default set
              </Badge>
            </Tooltip>
          )}
        </Group>

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap="xs">

            {/* ── Brick Exclusions ── */}
            <Stack gap={4} p="xs" style={{ background: '#1e2018', borderRadius: 6, border: '1px solid #3a4020' }}>
              <Group justify="space-between">
                <Group gap={4}>
                  <Text size="xs" fw={700} c="yellow">Brick Exclusions</Text>
                  <Tooltip multiline w={260}
                    label={
                      <Stack gap={2} p={2}>
                        <Text size="xs" fw={700}>Terms prepended as !term to every generated regex.</Text>
                        <Text size="xs">Use the mod picker to select named mods. Click ⭐ Set Default to save these as your persistent default — they'll auto-apply whenever you load a strategy.</Text>
                        <Text size="xs" c="dimmed" mt={2}>e.g. eche → Cannot Be Leeched From · nsta → Unstable Tentacle Fiends · vola → Volatile Cores</Text>
                      </Stack>
                    } withArrow>
                    <Badge size="xs" color="gray" variant="outline" style={{ cursor: 'help' }}>?</Badge>
                  </Tooltip>
                </Group>
                <Group gap={4}>
                  <Tooltip label="Save current exclusions as your persistent default — auto-applied when loading any strategy">
                    <Button size="sm" variant="light" color="teal" onClick={setDefaultPreset}>
                      ⭐ Set Default Preset
                    </Button>
                  </Tooltip>
                </Group>
              </Group>

              {exclusions.length > 0 && (
                <Group gap={4} wrap="wrap">
                  {exclusions.map((term) => (
                    <Badge key={term} size="sm" color="yellow" variant="light"
                      rightSection={
                        <ActionIcon size={10} variant="transparent" color="yellow"
                          onClick={() => removeExclusion(term)} style={{ marginLeft: 2 }}>
                          <FaTimes size={7} />
                        </ActionIcon>
                      }
                      style={{ paddingRight: 2 }}>
                      !{term}
                    </Badge>
                  ))}
                </Group>
              )}

              {brickMods.length > 0 && (
                <Stack gap={2}>
                  <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
                    Pick from mod list · <Text span style={{ color: '#cc88ff', fontSize: 9 }}>purple = nightmare</Text>
                  </Text>
                  <MultiSelect size="xs" placeholder="Search mods…" searchable clearable
                    data={brickModData} filter={brickModFilter}
                    value={brickMods.filter((m) => exclusions.includes(m.regexTerm)).map((m) => m.statId)}
                    renderOption={renderBrickOption}
                    onChange={(selected) => {
                      if (selected.length === 0) { updateSetting('regexExclusions', []); return; }
                      const knownTerms = new Set(brickMods.map((m) => m.regexTerm));
                      const customTerms = exclusions.filter((e) => !knownTerms.has(e));
                      const modTerms = selected
                        .map((id) => brickMods.find((m) => m.statId === id)?.regexTerm)
                        .filter((t): t is string => !!t);
                      updateSetting('regexExclusions', [...new Set([...customTerms, ...modTerms])]);
                    }}
                    maxDropdownHeight={220} />
                </Stack>
              )}

              {/* Regex paste preview */}
              <Stack gap={2}>
                <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>Paste a regex to preview its exclusions:</Text>
                <TextInput size="xs" placeholder='"!vola|eche|nsta" "(urr.*..."'
                  value={parsedRegex}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setParsedRegex(val);
                    setParsedTerms(val.trim() ? parseExclusionsFromRegex(val) : []);
                  }}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 10 } }} />
                {parsedTerms.length > 0 && (
                  <Stack gap={2}>
                    <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
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

              <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
                Preview: <Code style={{ fontSize: 9 }}>
                  {exclusions.length > 0 ? `"!${exclusions.join('|')}"` : '(no exclusions)'}
                </Code>
              </Text>
            </Stack>

            {/* ── Loaded from strategy ── */}
            {!generatedRegex && loadedStrategyInfo && (() => {
              const run  = applyUserExclusionsToRegex(loadedStrategyInfo.runRegex, exclusions);
              const slam = loadedStrategyInfo.slamRegex ? applyUserExclusionsToRegex(loadedStrategyInfo.slamRegex, exclusions) : null;
              return (
                <Stack gap="xs" p="xs" style={{ background: '#1a2020', borderRadius: 6, border: '1px solid #2a4040' }}>
                  <Group gap="xs">
                    <FaMagic size={10} color="#4dabf7" />
                    <Text size="xs" fw={700} c="blue">From {loadedStrategyInfo.authorName} · {loadedStrategyInfo.mapCount} maps</Text>
                    {loadedStrategyInfo.mapType && (
                      <Badge size="xs" color="gray" variant="outline">{loadedStrategyInfo.mapType}</Badge>
                    )}
                  </Group>
                  <Text size="xs" c="dimmed">
                    {loadedStrategyInfo.avgQuant.toFixed(0)}%Q · {loadedStrategyInfo.avgRarity.toFixed(0)}%R · {loadedStrategyInfo.avgPack.toFixed(0)}%P · {loadedStrategyInfo.avgCurr.toFixed(0)}% Curr
                  </Text>
                  <Group gap="xs" wrap="nowrap">
                    <Badge color="green" size="xs" style={{ flexShrink: 0 }}>Run</Badge>
                    <RegexLine value={run} />
                  </Group>
                  {slam && (
                    <Group gap="xs" wrap="nowrap">
                      <Badge color="orange" size="xs" style={{ flexShrink: 0 }}>Slam</Badge>
                      <RegexLine value={slam} />
                    </Group>
                  )}
                  {exclusions.length > 0
                    ? <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>Your exclusions applied. Click ⭐ Set Default to make these permanent.</Text>
                    : <Text size="xs" c="orange" style={{ fontSize: 9 }}>No exclusions set — set a default preset or pick mods above.</Text>
                  }
                  <Group gap={4}>
                    <Button size="xs" variant="light" color="gray"
                      onClick={() => {
                        setParsedRegex(loadedStrategyInfo.runRegex);
                        setParsedTerms(parseExclusionsFromRegex(loadedStrategyInfo.runRegex));
                      }}>
                      Show their exclusions ↑
                    </Button>
                    <Button size="xs" variant="subtle" color="green"
                      onClick={() => openSaveAsModal(run, 'run')}>
                      Save Run As…
                    </Button>
                    {slam && (
                      <Button size="xs" variant="subtle" color="orange"
                        onClick={() => openSaveAsModal(slam, 'slam')}>
                        Save Slam As…
                      </Button>
                    )}
                  </Group>
                </Stack>
              );
            })()}

            {/* ── Generated from session ── */}
            {generatedRegex && (
              <Stack gap="xs" p="xs" style={{ background: '#1a2020', borderRadius: 6, border: '1px solid #2a4040' }}>
                <Group gap="xs">
                  <FaMagic size={10} color="#4dabf7" />
                  <Text size="xs" fw={700} c="blue">Generated from {generatedRegex.n} maps (trimmed avg)</Text>
                </Group>
                <Text size="xs" c="dimmed">
                  {generatedRegex.avg.avgQuant.toFixed(0)}%Q · {generatedRegex.avg.avgRarity.toFixed(0)}%R · {generatedRegex.avg.avgPack.toFixed(0)}%P · {generatedRegex.avg.avgCurr.toFixed(0)}% Curr
                </Text>
                <Group gap="xs" wrap="nowrap">
                  <Badge color="green" size="xs" style={{ flexShrink: 0 }}>Run</Badge>
                  <RegexLine value={generatedRegex.run} />
                </Group>
                {generatedRegex.slam ? (
                  <Group gap="xs" wrap="nowrap">
                    <Badge color="orange" size="xs" style={{ flexShrink: 0 }}>Slam</Badge>
                    <RegexLine value={generatedRegex.slam} />
                  </Group>
                ) : (
                  <Text size="xs" c="dimmed" fs="italic">8-mod / Nightmare maps are corrupted — slam not applicable.</Text>
                )}
                {generatedRegex.slam && <Text size="xs" c="dimmed" fs="italic">⚠ Open slot only for slam.</Text>}
                <Group gap={4}>
                  <Button size="xs" variant="subtle" color="green"
                    onClick={() => openSaveAsModal(generatedRegex.run, 'run')}>
                    Save Run As…
                  </Button>
                  {generatedRegex.slam && (
                    <Button size="xs" variant="subtle" color="orange"
                      onClick={() => openSaveAsModal(generatedRegex.slam!, 'slam')}>
                      Save Slam As…
                    </Button>
                  )}
                </Group>
              </Stack>
            )}

            <Group gap={4} justify="flex-end">
              <Button size="xs" variant="light" color="orange" onClick={handleOpenTradeModal}>
                Open Trade
              </Button>
            </Group>

            <Divider label="Saved Sets" labelPosition="left" />

            {regexSets.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">No regex sets saved.</Text>
            )}

            {regexSets.map((set) => (
              <Stack key={set.id} gap={4} p="xs"
                style={{ background: '#1e1f22', borderRadius: 6 }}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <Badge color={TYPE_COLORS[set.type] ?? 'gray'} size="xs" variant="light">{TYPE_LABELS[set.type] ?? set.type}</Badge>
                    <Text size="xs" fw={600}>{set.label}</Text>
                  </Group>
                  <ActionIcon size="xs" color="red" variant="subtle" onClick={() => deleteRegexSet(set.id)}>
                    <FaTrash size={8} />
                  </ActionIcon>
                </Group>
                {set.lines.map((line, i) => <RegexLine key={i} value={line} />)}
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      </Card>
    </>
  );
};

export function applyUserExclusionsToRegex(regex: string, exclusions: string[]): string {
  if (!regex) return regex;
  if (exclusions.length === 0) return regex.replace(/^"![^"]*"\s*/, '');
  if (/^"![^"]+"/.test(regex)) return regex.replace(/^"![^"]+"/, `"!${exclusions.join('|')}"`);
  return `"!${exclusions.join('|')}" ${regex}`;
}
