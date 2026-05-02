import {
  Modal, Stack, Text, Alert, TextInput, MultiSelect,
  Textarea, Group, Switch, Divider, Button, CopyButton,
} from '@mantine/core';
import { useMemo, useState } from 'react';
import { FaDiscord } from 'react-icons/fa';
import { useSessionStore } from '../store/useSessionStore';
import { generateRunRegex, generateSlamRegex, trimmedMean } from '../utils/priceUtils';
import { ALL_TYPE_TAGS } from '../utils/strategyConstants';

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Initial tags to pre-populate — auto-detected by the parent before opening. */
  initialTags: string[];
}

export const ShareModal = ({ opened, onClose, initialTags }: Props) => {
  const { maps, settings, lootItems, baselineTotal, updateSetting } = useSessionStore();

  const [shareTags,  setShareTags]  = useState<string[]>(initialTags);
  const [stratName,  setStratName]  = useState('');
  const [stratNotes, setStratNotes] = useState('');
  const [isGroupPlay, setIsGroupPlay] = useState(false);

  // Re-sync tags when the modal is opened with new initial tags
  // (parent calls onOpen which triggers a new initialTags value)
  useMemo(() => { setShareTags(initialTags); }, [initialTags]); // eslint-disable-line react-hooks/exhaustive-deps

  const discordExport = useMemo(() => {
    const excludedItems = lootItems.filter((l) => l.excluded);
    const gemNetPL  = (settings.advGemCount * settings.advGemSellPrice) - (settings.advGemCount * settings.advGemBuyPrice);
    const chiselCost = settings.chiselType && settings.chiselPrice > 0 ? settings.chiselPrice : 0;
    const scarabCost = settings.scarabs.reduce((acc, s) => acc + (s.cost || 0), 0);
    const league     = settings.leagueName;
    let perMap = settings.baseMapCost + chiselCost + scarabCost;
    if (settings.advSplitPrice > 0) perMap = (settings.baseMapCost + chiselCost + settings.advSplitPrice) / 2 + scarabCost;
    const n               = maps.length;
    const totalInvestment = perMap * n + settings.rollingCostPerMap;
    const gemBuyOffset    = (settings.advGemName?.trim() && settings.advGemCount > 0 && settings.advGemBuyPrice > 0)
      ? settings.advGemCount * settings.advGemBuyPrice : 0;
    const rawReturn  = lootItems.filter((l) => !l.excluded).reduce((a, b) => a + b.total, 0);
    const hasBl      = baselineTotal > 0 && lootItems.length > 0;
    const totalReturn = rawReturn + gemBuyOffset - (hasBl ? baselineTotal : 0);
    const netProfit  = totalReturn - totalInvestment;
    const divPrice   = settings.divinePrice || 1;
    const divPerMap  = n > 0 ? (netProfit / divPrice) / n : 0;
    const scarabOfRiskCount = settings.scarabs.filter((s) => s.name.toLowerCase().includes('of risk')).length * 2;
    const baseModCount = settings.mapType === '8-mod' ? 8 : 6;
    const mountBonus   = settings.mountingModifiers ? (baseModCount + scarabOfRiskCount) * 2 : 0;
    const multiplier   = 1 + (settings.fragmentsUsed * 3 + settings.smallNodesAllocated * 2 + mountBonus) / 100;
    const avgQuant   = trimmedMean(maps.map((m) => m.quantity));
    const avgPack    = trimmedMean(maps.map((m) => m.packSize));
    const avgCurr    = trimmedMean(maps.map((m) => m.moreCurrency));
    const avgRarity  = trimmedMean(maps.map((m) => m.rarity));
    const avgScarabs = trimmedMean(maps.map((m) => m.moreScarabs));
    const chiselLine  = settings.chiselType
      ? '🪨 **Chisel:** ' + settings.chiselType + ' (' + settings.chiselPrice + 'c)'
      : '🪨 **Chisel:** None';
    const scarabLines = settings.scarabs.filter((s) => s.name).map((s) => `  - ${s.name} (${s.cost}c)`).join('\n');
    const deliLine    = settings.advDeliOrbType && settings.advDeliOrbQtyPerMap > 0
      ? '🌫️ **Delirium Orbs:** ' + settings.advDeliOrbQtyPerMap + 'x ' + settings.advDeliOrbType +
        ' (' + (settings.advDeliOrbQtyPerMap * 20) + '% delirious, ' +
        settings.advDeliOrbPriceEach.toFixed(1) + 'c each = ' +
        (settings.advDeliOrbQtyPerMap * settings.advDeliOrbPriceEach).toFixed(1) + 'c/map)'
      : null;
    const astroLine = settings.advAstrolabeType
      ? '🌍 **Astrolabe:** ' + settings.advAstrolabeType +
        ' (' + settings.advAstrolabeCount + 'x, ' + settings.advAstrolabePrice.toFixed(0) + 'c each)'
      : null;
    const atlasUrl = settings.atlasTreeUrl?.includes('#') ? settings.atlasTreeUrl : null;
    let regexBlock = '';
    if (n > 0) {
      const avg    = { avgQuant, avgPack, avgCurr, avgRarity, avgScarabs };
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
      ...(atlasUrl  ? [`🌳 **Atlas Tree:** ${atlasUrl}`] : []),
      ...(league    ? [`🏆 **League:** ${league}`] : []),
      ...(stratName.trim()   ? [`📝 **Strategy:** ${stratName.trim()}`] : []),
      ...(shareTags.length > 0 ? [`🏷️ **Tags:** ${shareTags.join(', ')}`] : []),
      ...(stratNotes.trim()  ? [`📋 **Notes:** ${stratNotes.trim()}`] : []),
      ...(isGroupPlay ? [`👥 **Party Play:** Yes`] : []),
      ...(excludedItems.length > 0 ? [
        `⛔ **Excluded drops (${excludedItems.length}):** ${excludedItems.map((i) => `${i.name} (${i.total.toFixed(0)}c)`).join(', ')}`
      ] : []),
      ...(settings.advGemCount > 0 ? [
        `💫 **Gem leveling:** ${settings.advGemCount} gems | buy ${(settings.advGemCount * settings.advGemBuyPrice).toFixed(0)}c | sell ${(settings.advGemCount * settings.advGemSellPrice).toFixed(0)}c | net ${gemNetPL >= 0 ? '+' : ''}${gemNetPL.toFixed(0)}c *(excluded from map profit)*`
      ] : []),
      ...(regexBlock ? [regexBlock] : []),
    ].join('\n');
  }, [maps, settings, lootItems, baselineTotal, shareTags, stratName, stratNotes, isGroupPlay]);

  return (
    <Modal opened={opened} onClose={onClose} title="Share My Session" size="md">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Copy this export and paste it into your strategy Discord channel. The bot picks it up automatically.
        </Text>
        <TextInput
          size="xs"
          label="Your Discord tag"
          description="Used to highlight your own strategies in the Strategy Browser"
          placeholder="e.g. traceur"
          value={settings.discordTag}
          onChange={(e) => updateSetting('discordTag', e.currentTarget.value)}
        />
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
          description={`Select tags that describe this build`}
          data={ALL_TYPE_TAGS.map((t) => ({ value: t, label: t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }))}
          value={shareTags} onChange={setShareTags} maxDropdownHeight={200} searchable clearable />
        <Textarea size="xs" label="Session notes (optional)"
          placeholder="e.g. Div Scarabs were cheap this week, Divine was 280c"
          value={stratNotes} onChange={(e) => setStratNotes(e.currentTarget.value)}
          autosize minRows={2} maxRows={4} />
        <Group gap={8} align="center">
          <Switch size="sm" checked={isGroupPlay} onChange={(e) => setIsGroupPlay(e.currentTarget.checked)} />
          <Stack gap={0}>
            <Text size="xs" fw={500}>Party / Group play</Text>
            <Text size="xs" c="dimmed" style={{ fontSize: 10 }}>Additional players increase loot. Mark this so others know the strategy scales with a group.</Text>
          </Stack>
        </Group>
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
  );
};
