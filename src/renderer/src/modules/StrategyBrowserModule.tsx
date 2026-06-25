import {
  Card, Text, Group, Stack, Badge, TextInput, Select, MultiSelect, Button,
  ActionIcon, Loader, Alert, Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { FaSync, FaDiscord, FaShareAlt } from 'react-icons/fa';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { KNOWN_LEAGUES } from '../utils/league';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { Strategy, ApiResponse, ALL_TYPE_TAGS } from '../utils/strategyConstants';
import { StrategyCard } from '../components/StrategyCard';
import { ShareModal } from '../components/ShareModal';
import { ImportModal } from '../components/ImportModal';
import type { DiscordImport } from '../utils/parseDiscordExport';

const DEFAULT_API_URL = 'https://wledger.richardpruett.com';

// ─── Main module ───────────────────────────────────────────────────────────────
export const StrategyBrowserModule = () => {
  const {
    maps, settings,
    updateSetting, updateAdvSetting, updateScarab, newSession, setLoadedStrategyInfo,
  } = useSessionStore();

  const apiUrl = DEFAULT_API_URL;
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [offset,     setOffset]     = useState(0);
  const [loadedMsg,  setLoadedMsg]  = useState<string | null>(null);
  const [typeTags,   setTypeTags]   = useState<string[]>([]);
  const [leagueFilter, setLeagueFilter] = useState<string>(KNOWN_LEAGUES[0]); // default to the newest league/event
  const [minDiv,     setMinDiv]     = useState('');
  const [sortBy,     setSortBy]     = useState('posted_at');
  const [period,     setPeriod]     = useState('all');
  const [showDate,   setShowDate]   = useState(false);
  const [hideGroup,  setHideGroup]  = useState(false);
  const LIMIT = 20;

  // ── Share modal ───────────────────────────────────────────────────────────────
  const [shareOpen, { open: openShare, close: closeShare }] = useDisclosure(false);
  const [shareTags, setShareTags] = useState<string[]>([]);

  const autoTags = useMemo(() => {
    const names = settings.scarabs.filter((s) => s.name).map((s) => s.name.toLowerCase()).join(' ');
    const cats: [string, string][] = [
      ['delirium','delirium'],['legion','legion'],['breach','breach'],['harvest','harvest'],
      ['expedition','expedition'],['ritual','ritual'],['abyss','abyss'],['blight','blight'],
      ['beyond','beyond'],['incursion','incursion'],['betrayal','betrayal'],['essence','essence'],
      ['divination','divination'],['harbinger','harbinger'],['titanic','titanic'],
      ['torment','torment'],['ultimatum','ultimatum'],['kalguuran','kalguur'],
      ['heist','heist'],['metamorph','metamorph'],['ambush','ambush'],['cartography','cartography'],
    ];
    return cats.filter(([kw]) => names.includes(kw)).map(([, tag]) => tag);
  }, [settings.scarabs]);

  const handleOpenShare = () => {
    if (shareTags.length === 0) {
      const merged = Array.from(new Set([...autoTags, ...(settings.atlasDetectedTags ?? [])]));
      if (maps.length > 0) {
      const isOrig  = (m: any) => m.isOriginator      || (m.rawText?.includes("Originator's Memories") ?? false);
      const isEmp   = (m: any) => m.isEmpoweredMirage  || (m.rawText?.includes('Empowered Mirage which covers the entire Map') ?? false);
      const isNight = (m: any) => m.isNightmare         || (m.rawText?.includes('Nightmare Map') ?? false);
      const hasOrig  = maps.some(isOrig);  const allOrig  = maps.every(isOrig);
      const hasEmp   = maps.some(isEmp);   const allEmp   = maps.every(isEmp);
      const hasNight = maps.some(isNight);
      let subtype = '';
      if (hasNight && maps.every(isNight))       subtype = 'nightmare';
      else if (allOrig && allEmp)                subtype = 'empowered-originator';
      else if (allOrig && !hasEmp)               subtype = 'originator';
      else if (allEmp  && !hasOrig)              subtype = 'empowered';
      else if (!hasOrig && !hasEmp && !hasNight) subtype = 'regular';
      else                                       subtype = 'mixed';
      if (subtype && !merged.includes(subtype)) merged.unshift(subtype);
    }
    if (settings.advAstrolabeType) {
      const a = settings.advAstrolabeType.toLowerCase();
      let astroTag = 'astrolabe';
      if      (a.includes('templar'))         astroTag = 'astrolabe-templar';
      else if (a.includes('enshrouded'))      astroTag = 'astrolabe-enshrouded';
      else if (a.includes('timeless'))        astroTag = 'astrolabe-timeless';
      else if (a.includes('grasping'))        astroTag = 'astrolabe-grasping';
      else if (a.includes('nameless'))        astroTag = 'astrolabe-nameless';
      else if (a.includes('runic'))           astroTag = 'astrolabe-runic';
      else if (a.includes('fruiting'))        astroTag = 'astrolabe-fruiting';
      else if (a.includes('fungal'))          astroTag = 'astrolabe-fungal';
      else if (a.includes('chaotic'))         astroTag = 'astrolabe-chaotic';
      else if (a.includes('lightless'))       astroTag = 'astrolabe-lightless';
      if (!merged.includes(astroTag)) merged.push(astroTag);
      }
      if (merged.length > 0) setShareTags(merged);
    }
    openShare();
  };

  // ── Import modal ──────────────────────────────────────────────────────────────
  const [importOpen, { open: openImport, close: closeImport }] = useDisclosure(false);

  // ── Load build (called by both StrategyCard and ImportModal) ─────────────────
  const handleLoadBuild = (s: Strategy) => {
    newSession();
    if (s.chisel && s.chisel !== 'None') {
      updateSetting('chiselType', s.chisel.split(' ')[0]);
      updateSetting('chiselUsed', true);
    }
    if (s.scarabs && s.scarabs.length > 0) {
      s.scarabs.slice(0, 5).forEach((scarab, i) => {
        updateScarab(i, 'name', scarab.name);
        updateScarab(i, 'cost', scarab.cost);
      });
    }
    if (s.atlas_tree_url) updateSetting('atlasTreeUrl', s.atlas_tree_url);
    if (s.raw_export) {
      const parsed = parseDiscordExport(s.raw_export);
      if (parsed) {
        if (parsed.deliOrbType) {
          updateAdvSetting('advDeliOrbType', parsed.deliOrbType);
          if (parsed.deliOrbQty   > 0) updateAdvSetting('advDeliOrbQtyPerMap',  parsed.deliOrbQty);
          if (parsed.deliOrbPrice > 0) updateAdvSetting('advDeliOrbPriceEach',  parsed.deliOrbPrice);
        }
        if (parsed.astroType) {
          updateAdvSetting('advAstrolabeType', parsed.astroType);
          if (parsed.astroCount > 0) updateAdvSetting('advAstrolabeCount', parsed.astroCount);
          if (parsed.astroPrice > 0) updateAdvSetting('advAstrolabePrice', parsed.astroPrice);
        }
      }
    }
    setLoadedMsg(`Loaded ${s.discord_username}'s build — scarabs, chisel, atlas tree, deli orbs & astrolabe applied.`);
    const p = s.raw_export ? parseDiscordExport(s.raw_export) : null;
    const runRegex = p?.runRegex || s.run_regex;
    if (runRegex) {
      setLoadedStrategyInfo({
        authorName: s.strategy_name || s.discord_username,
        mapCount:   p?.mapCount || s.map_count || 0,
        avgQuant:   p?.avgQuant  ?? s.avg_quant  ?? 0,
        avgRarity:  p?.avgRarity ?? s.avg_rarity ?? 0,
        avgPack:    p?.avgPack   ?? s.avg_pack   ?? 0,
        avgCurr:    p?.avgCurr   ?? s.avg_currency ?? 0,
        runRegex,
        slamRegex:  (p?.slamRegex || s.slam_regex) ?? undefined,
        mapType:    s.map_type === '8-mod' ? '8mod'
          : (s.type_tag?.split(',').find((t) =>
              ['nightmare','originator','empowered-originator','empowered'].includes(t.trim())
            ) ?? undefined),
      });
    }
    setTimeout(() => setLoadedMsg(null), 6000);
  };

  const handleLoadFromImport = (parsed: DiscordImport) => {
    // Apply what we can from a parsed import (no Strategy object — use parsed fields)
    newSession();
    if (parsed.chisel && parsed.chisel !== 'None') {
      updateSetting('chiselType', parsed.chisel.split(' ')[0]);
      updateSetting('chiselUsed', true);
    }
    if (parsed.scarabs && parsed.scarabs.length > 0) {
      parsed.scarabs.slice(0, 5).forEach((name, i) => {
        updateScarab(i, 'name', name);
        if (parsed.scarabCosts[i] > 0) updateScarab(i, 'cost', parsed.scarabCosts[i]);
      });
    }
    if (parsed.atlasTreeUrl) updateSetting('atlasTreeUrl', parsed.atlasTreeUrl);
    if (parsed.deliOrbType)  { updateAdvSetting('advDeliOrbType', parsed.deliOrbType); updateAdvSetting('advDeliOrbQtyPerMap', parsed.deliOrbQty); updateAdvSetting('advDeliOrbPriceEach', parsed.deliOrbPrice); }
    if (parsed.astroType)    { updateAdvSetting('advAstrolabeType', parsed.astroType); updateAdvSetting('advAstrolabeCount', parsed.astroCount); updateAdvSetting('advAstrolabePrice', parsed.astroPrice); }
    if (parsed.runRegex) {
      setLoadedStrategyInfo({
        authorName: parsed.strategyName || 'Imported',
        mapCount:   parsed.mapCount,
        avgQuant:   parsed.avgQuant,
        avgRarity:  parsed.avgRarity,
        avgPack:    parsed.avgPack,
        avgCurr:    parsed.avgCurr,
        runRegex:   parsed.runRegex,
        slamRegex:  parsed.slamRegex || undefined,
        mapType:    parsed.mapType === '8-mod' ? '8mod' : undefined,
      });
    }
    setLoadedMsg(`Imported build settings applied: chisel, scarabs, atlas tree, deli orbs & astrolabe.`);
    setTimeout(() => setLoadedMsg(null), 6000);
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────────
  const fetchStrategies = useCallback(async (newOffset = 0) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ limit: String(LIMIT), offset: String(newOffset), sort: sortBy });
      if (typeTags.length > 0) params.set('type_tag', typeTags.join(','));
      const divNum = parseFloat(minDiv);
      if (!isNaN(divNum) && divNum > 0) params.set('min_div', String(divNum));
      if (period !== 'all') params.set('since', period);
      if (leagueFilter) params.set('league', leagueFilter);
      const res  = await fetch(`${apiUrl}/strategies?${params}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data: ApiResponse = await res.json();
      setStrategies(newOffset === 0 ? data.strategies : (prev) => [...prev, ...data.strategies]);
      setTotal(data.total); setOffset(newOffset);
    } catch (err: any) { setError(err.message ?? 'Could not reach the strategy server.'); }
    finally { setLoading(false); }
  }, [apiUrl, typeTags, minDiv, sortBy, period, leagueFilter]);

  const { pendingStrategyAction, clearStrategyAction } = useUIStore();

  useEffect(() => {
    if (!pendingStrategyAction) return;
    if (pendingStrategyAction === 'share')  handleOpenShare();
    if (pendingStrategyAction === 'import') openImport();
    clearStrategyAction();
  }, [pendingStrategyAction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStrategies(0); }, [fetchStrategies]);

  const hasMore = offset + LIMIT < total;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <>
      <ShareModal opened={shareOpen} onClose={closeShare} initialTags={shareTags} />
      <ImportModal opened={importOpen} onClose={closeImport} onLoadBuild={handleLoadFromImport} />

      <Card shadow="sm" padding="sm" radius="md" withBorder h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        <Group justify="space-between" mb={6} style={{ flexShrink: 0 }}>
          <Text fw={700} size="sm">Strategy Browser</Text>
          <Group gap={4}>
            <Badge variant="light" size="sm">{total}</Badge>
            <Tooltip label="Analyse an export from Discord">
              <Button size="xs" variant="subtle" color="indigo" leftSection={<FaDiscord size={10} />} onClick={openImport}>Import</Button>
            </Tooltip>
            <Tooltip label="Share your current session">
              <Button size="xs" variant="light" color="teal" leftSection={<FaShareAlt size={10} />} onClick={handleOpenShare}>Share</Button>
            </Tooltip>
            <ActionIcon size="sm" variant="subtle" loading={loading} onClick={() => fetchStrategies(0)}><FaSync size={10} /></ActionIcon>
          </Group>
        </Group>

        <Group gap={6} mb={6} style={{ flexShrink: 0 }} wrap="nowrap">
          <MultiSelect size="xs" placeholder="Any type" clearable style={{ flex: 1 }}
            data={ALL_TYPE_TAGS.map((t) => ({ value: t, label: t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }))}
            value={typeTags} onChange={setTypeTags} maxDropdownHeight={200} searchable />
          <Select size="xs" style={{ width: 110 }}
            data={KNOWN_LEAGUES.filter((l) => l !== 'Standard').map((l) => ({ value: l, label: l }))}
            value={leagueFilter} onChange={(v) => setLeagueFilter(v ?? KNOWN_LEAGUES[0])} />
          <TextInput size="xs" placeholder="Min d/map" style={{ width: 80 }}
            value={minDiv} onChange={(e) => setMinDiv(e.currentTarget.value)} />
          <Select size="xs" style={{ width: 90 }}
            data={[{ value: 'all', label: 'All time' },{ value: '1d', label: 'Last 24h' },{ value: '3d', label: 'Last 3 days' },{ value: '7d', label: 'Last 7 days' }]}
            value={period} onChange={(v) => setPeriod(v ?? 'all')} />
          <Select size="xs" style={{ flex: 1 }}
            data={[{ value: 'posted_at', label: 'Newest' },{ value: 'div_per_map', label: 'Best d/map' },{ value: 'net_profit', label: 'Most profit' },{ value: 'least_invest', label: 'Least invest' },{ value: 'score', label: 'Top rated 👍' }]}
            value={sortBy} onChange={(v) => setSortBy(v ?? 'posted_at')} />
          <Tooltip label={hideGroup ? 'Showing solo only — click to show all' : 'Click to hide group/party strategies'} withArrow>
            <Button size="xs" variant={hideGroup ? 'filled' : 'subtle'} color={hideGroup ? 'cyan' : 'gray'}
              onClick={() => setHideGroup((v) => !v)}>
              👥
            </Button>
          </Tooltip>
        </Group>

        <Group gap={6} mb={3} style={{ flexShrink: 0, paddingLeft: 10, paddingRight: 10 }}>
          <div style={{ width: 22, flexShrink: 0 }} />
          <Text size="xs" c="dimmed" style={{ width: 88,  flexShrink: 0, fontSize: 10 }}>Author</Text>
          <Text size="xs" c="dimmed" style={{ width: 140, flexShrink: 0, fontSize: 10 }}>Tags</Text>
          <Text size="xs" c="dimmed" style={{ width: 40,  flexShrink: 0, fontSize: 10 }}>Mod</Text>
          <Text size="xs" c="dimmed" style={{ width: 26,  flexShrink: 0, fontSize: 10 }}>Maps</Text>
          <Text size="xs" c="dimmed" style={{ width: 58,  flexShrink: 0, fontSize: 10 }}>Cost/map</Text>
          <Text size="xs" c="dimmed" style={{ width: 96,  flexShrink: 0, fontSize: 10 }}>Total Invest</Text>
          <Text size="xs" c="dimmed" style={{ width: 100, flexShrink: 0, fontSize: 10 }}>Total Profit</Text>
          <Text size="xs" c="dimmed" style={{ width: 36,  flexShrink: 0, fontSize: 10 }}>Score</Text>
          <Text size="xs" c="dimmed" style={{ flex: 1, textAlign: 'right', fontSize: 10 }}>Profit/map</Text>
          <Tooltip label={showDate ? 'Hide date column' : 'Show date column'} withArrow>
            <Text size="xs" c={showDate ? 'dimmed' : 'dark'}
              style={{ width: 36, textAlign: 'right', flexShrink: 0, paddingLeft: 4, fontSize: 10, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setShowDate((v) => !v)}>
              {showDate ? 'Date' : '···'}
            </Text>
          </Tooltip>
        </Group>

        {loadedMsg && <Alert color="teal" variant="light" p="xs" mb={6} style={{ flexShrink: 0 }}><Text size="xs">✓ {loadedMsg}</Text></Alert>}
        {error     && <Alert color="red"  variant="light" p="xs" mb={6} style={{ flexShrink: 0 }}><Text size="xs">{error}</Text></Alert>}

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {!loading && strategies.length === 0 && !error && (
            <Stack align="center" justify="center" style={{ height: 120 }} gap="xs">
              <Text size="sm" c="dimmed">No strategies yet.</Text>
              <Text size="xs" c="dimmed">Use the Share button to post your first session.</Text>
            </Stack>
          )}
          <Stack gap={3}>
            {strategies
              .filter((s) => {
                if (!hideGroup) return true;
                const grp = s.is_group_play || (s.raw_export ? /Party Play:\s*Yes/i.test(s.raw_export) : false);
                return !grp;
              })
              .map((s) => <StrategyCard key={s.id} strategy={s} onLoadBuild={handleLoadBuild} showDate={showDate} discordTag={settings.discordTag} />)}
          </Stack>
          {hasMore && !loading && (
            <Button variant="subtle" size="xs" fullWidth mt={8} onClick={() => fetchStrategies(offset + LIMIT)}>
              Load more ({total - offset - LIMIT} remaining)
            </Button>
          )}
          {loading && <Group justify="center" mt={12}><Loader size="sm" /></Group>}
        </div>

        <Text size="xs" c="dimmed" ta="center" mt={6} style={{ flexShrink: 0 }}>
          React with 👍 or 👎 in Discord · Share submits your session · Load Build starts a new session
        </Text>
      </Card>
    </>
  );
};
