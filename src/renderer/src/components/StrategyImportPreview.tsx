import { Alert, Badge, Button, Divider, Group, Stack, Text } from '@mantine/core';
import type { ImportPreview } from '../utils/importPreview';
import { fixedDeliriumPercentage } from '../../../shared/deliriumOrbs';
import { chiselItemName, deliOrbItemName } from '../utils/itemIcons';
import { COLOR } from '../utils/uiTokens';
import { SetupHistoryPreview } from './SetupHistoryPreview';
import { PoeItemIcon } from './ui/PoeItemIcon';
import { RegexLine } from './ui/RegexLine';
import { SectionLabel } from './ui/SectionLabel';

export function StrategyImportPreview({ data: p, divinePrice, panelDivinePrice, onDivinePrice, onLoad }: {
  data: ImportPreview; divinePrice: number; panelDivinePrice: number;
  onDivinePrice: (value: number) => void; onLoad: () => void;
}) {
  const h = p.history;
  const fixedPercent = fixedDeliriumPercentage(p.league, p.delirium?.countPerMap ?? null);
  return <Stack gap="xs">
    {p.operationError && <Alert color="red" variant="light" p="xs" title="Invalid strategy operation marker">
      <Text size="xs">This export contains incomplete, malformed, or competing update/evidence markers.
        It can be inspected, but its build cannot be loaded as a normal strategy.</Text></Alert>}
    <Divider label="Parsed" labelPosition="left" />
    {p.title && <Text size="sm" fw={600}>{p.title}</Text>}
    {p.league && <Text size="xs" c="dimmed">Source league: {p.league}</Text>}
    <Group gap="xs" wrap="wrap">
      {h?.maps != null && <Badge variant="light">{h.maps} maps</Badge>}
      {p.mapType && <Badge variant="light" color="blue">{p.mapType}</Badge>}
      {h?.multiplier != null && <Badge variant="light">{h.multiplier.toFixed(2)}×</Badge>}
      {p.chisel && <Badge variant="light" color="yellow" leftSection={<PoeItemIcon name={chiselItemName(p.chisel)} size={14} category="chisel" />}>{p.chisel}</Badge>}
      {p.delirium && <Badge variant="light" color="grape" leftSection={<PoeItemIcon name={deliOrbItemName(p.delirium.type)} size={14} category="orb" />}>
        {p.delirium.countPerMap ?? '?'}x {p.delirium.type}{fixedPercent !== null ? ` (${fixedPercent}%)` : ''}</Badge>}
      {p.astrolabe && <Badge variant="light" color="teal" leftSection={<PoeItemIcon name={p.astrolabe} size={14} category="astrolabe" />}>{p.astrolabe}</Badge>}
      {p.isGroupPlay && <Badge variant="light" color="cyan">Group{p.groupSize !== null ? ` (${p.groupSize} players)` : ''}</Badge>}
      {h?.atlasPoints != null && <Badge variant="light" color="gray">Atlas {h.atlasPoints}/{h.atlasPointsMax ?? '?'}</Badge>}
    </Group>
    {p.deliriumOrbTypes?.length ? <Text size="xs">Delirium Orb types · {p.deliriumOrbTypes.join(', ')}</Text> : null}
    {p.observedDelirium && <Text size="xs" c="dimmed">
      Observed Delirium · {p.observedDelirium.levelCounts.map(level => `${level.percentage}% × ${level.count}`).join(', ')}
      {p.observedDelirium.rewardCounts.length > 0 && ` · ${p.observedDelirium.rewardCounts.map(reward => `${reward.name} × ${reward.count}`).join(', ')}`}
    </Text>}
    {p.delirium && fixedPercent === null && !p.observedDelirium &&
      <Text size="xs" c="dimmed">Map Delirium percentage unrecorded.</Text>}
    <Group gap="xs" wrap="wrap">{([
      ['Q', h?.quantity, 'teal'], ['R', h?.rarity, 'violet'], ['P', h?.packSize, 'cyan'], ['Curr', h?.currency, 'yellow'],
    ] as const).map(([label, value, color]) => <Badge key={label} variant="dot" color={color}>{label}: {value == null ? 'Unrecorded' : `${value}%`}</Badge>)}</Group>
    {p.scarabs.length > 0 && <div><SectionLabel mb={4}>Scarabs</SectionLabel><Group gap={4} wrap="wrap">
      {p.scarabs.map((name, i) => <Badge key={`${i}:${name}`} variant="light" color="orange"
        leftSection={<PoeItemIcon name={name} size={14} category="scarab" />}>{name}{h?.scarabPrices[i] != null ? ` (${h.scarabPrices[i]}c)` : ''}</Badge>)}
    </Group></div>}
    {p.notes && <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 4, padding: '6px 8px', borderLeft: '2px solid rgba(255,255,255,0.15)' }}>
      <SectionLabel mb={2}>Notes from author</SectionLabel><Text size="xs" style={{ color: COLOR.textDim, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{p.notes}</Text></div>}
    {p.excludedDrops.length > 0 && <div><SectionLabel mb={2}>Excluded drops ({p.excludedDrops.length})</SectionLabel>
      <Text size="xs" c="dimmed">{p.excludedDrops.map((d) => `${d.name} (${d.value.toFixed(0)}c)`).join(', ')}</Text></div>}
    {p.gemInfo && <Group gap={4}><Text size="xs" c="dimmed">Gem leveling:</Text>
      <Text size="xs">{p.gemInfo.count} gems · buy {p.gemInfo.buy}c · sell {p.gemInfo.sell}c ·</Text>
      <Text size="xs" fw={600} c={p.gemInfo.net >= 0 ? 'teal' : 'red'}>{p.gemInfo.net >= 0 ? '+' : ''}{p.gemInfo.net}c net</Text></Group>}
    {h ? <SetupHistoryPreview history={h} approximateTotals={p.approximateTotals} divinePrice={divinePrice} panelDivinePrice={panelDivinePrice} onDivinePrice={onDivinePrice} />
      : <Text size="xs" c="dimmed">Historical results and prices were not included in this code.</Text>}
    {p.atlasTreeUrl && <Text size="xs" c="dimmed">Atlas Tree included. Atlas Calc will read the tree after loading.</Text>}
    {(p.runRegex || p.slamRegex) && <><Divider label="Their Regex" labelPosition="left" />
      {p.runRegex && <RegexLine value={p.runRegex} badge="Run" badgeColor="green" c="teal" />}
      {p.slamRegex && <RegexLine value={p.slamRegex} badge="Slam" badgeColor="orange" c="orange" />}</>}
    <Button variant="light" color="blue" size="xs" disabled={p.operationError !== null} onClick={onLoad}>Load Build Settings</Button>
  </Stack>;
}
