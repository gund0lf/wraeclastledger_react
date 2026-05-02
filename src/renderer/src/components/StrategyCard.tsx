import {
  Text, Group, Stack, Badge, ActionIcon, Tooltip, Button,
  CopyButton, Collapse, SimpleGrid,
} from '@mantine/core';
import { useState } from 'react';
import {
  FaChevronDown, FaChevronRight, FaCopy, FaCheck,
  FaThumbsUp, FaThumbsDown, FaExternalLinkAlt,
} from 'react-icons/fa';
import { Strategy, TAG_COLORS, MAP_TYPE_TAGS, MAP_TYPE_LABELS, TAG_SHORT } from '../utils/strategyConstants';
import { fc, f1 } from '../utils/parseDiscordExport';

// ─── CopyRegex ────────────────────────────────────────────────────────────────

export const CopyRegex = ({ value, label }: { value: string; label: string }) => (
  <CopyButton value={value} timeout={2000}>
    {({ copied, copy }) => (
      <ActionIcon size="xs" variant={copied ? 'filled' : 'subtle'} color={copied ? 'teal' : 'gray'} onClick={copy}
        title={copied ? 'Copied!' : `Copy ${label} regex`}>
        {copied ? <FaCheck size={8} /> : <FaCopy size={8} />}
      </ActionIcon>
    )}
  </CopyButton>
);

// ─── TagStrip ─────────────────────────────────────────────────────────────────

export const TagStrip = ({ tagStr, maxVisible = 3 }: { tagStr?: string | null; maxVisible?: number }) => {
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

// ─── StrategyCard ─────────────────────────────────────────────────────────────

export const StrategyCard = ({ strategy, onLoadBuild, showDate, discordTag }: {
  strategy: Strategy; onLoadBuild: (s: Strategy) => void; showDate: boolean; discordTag?: string;
}) => {
  const [open, setOpen] = useState(false);
  const isOwn = !!(discordTag?.trim() && strategy.discord_username?.toLowerCase() === discordTag.trim().toLowerCase());
  const date = (() => { try { return new Date(strategy.posted_at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }); } catch { return '—'; } })();
  const div = strategy.div_per_map ??
    (strategy.net_profit != null && strategy.divine_price != null && strategy.divine_price > 0 && strategy.map_count != null && strategy.map_count > 0
      ? strategy.net_profit / strategy.divine_price / strategy.map_count
      : null);
  const divColor    = div != null ? (div >= 8 ? '#51cf66' : div >= 4 ? '#74c0fc' : div >= 1 ? '#ffd43b' : '#868e96') : '#868e96';
  const score       = strategy.score ?? 0;
  const scoreColor  = score > 0 ? '#51cf66' : score < 0 ? '#ff6b6b' : '#555';
  const profitColor = strategy.net_profit != null ? (strategy.net_profit >= 0 ? '#51cf66' : '#ff6b6b') : '#555';

  const isGroup = strategy.is_group_play ||
    (strategy.raw_export ? /Party Play:\s*Yes/i.test(strategy.raw_export) : false);

  return (
    <div style={{
      background: isOwn ? 'rgba(74,158,255,0.03)' : score <= -3 ? 'rgba(255,107,107,0.04)' : 'rgba(255,255,255,0.025)',
      border: `1px solid ${score <= -3 ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 8, overflow: 'hidden',
      borderLeft: isOwn ? '3px solid rgba(74,158,255,0.55)' : undefined,
    }}>
      <Group gap={6} wrap="nowrap" onClick={() => setOpen((o) => !o)}
        style={{ cursor: 'pointer', padding: '7px 10px', userSelect: 'none' }}>
        <ActionIcon size={22} variant="transparent" c="dimmed" style={{ flexShrink: 0 }}>
          {open ? <FaChevronDown size={8} /> : <FaChevronRight size={8} />}
        </ActionIcon>
        <Stack gap={0} style={{ width: 88, flexShrink: 0, paddingLeft: 4 }}>
          <Group gap={3} wrap="nowrap">
            <Text size="xs" fw={600} lineClamp={1}>{strategy.discord_username}</Text>
            {isGroup && (
              <Tooltip label="Group / Party play — loot scales with more players" withArrow>
                <Badge size="xs" color="cyan" variant="light" style={{ fontSize: 7, padding: '0 3px', flexShrink: 0, cursor: 'help' }}>👥</Badge>
              </Tooltip>
            )}
          </Group>
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

          {(() => {
            if (!strategy.per_map_cost) return null;
            const scarabTotal = (strategy.scarabs ?? []).reduce((a, s) => a + (s.cost ?? 0), 0);
            const chiselM = strategy.raw_export?.match(/Chisel:\s*[^(]+\((\d+)c\s*each\)/i);
            const chiselCost = chiselM ? parseInt(chiselM[1]) : 0;
            const baseImplied = Math.round(strategy.per_map_cost - scarabTotal - chiselCost);
            if (scarabTotal === 0 && chiselCost === 0) return null; // nothing to break down
            return (
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 4, padding: '5px 8px', marginBottom: 8 }}>
                <Text size="xs" c="dimmed" mb={3} style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>Cost breakdown / map</Text>
                <Group gap="md" wrap="wrap">
                  {baseImplied > 0 && <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Base map</Text><Text size="xs">{baseImplied}c</Text></Group>}
                  {chiselCost > 0 && <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Chisel</Text><Text size="xs">{chiselCost}c</Text></Group>}
                  {scarabTotal > 0 && <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Scarabs</Text><Text size="xs">{scarabTotal.toFixed(0)}c</Text></Group>}
                  <Group gap={3}><Text size="xs" c="dimmed" style={{ fontSize: 10 }}>= Total</Text><Text size="xs" fw={600}>{Math.round(strategy.per_map_cost)}c</Text></Group>
                </Group>
              </div>
            );
          })()}

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
