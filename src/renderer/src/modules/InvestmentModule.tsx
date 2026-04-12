import {
  Card, Text, NumberInput, Divider, Group, Stack, Switch,
  Select, Button, Modal, SimpleGrid, Autocomplete, Badge,
  ActionIcon, TextInput, Menu, Alert,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { SCARAB_LIST, CHISEL_TYPES, DELIRIUM_ORB_LIST, ASTROLABE_LIST } from '../utils/constants';
import { parsePriceInput } from '../utils/priceUtils';
import { FaTrash, FaSave, FaChevronDown, FaSync, FaTimes } from 'react-icons/fa';

const CHISEL_SELECT_DATA = Object.entries(CHISEL_TYPES).map(([k, v]) => ({ value: k, label: v.label }));

const PriceInput = ({ label, description, value, onChange, divinePrice, placeholder = '0' }: {
  label?: string; description?: string; value: number;
  onChange: (v: number) => void; divinePrice: number; placeholder?: string;
}) => {
  const [raw, setRaw]       = useState(value > 0 ? String(value) : '');
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setRaw(value > 0 ? String(value) : ''); }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const r = parsePriceInput(raw, divinePrice);
    setRaw(r > 0 ? String(r) : '');
    onChange(r);
  };
  const divPreview = (() => {
    if (!raw || raw.toLowerCase().includes('d')) return null;
    const n = parsePriceInput(raw, divinePrice);
    return n > 0 && divinePrice > 0 ? `≈${(n / divinePrice).toFixed(2)}d` : null;
  })();
  return (
    <TextInput label={label} description={description} placeholder={placeholder} value={raw}
      onChange={(e) => { setEditing(true); setRaw(e.currentTarget.value); }}
      onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
      rightSection={divPreview ? <Text size="xs" c="dimmed">{divPreview}</Text> : undefined}
      rightSectionWidth={55} size="xs" />
  );
};

export const InvestmentModule = () => {
  const {
    maps, settings, updateSetting, updateAdvSetting, updateScarab, clearScarab, initDivinePrice,
    scarabPresets, saveScarabPreset, loadScarabPreset, deleteScarabPreset,
  } = useSessionStore();
  const [advOpen, { open: openAdv, close: closeAdv }] = useDisclosure(false);
  const [presetName, setPresetName] = useState('');
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const divinePrice = settings.divinePrice || 1;
  const chiselCost  = settings.chiselUsed ? settings.chiselPrice : 0;
  const scarabCost  = settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
  const mapCount    = maps.length || 1;

  const perMapBase = settings.isSplitSession
    ? (settings.baseMapCost + chiselCost) / 2 + scarabCost
    : settings.baseMapCost + chiselCost + scarabCost;

  const rollingPerMap   = settings.rollingCostPerMap / mapCount;
  const totalPerMapFull = perMapBase + rollingPerMap;

  const deliPerMap      = settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach;
  const astrolabeTotal  = settings.advAstrolabePrice * settings.advAstrolabeCount;
  const astrolabeNote   = astrolabeTotal > 0
    ? `${astrolabeTotal.toFixed(1)}c total (${settings.advAstrolabeCount} × ${settings.advAstrolabePrice.toFixed(1)}c)`
    : null;

  useEffect(() => {
    if (settings.divinePrice === 0 || settings.divinePrice === 200) initDivinePrice();
  }, []);

  const handleFetchPrice = async () => {
    setFetchingPrice(true);
    updateSetting('divinePrice', 0);
    await initDivinePrice();
    setFetchingPrice(false);
  };

  return (
    <>
      <Modal opened={advOpen} onClose={closeAdv} title="Advanced Rolling Cost" size="md">
        <Stack gap="sm">
          <Alert color="blue" variant="light" p="xs">
            <Text size="xs">
              Enter qty bought + total paid for each orb type.
              Use <Text span c="yellow">.7d</Text> for divine prices. Rolling Cost updates live.
            </Text>
          </Alert>

          <SimpleGrid cols={3}>
            <Text size="xs" fw={600} c="dimmed">Item</Text>
            <Text size="xs" fw={600} c="dimmed">Qty bought</Text>
            <Text size="xs" fw={600} c="dimmed">Total paid</Text>
          </SimpleGrid>

          <SimpleGrid cols={3} style={{ alignItems: 'center' }}>
            <Text size="xs">Chaos Orbs</Text>
            <NumberInput size="xs" value={settings.advChaos} onChange={(v) => updateAdvSetting('advChaos', Number(v))} min={0} />
            <Text size="xs" c="dimmed">{settings.advChaos}c</Text>
          </SimpleGrid>

          <SimpleGrid cols={3} style={{ alignItems: 'flex-end' }}>
            <Text size="xs">Exalted Orbs</Text>
            <NumberInput size="xs" value={settings.advExalt} onChange={(v) => updateAdvSetting('advExalt', Number(v))} min={0} />
            <PriceInput value={settings.advExaltPrice} onChange={(v) => updateAdvSetting('advExaltPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
          </SimpleGrid>
          {settings.advExalt > 0 && settings.advExaltPrice > 0 && <Text size="xs" c="dimmed" pl={4}>→ {(settings.advExaltPrice / settings.advExalt).toFixed(2)}c each</Text>}

          <SimpleGrid cols={3} style={{ alignItems: 'flex-end' }}>
            <Text size="xs">Scouring Orbs</Text>
            <NumberInput size="xs" value={settings.advScour} onChange={(v) => updateAdvSetting('advScour', Number(v))} min={0} />
            <PriceInput value={settings.advScourPrice} onChange={(v) => updateAdvSetting('advScourPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
          </SimpleGrid>

          <SimpleGrid cols={3} style={{ alignItems: 'flex-end' }}>
            <Text size="xs">Alchemy Orbs</Text>
            <NumberInput size="xs" value={settings.advAlch} onChange={(v) => updateAdvSetting('advAlch', Number(v))} min={0} />
            <PriceInput value={settings.advAlchPrice} onChange={(v) => updateAdvSetting('advAlchPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
          </SimpleGrid>

          <Divider label="Delirium Orbs" />
          <Select label="Orb Type"
            data={DELIRIUM_ORB_LIST}
            value={settings.advDeliOrbType || null}
            onChange={(v) => updateAdvSetting('advDeliOrbType', v ?? '')}
            size="xs" placeholder="Type to search..." searchable clearable />
          <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
            <NumberInput label="Per map (1–5)" size="xs" value={settings.advDeliOrbQtyPerMap}
              onChange={(v) => updateAdvSetting('advDeliOrbQtyPerMap', Number(v))} min={0} max={5} />
            <PriceInput label="Price each"
              value={settings.advDeliOrbPriceEach}
              onChange={(v) => updateAdvSetting('advDeliOrbPriceEach', v)}
              divinePrice={divinePrice} placeholder="e.g. 0.5d" />
          </SimpleGrid>
          {deliPerMap > 0 && <Text size="xs" c="teal" pl={4}>→ {deliPerMap.toFixed(2)}c per map</Text>}

          <Divider label="Astrolabe" />
          <Text size="xs" c="dimmed">
            How many astrolabes did you use this session, and at what price each?
            The count can be adjusted any time as the ping-pong mechanic affects duration.
          </Text>
          <Select label="Type"
            data={ASTROLABE_LIST}
            value={settings.advAstrolabeType || null}
            onChange={(v) => updateAdvSetting('advAstrolabeType', v ?? '')}
            size="xs" placeholder="Select astrolabe..." clearable />
          <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
            <PriceInput label="Price each"
              value={settings.advAstrolabePrice}
              onChange={(v) => updateAdvSetting('advAstrolabePrice', v)}
              divinePrice={divinePrice} placeholder="e.g. 1d" />
            <NumberInput label="Count used this session" size="xs"
              value={settings.advAstrolabeCount}
              onChange={(v) => updateAdvSetting('advAstrolabeCount', Number(v))} min={0} />
          </SimpleGrid>
          {astrolabeNote && <Text size="xs" c="teal" pl={4}>→ {astrolabeNote}</Text>}

          <Divider />
          <Group justify="space-between">
            <Text size="sm" fw={700}>Rolling Cost (session total)</Text>
            <Text size="sm" fw={700} c="orange">{settings.rollingCostPerMap.toFixed(2)}c</Text>
          </Group>
          <Button color="blue" onClick={closeAdv}>Done</Button>
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
        <Group justify="space-between" mb="xs">
          <Text fw={700} size="sm">Investment</Text>
          <Badge color="red" variant="light">{totalPerMapFull.toFixed(1)}c/map</Badge>
        </Group>

        <Stack gap={6}>
          <Group gap="xs" align="flex-end">
            <NumberInput
              label={<Group gap={4}><Text size="xs" fw={500}>Divine Price</Text><Text size="xs" c="dimmed">(verify manually)</Text></Group>}
              value={settings.divinePrice} onChange={(v) => updateSetting('divinePrice', Number(v))}
              suffix="c" size="xs" style={{ flex: 1 }} />
            <ActionIcon size="sm" variant="subtle" color="blue" mb={1} loading={fetchingPrice}
              onClick={handleFetchPrice} title="Re-fetch from poe.ninja">
              <FaSync size={10} />
            </ActionIcon>
          </Group>

          <Divider label="Per-Map" labelPosition="left" />
          <PriceInput label="Base Map Cost" value={settings.baseMapCost}
            onChange={(v) => updateSetting('baseMapCost', v)} divinePrice={divinePrice} />

          <Group justify="space-between" align="center">
            <Text size="xs" fw={500}>Use Chisel</Text>
            <Switch checked={settings.chiselUsed}
              onChange={(e) => updateSetting('chiselUsed', e.currentTarget.checked)} size="xs" />
          </Group>
          {settings.chiselUsed && (
            <SimpleGrid cols={2}>
              <Select label="Type" data={CHISEL_SELECT_DATA} value={settings.chiselType}
                onChange={(v) => updateSetting('chiselType', v ?? 'Avarice')} size="xs" />
              <PriceInput label="Price" value={settings.chiselPrice}
                onChange={(v) => updateSetting('chiselPrice', v)} divinePrice={divinePrice} />
            </SimpleGrid>
          )}

          <Group justify="space-between" align="center">
            <Stack gap={0}>
              <Text size="xs" fw={500}>Split Session</Text>
              <Text size="xs" c="dimmed">(map + chisel) ÷ 2 per map</Text>
            </Stack>
            <Switch checked={settings.isSplitSession}
              onChange={(e) => updateSetting('isSplitSession', e.currentTarget.checked)} size="xs" />
          </Group>

          <Divider label="Rolling" labelPosition="left" />
          <Group gap="xs" align="flex-end">
            <PriceInput label="Rolling Cost (session total)"
              value={settings.rollingCostPerMap}
              onChange={(v) => updateSetting('rollingCostPerMap', v)}
              divinePrice={divinePrice} placeholder="0c" />
            <Button size="xs" variant="default" style={{ marginBottom: 1 }} onClick={openAdv}>⚙</Button>
          </Group>
          {settings.rollingCostPerMap > 0 && maps.length > 0 && (
            <Text size="xs" c="dimmed">÷ {maps.length} maps = {rollingPerMap.toFixed(1)}c/map</Text>
          )}

          <Divider label="Scarabs" labelPosition="left" />
          <Group gap="xs" align="flex-end">
            <TextInput placeholder="Preset name" value={presetName}
              onChange={(e) => setPresetName(e.currentTarget.value)} size="xs" style={{ flex: 1 }} />
            <Button size="xs" variant="light" leftSection={<FaSave size={10} />}
              disabled={!presetName.trim()}
              onClick={() => { saveScarabPreset(presetName.trim()); setPresetName(''); }}>Save</Button>
            {scarabPresets.length > 0 && (
              <Menu shadow="md" width={200}>
                <Menu.Target>
                  <Button size="xs" variant="default" rightSection={<FaChevronDown size={8} />}>Load</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {scarabPresets.map((p) => (
                    <Menu.Item key={p.id}
                      rightSection={<ActionIcon size="xs" color="red" variant="subtle"
                        onClick={(e) => { e.stopPropagation(); deleteScarabPreset(p.id); }}>
                        <FaTrash size={8} /></ActionIcon>}
                      onClick={() => loadScarabPreset(p.id)}>{p.name}</Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            )}
          </Group>

          {settings.scarabs.map((scarab, i) => (
            <Group key={i} gap="xs">
              <Autocomplete placeholder={`Scarab ${i + 1}`} value={scarab.name}
                onChange={(v) => updateScarab(i, 'name', v)}
                data={SCARAB_LIST} size="xs" style={{ flex: 1 }} />
              <PriceInput value={scarab.cost} onChange={(v) => updateScarab(i, 'cost', v)}
                divinePrice={divinePrice} placeholder="0c" />
              {scarab.name && (
                <Tooltip label="Clear slot">
                  <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => clearScarab(i)}>
                    <FaTimes size={10} />
                  </ActionIcon>
                </Tooltip>
              )}
            </Group>
          ))}
        </Stack>
      </Card>
    </>
  );
};
