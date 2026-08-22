import {
  Card, Text, NumberInput, Divider, Group, Stack,
  Select, Button, Modal, SimpleGrid, Autocomplete, Badge,
  ActionIcon, TextInput, Menu, Alert, Tooltip,
} from '@mantine/core';
import { useDisclosure, useElementSize } from '@mantine/hooks';
import { useState, useEffect, useMemo } from 'react';
import { useSessionKeys } from '../store/useSessionStore';
import {
  shouldShowMechanicInput, selectableAstrolabeList,
  selectableChiselList, selectableDeliriumOrbList, selectableScarabOptions,
  preserveHistoricalSelection,
} from '../utils/gameData';
import { parsePriceInput } from '../utils/priceUtils';
import { computeCosts } from '../utils/profit';
import { fcSep } from '../utils/parseDiscordExport';
import { KNOWN_LEAGUES, confirmedLeagueSync, fetchSelectableLeagues, currentLeagueSync } from '../utils/league';
import { isCrossLeagueSession, isLiveSessionLeagueMismatch } from '../utils/historicalSession';
import { chiselItemName, deliOrbItemName } from '../utils/itemIcons';
import { PoeItemIcon } from '../components/ui/PoeItemIcon';
import { IconTrash, IconDeviceFloppy, IconChevronDown, IconRefresh, IconX, IconSettings, IconLock } from '@tabler/icons-react';
import { CollapsibleSection } from '../components/ui/CollapsibleSection';
import { COLOR, FONT } from '../utils/uiTokens'
import { MAP_DEVICE_SLOT_COUNT } from '../../../shared/mapDevice';
import { usePanelMaximized } from '../layout/panelLayoutContext';

const AdvSection = ({ title, filled, children }: {
  title: string; filled: boolean; children: React.ReactNode;
}) => (
  <CollapsibleSection title={title} variant="group" filled={filled}>
    {children}
  </CollapsibleSection>
);

const PriceInput = ({
  label, description, value, onChange, divinePrice, placeholder = '0', style, size = 'xs',
}: {
  label?: string; description?: string; value: number;
  onChange: (v: number) => void; divinePrice: number;
  placeholder?: string; style?: React.CSSProperties; size?: 'xs' | 'sm';
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
      style={style} size={size} />
  );
};

export const InvestmentModule = ({ embedded = false }: { embedded?: boolean } = {}) => {
  const panelIsMaximized = usePanelMaximized('investment');
  const isMaximized = !embedded && panelIsMaximized;
  const { ref: panelRef, width: panelWidth } = useElementSize();
  const compactPanel = panelWidth > 0 && panelWidth < 310;
  const {
    maps, settings, updateSetting, updateAdvSetting, updateScarab, clearScarab, initDivinePrice,
    setDivinePriceManual, leagueOverride, setLeagueOverride, assignMissingSessionLeague,
    scarabPresets, saveScarabPreset, loadScarabPreset, deleteScarabPreset, sessionLifecycle, sessionNonce,
  } = useSessionKeys(
    'maps', 'settings', 'updateSetting', 'updateAdvSetting', 'updateScarab', 'clearScarab', 'initDivinePrice',
    'setDivinePriceManual', 'leagueOverride', 'setLeagueOverride', 'assignMissingSessionLeague',
    'scarabPresets', 'saveScarabPreset', 'loadScarabPreset', 'deleteScarabPreset', 'sessionLifecycle', 'sessionNonce',
  );
  const [advOpen, { open: openAdv, close: closeAdv }] = useDisclosure(false);
  const [presetSaveOpen, setPresetSaveOpen] = useState(false); // scarab preset "Save current as…" dialog
  const [presetSaveName, setPresetSaveName] = useState('');
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [confirmedActiveLeague, setConfirmedActiveLeague] = useState<string | null>(() => confirmedLeagueSync());
  const [hoveredReset, setHoveredReset] = useState(false); // reset-costs icon red hover (Sessions pattern)
  const [hoveredPresetTrashId, setHoveredPresetTrashId] = useState<string | null>(null); // preset delete red hover
  // League-override dropdown (rollover D4/D5). Options start with the curated
  // KNOWN_LEAGUES and are replaced by the poe.ninja index list on first
  // dropdown open (one attempt per mount; fetchSelectableLeagues falls back to
  // KNOWN_LEAGUES with a loud console.warn if the endpoint fails).
  const [leagueList, setLeagueList] = useState<string[]>(KNOWN_LEAGUES);
  const [leagueListRequested, setLeagueListRequested] = useState(false);
  const [pendingSessionLeague, setPendingSessionLeague] = useState<string | null>(null);
  const loadLeagueOptions = async () => {
    if (leagueListRequested) return;
    setLeagueListRequested(true);
    setLeagueList(await fetchSelectableLeagues());
  };
  const historical = sessionLifecycle === 'historical';
  const leagueOptions = useMemo(() => {
    const names = [...leagueList];
    // The persisted override must always be selectable, even if the index
    // no longer lists it (e.g. an ended event league).
    if (leagueOverride && !names.includes(leagueOverride)) names.unshift(leagueOverride);
    if (settings.leagueName && !names.includes(settings.leagueName)) names.unshift(settings.leagueName);
    return [
      {
        value: '',
        label: historical
          ? 'Unassigned session'
          : (!leagueOverride && settings.leagueName ? `Auto: ${settings.leagueName}` : 'Auto-detect'),
      },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  }, [historical, leagueList, leagueOverride, settings.leagueName]);
  const leagueSelectValue = historical
    ? settings.leagueName
    : (leagueOverride ?? '');
  const handleLeagueChange = (value: string | null): void => {
    const next = value || null;
    if (!historical) {
      setLeagueOverride(next);
      return;
    }
    if (!settings.leagueName.trim() && next) setPendingSessionLeague(next);
  };

  const divinePrice = settings.divinePrice || 1;
  const scarabOptions = selectableScarabOptions();
  const deliriumOrbOptions = preserveHistoricalSelection(
    selectableDeliriumOrbList(), settings.advDeliOrbType,
  );
  const astrolabeOptions = preserveHistoricalSelection(
    selectableAstrolabeList(), settings.advAstrolabeType,
  );
  const chiselOptions = preserveHistoricalSelection(
    selectableChiselList(), settings.chiselType,
  );

  // All cost math lives in utils/profit.ts (WP1). The session total is derived
  // LIVE from settings + map count — the stored settings.rollingCostPerMap was
  // stale (froze at the map count of the last Advanced Costs edit) and is
  // removed in store migration v16.
  const mapCount = maps.length || 1;
  const costs = computeCosts(settings, mapCount);
  const { hasPreservation, oneTimeScarabs, rollingSessionTotal } = costs;
  const isSplit         = settings.advSplitPrice > 0;
  // ALL-IN cost per map: total investment (incl. one-time scarabs and session
  // costs) spread over parsed maps — badge x maps always equals the Dashboard's
  // Investment figure. One definition, no gaps.
  const totalPerMapFull = costs.totalInvest / mapCount;
  const deliPerMap      = settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach;
  const astrolabeTotal  = settings.advAstrolabePrice * settings.advAstrolabeCount;
  // Mechanic gate (rollover §5.3): if 3.29 removes astrolabes, hide the NEW-input
  // section — UNLESS this session already has astrolabe data, so an in-progress
  // session is never disrupted mid-edit (read-time visibility, non-destructive).
  const astrolabeHasData = !!settings.advAstrolabeType || settings.advAstrolabeCount > 0 || settings.advAstrolabePrice > 0;
  const showAstrolabe   = shouldShowMechanicInput('astrolabe', astrolabeHasData);
  // 3.29 removed both map-splitting methods. New sessions no longer offer the
  // input, but historical sessions with a recorded split cost retain it.
  const showSplit       = shouldShowMechanicInput('split', isSplit);
  const gemBuyTotal     = settings.advGemCount * settings.advGemBuyPrice;
  const gemSellTotal    = settings.advGemCount * settings.advGemSellPrice;
  const gemNetPL        = gemSellTotal - gemBuyTotal;

  // Auto-init on mount. The unset/legacy-200/30-min-staleness guard lives in
  // the store (WP4.2); the 60s cooldown in tryFetchDivinePrice prevents remount
  // retry storms when poe.ninja is unreachable.
  useEffect(() => {
    initDivinePrice();
  }, []);

  // Re-fetch when a new session is started (activeSessionId transitions to null)
  // so the price stays fresh without requiring a manual refresh.
  useEffect(() => {
    if (sessionLifecycle !== 'live') return;
    let active = true;
    void initDivinePrice().finally(() => {
      if (active) setConfirmedActiveLeague(confirmedLeagueSync());
    });
    return () => { active = false; };
  }, [sessionLifecycle, leagueOverride, sessionNonce, initDivinePrice]);

  // Manual refresh button: bypasses the cooldown via { force: true }, since
  // an explicit user action shouldn't be silently skipped.
  // Phase 1.5 (2026-07-11): on a LOADED saved session this becomes an
  // explicit, confirmed "reprice" action (the store guard blocks everything
  // else). The old pre-zeroing of divinePrice is GONE — fetch-first, a
  // failed fetch must never destroy a valid price.
  const [repriceConfirmOpen, setRepriceConfirmOpen] = useState(false);
  const handleFetchPrice = async () => {
    if (historical) { setRepriceConfirmOpen(true); return; }
    setFetchingPrice(true);
    await initDivinePrice({ force: true });
    setConfirmedActiveLeague(confirmedLeagueSync());
    setFetchingPrice(false);
  };
  const confirmReprice = async () => {
    setRepriceConfirmOpen(false);
    setFetchingPrice(true);
    await initDivinePrice({ force: true, repriceLoaded: true });
    setFetchingPrice(false);
  };
  // Cross-league loaded session (e.g. an Ancestors session opened under
  // 3.29): show the historical banner. The price guard above is stricter
  // (any loaded session); this banner only flags the league mismatch case.
  const crossLeague = isCrossLeagueSession(sessionLifecycle, settings.leagueName);
  const liveLeagueMismatch = isLiveSessionLeagueMismatch(sessionLifecycle, settings.leagueName);
  // Keep the historical-session status inside the existing price label. A
  // standalone badge costs a whole row in short stacked FlexLayout panels.
  const historicalDivinePriceLabel = settings.leagueName
    ? `${settings.leagueName} Divine Price`
    : 'Historical Divine Price';
  const compactHistoricalDivinePriceLabel = settings.leagueName
    ? `${settings.leagueName} Divine`
    : 'Historical Divine';
  const historicalPriceTooltip = `Historical session — divine price, league and atlas points are frozen. Live refreshes never touch this loaded session. Start a new session to track ${currentLeagueSync() ?? 'the current league'}.`;

  const baseMapFilled   = settings.baseMapCost > 0;
  const doPresetSave = () => {
    const name = presetSaveName.trim();
    if (!name) return;
    saveScarabPreset(name);
    setPresetSaveName('');
    setPresetSaveOpen(false);
  };
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
            <Text size="xs">Use <Text span c="yellow">.7d</Text> for divine prices. Click a section to expand. Session costs update live.</Text>
          </Alert>
          <AdvSection title="Base Map Cost" filled={baseMapFilled}>
            <PriceInput value={settings.baseMapCost} onChange={(v) => updateSetting('baseMapCost', v)} divinePrice={divinePrice} placeholder="e.g. 900c" />
          </AdvSection>
          <AdvSection title="Chisel" filled={chiselFilled}>
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <Select label="Type" data={chiselOptions} value={settings.chiselType || null}
                onChange={(v) => { const t = v ?? ''; updateSetting('chiselType', t); updateSetting('chiselUsed', t.length > 0); }}
                size="xs" clearable placeholder="— None —"
                leftSection={settings.chiselType ? <PoeItemIcon name={chiselItemName(settings.chiselType)} size={16} category="chisel" /> : undefined}
                renderOption={({ option }) => (
                  <Group gap={6} wrap="nowrap">
                    <PoeItemIcon name={chiselItemName(option.value)} size={16} category="chisel" />
                    <Text size="xs">{option.label}</Text>
                  </Group>
                )} />
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
              <Group gap={4} wrap="nowrap"><PoeItemIcon name="Chaos Orb" size={16} category="orb" /><Text size="xs">Chaos</Text></Group>
              <NumberInput size="xs" value={settings.advChaos} onChange={(v) => updateAdvSetting('advChaos', Number(v))} min={0} />
              <Text size="xs" c="dimmed">{settings.advChaos}c</Text>
            </SimpleGrid>
            <SimpleGrid cols={3} style={{ alignItems: 'center' }}>
              <Group gap={4} wrap="nowrap"><PoeItemIcon name="Exalted Orb" size={16} category="orb" /><Text size="xs">Exalted</Text></Group>
              <NumberInput size="xs" value={settings.advExalt} onChange={(v) => updateAdvSetting('advExalt', Number(v))} min={0} />
              <PriceInput value={settings.advExaltPrice} onChange={(v) => updateAdvSetting('advExaltPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
            </SimpleGrid>
            {settings.advExalt > 0 && settings.advExaltPrice > 0 && (
              // Per-orb caption lives in the grid too, under the Total paid
              // column — a full-width line here knocked the row icons out of
              // alignment (Sad observation 2026-07-10).
              <SimpleGrid cols={3}>
                <div /><div />
                <Text size="xs" c="dimmed">→ {(settings.advExaltPrice / settings.advExalt).toFixed(2)}c each</Text>
              </SimpleGrid>
            )}
            <SimpleGrid cols={3} style={{ alignItems: 'center' }}>
              <Group gap={4} wrap="nowrap"><PoeItemIcon name="Orb of Scouring" size={16} category="orb" /><Text size="xs">Scour</Text></Group>
              <NumberInput size="xs" value={settings.advScour} onChange={(v) => updateAdvSetting('advScour', Number(v))} min={0} />
              <PriceInput value={settings.advScourPrice} onChange={(v) => updateAdvSetting('advScourPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
            </SimpleGrid>
            <SimpleGrid cols={3} style={{ alignItems: 'center' }}>
              <Group gap={4} wrap="nowrap"><PoeItemIcon name="Orb of Alchemy" size={16} category="orb" /><Text size="xs">Alch</Text></Group>
              <NumberInput size="xs" value={settings.advAlch} onChange={(v) => updateAdvSetting('advAlch', Number(v))} min={0} />
              <PriceInput value={settings.advAlchPrice} onChange={(v) => updateAdvSetting('advAlchPrice', v)} divinePrice={divinePrice} placeholder="total paid" />
            </SimpleGrid>
          </AdvSection>
          <AdvSection title="Delirium Orbs" filled={deliFilled}>
            <Select label="Orb Type" data={deliriumOrbOptions} value={settings.advDeliOrbType || null}
              onChange={(v) => updateAdvSetting('advDeliOrbType', v ?? '')} size="xs" placeholder="Type to search..." searchable clearable
              leftSection={settings.advDeliOrbType ? <PoeItemIcon name={deliOrbItemName(settings.advDeliOrbType)} size={16} category="orb" /> : undefined}
              renderOption={({ option }) => (
                <Group gap={6} wrap="nowrap">
                  <PoeItemIcon name={deliOrbItemName(option.value)} size={16} category="orb" />
                  <Text size="xs">{option.label}</Text>
                </Group>
              )} />
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <NumberInput label="Per map (1–5)" size="xs" value={settings.advDeliOrbQtyPerMap}
                onChange={(v) => updateAdvSetting('advDeliOrbQtyPerMap', Number(v))} min={0} max={5} />
              <PriceInput label="Price each" value={settings.advDeliOrbPriceEach}
                onChange={(v) => updateAdvSetting('advDeliOrbPriceEach', v)} divinePrice={divinePrice} placeholder="e.g. 0.5d" />
            </SimpleGrid>
            <Text size="xs" c="teal" style={{ visibility: deliPerMap > 0 ? 'visible' : 'hidden' }} aria-hidden={deliPerMap <= 0}>
              → {deliPerMap.toFixed(2)}c per map
            </Text>
          </AdvSection>
          {showAstrolabe && (
          <AdvSection title="Astrolabe" filled={astrolabeFilled}>
            <Text size="xs" c="dimmed">Random duration. Enter price each + count used this session.</Text>
            <Select label="Type" data={astrolabeOptions} value={settings.advAstrolabeType || null}
              onChange={(v) => updateAdvSetting('advAstrolabeType', v ?? '')} size="xs" placeholder="Select astrolabe..." clearable
              leftSection={settings.advAstrolabeType ? <PoeItemIcon name={settings.advAstrolabeType} size={16} category="astrolabe" /> : undefined}
              renderOption={({ option }) => (
                <Group gap={6} wrap="nowrap">
                  <PoeItemIcon name={option.value} size={16} category="astrolabe" />
                  <Text size="xs">{option.label}</Text>
                </Group>
              )} />
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <PriceInput label="Price each" value={settings.advAstrolabePrice}
                onChange={(v) => updateAdvSetting('advAstrolabePrice', v)} divinePrice={divinePrice} placeholder="e.g. 1d" />
              <NumberInput label="Count used" size="xs" value={settings.advAstrolabeCount}
                onChange={(v) => updateAdvSetting('advAstrolabeCount', Number(v))} min={0} />
            </SimpleGrid>
            <Text size="xs" c="teal" style={{ visibility: astrolabeTotal > 0 ? 'visible' : 'hidden' }} aria-hidden={astrolabeTotal <= 0}>
              → {astrolabeTotal.toFixed(1)}c total ({settings.advAstrolabeCount} × {settings.advAstrolabePrice.toFixed(1)}c)
            </Text>
          </AdvSection>
          )}
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
              leftSection={settings.advGemName ? <PoeItemIcon name={settings.advGemName} size={16} category="gem" /> : undefined}
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
                    CSV auto-excludes: &quot;{settings.advGemName}&quot;
                  </Text>
                )}
              </Stack>
            )}
          </AdvSection>
          {showSplit && (
          <AdvSection title="Split Session" filled={splitFilled}>
            <Group gap={6} wrap="nowrap">
              {/* Fractured Fossil = the actual split fossil (session-16 review
                  correction; Shuddering was wrong). The beast-orb icon was
                  dropped: beasts aren't reliably in the economy icon cache and
                  a wrong/absent icon confuses more than it helps. */}
              <PoeItemIcon name="Fractured Fossil" size={16} />
              <Text size="xs" c="dimmed">Running split maps? Each map is split from a base map (costs 1 split op). Formula: (map + chisel + split cost) ÷ 2 per map. Deli orbs and rolling costs are NOT halved.</Text>
            </Group>
            <SimpleGrid cols={2} style={{ alignItems: 'flex-end' }}>
              <PriceInput label="Price per split" description="cost of your split method (beast or fossil)"
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
          )}
          <Divider />
          <Group justify="space-between">
            <Text size="sm" fw={700}>Session costs (total)</Text>
            <Text size="sm" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }}>{fcSep(rollingSessionTotal, false, 2)}</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Chaos, exalt, scour, alch, astrolabes, and delirium orbs ({settings.advDeliOrbQtyPerMap > 0 ? `${deliPerMap.toFixed(0)}c/map × ${maps.length || 1} maps` : 'none'}). Updates live as maps are parsed.
          </Text>
          <Button color="blue" onClick={closeAdv}>Done</Button>
        </Stack>
      </Modal>

      {/* ── Scarab-preset save modal (name only; Sad 2026-07-09 — replaces the
          always-visible name field, consolidated with Load into one menu) ── */}
      <Modal opened={presetSaveOpen} onClose={() => { setPresetSaveOpen(false); setPresetSaveName(''); }} title="Save Scarab Preset" size="sm">
        <Stack gap="sm">
          <TextInput label="Name" placeholder="e.g. Deli farming" autoFocus
            value={presetSaveName} onChange={(e) => setPresetSaveName(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && doPresetSave()} />
          <Text size="xs" c="dimmed">
            {settings.scarabs.filter((s) => s.name.trim()).map((s) => s.name).join(', ') || 'No scarabs set'}
          </Text>
          <Button onClick={doPresetSave} disabled={!presetSaveName.trim()}>Save</Button>
        </Stack>
      </Modal>

      {/* Phase 1.5: explicit reprice confirmation for LOADED sessions — the
          only sanctioned way live prices reach a saved session's economics. */}
      <Modal opened={repriceConfirmOpen} onClose={() => setRepriceConfirmOpen(false)}
        title="Reprice saved session?" size="sm">
        <Stack gap="sm">
          <Text size="xs">
            This is a saved session{settings.leagueName ? ` from the ${settings.leagueName} league` : ''}.
            Fetching the current divine price will change its historical
            profit numbers. The session&apos;s league is never changed.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setRepriceConfirmOpen(false)}>Cancel</Button>
            <Button size="xs" color="yellow" onClick={confirmReprice}>Reprice using current economy</Button>
          </Group>
        </Stack>
      </Modal>

      <Modal opened={pendingSessionLeague !== null} onClose={() => setPendingSessionLeague(null)}
        title="Assign league to saved session?" size="sm">
        <Stack gap="sm">
          <Text size="xs">
            This saved session has no recorded league. Assigning {pendingSessionLeague ?? 'this league'}
            {' '}repairs that missing provenance and unlocks sharing. It does not change historical prices,
            and a recorded league cannot be reassigned here later.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button size="xs" variant="default" onClick={() => setPendingSessionLeague(null)}>Cancel</Button>
            <Button size="xs" onClick={() => {
              if (pendingSessionLeague) assignMissingSessionLeague(pendingSessionLeague);
              setPendingSessionLeague(null);
            }}>
              Assign {pendingSessionLeague ?? 'league'}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Card
        ref={panelRef}
        shadow={embedded ? undefined : 'sm'}
        padding={embedded ? 0 : (isMaximized ? 'md' : 'sm')}
        radius="md"
        withBorder={!embedded}
        h={embedded ? 'auto' : '100%'}
        style={{ background: embedded ? 'transparent' : undefined, overflow: embedded ? 'visible' : 'auto' }}
      >
        <Group justify="space-between" mb={isMaximized ? 12 : 8} wrap="nowrap" gap={compactPanel ? 4 : 'md'}>
          {/* Panel title removed (redundant with the tab label — same call as the
              Sessions panel). The header slot hosts the league override instead
              (rollover D4/D5): '' = auto-detect via poe.ninja probe; anything
              else bypasses the probe entirely — including the D5 case of
              detection sticking on an ended event. */}
          <Select
            size={isMaximized ? 'sm' : 'xs'} searchable
            data={leagueOptions}
            value={leagueSelectValue}
            onChange={handleLeagueChange}
            onDropdownOpen={loadLeagueOptions}
            comboboxProps={{ withinPortal: true }}
            disabled={historical && !!settings.leagueName.trim()}
            title={historical
              ? (settings.leagueName.trim()
                ? 'Saved-session league provenance is fixed and cannot be reassigned here'
                : 'Choose the league once to repair this saved session\'s missing provenance')
              : 'League — leave on Auto unless detection picks the wrong league'}
            style={{ width: compactPanel ? undefined : (isMaximized ? 220 : 170), minWidth: 0, flex: compactPanel ? 1 : undefined }}
          />
          <Group gap={4} style={{ marginLeft: 'auto' }}>
            <Tooltip label="All-in cost per map: total investment (base map + chisel + scarabs incl. one-time + session costs) divided by parsed maps. Equals Dashboard Investment / maps.">
              <Badge size={isMaximized ? 'md' : 'sm'} color="gray" variant="outline" style={{ fontVariantNumeric: 'tabular-nums' }}>{totalPerMapFull.toFixed(1)}c/map</Badge>
            </Tooltip>
          </Group>
        </Group>

        <Stack gap={isMaximized ? 10 : 6}>
          {liveLeagueMismatch && (
            <Alert color="yellow" variant="light" p="xs" title="Previous-league working session">
              <Text size={isMaximized ? 'sm' : 'xs'}>
                This session belongs to {settings.leagueName}. Automatic league and divine-price updates are paused
                {confirmedActiveLeague ? ` while ${confirmedActiveLeague} is active` : ''}. Use Sessions to save it or start a new session.
              </Text>
            </Alert>
          )}
          {/* ── Costs box ─────────────────────────────────── */}
          <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: compactPanel ? '6px 8px' : (isMaximized ? '14px 16px' : '10px 12px'),
          }}>
            {/* Two equal columns — label on top, control below, all centered */}
            <Group grow gap={compactPanel ? 6 : 'md'} mb={compactPanel ? 6 : (isMaximized ? 12 : 8)} align="flex-start">
              {/* Divine Price */}
              <Stack gap={4} align="center">
                {crossLeague ? (
                  <Tooltip label={historicalPriceTooltip} withArrow multiline w={280}>
                    <Text size={isMaximized ? 'sm' : 'xs'} c="yellow" style={{ cursor: 'help' }}>{compactPanel ? compactHistoricalDivinePriceLabel : historicalDivinePriceLabel}</Text>
                  </Tooltip>
                ) : (
                  <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed">Divine Price</Text>
                )}
                {/* Input + icon on same row, input fills available space */}
                {/* session-16: refresh lives INSIDE the price input (it belongs to
                    that value; also removes the uneven spacing vs Session costs) */}
                <NumberInput
                  value={settings.divinePrice}
                  onChange={(v) => setDivinePriceManual(Number(v))}
                  suffix="c" size={isMaximized ? 'md' : 'sm'} hideControls style={{ width: '100%' }}
                  styles={{ input: { textAlign: 'center', fontWeight: 700, fontSize: FONT.stat } }}
                  rightSection={
                    <ActionIcon size="sm" variant="subtle" color="gray" loading={fetchingPrice}
                      onClick={handleFetchPrice} aria-label="Fetch divine price from poe.ninja"
                      title="Fetch from poe.ninja">
                      <IconRefresh size={13} />
                    </ActionIcon>
                  }
                  rightSectionPointerEvents="all"
                />
              </Stack>

              {/* Session costs — live derived total of Advanced Costs (WP1) */}
              <Stack gap={4} align="center">
                <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed">Session costs</Text>
                {/* session-16: match the Divine Price input's surface (dark-6/dark-4)
                    and drop the orange value — both boxes now read as one family */}
                <div style={{
                  height: isMaximized ? 42 : 34, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--mantine-color-dark-6)', borderRadius: 4,
                  border: '1px solid var(--mantine-color-dark-4)',
                }}>
                  <Text fw={700} style={{
                    fontSize: FONT.stat, fontVariantNumeric: 'tabular-nums',
                    color: rollingSessionTotal > 0 ? COLOR.text : COLOR.dim,
                  }}>
                    {rollingSessionTotal > 0 ? fcSep(rollingSessionTotal) : '—'}
                  </Text>
                </div>
              </Stack>
            </Group>

            {/* session-16: the reset lives IN the box it resets, beside the
                button that configures those costs (Sad asked for in-box; the
                literal top-right corner would collide with the centered
                column labels — flag it if this placement doesn't read). */}
            <Group gap={4} wrap="nowrap">
              {/* session-17 review: variant="default" — the blue light button
                  was the odd one out vs the reference language (neutral
                  surfaces; colour = status/destructive-hover only). */}
              <Button variant="default" size={isMaximized ? 'sm' : 'xs'} leftSection={<IconSettings size={12} />} onClick={openAdv} style={{ flex: 1 }}>
                Advanced Costs
              </Button>
              <Tooltip label="Reset all costs (keeps divine price)">
                <ActionIcon size={isMaximized ? 36 : 30} variant="default" aria-label="Reset all costs"
                  onMouseEnter={() => setHoveredReset(true)}
                  onMouseLeave={() => setHoveredReset(false)}
                  style={hoveredReset ? { color: 'var(--mantine-color-red-4)', borderColor: 'var(--mantine-color-red-7)' } : undefined}
                  onClick={() => {
                    setHoveredReset(false);
                    updateSetting('baseMapCost', 0);
                    updateSetting('chiselUsed', false);
                    updateSetting('chiselType', '');
                    updateSetting('chiselPrice', 0);
                    updateSetting('scarabs', Array(MAP_DEVICE_SLOT_COUNT).fill(null).map(() => ({ name: '', cost: 0 })));
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
                  <IconTrash size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </div>

          {/* Active cost indicators — CENTERED */}
          {(settings.chiselType || isSplit || deliPerMap > 0 || astrolabeTotal > 0) && (
            <Group gap={4} wrap="wrap" justify="center">
              {settings.chiselType && (
                <Badge size="sm" color="yellow" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}
                  leftSection={<PoeItemIcon name={chiselItemName(settings.chiselType)} size={16} category="chisel" />}>
                  {settings.chiselType}{settings.chiselPrice > 0 ? ` ${settings.chiselPrice}c` : ''}
                </Badge>
              )}
              {isSplit && (
                <Badge size="sm" color="cyan" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                  Split {settings.advSplitPrice}c
                </Badge>
              )}
              {deliPerMap > 0 && (
                <Badge size="sm" color="grape" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}
                  leftSection={<PoeItemIcon name={deliOrbItemName(settings.advDeliOrbType)} size={16} category="orb" />}>
                  Deli {deliPerMap.toFixed(1)}c
                </Badge>
              )}
              {astrolabeTotal > 0 && (
                <Badge size="sm" color="teal" variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}
                  leftSection={<PoeItemIcon name={settings.advAstrolabeType} size={16} category="astrolabe" />}>
                  Astro {astrolabeTotal.toFixed(0)}c
                </Badge>
              )}
              {oneTimeScarabs > 0 && (
                <Badge size="sm" color="teal" variant="outline" leftSection={<IconLock size={11} />}>
                  Preserved {oneTimeScarabs.toFixed(0)}c
                </Badge>
              )}
            </Group>
          )}

          {/* Gem P&L — separate row, not mixed with investment */}
          {settings.advGemCount > 0 && (
            <Group gap={4} justify="center">
              <Badge size="sm" color={gemNetPL >= 0 ? 'green' : 'red'} variant="light" style={{ cursor: 'pointer' }} onClick={openAdv}>
                Gems: {gemNetPL >= 0 ? '+' : ''}{gemNetPL.toFixed(0)}c net ({settings.advGemCount} leveled)
              </Badge>
            </Group>
          )}

          <div style={{
            alignItems: 'center',
            display: 'grid',
            gap: 4,
            gridTemplateColumns: `minmax(0, 1fr) ${isMaximized ? 120 : 100}px`,
          }}>
            <div style={{
              alignItems: 'center',
              display: 'grid',
              gap: 8,
              gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
            }}>
              <div style={{ background: COLOR.borderSoft, height: 1 }} />
              <Group gap={4} wrap="nowrap">
                <Text size={isMaximized ? 'sm' : 'xs'} c="dimmed">Scarabs</Text>
                {hasPreservation && (
                  <Tooltip
                    label="Horned Scarab of Preservation detected — only Preservation scarabs are counted per-map. All other scarabs are treated as a one-time cost."
                    withArrow multiline w={240}>
                    <span
                      aria-label="Preservation active"
                      style={{ color: COLOR.profit, cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
                    >
                      <IconLock size={10} />
                    </span>
                  </Tooltip>
                )}
              </Group>
              <div style={{ background: COLOR.borderSoft, height: 1 }} />
            </div>
            <div>
              <Menu shadow="md" width={220} position="bottom-end">
                <Menu.Target>
                  <Button fullWidth size={isMaximized ? 'sm' : 'xs'} variant="default" rightSection={<IconChevronDown size={10} />}>Presets</Button>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconDeviceFloppy size={13} />}
                    disabled={!settings.scarabs.some((s) => s.name.trim())}
                    onClick={() => setPresetSaveOpen(true)}>
                    Save current as…
                  </Menu.Item>
                  {scarabPresets.length > 0 && (
                    <>
                      <Menu.Divider />
                      <Menu.Label>Load preset</Menu.Label>
                      {scarabPresets.map((p) => (
                        <Menu.Item key={p.id}
                          rightSection={<ActionIcon size="sm" variant="subtle" aria-label={`Delete preset ${p.name}`}
                            onMouseEnter={() => setHoveredPresetTrashId(p.id)}
                            onMouseLeave={() => setHoveredPresetTrashId(null)}
                            style={{ color: hoveredPresetTrashId === p.id ? 'var(--mantine-color-red-4)' : 'var(--mantine-color-dimmed)' }}
                            onClick={(e) => { e.stopPropagation(); setHoveredPresetTrashId(null); deleteScarabPreset(p.id); }}>
                            <IconTrash size={13} /></ActionIcon>}
                          onClick={() => loadScarabPreset(p.id)}>
                          <Tooltip label={p.scarabs.filter((s) => s.name.trim()).map((s) => s.name).join(', ') || '(empty)'} withArrow position="left">
                            <Text size="xs" lineClamp={1}>{p.name}</Text>
                          </Tooltip>
                        </Menu.Item>
                      ))}
                    </>
                  )}
                </Menu.Dropdown>
              </Menu>
            </div>
          </div>

          {settings.scarabs.map((scarab, i) => (
            <Group key={i} gap={4} wrap="nowrap">
              <Autocomplete placeholder={`Scarab ${i + 1}`} value={scarab.name}
                onChange={(v) => updateScarab(i, 'name', v)}
                data={scarabOptions} size={isMaximized ? 'sm' : 'xs'} style={{ flex: 1, minWidth: 0 }}
                leftSection={scarab.name ? <PoeItemIcon name={scarab.name} size={isMaximized ? 18 : 16} category="scarab" /> : undefined}
                rightSection={scarab.name
                  ? <ActionIcon size="xs" variant="transparent" c="dimmed"
                      onMouseDown={(e) => { e.preventDefault(); clearScarab(i); }}>
                      <IconX size={10} />
                    </ActionIcon>
                  : undefined}
                rightSectionPointerEvents={scarab.name ? 'all' : 'none'}
              />
              <PriceInput value={scarab.cost} onChange={(v) => updateScarab(i, 'cost', v)}
                divinePrice={divinePrice} placeholder="0c" size={isMaximized ? 'sm' : 'xs'}
                style={{ width: isMaximized ? 120 : 100, flexShrink: 0 }} />
            </Group>
          ))}
        </Stack>
      </Card>
    </>
  );
};
