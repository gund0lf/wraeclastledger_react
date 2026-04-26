import {
  Card, Text, NumberInput, Divider, Group, Stack,
  Select, Button, Modal, SimpleGrid, Autocomplete, Badge,
  ActionIcon, TextInput, Menu, Alert, Collapse, Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect } from 'react';
import { useSessionStore } from '../store/useSessionStore';
import { SCARAB_LIST, DELIRIUM_ORB_LIST, ASTROLABE_LIST, CHISEL_SELECT_DATA } from '../utils/constants';
import { parsePriceInput } from '../utils/priceUtils';
import { FaTrash, FaSave, FaChevronDown, FaChevronRight, FaSync, FaTimes } from 'react-icons/fa';

const AdvSection = ({ title, filled, children }: {
  title: string; filled: boolean; children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap={0}>
      <Group justify="space-between" onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', userSelect: 'none' }}>
        <Group gap={6}>
          <Text size="xs" fw={700}>{title}</Text>
          {filled && !open && <Badge size="xs" color="green" variant="dot">filled</Badge>}
        </Group>
        <ActionIcon size="xs" variant="transparent" c="dimmed">
          {open ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
        </ActionIcon>
      </Group>
      <Collapse in={open}>
        <Stack gap="xs" pt="xs" pb={4}>{children}</Stack>
      </Collapse>
    </Stack>
  );
};

const PriceInput = ({
  label, description, value, onChange, divinePrice, placeholder = '0', style,
}: {
  label?: string; description?: string; value: number;
  onChange: (v: number) => void; divinePrice: number;
  placeholder?: string; style?: React.CSSProperties;
}) => {
  const [raw, setRaw]         = useState(value > 0 ? String(value) : '');
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
      rightSectionWidth={divPreview ? 52 : 0}
      style={style} size="xs" />
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

  const divinePrice   = settings.divinePrice || 1;
  const chiselCost      = settings.chiselType && settings.chiselPrice > 0 ? settings.chiselPrice : 0;
  const hasPreservation  = settings.scarabs.some((s) => s.name.toLowerCase().includes('preservation'));
  const perMapScarabs    = hasPreservation
    ? settings.scarabs.filter((s) =>  s.name.toLowerCase().includes('preservation')).reduce((acc, s) => acc + (s.cost || 0), 0)
    : settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
  const oneTimeScarabs   = hasPreservation
    ? settings.scarabs.filter((s) => !s.name.toLowerCase().includes('preservation')).reduce((acc, s) => acc + (s.cost || 0), 0)
    : 0;
  const scarabCost       = perMapScarabs;
  const mapCount         = maps.length || 1;
  const isSplit          = settings.advSplitPrice > 0;
  const perMapBase       = isSplit
    ? (settings.baseMapCost + chiselCost + settings.advSplitPrice) / 2 + perMapScarabs
    : settings.baseMapCost + chiselCost + perMapScarabs;
  const rollingPerMap   = settings.rollingCostPerMap / mapCount;
  const totalPerMapFull = perMapBase + rollingPerMap;
  const deliPerMap      = settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach;
  const astrolabeTotal  = settings.advAstrolabePrice * settings.advAstrolabeCount;
  const gemBuyTotal     = settings.advGemCount * settings.advGemBuyPrice;
  const gemSellTotal    = settings.advGemCount * settings.advGemSellPrice;
  const gemNetPL        = gemSellTotal - gemBuyTotal;

  useEffect(() => {
    if (settings.divinePrice === 0 || settings.divinePrice === 200) initDivinePrice();
  }, []);

  const handleFetchPrice = async () => {
    setFetchingPrice(true);
    updateSetting('divinePrice', 0);
    await initDivinePrice();
    setFetchingPrice(false);
  };

  const baseMapFilled   = settings.baseMapCost > 0;
  const chiselFilled    = !!settings.chiselType && settings.chiselPrice > 0;
  const rollingFilled   = settings.advChaos > 0 || settings.advExaltPrice > 0 || settings.advScourPrice > 0 || settings.advAlchPrice > 0;
  const deliFilled      = deliPerMap > 0;
  const astrolabeFilled = astrolabeTotal > 0;
  const gemFilled       = settings.advGemCount > 0;
  const splitFilled     = isSplit;

  return (
    <>
      <Modal opened={advOpen} onClose={closeAdv} title="Advanced Costs" size="md"
        styles={{ body: { maxHeight: '78vh', overflowY: 'auto' } }}>
        <Stack gap={4} pb="md">
          <Alert color="blue" variant="light" p="xs">
            <Text size="xs">Use <Text span c="yellow">.7d</Text> for divine prices. Click a section to expand. Rolling Cost updates live.</Text>
          </Alert>
          <AdvSection title="Base Map Cost" filled={baseMapFilled}>
            <PriceInput value={settings.baseMapCost} onChange={(v) => updateSetting('baseMapCost', v)} divinePrice={divinePrice} placeholder="e.g. 900c" />
          </AdvSection>
          <AdvSection title="Chisel" filled={chiselFilled}>
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <Select label="Type" data={CHISEL_SELECT_DATA} value={settings.chiselType || null}
                onChange={(v) => { const t = v ?? ''; updateSetting('chiselType', t); updateSetting('chiselUsed', t.length > 0); }}
                size="xs" clearable placeholder="— None —" />
              <PriceInput label="Price per map" value={settings.chiselPrice}
                onChange={(v) => updateSetting('chiselPrice', v)} divinePrice={divinePrice}
                placeholder={settings.chiselType ? 'e.g. 150c' : '—'} />
            </SimpleGrid>
          </AdvSection>
          <AdvSection title="Rolling Costs" filled={rollingFilled}>
            <Text size="xs" c="dimmed">Orbs spent rolling maps this session. Enter total quantity bought + total chaos paid.</Text>
            <SimpleGrid cols={3}>
              <Text size="xs" fw={600} c="dimmed">Item</Text>
              <Text size="xs" fw={600} c="dimmed">Qty bought</Text>
              <Text size="xs" fw={600} c="dimmed">Total paid</Text>
            </SimpleGrid>
            <SimpleGrid cols={3} style={{ alignItems: 'center' }}>
              <Text size="xs">Chaos</Text>
              <NumberInput size="xs" value={settings.advChaos} onChange={(v) => updateAdvSetting('advChaos', Number(v))} min={0} />
              <Text size="xs" c="dimmed">{settings.advChaos}c</Text>
            </SimpleGrid>
            <SimpleGrid cols={3} style={{ alignItems: 'flex-end' }}>
              <Text size="xs">Exalted</Text>
              <NumberInput size="xs" value={settings.advExalt} onChange={(v) => updateAdvSetting('advExalt', Number(v))} min={0} />
              <PriceInput value={settings.advExaltPrice} onChange={(v) => updateAdvSetting('advExaltPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
            </SimpleGrid>
            {settings.advExalt > 0 && settings.advExaltPrice > 0 && <Text size="xs" c="dimmed">→ {(settings.advExaltPrice / settings.advExalt).toFixed(2)}c each</Text>}
            <SimpleGrid cols={3} style={{ alignItems: 'flex-end' }}>
              <Text size="xs">Scour</Text>
              <NumberInput size="xs" value={settings.advScour} onChange={(v) => updateAdvSetting('advScour', Number(v))} min={0} />
              <PriceInput value={settings.advScourPrice} onChange={(v) => updateAdvSetting('advScourPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
            </SimpleGrid>
            <SimpleGrid cols={3} style={{ alignItems: 'flex-end' }}>
              <Text size="xs">Alch</Text>
              <NumberInput size="xs" value={settings.advAlch} onChange={(v) => updateAdvSetting('advAlch', Number(v))} min={0} />
              <PriceInput value={settings.advAlchPrice} onChange={(v) => updateAdvSetting('advAlchPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
            </SimpleGrid>
          </AdvSection>
          <AdvSection title="Delirium Orbs" filled={deliFilled}>
            <Select label="Orb Type" data={DELIRIUM_ORB_LIST} value={settings.advDeliOrbType || null}
              onChange={(v) => updateAdvSetting('advDeliOrbType', v ?? '')} size="xs" placeholder="Type to search..." searchable clearable />
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <NumberInput label="Per map (1–5)" size="xs" value={settings.advDeliOrbQtyPerMap}
                onChange={(v) => updateAdvSetting('advDeliOrbQtyPerMap', Number(v))} min={0} max={5} />
              <PriceInput label="Price each" value={settings.advDeliOrbPriceEach}
                onChange={(v) => updateAdvSetting('advDeliOrbPriceEach', v)} divinePrice={divinePrice} placeholder="e.g. 0.5d" />
            </SimpleGrid>
            {deliPerMap > 0 && <Text size="xs" c="teal">→ {deliPerMap.toFixed(2)}c per map</Text>}
          </AdvSection>
          <AdvSection title="Astrolabe" filled={astrolabeFilled}>
            <Text size="xs" c="dimmed">Random duration. Enter price each + count used this session.</Text>
            <Select label="Type" data={ASTROLABE_LIST} value={settings.advAstrolabeType || null}
              onChange={(v) => updateAdvSetting('advAstrolabeType', v ?? '')} size="xs" placeholder="Select astrolabe..." clearable />
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <PriceInput label="Price each" value={settings.advAstrolabePrice}
                onChange={(v) => updateAdvSetting('advAstrolabePrice', v)} divinePrice={divinePrice} placeholder="e.g. 1d" />
              <NumberInput label="Count used" size="xs" value={settings.advAstrolabeCount}
                onChange={(v) => updateAdvSetting('advAstrolabeCount', Number(v))} min={0} />
            </SimpleGrid>
            {astrolabeTotal > 0 && <Text size="xs" c="teal">→ {astrolabeTotal.toFixed(1)}c total ({settings.advAstrolabeCount} × {settings.advAstrolabePrice.toFixed(1)}c)</Text>}
          </AdvSection>
          <AdvSection title="Gem Leveling" filled={gemFilled}>
            <Text size="xs" c="dimmed">
              Tracked separately — gem buy cost and sell value are both excluded from map profit.
              Enter the gem name to auto-exclude matching items when you import a loot CSV.
            </Text>
            <TextInput
              label="Gem name (for auto-exclusion)"
              description="Partial match: 'Empower' will exclude all 'Empower Support' entries from CSV"
              placeholder="e.g. Empower Support"
              value={settings.advGemName}
              onChange={(e) => updateAdvSetting('advGemName', e.currentTarget.value)}
              size="xs"
            />
            <NumberInput label="Gems leveled" size="xs" value={settings.advGemCount}
              onChange={(v) => updateAdvSetting('advGemCount', Number(v))} min={0} />
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <PriceInput label="Buy price each (lvl 1)" value={settings.advGemBuyPrice}
                onChange={(v) => updateAdvSetting('advGemBuyPrice', v)} divinePrice={divinePrice}
                placeholder="e.g. 100c" />
              <PriceInput label="Sell price each (leveled)" value={settings.advGemSellPrice}
                onChange={(v) => updateAdvSetting('advGemSellPrice', v)} divinePrice={divinePrice}
                placeholder="e.g. 300c" />
            </SimpleGrid>
            {settings.advGemCount > 0 && (
              <Stack gap={2} pt={2}>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Buy cost total</Text>
                  <Text size="xs" c="red">{gemBuyTotal.toFixed(0)}c</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">Sell value total</Text>
                  <Text size="xs" c="teal">{gemSellTotal.toFixed(0)}c</Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" fw={700}>Net gem P&amp;L</Text>
                  <Text size="xs" fw={700} c={gemNetPL >= 0 ? 'green' : 'red'}>
                    {gemNetPL >= 0 ? '+' : ''}{gemNetPL.toFixed(0)}c
                  </Text>
                </Group>
                {settings.advGemName && (
                  <Text size="xs" c="violet" style={{ fontStyle: 'italic' }}>
                    CSV auto-excludes: "{settings.advGemName}"
                  </Text>
                )}
              </Stack>
            )}
          </AdvSection>
          <AdvSection title="Split Session" filled={splitFilled}>
            <Text size="xs" c="dimmed">Running split maps? Each map is split from a base map (costs 1 split op). Formula: (map + chisel + split cost) ÷ 2 per map. Deli orbs and rolling costs are NOT halved.</Text>
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <PriceInput label="Price per split" description="beast ≈ 1–2c, fossil varies"
                value={settings.advSplitPrice} onChange={(v) => updateAdvSetting('advSplitPrice', v)}
                divinePrice={divinePrice} placeholder="0 = disabled" />
              <Stack gap={0}>
                <Text size="xs" fw={500}>Splits needed</Text>
                <Text size="xs" c="dimmed" mt={2}>
                  {maps.length > 0 ? `${Math.ceil(maps.length / 2)} (${maps.length} maps ÷ 2)` : 'parse maps first'}
                </Text>
              </Stack>
            </SimpleGrid>
            {isSplit && <Text size="xs" c="teal">→ +{(settings.advSplitPrice / 2).toFixed(2)}c/map</Text>}
          </AdvSection>
          <Divider />
          <Group justify="space-between">
            <Text size="sm" fw={700}>Rolling Cost (session total)</Text>
            <Text size="sm" fw={700} c="orange">{settings.rollingCostPerMap.toFixed(2)}c</Text>
          </Group>
          <Button color="blue" onClick={closeAdv}>Done</Button>
        </Stack>
      </Modal>

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ overflow: 'auto' }}>
        <Group justify="space-between" mb={8}>
          <Text fw={700} size="sm">Investment</Text>
          <Group gap={4}>
            <Tooltip label="Reset all costs (keeps divine price)">
              <ActionIcon size="xs" variant="subtle" color="red"
                onClick={() => {
                  updateSetting('baseMapCost', 0);
                  updateSetting('chiselUsed', false);
                  updateSetting('chiselType', '');
                  updateSetting('chiselPrice', 0);
                  updateSetting('scarabs', Array(5).fill(null).map(() => ({ name: '', cost: 0 })));
                  updateAdvSetting('advChaos', 0);
                  updateAdvSetting('advExalt', 0);
                  updateAdvSetting('advExaltPrice', 0);
                  updateAdvSetting('advScour', 0);
                  updateAdvSetting('advScourPrice', 0);
                  updateAdvSetting('advAlch', 0);
                  updateAdvSetting('advAlchPrice', 0);
                  updateAdvSetting('advDeliOrbType', '');
                  updateAdvSetting('advDeliOrbQtyPerMap', 0);
                  updateAdvSetting('advDeliOrbPriceEach', 0);
                  updateAdvSetting('advSplitPrice', 0);
                  updateAdvSetting('advAstrolabeType', '');
                  updateAdvSetting('advAstrolabePrice', 0);
                  updateAdvSetting('advAstrolabeCount', 0);
                  updateAdvSetting('advGemCount', 0);
                  updateAdvSetting('advGemBuyPrice', 0);
                  updateAdvSetting('advGemSellPrice', 0);
                  updateAdvSetting('advGemName', '');
                }}>
                <FaTimes size={9} />
              </ActionIcon>
            </Tooltip>
            <Badge color="red" variant="light">{totalPerMapFull.toFixed(1)}c/map</Badge>
          </Group>
        </Group>

        <Stack gap={6}>
          {/* ── Costs box ─────────────────────────────────── */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '10px 12px',
          }}>
            {/* Two equal columns — label on top, control below, all centered */}
            <Group grow gap="md" mb={8} align="flex-start">
              {/* Divine Price */}
              <Stack gap={4} align="center">
                <Text size="xs" c="dimmed">Divine Price</Text>
                {/* Input + icon on same row, input fills available space */}
                <Group gap={4} align="center" wrap="nowrap" style={{ width: '100%' }}>
                  <NumberInput
                    value={settings.divinePrice}
                    onChange={(v) => updateSetting('divinePrice', Number(v))}
                    suffix="c" size="sm" hideControls style={{ flex: 1 }}
                    styles={{ input: { textAlign: 'center', fontWeight: 700, fontSize: 14 } }}
                  />
                  <ActionIcon size="sm" variant="subtle" color="blue" loading={fetchingPrice}
                    onClick={handleFetchPrice} title="Fetch from poe.ninja" style={{ flexShrink: 0 }}>
                    <FaSync size={10} />
                  </ActionIcon>
                </Group>
              </Stack>

              {/* Total Cost (was Rolling Cost) */}
              <Stack gap={4} align="center">
                <Text size="xs" c="dimmed">Total Cost</Text>
                <div style={{
                  height: 34, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(255,255,255,0.05)', borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                  <Text fw={700} style={{
                    fontSize: 14, fontVariantNumeric: 'tabular-nums',
                    color: settings.rollingCostPerMap > 0 ? '#fd7e14' : '#555',
                  }}>
                    {settings.rollingCostPerMap > 0 ? `${settings.rollingCostPerMap.toFixed(0)}c` : '—'}
                  </Text>
                </div>
              </Stack>
            </Group>

            <Button variant="light" color="blue" fullWidth size="xs" onClick={openAdv}>
              ⚙ Advanced Costs
            </Button>
          </div>

          {/* Active cost indicators — CENTERED */}
          {(settings.chiselType || isSplit || deliPerMap > 0 || astrolabeTotal > 0) && (
            <Group gap={4} wrap="wrap" justify="center">
              {settings.chiselType && (
                <Badge size="xs" color="yellow" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                  🪨 {settings.chiselType}{settings.chiselPrice > 0 ? ` ${settings.chiselPrice}c` : ''}
                </Badge>
              )}
              {isSplit && (
                <Badge size="xs" color="cyan" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                  ✂ Split {settings.advSplitPrice}c
                </Badge>
              )}
              {deliPerMap > 0 && (
                <Badge size="xs" color="grape" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                  🌫 Deli {deliPerMap.toFixed(1)}c
                </Badge>
              )}
              {astrolabeTotal > 0 && (
                <Badge size="xs" color="teal" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                  Astro {astrolabeTotal.toFixed(0)}c
                </Badge>
              )}
              {oneTimeScarabs > 0 && (
                <Badge size="xs" color="teal" variant="outline">
                  🔒 Preserved {oneTimeScarabs.toFixed(0)}c
                </Badge>
              )}
            </Group>
          )}

          {/* Gem P&L — separate row, not mixed with investment */}
          {settings.advGemCount > 0 && (
            <Group gap={4} justify="center">
              <Badge size="xs" color={gemNetPL >= 0 ? 'green' : 'red'} variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                Gems: {gemNetPL >= 0 ? '+' : ''}{gemNetPL.toFixed(0)}c net ({settings.advGemCount} leveled)
              </Badge>
            </Group>
          )}

          <Divider label={
            <Group gap={4}>
              <Text size="xs" c="dimmed">Scarabs</Text>
              {hasPreservation && (
                <Tooltip
                  label="Horned Scarab of Preservation detected — only Preservation scarabs are counted per-map. All other scarabs are treated as a one-time cost."
                  withArrow multiline w={240}>
                  <Text size="xs" c="teal" style={{ cursor: 'help' }}>🔒 preservation active</Text>
                </Tooltip>
              )}
            </Group>
          } />
          <Group gap="xs" align="flex-end">
            <TextInput placeholder="Preset name" value={presetName}
              onChange={(e) => setPresetName(e.currentTarget.value)} size="xs" style={{ flex: 1 }} />
            <Button size="xs" variant="light" disabled={!presetName.trim()}
              onClick={() => { saveScarabPreset(presetName.trim()); setPresetName(''); }}>
              <FaSave size={10} />
            </Button>
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
            <Group key={i} gap={4} wrap="nowrap">
              <Autocomplete placeholder={`Scarab ${i + 1}`} value={scarab.name}
                onChange={(v) => updateScarab(i, 'name', v)}
                data={SCARAB_LIST} size="xs" style={{ flex: 1, minWidth: 0 }}
                rightSection={scarab.name
                  ? <ActionIcon size="xs" variant="transparent" c="dimmed"
                      onMouseDown={(e) => { e.preventDefault(); clearScarab(i); }}>
                      <FaTimes size={8} />
                    </ActionIcon>
                  : undefined}
                rightSectionPointerEvents={scarab.name ? 'all' : 'none'}
              />
              <PriceInput value={scarab.cost} onChange={(v) => updateScarab(i, 'cost', v)}
                divinePrice={divinePrice} placeholder="0c" style={{ width: 100, flexShrink: 0 }} />
            </Group>
          ))}
        </Stack>
      </Card>
    </>
  );
};
