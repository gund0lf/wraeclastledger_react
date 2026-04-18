import {
  Card, Text, Button, Group, Stack, Badge, ActionIcon,
  TextInput, Select, MultiSelect, Modal, CopyButton, Code, Divider, ScrollArea, Tooltip,
  NumberInput, Switch,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useMemo } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { RegexSet } from '../types';
import { FaTrash, FaPlus, FaCopy, FaCheck, FaMagic, FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import { generateRunRegex, generateSlamRegex, trimmedMean } from '../utils/priceUtils';

const TYPE_COLORS: Record<string, string> = { run: 'green', slam: 'orange', other: 'gray' };
const TYPE_LABELS: Record<string, string> = { run: 'Run', slam: 'Slam', other: 'Other' };

type MapType = 'any' | 'regular' | '8mod' | 'nightmare' | 'originator';

const MAP_TYPE_OPTIONS: { value: MapType; label: string; description: string }[] = [
  { value: 'any',        label: 'Any',         description: 'No map type filter applied' },
  { value: 'regular',    label: 'Regular',      description: 'Non-corrupted maps, standard mod pool. Pseudo stats (currency/scarabs/maps) left at 0 — regular maps have none of these.' },
  { value: '8mod',       label: '8-mod',        description: 'Corrupted maps only, standard mod pool. High IIQ/pack filter narrows to quality 8-mod maps.' },
  { value: 'nightmare',  label: 'Nightmare',    description: 'Has uber pseudo stats (currency/scarabs/maps > 0) and is NOT an Originator map. Set at least one pseudo min to identify them.' },
  { value: 'originator', label: 'Originator',   description: 'Has Originator\'s Memories implicit. Includes all variants (corrupted or not).' },
];

export const RegexModule = () => {
  const { settings, updateSetting, saveRegexSet, deleteRegexSet, maps, initDivinePrice } = useSessionStore();
  const [newOpen,   { open: openNew,   close: closeNew   }] = useDisclosure(false);
  const [tradeOpen, { open: openTrade, close: closeTrade }] = useDisclosure(false);

  const [newLabel,     setNewLabel]     = useState('');
  const [newType,      setNewType]      = useState<string>('run');
  const [newLine,      setNewLine]      = useState('');
  const [newExclusion, setNewExclusion] = useState('');

  // Trade modal state
  const [tradeMapType,     setTradeMapType]     = useState<MapType>('any');
  const [tradeEmpowered,   setTradeEmpowered]   = useState(false);
  const [tradeMinDelirious, setTradeMinDelirious] = useState(0);
  const [tradeDeliRewards,  setTradeDeliRewards]  = useState<string[]>([]);
  const [tradeMinIIQ,      setTradeMinIIQ]      = useState(0);
  const [tradeMinIIR,      setTradeMinIIR]      = useState(0);
  const [tradeMinPack,     setTradeMinPack]      = useState(0);
  const [tradeMinCurrency, setTradeMinCurrency] = useState(0);
  const [tradeMinScarabs,  setTradeMinScarabs]  = useState(0);
  const [tradeMinMaps,     setTradeMinMaps]     = useState(0);
  const [tradeLoading,     setTradeLoading]     = useState(false);
  const [tradeError,       setTradeError]       = useState<string | null>(null);

  const regexSets: RegexSet[] = settings.regexSets ?? [];
  const exclusions: string[]  = settings.regexExclusions ?? [];

  const addExclusion = () => {
    const term = newExclusion.trim();
    if (!term || exclusions.includes(term)) return;
    updateSetting('regexExclusions', [...exclusions, term]);
    setNewExclusion('');
  };
  const removeExclusion = (term: string) =>
    updateSetting('regexExclusions', exclusions.filter((e) => e !== term));
  const resetExclusions = () =>
    updateSetting('regexExclusions', ['vola', 'eche', 'tab', 'wb', '% of e', 'reg', 'get']);

  const is8Mod = maps.length > 0 && maps.every((m) => m.modCount > 6 || m.isNightmare);

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

  // Pre-fill trade modal from session maps
  const handleOpenTradeModal = () => {
    if (generatedRegex) {
      setTradeMinIIQ(Math.floor(generatedRegex.avg.avgQuant / 10) * 10);
      setTradeMinIIR(Math.floor(generatedRegex.avg.avgRarity / 10) * 10);
      setTradeMinPack(Math.floor(generatedRegex.avg.avgPack  / 10) * 10);
      // Only pre-fill currency for non-regular maps (regular maps have no pseudo currency stats)
      const avgCurr = generatedRegex.avg.avgCurr;
      setTradeMinCurrency(avgCurr > 0 ? Math.floor(avgCurr / 10) * 10 : 0);
      setTradeMinScarabs(0);
      setTradeMinMaps(0);
    }
    // Auto-detect map type from session
    if (maps.length > 0) {
      const hasOrig  = maps.some((m) => m.isOriginator);
      const hasEmp   = maps.some((m) => m.isEmpoweredMirage);
      const hasNight = maps.some((m) => m.isNightmare);
      const hasCorr  = maps.some((m) => m.isCorrupted && m.modCount > 6);
      if (hasOrig)        { setTradeMapType('originator'); setTradeEmpowered(hasEmp); }
      else if (hasNight)  { setTradeMapType('nightmare');  setTradeEmpowered(false); }
      else if (hasCorr)   { setTradeMapType('8mod');       setTradeEmpowered(hasEmp); }
      else                { setTradeMapType('regular');    setTradeEmpowered(hasEmp); }
    }
    setTradeError(null);
    openTrade();
  };

  const handleSearch = async () => {
    const league = settings.leagueName?.trim() || await (async () => {
      await initDivinePrice();
      return useSessionStore.getState().settings.leagueName || 'Mirage';
    })();
    setTradeLoading(true);
    setTradeError(null);
    try {
      const result = await window.api.searchMapsOnTrade({
        league,
        minIIQ:      tradeMinIIQ,
        minIIR:      tradeMinIIR,
        minPack:     tradeMinPack,
        minCurrency: tradeMinCurrency,
        minScarabs:  tradeMinScarabs,
        minMaps:     tradeMinMaps,
        mapType:     tradeMapType,
        empowered:   tradeEmpowered,
        minDelirious:  tradeMinDelirious,
        deliRewardTypes: tradeDeliRewards,
        brickExclusions: [],
      });
      if (result.url) {
        window.open(result.url, '_blank');
        closeTrade();
      } else {
        setTradeError(result.error ?? 'Failed to create trade search');
      }
    } catch (err: any) {
      setTradeError(err.message ?? 'IPC error');
    } finally {
      setTradeLoading(false);
    }
  };

  const handleSave = () => {
    if (!newLabel.trim() || !newLine.trim()) return;
    saveRegexSet({ label: newLabel.trim(), type: newType as any, lines: [newLine.trim()] });
    setNewLabel(''); setNewLine('');
    closeNew();
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

  const RegexLine = ({ value, label }: { value: string; label?: string }) => (
    <Group gap={4} wrap="nowrap">
      <CopyLine value={value} />
      <Code style={{ fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{value}</Code>
      {label && <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', minWidth: 160 }}>{label}</Text>}
    </Group>
  );

  const selectedMapTypeInfo = MAP_TYPE_OPTIONS.find((o) => o.value === tradeMapType);

  return (
    <>
      {/* ── Save regex set modal ── */}
      <Modal opened={newOpen} onClose={closeNew} title="Save Regex Set" size="md">
        <Stack gap="sm">
          <TextInput label="Label" value={newLabel} onChange={(e) => setNewLabel(e.currentTarget.value)} />
          <Select label="Type"
            data={[
              { value: 'run',   label: '🟢 Run — run as-is' },
              { value: 'slam',  label: '🟠 Slam — exalt first, open slot' },
              { value: 'other', label: '⚪ Other' },
            ]}
            value={newType} onChange={(v) => setNewType(v ?? 'run')} />
          <TextInput label="Regex" value={newLine} onChange={(e) => setNewLine(e.currentTarget.value)}
            styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }} />
          <Button onClick={handleSave} disabled={!newLabel.trim() || !newLine.trim()}>Save</Button>
        </Stack>
      </Modal>

      {/* ── Trade search modal ── */}
      <Modal opened={tradeOpen} onClose={closeTrade} title="PoE Trade Map Search" size="md">
        <Stack gap="md">
          <Text size="xs" c="dimmed">
            League: <Text span fw={600} c="teal">{settings.leagueName || 'Mirage'}</Text>
            {' · '}Any Non-Unique{' · '}Sort by price
          </Text>

          {/* Map type */}
          <Stack gap={4}>
            <Text size="xs" fw={600}>Map type</Text>
            <Select
              size="xs"
              data={MAP_TYPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              value={tradeMapType}
              onChange={(v) => {
                const t = (v ?? 'any') as MapType;
                setTradeMapType(t);
                // Clear pseudo stats for types where they don't exist
                if (t === 'regular' || t === '8mod') {
                  setTradeMinCurrency(0); setTradeMinScarabs(0); setTradeMinMaps(0);
                }
              }}
            />
            {selectedMapTypeInfo && (
              <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>{selectedMapTypeInfo.description}</Text>
            )}
          </Stack>

          {/* Empowered Mirage toggle — works on all types */}
          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Text size="xs" fw={600}>Empowered Mirage enchant</Text>
              <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Require "Empowered Mirage which covers the entire Map" enchant</Text>
            </Stack>
            <Switch size="sm" checked={tradeEmpowered} onChange={(e) => setTradeEmpowered(e.currentTarget.checked)} />
          </Group>

          {/* Delirium */}
          <Stack gap={4}>
            <Text size="xs" fw={600}>Delirium</Text>
            <Group gap="md" grow>
              <Select
                size="xs"
                label="Min % Delirious"
                data={[
                  { value: '0',   label: 'Any' },
                  { value: '20',  label: '20% (1 orb)' },
                  { value: '40',  label: '40% (2 orbs)' },
                  { value: '60',  label: '60% (3 orbs)' },
                  { value: '80',  label: '80% (4 orbs)' },
                  { value: '100', label: '100% (5 orbs)' },
                ]}
                value={String(tradeMinDelirious)}
                onChange={(v) => setTradeMinDelirious(Number(v ?? '0'))}
              />
              <MultiSelect
                size="xs"
                label="Reward types (optional)"
                placeholder="Any"
                clearable
                searchable
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
                value={tradeDeliRewards}
                onChange={setTradeDeliRewards}
                maxDropdownHeight={200}
              />
            </Group>
            {tradeDeliRewards.length > 0 && (
              <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
                Map must have ANY of the selected reward types (OR logic)
              </Text>
            )}
          </Stack>

          <Divider label="Map filters" labelPosition="left" />
          <Group gap="md" grow>
            <NumberInput size="xs" label="Min IIQ (%Q)" min={0} max={300} step={10}
              value={tradeMinIIQ} onChange={(v) => setTradeMinIIQ(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min IIR (%R)" min={0} max={300} step={10}
              value={tradeMinIIR} onChange={(v) => setTradeMinIIR(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min Pack size (%P)" min={0} max={200} step={10}
              value={tradeMinPack} onChange={(v) => setTradeMinPack(Number(v) || 0)} suffix="%" />
          </Group>

          <Divider label="Pseudo stat filters" labelPosition="left" />
          <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>
            {tradeMapType === 'regular' || tradeMapType === '8mod'
              ? 'Regular and 8-mod maps have no uber pseudo stats — keep these at 0.'
              : 'These use pseudo stats that combine chisel quality + explicit mods. Setting any > 0 on Nightmare search identifies uber-mod maps.'}
          </Text>
          <Group gap="md" grow>
            <NumberInput size="xs" label="Min Currency (%)" min={0} step={10}
              disabled={tradeMapType === 'regular' || tradeMapType === '8mod'}
              value={tradeMinCurrency} onChange={(v) => setTradeMinCurrency(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min Scarabs (%)" min={0} step={10}
              disabled={tradeMapType === 'regular' || tradeMapType === '8mod'}
              value={tradeMinScarabs} onChange={(v) => setTradeMinScarabs(Number(v) || 0)} suffix="%" />
            <NumberInput size="xs" label="Min Maps (%)" min={0} step={10}
              disabled={tradeMapType === 'regular' || tradeMapType === '8mod'}
              value={tradeMinMaps} onChange={(v) => setTradeMinMaps(Number(v) || 0)} suffix="%" />
          </Group>

          {tradeMapType === 'nightmare' && tradeMinCurrency === 0 && tradeMinScarabs === 0 && tradeMinMaps === 0 && (
            <Text size="xs" c="orange" style={{ fontSize: 10 }}>
              ⚠ Set at least one pseudo stat minimum to identify nightmare maps (otherwise search returns all non-originator maps)
            </Text>
          )}

          {tradeError && <Text size="xs" c="red">{tradeError}</Text>}

          <Button
            color="orange" loading={tradeLoading}
            leftSection={<FaExternalLinkAlt size={11} />}
            onClick={handleSearch} fullWidth>
            Search on PoE Trade
          </Button>
        </Stack>
      </Modal>

      {/* ── Main card ── */}
      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%"
        style={{ display: 'flex', flexDirection: 'column' }}>
        <Group justify="space-between" mb="xs">
          <Text fw={700} size="sm">Regex Sets</Text>
          <Button size="xs" variant="light" leftSection={<FaPlus size={10} />} onClick={openNew}>New</Button>
        </Group>

        <ScrollArea style={{ flex: 1 }}>
          <Stack gap="xs">

            <Stack gap={4} p="xs" style={{ background: '#1e2018', borderRadius: 6, border: '1px solid #3a4020' }}>
              <Group justify="space-between">
                <Group gap={4}>
                  <Text size="xs" fw={700} c="yellow">Brick Exclusions</Text>
                  <Tooltip multiline w={280}
                    label={
                      <Stack gap={2} p={2}>
                        <Text size="xs" fw={700}>These terms are prepended as !term to every generated regex.</Text>
                        <Text size="xs">Maps containing these mods are skipped entirely — too dangerous or annoying to run.</Text>
                        <Text size="xs" c="dimmed" mt={2}>Defaults: vola (Volatile), eche (Echoing), tab (Tabula), wb (Warrior Breach), % of e (Energy Shield), reg (Regeneration), get (Monsters get…)</Text>
                      </Stack>
                    }
                    withArrow>
                    <Badge size="xs" color="gray" variant="outline" style={{ cursor: 'help' }}>?</Badge>
                  </Tooltip>
                </Group>
                <Tooltip label="Reset to defaults">
                  <Button size="xs" variant="subtle" color="gray" onClick={resetExclusions}
                    style={{ fontSize: 9, padding: '0 4px', height: 18 }}>reset</Button>
                </Tooltip>
              </Group>

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

              <Group gap={4}>
                <TextInput size="xs" placeholder="Add exclusion term..." style={{ flex: 1 }}
                  value={newExclusion}
                  onChange={(e) => setNewExclusion(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addExclusion()}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 11 } }} />
                <Button size="xs" variant="light" color="yellow"
                  disabled={!newExclusion.trim() || exclusions.includes(newExclusion.trim())}
                  onClick={addExclusion}>
                  <FaPlus size={9} />
                </Button>
              </Group>

              <Text size="xs" c="dimmed" style={{ fontSize: 9 }}>
                Preview: <Code style={{ fontSize: 9 }}>"!{exclusions.join('|')}"</Code>
              </Text>
            </Stack>

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
                    onClick={() => saveRegexSet({ label: `Run (${generatedRegex.n} maps)`, type: 'run', lines: [generatedRegex.run] })}>
                    Save Run
                  </Button>
                  {generatedRegex.slam && (
                    <Button size="xs" variant="subtle" color="orange"
                      onClick={() => saveRegexSet({ label: `Slam (${generatedRegex.n} maps)`, type: 'slam', lines: [generatedRegex.slam!] })}>
                      Save Slam
                    </Button>
                  )}
                  <Button size="xs" variant="light" color="orange" onClick={handleOpenTradeModal}>
                    Open Trade
                  </Button>
                </Group>
              </Stack>
            )}

            <Divider label="Saved Sets" labelPosition="left" />

            {regexSets.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="md">No regex sets saved.</Text>
            )}

            {regexSets.map((set) => (
              <Stack key={set.id} gap={4} p="xs" style={{ background: '#1e1f22', borderRadius: 6 }}>
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
