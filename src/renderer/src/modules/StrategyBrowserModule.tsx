import {
  Card, Text, Group, Stack, Badge, TextInput, Select, MultiSelect, Button,
  ActionIcon, Loader, Alert, Collapse, SimpleGrid, Tooltip, CopyButton,
  Modal, Textarea, Divider, NumberInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FaSync, FaExternalLinkAlt, FaChevronDown, FaChevronRight,
  FaCopy, FaCheck, FaThumbsUp, FaThumbsDown, FaDiscord, FaShareAlt,
} from 'react-icons/fa';
import { useSessionStore } from '../store/useSessionStore';
import { useUIStore } from '../store/useUIStore';
import { generateRunRegex, generateSlamRegex, trimmedMean } from '../utils/priceUtils';
import { applyUserExclusionsToRegex } from './RegexModule';

const DEFAULT_API_URL = 'http://wledger.richardpruett.com';

// ─── Tag options & colors ──────────────────────────────────────────────────────
const TAG_OPTIONS = [
  { value: '',                    label: '— No tag (auto-detect) —' },
  { value: 'regular',             label: 'Regular' },
  { value: 'originator',          label: 'Originator' },
  { value: 'empowered',           label: 'Empowered' },
  { value: 'empowered-originator',label: 'Empowered + Originator' },
  { value: 'nightmare',           label: 'Nightmare' },
  { value: 'mixed',               label: 'Mixed (map types)' },
  { value: 'delirium',    label: 'Delirium' },
  { value: 'legion',      label: 'Legion' },
  { value: 'breach',      label: 'Breach' },
  { value: 'harvest',     label: 'Harvest' },
  { value: 'expedition',  label: 'Expedition' },
  { value: 'ritual',      label: 'Ritual' },
  { value: 'abyss',       label: 'Abyss' },
  { value: 'blight',      label: 'Blight' },
  { value: 'beyond',      label: 'Beyond' },
  { value: 'incursion',   label: 'Incursion' },
  { value: 'betrayal',    label: 'Betrayal' },
  { value: 'essence',     label: 'Essence' },
  { value: 'divination',  label: 'Divination' },
  { value: 'ultimatum',   label: 'Ultimatum' },
  { value: 'kalguur',     label: 'Kalguur' },
  { value: 'heist',       label: 'Heist' },
  { value: 'ambush',      label: 'Ambush' },
  { value: 'cartography', label: 'Cartography' },
  { value: 'boss-rush',   label: 'Boss Rush' },
  { value: 'mirage-rush', label: 'Mirage Rush' },
  { value: 'eater',       label: 'Eater of Worlds' },
  { value: 'exarch',      label: 'Searing Exarch' },
  { value: 'astrolabe',           label: 'Astrolabe (any)' },
  { value: 'astrolabe-templar',   label: 'Astrolabe: Templar (Originator)' },
  { value: 'astrolabe-enshrouded',label: 'Astrolabe: Enshrouded (Delirium Mirror)' },
  { value: 'astrolabe-timeless',  label: 'Astrolabe: Timeless (Legion)' },
  { value: 'astrolabe-grasping',  label: 'Astrolabe: Grasping (Breach)' },
  { value: 'astrolabe-nameless',  label: 'Astrolabe: Nameless (Ritual)' },
  { value: 'astrolabe-runic',     label: 'Astrolabe: Runic (Expedition)' },
  { value: 'astrolabe-fruiting',  label: 'Astrolabe: Fruiting (Harvest)' },
  { value: 'astrolabe-fungal',    label: 'Astrolabe: Fungal (Blight)' },
  { value: 'astrolabe-chaotic',   label: 'Astrolabe: Chaotic (Ultimatum)' },
  { value: 'astrolabe-lightless', label: 'Astrolabe: Lightless (Abyss)' },
];

const ALL_TYPE_TAGS = TAG_OPTIONS.slice(1).map((t) => t.value);

const TAG_COLORS: Record<string, string> = {
  regular: 'gray', originator: 'orange', empowered: 'violet',
  'empowered-originator': 'grape', nightmare: 'red', mixed: 'dark',
  delirium: 'grape', legion: 'yellow', breach: 'violet', harvest: 'green',
  expedition: 'orange', ritual: 'red', abyss: 'dark', blight: 'lime',
  beyond: 'pink', incursion: 'cyan', betrayal: 'indigo', essence: 'teal',
  divination: 'blue', harbinger: 'gray', titanic: 'orange', torment: 'dark',
  ultimatum: 'red', kalguur: 'yellow', heist: 'dark', metamorph: 'grape',
  ambush: 'cyan', cartography: 'gray', 'boss-rush': 'red', 'mirage-rush': 'violet',
  eater: 'blue', exarch: 'red',
  'astrolabe': 'teal', 'astrolabe-templar': 'teal', 'astrolabe-enshrouded': 'grape',
  'astrolabe-timeless': 'yellow', 'astrolabe-grasping': 'violet', 'astrolabe-nameless': 'red',
  'astrolabe-runic': 'orange', 'astrolabe-fruiting': 'green', 'astrolabe-fungal': 'lime',
  'astrolabe-chaotic': 'pink', 'astrolabe-lightless': 'dark',
};

interface Strategy {
  id: string;
  discord_username: string;
  discord_avatar_url?: string;
  discord_jump_url?: string | null;
  map_type?: string | null;
  map_count?: number | null;
  multiplier?: number | null;
  avg_quant?: number | null;
  avg_rarity?: number | null;
  avg_pack?: number | null;
  avg_currency?: number | null;
  per_map_cost?: number | null;
  total_invest?: number | null;
  net_profit?: number | null;
  div_per_map?: number | null;
  divine_price?: number | null;
  chisel?: string | null;
  scarabs?: { name: string; cost: number }[] | null;
  atlas_tree_url?: string | null;
  run_regex?: string | null;
  slam_regex?: string | null;
  type_tag?: string | null;
  strategy_name?: string | null;
  strategy_notes?: string | null;
  score?: number | null;
  posted_at: string;
  raw_export?: string | null;
}

interface ApiResponse { total: number; limit: number; offset: number; strategies: Strategy[]; }

interface DiscordImport {
  mapCount: number; mapType: string; multiplier: number;
  avgQuant: number; avgRarity: number; avgPack: number; avgCurr: number;
  perMapCost: number; totalInvest: number; totalReturn: number;
  netProfit: number; divPerMap: number; divPrice: number;
  chisel: string; runRegex: string; slamRegex: string; scarabs: string[];
  strategyName: string; strategyNotes: string;
  deliOrbQty: number; deliOrbType: string; deliOrbPrice: number;
  astroType: string; astroCount: number; astroPrice: number;
  excludedDrops: { name: string; value: number }[];
  gemInfo: { count: number; buy: number; sell: number; net: number } | null;
}

function parseDiscordExport(raw: string): DiscordImport | null {
  try {
    const text = raw.replace(/^```\s*/m, '').replace(/\s*```\s*$/m, '').replace(/\*\*/g, '').trim();
    if (!text.includes('WraeclastLedger')) return null;
    const num = (patterns: RegExp[]): number => {
      for (const p of patterns) { const m = text.match(p); if (m) return parseFloat(m[1].replace(/,/g, '')); }
      return 0;
    };
    const str = (patterns: RegExp[]): string => {
      for (const p of patterns) { const m = text.match(p); if (m) return m[1].trim(); }
      return '';
    };
    const mapCount    = num([/Maps:\s*(\d+)/]);
    const multiplier  = num([/Multiplier:\s*([\d.]+)[x×]/i]);
    const avgQuant    = num([/Avg Quant:\s*(\d+)%/]);
    const avgRarity   = num([/Avg Rarity:\s*(\d+)%/]);
    const avgPack     = num([/Avg Pack:\s*(\d+)%/]);
    const avgCurr     = num([/Avg Currency:\s*(\d+)%/]);
    const perMapCost  = num([/Per Map Cost:\s*([\d.]+)c/]);
    const totalInvest = num([/Total Invest:\s*([\d.]+)c/]);
    const totalReturn = num([/Total Return:\s*([\d.]+)c/]);
    const divPerMap   = num([/Profit\/map:\s*([\d.]+)d/, /Div \/ Map:\s*([\d.]+)d/]);
    const divPrice    = num([/Divine Price:\s*([\d.]+)c/]);
    const profitMatch = text.match(/Net Profit:\s*([+-]?[\d.]+)c/);
    const netProfit   = profitMatch ? parseFloat(profitMatch[1]) : 0;
    const mapType     = str([/Type:\s*([68]-mod)/]);
    const chiselRaw   = str([/Chisel:\s*([^\n]+)/]);
    const chisel      = chiselRaw.replace(/\(.*/, '').replace(/[^\x00-\x7F]/g, '').trim();
    const stripBt     = (s: string) => s.trim().replace(/^`+|`+$/g, '').trim();
    const runMatch    = text.match(/(?:🟢\s*)?Run:\s+(.+)/);
    const slamMatch   = text.match(/(?:🟠\s*)?Slam:\s+(.+?)(?:\s*[*(]open|\s*$)/m);
    const runRegex    = runMatch  ? stripBt(runMatch[1])  : '';
    const slamRegex   = slamMatch ? stripBt(slamMatch[1]) : '';
    const scarabs: string[] = [];
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*-?\s*([A-Z][^\n(]+?)\s+\(\d/);
      if (m && !m[1].includes(':') && m[1].trim().length >= 5) scarabs.push(m[1].trim());
    }
    const strategyNameRaw  = str([/Strategy:\s*([^\n]+)/]);
    const strategyName     = strategyNameRaw.replace(/[^\x00-\x7F]/g, '').trim();
    const strategyNotesRaw = str([/Notes:\s*([^\n]+)/]);
    const strategyNotes    = strategyNotesRaw.replace(/[^\x00-\x7F]/g, '').trim();
    // Parse deli orbs and astrolabe
    const deliOrbMatch    = text.match(/Delirium Orbs:\s*(\d+)x\s+([^\s(]+)[^\n]*?(\d+\.?\d*)c each/i);
    const deliOrbQty      = deliOrbMatch ? parseInt(deliOrbMatch[1]) : 0;
    const deliOrbType     = deliOrbMatch ? deliOrbMatch[2].replace(/[^\x00-\x7F]/g, '').trim() : '';
    const deliOrbPrice    = deliOrbMatch ? parseFloat(deliOrbMatch[3]) : 0;
    const astroMatch      = text.match(/Astrolabe:\s*([^\n(]+?)\s+\((\d+)x,\s*(\d+\.?\d*)c each\)/i);
    const astroType       = astroMatch ? astroMatch[1].replace(/[^\x00-\x7F]/g, '').trim() : '';
    const astroCount      = astroMatch ? parseInt(astroMatch[2]) : 0;
    const astroPrice      = astroMatch ? parseFloat(astroMatch[3]) : 0;
    // Parse excluded drops: "Excluded drops (N): Name (Vc), Name2 (V2c)"
    const excludedDrops: { name: string; value: number }[] = [];
    const exclMatch = text.match(/Excluded drops \(\d+\):\s*([^\n]+)/i);
    if (exclMatch) {
      for (const part of exclMatch[1].split(',')) {
        const m = part.trim().match(/^(.+?)\s+\(([\d.]+)c\)$/);
        if (m) excludedDrops.push({ name: m[1].trim(), value: parseFloat(m[2]) });
      }
    }
    // Parse gem leveling: "Gem leveling: N gems | buy Xc | sell Xc | net +/-Xc"
    const gemMatch = text.match(/Gem leveling:\s*(\d+) gems \| buy (\d+)c \| sell (\d+)c \| net ([+-]?\d+)c/i);
    const gemInfo = gemMatch ? {
      count: parseInt(gemMatch[1]), buy: parseInt(gemMatch[2]),
      sell: parseInt(gemMatch[3]), net: parseInt(gemMatch[4]),
    } : null;
    if (mapCount === 0) return null;
    return { mapCount, mapType, multiplier, avgQuant, avgRarity, avgPack, avgCurr,
             perMapCost, totalInvest, totalReturn, netProfit, divPerMap, divPrice,
             chisel, runRegex, slamRegex, scarabs, strategyName, strategyNotes,
             deliOrbQty, deliOrbType, deliOrbPrice, astroType, astroCount, astroPrice,
             excludedDrops, gemInfo };
  } catch { return null; }
}

const f1 = (v: number | null | undefined) => v != null ? v.toFixed(1) : null;

const fc = (v: number | null | undefined, sign = false): string => {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const s = abs >= 1000
    ? `${parseFloat((abs / 1000).toFixed(1))}k` // strips trailing .0 (107.0 → 107)
    : `${Math.round(abs)}`;
  const prefix = sign ? (v >= 0 ? '+' : '-') : (v < 0 ? '-' : '');
  return `${prefix}${s}c`;
};

const CopyRegex = ({ value, label }: { value: string; label: string }) => (
  <CopyButton value={value} timeout={2000}>
    {({ copied, copy }) => (
      <ActionIcon size="xs" variant={copied ? 'filled' : 'subtle'} color={copied ? 'teal' : 'gray'} onClick={copy}
        title={copied ? 'Copied!' : `Copy ${label} regex`}>
        {copied ? <FaCheck size={8} /> : <FaCopy size={8} />}
      </ActionIcon>
    )}
  </CopyButton>
);

const MAP_TYPE_TAGS = new Set(['regular','originator','empowered','empowered-originator','nightmare','mixed']);
const MAP_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular T16 maps (no enchant, no implicit)',
  originator: 'Originator\'s Memories implicit (+1 Tier beyond T16)',
  empowered: 'Empowered Mirage enchant (covers entire map)',
  'empowered-originator': 'Empowered Mirage enchant + Originator\'s Memories',
  nightmare: 'Nightmare Maps (8-mod, Chaos-only modification)',
  mixed: 'Mixed batch of different map types',
};

const TAG_SHORT: Record<string, string> = {
  // Only shorten genuinely long/compound names
  'empowered-originator': 'emp+orig',
  'empowered':            'emp',
  'boss-rush':            'boss',
  'mirage-rush':          'mirage',
  'delirium':             'deli',
  // Astrolabe variants
  'astrolabe':            'astro',
  'astrolabe-templar':    'a:templ',
  'astrolabe-enshrouded': 'a:enshr',
  'astrolabe-timeless':   'a:time',
  'astrolabe-grasping':   'a:grasp',
  'astrolabe-nameless':   'a:name',
  'astrolabe-runic':      'a:runic',
  'astrolabe-fruiting':   'a:fruit',
  'astrolabe-fungal':     'a:fung',
  'astrolabe-chaotic':    'a:chaos',
  'astrolabe-lightless':  'a:light',
};

const TagStrip = ({ tagStr, maxVisible = 3 }: { tagStr?: string | null; maxVisible?: number }) => {
  if (!tagStr) return null;
  const tags = tagStr.split(',').map((t) => t.trim()).filter(Boolean);
  if (tags.length === 0) return null;
  const visible = tags.slice(0, maxVisible);
  const hidden  = tags.slice(maxVisible);
  return (
    <Group gap={2} wrap="nowrap" style={{ overflow: 'hidden' }}>
      {visible.map((t) => (
        MAP_TYPE_TAGS.has(t) ? (
          <Tooltip key={t} label={MAP_TYPE_LABELS[t] ?? t} withArrow>
            <Badge size="xs" color={TAG_COLORS[t] ?? 'gray'} variant="light"
              style={{ fontSize: 8, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>
              {TAG_SHORT[t] ?? t}
            </Badge>
          </Tooltip>
        ) : (
          <Badge key={t} size="xs" color={TAG_COLORS[t] ?? 'gray'} variant="light"
            style={{ fontSize: 8, padding: '0 3px', flexShrink: 0 }}>
            {TAG_SHORT[t] ?? t}
          </Badge>
        )
      ))}
      {hidden.length > 0 && (
        <Tooltip label={hidden.join(', ')} withArrow>
          <Badge size="xs" color="gray" variant="outline"
            style={{ fontSize: 8, padding: '0 3px', flexShrink: 0, cursor: 'default' }}>
            +{hidden.length}
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
};

const StrategyCard = ({ strategy, onLoadBuild, showDate }: {
  strategy: Strategy; onLoadBuild: (s: Strategy) => void; showDate: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const date = (() => { try { return new Date(strategy.posted_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); } catch { return '—'; } })();
  const div = strategy.div_per_map ??
    // Fallback: compute from stored net_profit / divine_price / map_count when server didn't store div_per_map
    (strategy.net_profit != null && strategy.divine_price != null && strategy.divine_price > 0 && strategy.map_count != null && strategy.map_count > 0
      ? strategy.net_profit / strategy.divine_price / strategy.map_count
      : null);
  const divColor   = div != null ? (div >= 8 ? '#51cf66' : div >= 4 ? '#74c0fc' : div >= 1 ? '#ffd43b' : '#868e96') : '#868e96';
  const score      = strategy.score ?? 0;
  const scoreColor = score > 0 ? '#51cf66' : score < 0 ? '#ff6b6b' : '#555';
  const profitColor = strategy.net_profit != null ? (strategy.net_profit >= 0 ? '#51cf66' : '#ff6b6b') : '#555';

  return (
    <div style={{
      background: score <= -3 ? 'rgba(255,107,107,0.04)' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${score <= -3 ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      <Group gap={6} wrap="nowrap" onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', padding: '7px 10px', userSelect: 'none' }}>
        <ActionIcon size={22} variant="transparent" c="dimmed" style={{ flexShrink: 0 }}>
          {open ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
        </ActionIcon>
        <Stack gap={0} style={{ width: 88, flexShrink: 0, paddingLeft: 4 }}>
          <Text size="xs" fw={600} lineClamp={1}>{strategy.discord_username}</Text>
          {strategy.strategy_name && (
            <Text size="xs" c="dimmed" lineClamp={1} style={{ fontSize: 9 }}>{strategy.strategy_name}</Text>
          )}
        </Stack>
        <div style={{ width: 140, flexShrink: 0, overflow: 'hidden' }}>
          <TagStrip tagStr={strategy.type_tag} maxVisible={3} />
        </div>
        <Text size="xs" c="dimmed" style={{ width: 40, flexShrink: 0, fontSize: 10 }}>{strategy.map_type ?? '?'}</Text>
        <Text size="xs" c="dimmed" style={{ width: 26, flexShrink: 0 }}>{strategy.map_count != null ? strategy.map_count : '—'}</Text>
        <Text size="xs" c="dimmed" style={{ width: 58, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {strategy.per_map_cost != null ? `${Math.round(strategy.per_map_cost)}c` : '—'}
        </Text>
        <Text size="xs" c="dimmed" style={{ width: 96, flexShrink: 0, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {fc(strategy.total_invest)}
          {strategy.total_invest != null && strategy.divine_price != null && strategy.divine_price > 0 && (
            <Text span style={{ color: '#555', fontSize: 9 }}> ({(strategy.total_invest / strategy.divine_price).toFixed(1)}d)</Text>
          )}
        </Text>
        <Text size="xs" fw={600} style={{ width: 100, flexShrink: 0, fontVariantNumeric: 'tabular-nums', color: profitColor, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {fc(strategy.net_profit, true)}
          {strategy.net_profit != null && strategy.divine_price != null && strategy.divine_price > 0 && (
            <Text span style={{ color: '#555', fontSize: 9 }}> ({strategy.net_profit >= 0 ? '+' : ''}{(strategy.net_profit / strategy.divine_price).toFixed(1)}d)</Text>
          )}
        </Text>
        <Group gap={2} style={{ width: 36, flexShrink: 0 }} align="center">
          {score >= 0 ? <FaThumbsUp size={8} style={{ color: scoreColor }} /> : <FaThumbsDown size={8} style={{ color: scoreColor }} />}
          <Text size="xs" style={{ color: scoreColor, fontVariantNumeric: 'tabular-nums' }}>{score > 0 ? `+${score}` : score}</Text>
        </Group>
        <Text size="sm" fw={800} style={{ flex: 1, textAlign: 'right', color: divColor, fontVariantNumeric: 'tabular-nums' }}>
          {div != null ? `${div.toFixed(3)}d` : '—'}
        </Text>
        {showDate && (
          <Text size="xs" c="dimmed" style={{ width: 36, textAlign: 'right', flexShrink: 0, paddingLeft: 4 }}>{date}</Text>
        )}
      </Group>

      <Collapse in={open}>
        <div style={{ padding: '8px 12px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <SimpleGrid cols={3} spacing={6} mb={10}>
            {strategy.avg_quant    != null && <Stack gap={0}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Quantity</Text><Text size="sm" fw={700} c="#74c0fc">{f1(strategy.avg_quant)}%</Text></Stack>}
            {strategy.avg_rarity   != null && <Stack gap={0}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Rarity</Text><Text size="sm" fw={700} c="#74c0fc">{f1(strategy.avg_rarity)}%</Text></Stack>}
            {strategy.avg_pack     != null && <Stack gap={0}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Pack</Text><Text size="sm" fw={700} c="#74c0fc">{f1(strategy.avg_pack)}%</Text></Stack>}
            {strategy.avg_currency != null && <Stack gap={0}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Currency</Text><Text size="sm" fw={700} c="#ffd43b">{f1(strategy.avg_currency)}%</Text></Stack>}
            {strategy.per_map_cost != null && <Stack gap={0}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Cost/map</Text><Text size="sm" fw={700}>{f1(strategy.per_map_cost)}c</Text></Stack>}
            {strategy.net_profit   != null && <Stack gap={0}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Net Profit</Text><Text size="sm" fw={700} c={strategy.net_profit >= 0 ? '#51cf66' : '#ff6b6b'}>{strategy.net_profit >= 0 ? '+' : ''}{strategy.net_profit.toFixed(0)}c{strategy.divine_price ? ` (${strategy.net_profit >= 0 ? '+' : ''}${(strategy.net_profit / strategy.divine_price).toFixed(1)}d)` : ''}</Text></Stack>}
          </SimpleGrid>

          {(strategy.divine_price != null || strategy.total_invest != null) && (
            <Group gap="md" mb={8}>
              {strategy.divine_price != null && <Group gap={4}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Divine at time</Text><Text size="xs" c="dimmed">{strategy.divine_price.toFixed(0)}c</Text></Group>}
              {strategy.total_invest != null && <Group gap={4}><Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Total invest</Text><Text size="xs" c="dimmed">{strategy.total_invest.toFixed(0)}c{strategy.divine_price ? ` (${(strategy.total_invest / strategy.divine_price).toFixed(1)}d)` : ''}</Text></Group>}
            </Group>
          )}

          {/* Deli orbs and astrolabe headers — parsed from raw_export */}
          {(() => {
            if (!strategy.raw_export) return null;
            const deliM = strategy.raw_export.match(/Delirium Orbs:\s*(\d+)x\s+([^\s(]+)/i);
            const astM  = strategy.raw_export.match(/Astrolabe:\s*([^\n(]+?)\s+\(\d+x/i);
            if (!deliM && !astM) return null;
            return (
              <Group gap={4} mb={6} wrap="wrap">
                {deliM && (
                  <Badge size="xs" color="grape" variant="light">
                    🌫 {deliM[1]}x {deliM[2].replace(/[^\x00-\x7F]/g, '')} ({parseInt(deliM[1]) * 20}% delirious)
                  </Badge>
                )}
                {astM && (
                  <Badge size="xs" color="teal" variant="light">
                    🌍 {astM[1].replace(/[^\x00-\x7F]/g, '').trim()}
                  </Badge>
                )}
              </Group>
            );
          })()}

          {strategy.chisel && strategy.chisel !== 'None' && (
            <Group gap={4} mb={6}><Badge size="xs" color="yellow" variant="light">🪨 {strategy.chisel}</Badge></Group>
          )}

          {strategy.type_tag && (
            <Group gap={4} mb={6} wrap="wrap">
              {strategy.type_tag.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                <Badge key={t} size="xs" color={TAG_COLORS[t] ?? 'gray'} variant="light">{t}</Badge>
              ))}
            </Group>
          )}

          {strategy.strategy_notes && (
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '6px 8px', marginBottom: 8, borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
              <Text size="xs" c="dimmed" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 2 }}>Notes</Text>
              <Text size="xs" style={{ color: '#aaa', lineHeight: 1.5 }}>{strategy.strategy_notes}</Text>
            </div>
          )}

          {strategy.scarabs && strategy.scarabs.length > 0 && (
            <Stack gap={2} mb={8}>
              <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Scarabs</Text>
              <Group gap={4} wrap="wrap">
                {strategy.scarabs.map((s, i) => (
                  <Badge key={i} size="xs" color={TAG_COLORS[strategy.type_tag ?? ''] ?? 'orange'} variant="light">
                    {s.name}{s.cost > 0 ? ` · ${s.cost}c` : ''}
                  </Badge>
                ))}
              </Group>
            </Stack>
          )}

          {/* Excluded drops + gem leveling — parsed from raw_export */}
          {(() => {
            if (!strategy.raw_export) return null;
            const exclM = strategy.raw_export.match(/Excluded drops \(\d+\):\s*([^\n]+)/i);
            const gemM  = strategy.raw_export.match(/Gem leveling:\s*(\d+) gems \| buy (\d+)c \| sell (\d+)c \| net ([+-]?\d+)c/i);
            if (!exclM && !gemM) return null;
            const drops = exclM ? exclM[1].split(',').map((p) => {
              const m = p.trim().match(/^(.+?)\s+\(([\d.]+)c\)$/);
              return m ? { name: m[1].trim(), value: parseFloat(m[2]) } : null;
            }).filter(Boolean) as { name: string; value: number }[] : [];
            return (
              <Stack gap={4} mb={8}>
                {drops.length > 0 && (
                  <div style={{ background: 'rgba(255,107,107,0.04)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,107,107,0.3)' }}>
                    <Text size="xs" c="dimmed" mb={2} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>Excluded drops ({drops.length})</Text>
                    <Text size="xs" style={{ color: '#aaa', lineHeight: 1.5 }}>{drops.map((d) => `${d.name} (${d.value.toFixed(0)}c)`).join(', ')}</Text>
                  </div>
                )}
                {gemM && (
                  <Group gap={4} wrap="wrap">
                    <Text size="xs" c="dimmed">Gem leveling:</Text>
                    <Text size="xs">{gemM[1]} gems · buy {gemM[2]}c · sell {gemM[3]}c ·</Text>
                    <Text size="xs" fw={600} c={parseInt(gemM[4]) >= 0 ? 'teal' : 'red'}>{parseInt(gemM[4]) >= 0 ? '+' : ''}{gemM[4]}c net *(not in map profit)*</Text>
                  </Group>
                )}
              </Stack>
            );
          })()}

          {(strategy.run_regex || strategy.slam_regex) && (
            <Stack gap={4} mb={8} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 4, padding: '6px 8px' }}>
              <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.8 }}>Regex</Text>
              {strategy.run_regex && (
                <Group gap={4} wrap="nowrap" align="flex-start">
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>🟢</Text>
                  <Text size="xs" c="teal" style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', flex: 1 }}>{strategy.run_regex}</Text>
                  <CopyRegex value={strategy.run_regex} label="run" />
                </Group>
              )}
              {strategy.slam_regex && (
                <Group gap={4} wrap="nowrap" align="flex-start">
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>🟠</Text>
                  <Text size="xs" c="orange" style={{ fontFamily: 'monospace', fontSize: 10, wordBreak: 'break-all', flex: 1 }}>{strategy.slam_regex}</Text>
                  <CopyRegex value={strategy.slam_regex} label="slam" />
                </Group>
              )}
            </Stack>
          )}

          <Group gap="xs">
            <Button size="xs" variant="light" color="blue" onClick={(e) => { e.stopPropagation(); onLoadBuild(strategy); }}>
              Load Build Settings
            </Button>
            {strategy.atlas_tree_url && (
              <Tooltip label="Open atlas tree in browser">
                <Button size="xs" variant="subtle" color="gray" rightSection={<FaExternalLinkAlt size={9} />}
                  onClick={(e) => { e.stopPropagation(); window.open(strategy.atlas_tree_url!, '_blank'); }}>
                  Atlas Tree
                </Button>
              </Tooltip>
            )}
            {strategy.discord_jump_url && (
              <Tooltip label="Jump to this message in Discord to vote 👍/👎">
                <Button size="xs" variant="subtle" color="indigo" rightSection={<FaExternalLinkAlt size={9} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    const jumpUrl = strategy.discord_jump_url!;
                    window.open(jumpUrl.replace('https://discord.com', 'discord://discord.com'), '_blank');
                  }}>
                  View in Discord
                </Button>
              </Tooltip>
            )}
          </Group>
        </div>
      </Collapse>
    </div>
  );
};

// ─── Main module ───────────────────────────────────────────────────────────────
export const StrategyBrowserModule = () => {
  const {
    maps, settings, lootItems, baselineTotal,
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
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);
  const [minDiv,     setMinDiv]     = useState('');
  const [sortBy,     setSortBy]     = useState('posted_at');
  const [period,     setPeriod]     = useState('all');
  const [showDate,   setShowDate]   = useState(false);
  const LIMIT = 20;

  const [shareOpen, { open: openShare, close: closeShare }] = useDisclosure(false);
  const [shareTags,  setShareTags]  = useState<string[]>([]);
  const [stratName,  setStratName]  = useState('');
  const [stratNotes, setStratNotes] = useState('');

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
        const isOrig  = (m: any) => m.isOriginator     || (m.rawText?.includes("Originator's Memories") ?? false);
        const isEmp   = (m: any) => m.isEmpoweredMirage || (m.rawText?.includes('Empowered Mirage which covers the entire Map') ?? false);
        const isNight = (m: any) => m.isNightmare       || (m.rawText?.includes('Nightmare Map') ?? false);
        const hasOrig = maps.some(isOrig); const allOrig = maps.every(isOrig);
        const hasEmp  = maps.some(isEmp);  const allEmp  = maps.every(isEmp);
        const hasNight = maps.some(isNight);
        let subtype = '';
        if (hasNight && maps.every(isNight))        subtype = 'nightmare';
        else if (allOrig && allEmp)                 subtype = 'empowered-originator';
        else if (allOrig && !hasEmp)                subtype = 'originator';
        else if (allEmp  && !hasOrig)               subtype = 'empowered';
        else if (!hasOrig && !hasEmp && !hasNight)  subtype = 'regular';
        else                                        subtype = 'mixed';
        if (subtype && !merged.includes(subtype)) merged.unshift(subtype);
      }
      // Auto-add astrolabe tag from settings if configured
      if (settings.advAstrolabeType) {
        const a = settings.advAstrolabeType.toLowerCase();
        let astroTag = 'astrolabe';
        if (a.includes('templar'))         astroTag = 'astrolabe-templar';
        else if (a.includes('enshrouded')) astroTag = 'astrolabe-enshrouded';
        else if (a.includes('timeless'))   astroTag = 'astrolabe-timeless';
        else if (a.includes('grasping'))   astroTag = 'astrolabe-grasping';
        else if (a.includes('nameless'))   astroTag = 'astrolabe-nameless';
        else if (a.includes('runic'))      astroTag = 'astrolabe-runic';
        else if (a.includes('fruiting'))   astroTag = 'astrolabe-fruiting';
        else if (a.includes('fungal'))     astroTag = 'astrolabe-fungal';
        else if (a.includes('chaotic'))    astroTag = 'astrolabe-chaotic';
        else if (a.includes('lightless'))  astroTag = 'astrolabe-lightless';
        if (!merged.includes(astroTag)) merged.push(astroTag);
      }
      if (merged.length > 0) setShareTags(merged);
    }
    openShare();
  };

  const [importOpen,    { open: openImport,  close: closeImport  }] = useDisclosure(false);
  const [importText,    setImportText]    = useState('');
  const [importResult,  setImportResult]  = useState<DiscordImport | null>(null);
  const [parseError,    setParseError]    = useState(false);
  const [importDivPrice, setImportDivPrice] = useState(settings.divinePrice || 300);

  // ── Export text ──────────────────────────────────────────────────────────────
  const discordExport = useMemo(() => {
    const excludedItems = lootItems.filter((l) => l.excluded);
    const gemNetPL = (settings.advGemCount * settings.advGemSellPrice) - (settings.advGemCount * settings.advGemBuyPrice);
    const chiselCost = settings.chiselType && settings.chiselPrice > 0 ? settings.chiselPrice : 0;
    const scarabCost = settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
    const league = settings.leagueName;
    let perMap = settings.baseMapCost + chiselCost + scarabCost;
    if (settings.advSplitPrice > 0) perMap = (settings.baseMapCost + chiselCost + settings.advSplitPrice) / 2 + scarabCost;
    const n               = maps.length;
    const totalInvestment = perMap * n + settings.rollingCostPerMap;
    const gemBuyOffset    = (settings.advGemName?.trim() && settings.advGemCount > 0 && settings.advGemBuyPrice > 0)
      ? settings.advGemCount * settings.advGemBuyPrice : 0;
    const rawReturn       = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
    const hasBl           = baselineTotal > 0 && lootItems.length > 0;
    const totalReturn     = rawReturn + gemBuyOffset - (hasBl ? baselineTotal : 0);
    const netProfit       = totalReturn - totalInvestment;
    const divPrice        = settings.divinePrice || 1;
    const divPerMap       = n > 0 ? (netProfit / divPrice) / n : 0;
    const scarabOfRiskCount = settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2;
    const baseModCount    = settings.mapType === '8-mod' ? 8 : 6;
    const mountBonus      = settings.mountingModifiers ? (baseModCount + scarabOfRiskCount) * 2 : 0;
    const multiplier      = 1 + (settings.fragmentsUsed * 3 + settings.smallNodesAllocated * 2 + mountBonus) / 100;
    const avgQuant   = trimmedMean(maps.map((m) => m.quantity));
    const avgPack    = trimmedMean(maps.map((m) => m.packSize));
    const avgCurr    = trimmedMean(maps.map((m) => m.moreCurrency));
    const avgRarity  = trimmedMean(maps.map((m) => m.rarity));
    const avgScarabs = trimmedMean(maps.map((m) => m.moreScarabs));
    const chiselLine  = settings.chiselType
      ? '\u{1FAA8} **Chisel:** ' + settings.chiselType + ' (' + settings.chiselPrice + 'c)'
      : '\u{1FAA8} **Chisel:** None';
    const scarabLines = settings.scarabs.filter((s) => s.name).map((s) => `  - ${s.name} (${s.cost}c)`).join('\n');
    const deliLine    = settings.advDeliOrbType && settings.advDeliOrbQtyPerMap > 0
      ? '\uD83C\uDF2B\uFE0F **Delirium Orbs:** ' + settings.advDeliOrbQtyPerMap + 'x ' + settings.advDeliOrbType +
        ' (' + (settings.advDeliOrbQtyPerMap * 20) + '% delirious, ' +
        settings.advDeliOrbPriceEach.toFixed(1) + 'c each = ' +
        (settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach).toFixed(1) + 'c/map)'
      : null;
    const astroLine   = settings.advAstrolabeType
      ? '\uD83C\uDF0D **Astrolabe:** ' + settings.advAstrolabeType +
        ' (' + settings.advAstrolabeCount + 'x, ' + settings.advAstrolabePrice.toFixed(0) + 'c each)'
      : null;
    const atlasUrl    = settings.atlasTreeUrl?.includes('#') ? settings.atlasTreeUrl : null;
    let regexBlock = '';
    if (n > 0) {
      const avg = { avgQuant, avgPack, avgCurr, avgRarity, avgScarabs };
      const is8mod = settings.mapType === '8-mod';
      regexBlock = ['', `🔍 **Generated Regex (${n} maps, trimmed avg)**`,
        `Avg: ${avgQuant.toFixed(0)}%Q · ${avgRarity.toFixed(0)}%R · ${avgPack.toFixed(0)}%P · ${avgCurr.toFixed(0)}% Curr`,
        `*Brick exclusion is build-dependent — edit in settings*`,
        `🟢 Run: \`${generateRunRegex(avg, settings.regexExclusions)}\``,
        ...(!is8mod ? [`🟠 Slam: \`${generateSlamRegex(avg, settings.regexExclusions)}\` *(open slots only)*`] : []),
      ].join('\n');
    }
    return [
      `[WraeclastLedger Session]`, `**Map Session — WraeclastLedger**`,
      `📦 **Maps:** ${n} | **Type:** ${settings.mapType} | **Multiplier:** ${multiplier.toFixed(2)}×`,
      chiselLine,
      `📊 **Avg Quant:** ${avgQuant.toFixed(0)}% | **Avg Rarity:** ${avgRarity.toFixed(0)}% | **Avg Pack:** ${avgPack.toFixed(0)}% | **Avg Currency:** ${avgCurr.toFixed(0)}%`,
      `💰 **Per Map Cost:** ${perMap.toFixed(1)}c | **Total Invest:** ${totalInvestment.toFixed(1)}c`,
      `🎯 **Total Return:** ${totalReturn.toFixed(1)}c | **Net Profit:** ${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(1)}c`,
      `📈 **Div / Map:** ${divPerMap.toFixed(3)}d | **Divine Price:** ${divPrice}c`,
      ...(scarabLines ? ['🦂 **Scarabs:**\n' + scarabLines] : []),
      ...(deliLine  ? [deliLine]  : []),
      ...(astroLine ? [astroLine] : []),
      ...(atlasUrl  ? [`🌳 **Atlas Tree:** ${atlasUrl}`]  : []),
      ...(league    ? [`🏆 **League:** ${league}`] : []),
      ...(stratName.trim()  ? [`📝 **Strategy:** ${stratName.trim()}`] : []),
      ...(shareTags.length > 0 ? [`🏷️ **Tags:** ${shareTags.join(', ')}`] : []),
      ...(stratNotes.trim() ? [`📋 **Notes:** ${stratNotes.trim()}`] : []),
      ...(excludedItems.length > 0 ? [
        `⛔ **Excluded drops (${excludedItems.length}):** ${excludedItems.map((i) => `${i.name} (${i.total.toFixed(0)}c)`).join(', ')}`
      ] : []),
      ...(settings.advGemCount > 0 ? [
        `💫 **Gem leveling:** ${settings.advGemCount} gems | buy ${(settings.advGemCount * settings.advGemBuyPrice).toFixed(0)}c | sell ${(settings.advGemCount * settings.advGemSellPrice).toFixed(0)}c | net ${gemNetPL >= 0 ? '+' : ''}${gemNetPL.toFixed(0)}c *(excluded from map profit)*`
      ] : []),
      ...(regexBlock ? [regexBlock] : []),
    ].join('\n');
  }, [maps, settings, lootItems, baselineTotal, shareTags, stratName, stratNotes]);

  const handleImportTextChange = (text: string) => {
    setImportText(text);
    if (text.trim().length > 50) {
      const r = parseDiscordExport(text);
      setImportResult(r);
      setParseError(!r && text.trim().length > 100);
    } else { setImportResult(null); setParseError(false); }
  };

  const repriced = importResult ? (() => {
    const orig = importResult.divPrice > 0 ? importResult.divPrice
      : importResult.divPerMap > 0 && importResult.mapCount > 0
        ? Math.round(Math.abs(importResult.netProfit) / (importResult.divPerMap * importResult.mapCount))
        : importDivPrice;
    const curr = importDivPrice || 1;
    return { netProfitDivNow: importResult.netProfit / curr, divPerMapNow: importResult.divPerMap * (orig / curr), impliedDivPrice: orig };
  })() : null;

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
    if (pendingStrategyAction === 'share') handleOpenShare();
    if (pendingStrategyAction === 'import') openImport();
    clearStrategyAction();
  }, [pendingStrategyAction]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStrategies(0); }, [fetchStrategies]);

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
    // Load deli orbs and astrolabe from raw_export
    if (s.raw_export) {
      const parsed = parseDiscordExport(s.raw_export);
      if (parsed) {
        if (parsed.deliOrbType) {
          updateAdvSetting('advDeliOrbType', parsed.deliOrbType);
          if (parsed.deliOrbQty > 0) updateAdvSetting('advDeliOrbQtyPerMap', parsed.deliOrbQty);
          if (parsed.deliOrbPrice > 0) updateAdvSetting('advDeliOrbPriceEach', parsed.deliOrbPrice);
        }
        if (parsed.astroType) {
          updateAdvSetting('advAstrolabeType', parsed.astroType);
          if (parsed.astroCount > 0) updateAdvSetting('advAstrolabeCount', parsed.astroCount);
          if (parsed.astroPrice > 0) updateAdvSetting('advAstrolabePrice', parsed.astroPrice);
        }
      }
    }
    setLoadedMsg(`Loaded ${s.discord_username}'s build — scarabs, chisel, atlas tree, deli orbs & astrolabe applied.`);
    // Store strategy averages and regex for RegexModule to display and use
    if (s.raw_export) {
      const p2 = parseDiscordExport(s.raw_export);
      if (p2 && p2.runRegex) {
        setLoadedStrategyInfo({
          authorName: s.strategy_name || s.discord_username,
          mapCount: p2.mapCount || s.map_count || 0,
          avgQuant:  p2.avgQuant,
          avgRarity: p2.avgRarity,
          avgPack:   p2.avgPack,
          avgCurr:   p2.avgCurr,
          runRegex:  p2.runRegex,
          slamRegex: p2.slamRegex || undefined,
          mapType:   s.map_type === '8-mod' ? '8mod' : (s.type_tag?.split(',').find((t) => ['nightmare','originator','empowered-originator','empowered'].includes(t.trim())) ?? undefined),
        });
      }
    } else if (s.run_regex) {
      setLoadedStrategyInfo({
        authorName: s.strategy_name || s.discord_username,
        mapCount: s.map_count || 0,
        avgQuant:  s.avg_quant ?? 0,
        avgRarity: s.avg_rarity ?? 0,
        avgPack:   s.avg_pack ?? 0,
        avgCurr:   s.avg_currency ?? 0,
        runRegex:  s.run_regex,
        slamRegex: s.slam_regex ?? undefined,
        mapType:   s.map_type === '8-mod' ? '8mod' : (s.type_tag?.split(',').find((t) => ['nightmare','originator','empowered-originator','empowered'].includes(t.trim())) ?? undefined),
      });
    }
    setTimeout(() => setLoadedMsg(null), 6000);
  };

  const hasMore = offset + LIMIT < total;

  return (
    <>
      {/* ── Share modal ── */}
      <Modal opened={shareOpen} onClose={closeShare} title="Share My Session" size="md">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">
            Copy this export and paste it into your strategy Discord channel. The bot picks it up automatically.
          </Text>
          {maps.length === 0 && (
            <Alert color="orange" variant="light" p="xs">
              <Text size="xs">No maps parsed yet — parse some maps in Map Log first for complete stats.</Text>
            </Alert>
          )}
          {settings.baseMapCost === 0 && settings.rollingCostPerMap === 0 && (
            <Alert color="yellow" variant="light" p="xs">
              <Text size="xs">⚠️ No investment costs set. Fill in Advanced Costs before sharing.</Text>
            </Alert>
          )}
          {settings.advAstrolabeType && settings.advAstrolabeCount > 0 && (
            <Alert color="teal" variant="light" p="xs">
              <Text size="xs">🌍 Astrolabe: <Text span fw={700}>{settings.advAstrolabeType}</Text> × {settings.advAstrolabeCount} at {settings.advAstrolabePrice.toFixed(0)}c each. Is this count still accurate?</Text>
            </Alert>
          )}
          <TextInput size="xs" label="Strategy name (optional)"
            placeholder="e.g. Shrine strat with Memory Tears"
            value={stratName} onChange={(e) => setStratName(e.currentTarget.value)} />
          <MultiSelect size="xs" label="Build type tags"
            description={autoTags.length > 0 ? `Auto-detected from scarabs: ${autoTags.join(', ')}` : 'Select tags that describe this build'}
            data={ALL_TYPE_TAGS.map((t) => ({ value: t, label: t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }))}
            value={shareTags} onChange={setShareTags} maxDropdownHeight={200} searchable clearable />
          <Textarea size="xs" label="Session notes (optional)"
            placeholder="e.g. Div Scarabs were cheap this week, Divine was 280c"
            value={stratNotes} onChange={(e) => setStratNotes(e.currentTarget.value)}
            autosize minRows={2} maxRows={4} />
          <Divider label="Preview" labelPosition="left" />
          <div style={{ background: '#0d0e10', borderRadius: 6, padding: '8px 10px', maxHeight: 200, overflowY: 'auto' }}>
            <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: '#ccc', fontSize: 10, lineHeight: 1.5 }}>
              {discordExport}
            </Text>
          </div>
          <CopyButton value={discordExport} timeout={2000}>
            {({ copied, copy }) => (
              <Button leftSection={<FaDiscord size={12} />} onClick={copy}
                color={copied ? 'teal' : 'indigo'} variant="light" fullWidth>
                {copied ? '✓ Copied to clipboard!' : 'Copy to Discord'}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Modal>

      {/* ── Import modal ── */}
      <Modal opened={importOpen}
        onClose={() => { closeImport(); setImportText(''); setImportResult(null); setParseError(false); }}
        title="Analyse a Discord Export" size="lg" scrollAreaComponent="div">
        <Stack gap="sm">
          <Text size="xs" c="dimmed">Paste any WraeclastLedger export to see how it performs at your current divine price.</Text>
          <Textarea placeholder="Paste export here — auto-parses as you type..."
            value={importText} onChange={(e) => handleImportTextChange(e.currentTarget.value)}
            autosize minRows={4} maxRows={8} styles={{ input: { fontFamily: 'monospace', fontSize: 11 } }} />
          {parseError && <Alert color="red" variant="light" p="xs"><Text size="xs">Could not parse — paste the full export including the [WraeclastLedger Session] line.</Text></Alert>}
          {importResult && repriced && (
            <Stack gap="xs">
              <Divider label="Parsed" labelPosition="left" />
              <Group gap="xs" wrap="wrap">
                <Badge variant="light">{importResult.mapCount} maps</Badge>
                {importResult.mapType && <Badge variant="light" color="blue">{importResult.mapType}</Badge>}
                <Badge variant="light" color="blue">{importResult.multiplier.toFixed(2)}×</Badge>
                {importResult.chisel && importResult.chisel !== 'None' && <Badge variant="light" color="yellow">🪨 {importResult.chisel}</Badge>}
                {importResult.deliOrbType && <Badge variant="light" color="grape">🌫 {importResult.deliOrbQty}x {importResult.deliOrbType} ({importResult.deliOrbQty * 20}%)</Badge>}
                {importResult.astroType && <Badge variant="light" color="teal">🌍 {importResult.astroType}</Badge>}
              </Group>
              <Group gap="xs" wrap="wrap">
                <Badge variant="dot" color="teal">Q: {importResult.avgQuant}%</Badge>
                <Badge variant="dot" color="violet">R: {importResult.avgRarity}%</Badge>
                <Badge variant="dot" color="cyan">P: {importResult.avgPack}%</Badge>
                <Badge variant="dot" color="yellow">Curr: {importResult.avgCurr}%</Badge>
              </Group>
              {importResult.scarabs.length > 0 && <Text size="xs" c="dimmed">Scarabs: {importResult.scarabs.join(', ')}</Text>}
              {importResult.strategyNotes && (
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
                  <Text size="xs" c="dimmed" mb={2} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>Notes from author</Text>
                  <Text size="xs" style={{ color: '#aaa', lineHeight: 1.5 }}>{importResult.strategyNotes}</Text>
                </div>
              )}
              {importResult.excludedDrops.length > 0 && (
                <div style={{ background: 'rgba(255,107,107,0.04)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,107,107,0.3)' }}>
                  <Text size="xs" c="dimmed" mb={2} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>Excluded drops ({importResult.excludedDrops.length})</Text>
                  <Text size="xs" style={{ color: '#aaa', lineHeight: 1.5 }}>{importResult.excludedDrops.map((d) => `${d.name} (${d.value.toFixed(0)}c)`).join(', ')}</Text>
                </div>
              )}
              {importResult.gemInfo && (
                <Group gap={4}>
                  <Text size="xs" c="dimmed">Gem leveling:</Text>
                  <Text size="xs">{importResult.gemInfo.count} gems · buy {importResult.gemInfo.buy}c · sell {importResult.gemInfo.sell}c ·</Text>
                  <Text size="xs" fw={600} c={importResult.gemInfo.net >= 0 ? 'teal' : 'red'}>{importResult.gemInfo.net >= 0 ? '+' : ''}{importResult.gemInfo.net}c net</Text>
                </Group>
              )}
              <Group gap="lg" wrap="wrap">
                <Stack gap={0}><Text size="xs" c="dimmed">Per map cost</Text><Text size="sm" fw={600}>{importResult.perMapCost.toFixed(1)}c</Text></Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Total invest</Text><Text size="sm" fw={600}>{importResult.totalInvest.toFixed(1)}c</Text></Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Net profit</Text><Text size="sm" fw={600} c={importResult.netProfit >= 0 ? 'green' : 'red'}>{importResult.netProfit >= 0 ? '+' : ''}{importResult.netProfit.toFixed(1)}c</Text></Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Divine at time</Text><Text size="sm" fw={600}>~{repriced.impliedDivPrice}c</Text></Stack>
              </Group>
              <Divider label="At Your Divine Price" labelPosition="left" />
              <Group gap="xs" align="flex-end">
                <NumberInput label="Current divine price" value={importDivPrice}
                  onChange={(v) => setImportDivPrice(Number(v))} suffix="c" size="xs" w={140} />
                <Text size="xs" c="dimmed" mb={4}>Your panel: {settings.divinePrice}c</Text>
              </Group>
              <Group gap="lg" wrap="wrap">
                <Stack gap={0}><Text size="xs" c="dimmed">Net profit in divs now</Text>
                  <Text size="lg" fw={800} c={repriced.netProfitDivNow >= 0 ? 'green' : 'red'}>{repriced.netProfitDivNow >= 0 ? '+' : ''}{repriced.netProfitDivNow.toFixed(2)}d</Text>
                </Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Div/map now</Text>
                  <Text size="lg" fw={800} c={repriced.divPerMapNow >= 0 ? 'teal' : 'red'}>{repriced.divPerMapNow.toFixed(3)}d</Text>
                </Stack>
                <Stack gap={0}><Text size="xs" c="dimmed">Originally</Text>
                  <Text size="sm" c="dimmed">{importResult.divPerMap.toFixed(3)}d/map at {repriced.impliedDivPrice}c div</Text>
                </Stack>
              </Group>
              <Alert color="blue" variant="light" p="xs"><Text size="xs">Chaos values are fixed. Only div-denominated values scale with divine price.</Text></Alert>
              {(importResult.runRegex || importResult.slamRegex) && (
                <>
                  <Divider label="Their Regex" labelPosition="left" />
                  {importResult.runRegex && <Group gap={4} wrap="nowrap"><Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>🟢</Text><Text size="xs" c="teal" style={{ fontFamily: 'monospace', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{importResult.runRegex}</Text><CopyRegex value={importResult.runRegex} label="run" /></Group>}
                  {importResult.slamRegex && <Group gap={4} wrap="nowrap"><Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>🟠</Text><Text size="xs" c="orange" style={{ fontFamily: 'monospace', fontSize: 10, flex: 1, wordBreak: 'break-all' }}>{importResult.slamRegex}</Text><CopyRegex value={importResult.slamRegex} label="slam" /></Group>}
                </>
              )}
            </Stack>
          )}
        </Stack>
      </Modal>

      {/* ── Main card ── */}
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
          <Select size="xs" placeholder="Any league" clearable style={{ width: 110 }}
            data={['Mirage','Dawn of the Hunt','Mercenaries','Settlers','Affliction','Standard'].map((l) => ({ value: l, label: l }))}
            value={leagueFilter} onChange={setLeagueFilter} />
          <TextInput size="xs" placeholder="Min d/map" style={{ width: 80 }}
            value={minDiv} onChange={(e) => setMinDiv(e.currentTarget.value)} />
          <Select size="xs" style={{ width: 90 }}
            data={[{ value: 'all', label: 'All time' },{ value: '1d', label: 'Last 24h' },{ value: '3d', label: 'Last 3 days' },{ value: '7d', label: 'Last 7 days' }]}
            value={period} onChange={(v) => setPeriod(v ?? 'all')} />
          <Select size="xs" style={{ flex: 1 }}
            data={[{ value: 'posted_at', label: 'Newest' },{ value: 'div_per_map', label: 'Best d/map' },{ value: 'net_profit', label: 'Most profit' },{ value: 'least_invest', label: 'Least invest' },{ value: 'score', label: 'Top rated 👍' }]}
            value={sortBy} onChange={(v) => setSortBy(v ?? 'posted_at')} />
        </Group>

        <Group gap={6} mb={3} style={{ flexShrink: 0, paddingLeft: 10, paddingRight: 10 }}>
          <div style={{ width: 22, flexShrink: 0 }} />
          <Text size="xs" c="dimmed" style={{ width: 88, flexShrink: 0, fontSize: 10 }}>Author</Text>
          <Text size="xs" c="dimmed" style={{ width: 140, flexShrink: 0, fontSize: 10 }}>Tags</Text>
          <Text size="xs" c="dimmed" style={{ width: 40, flexShrink: 0, fontSize: 10 }}>Mod</Text>
          <Text size="xs" c="dimmed" style={{ width: 26, flexShrink: 0, fontSize: 10 }}>Maps</Text>
          <Text size="xs" c="dimmed" style={{ width: 58, flexShrink: 0, fontSize: 10 }}>Cost/map</Text>
          <Text size="xs" c="dimmed" style={{ width: 96, flexShrink: 0, fontSize: 10 }}>Total Invest</Text>
          <Text size="xs" c="dimmed" style={{ width: 100, flexShrink: 0, fontSize: 10 }}>Total Profit</Text>
          <Text size="xs" c="dimmed" style={{ width: 36, flexShrink: 0, fontSize: 10 }}>Score</Text>
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
            {strategies.map((s) => <StrategyCard key={s.id} strategy={s} onLoadBuild={handleLoadBuild} showDate={showDate} />)}
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
