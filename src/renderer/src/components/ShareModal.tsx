import {
  Modal, Stack, Text, Alert, TextInput, NumberInput, MultiSelect,
  Textarea, Group, SegmentedControl, Divider, Button, CopyButton,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { IconBrandDiscord, IconCheck } from '@tabler/icons-react';
import { useSessionKeys } from '../store/useSessionStore';
import { buildDiscordExport } from '../utils/discordExport';
import { computeRollingSessionTotal } from '../utils/profit';
import { parseTimeInput } from '../utils/sessionTime';
import { computeTimeEstimate, formatActiveTime } from '../utils/timeEstimate';
import { ALL_TYPE_TAGS, STRATEGY_API_URL, type Strategy } from '../utils/strategyConstants';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { buildUpdateComparison, rowDirection } from '../utils/updateCompare';
import { COLOR, FONT } from '../utils/uiTokens'

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Initial tags to pre-populate — auto-detected by the parent before opening. */
  initialTags: string[];
}

export const ShareModal = ({ opened, onClose, initialTags }: Props) => {
  const {
    maps, settings, lootItems, baselineTotal,
    investmentNeutralization, discordTag, setDiscordTag, updateAdvSetting, updateSetting,
  } = useSessionKeys(
    'maps', 'settings', 'lootItems', 'baselineTotal',
    'investmentNeutralization', 'discordTag', 'setDiscordTag', 'updateAdvSetting', 'updateSetting',
  );

  // Versioning client half: a session carrying an update target shares as an
  // UPDATE (marker line in the export). "Share as new instead" CLEARS the
  // persisted target — matrix case (c): later shares must not silently update.
  const updateTargetId   = settings.updateTargetStrategyId ?? null;
  const updateTargetName = settings.updateTargetStrategyName ?? null;
  const clearUpdateTarget = () => {
    updateSetting('updateTargetStrategyId', null);
    updateSetting('updateTargetStrategyName', null);
  };

  const [shareTags,  setShareTags]  = useState<string[]>(initialTags);
  const [stratName,  setStratName]  = useState('');
  const [stratNotes, setStratNotes] = useState('');
  const [isGroupPlay, setIsGroupPlay] = useState(false);
  const [groupSize,  setGroupSize]  = useState(2);
  const [timeText,   setTimeText]   = useState('');

  // Re-sync tags when the modal is opened with new initial tags
  // (parent calls onOpen which triggers a new initialTags value)
  useEffect(() => { setShareTags(initialTags); }, [initialTags]);

  // Prefill the session-time input from the Tier-1 local estimate (WP9):
  // computeTimeEstimate's activeMs already excludes break-like gaps, so the
  // prefill is ACTIVE mapping time. It is an ESTIMATE the user can edit or
  // clear — empty means "no claim" and the export line is suppressed entirely.
  useEffect(() => {
    if (!opened) return;
    const est = computeTimeEstimate(maps);
    setTimeText(est ? String(Math.round(est.activeMs / 60_000)) : '');
    // Update run: prefill the strategy name from the target so an untouched
    // field can't blank the published name (the update replaces display
    // columns from THIS export). User edits still win — a rename via update
    // is legitimate (names are labels, not identity).
    if (updateTargetId && updateTargetName && stratName.trim() === '') {
      setStratName(updateTargetName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately only on open
  }, [opened]);

  // Canonical wire value (minutes) derived from the flexible input; null when
  // empty or unparseable.
  const sessionMinutes = parseTimeInput(timeText);
  const timeCaption = timeText.trim() === ''
    ? 'Empty — time will not be shared'
    : sessionMinutes != null
      ? `Shared as ${sessionMinutes} min (${formatActiveTime(sessionMinutes * 60_000)})`
      : 'Not recognized — use minutes (245) or hours (4h / 4.5h)';

  // All math lives in utils/profit.ts via buildDiscordExport (WP1) — the export
  // is guaranteed to match the Dashboard.
  const discordExport = useMemo(() => buildDiscordExport({
    maps, settings, lootItems, baselineTotal, investmentNeutralization,
    stratName, stratNotes, shareTags, isGroupPlay,
    groupSize: isGroupPlay ? groupSize : null,
    sessionMinutes,
    updateStrategyId: updateTargetId,
  }), [maps, settings, lootItems, baselineTotal, investmentNeutralization,
       stratName, stratNotes, shareTags, isGroupPlay, groupSize, sessionMinutes,
       updateTargetId]);

  const rollingSessionTotal = computeRollingSessionTotal(settings, maps.length);

  // ── Update run: compare the about-to-publish numbers to what's live now ─────
  // Fetch the current published strategy by uuid so the author can eyeball what
  // the update will change BEFORE committing. The "next" side reuses the parsed
  // export (exactly what the server stores), so the preview can't drift from the
  // outcome. Silent-failure-averse: a fetch error shows an inline note, never a
  // blank panel — and never blocks sharing.
  const [compareCurrent, setCompareCurrent] = useState<Strategy | null>(null);
  const [compareError,   setCompareError]   = useState<string | null>(null);
  useEffect(() => {
    if (!opened || !updateTargetId) { setCompareCurrent(null); setCompareError(null); return; }
    let cancelled = false;
    setCompareError(null);
    fetch(`${STRATEGY_API_URL}/strategies/${updateTargetId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((s: Strategy) => { if (!cancelled) setCompareCurrent(s); })
      .catch(() => { if (!cancelled) { setCompareCurrent(null); setCompareError('Could not load the current published version to compare.'); } });
    return () => { cancelled = true; };
  }, [opened, updateTargetId]);

  const compareRows = useMemo(() => {
    if (!compareCurrent) return null;
    const next = parseDiscordExport(discordExport);
    return next ? buildUpdateComparison(compareCurrent, next) : null;
  }, [compareCurrent, discordExport]);

  const fmtCompare = (v: number | null, kind: string): string => {
    if (v == null) return '—';
    if (kind === 'pct')   return `${Math.round(v)}%`;
    if (kind === 'div')   return `${v.toFixed(2)}d`;
    if (kind === 'count') return String(Math.round(v));
    return `${Math.round(v)}c`; // chaos
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Share My Session" size="md">
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          Copy this export and paste it into your strategy Discord channel. The bot picks it up automatically.
        </Text>
        {updateTargetId && (
          <Alert color="indigo" variant="light" p="xs">
            <Text size="xs" mb={4}>
              Updating <Text span fw={700}>{updateTargetName ?? 'your strategy'}</Text>
              {compareCurrent?.current_revision ? <Text span c="dimmed"> (currently v{compareCurrent.current_revision})</Text> : null}
              {' '}— this share replaces your published result in place (votes and post date kept).
            </Text>

            {compareError && (
              <Text size="xs" c="dimmed" mb={4} style={{ fontSize: FONT.small }}>{compareError}</Text>
            )}

            {compareRows && (
              <Stack gap={1} mb={6}>
                <Group gap={0} wrap="nowrap" px={4}>
                  <Text style={{ flex: 1, fontSize: FONT.small }} c="dimmed">Change vs published</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: FONT.small }} c="dimmed">now</Text>
                  <Text style={{ width: 70, textAlign: 'right', fontSize: FONT.small }} c="dimmed">this share</Text>
                </Group>
                {compareRows.map((row) => {
                  const dir = rowDirection(row);
                  const color = dir === 'same' || dir == null ? COLOR.dim : COLOR.accent;
                  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
                  return (
                    <Group key={row.label} gap={0} wrap="nowrap" px={4}>
                      <Text style={{ flex: 1, fontSize: FONT.small }} c="dimmed">{row.label}</Text>
                      <Text style={{ width: 70, textAlign: 'right', fontSize: FONT.small, fontVariantNumeric: 'tabular-nums' }} c="dimmed">
                        {fmtCompare(row.before, row.kind)}
                      </Text>
                      <Text style={{ width: 70, textAlign: 'right', fontSize: FONT.small, fontVariantNumeric: 'tabular-nums', color }}>
                        {arrow ? `${arrow} ` : ''}{fmtCompare(row.after, row.kind)}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            )}

            <Button size="xs" variant="default" onClick={clearUpdateTarget}>
              Share as new strategy instead
            </Button>
          </Alert>
        )}
        <TextInput
          size="xs"
          label="Your Discord tag"
          description="Used to highlight your own strategies in the Strategy Browser"
          placeholder="e.g. your-discord-name"
          value={discordTag}
          onChange={(e) => setDiscordTag(e.currentTarget.value)}
        />
        {maps.length === 0 && (
          <Alert color="orange" variant="light" p="xs">
            <Text size="xs">No maps parsed yet — parse some maps in Map Log first for complete stats.</Text>
          </Alert>
        )}
        {settings.baseMapCost === 0 && rollingSessionTotal === 0 && (
          <Alert color="yellow" variant="light" p="xs">
            <Text size="xs">No investment costs set. Fill in Advanced Costs before sharing.</Text>
          </Alert>
        )}
        {settings.advAstrolabeType && (
          <Alert color="teal" variant="light" p="xs">
            <Text size="xs" mb={4}>
              Astrolabe: <Text span fw={700}>{settings.advAstrolabeType}</Text> at {settings.advAstrolabePrice.toFixed(0)}c each — the count drifts over a session, so double-check how many you actually used before sharing:
            </Text>
            <Group gap={6} align="center" wrap="nowrap">
              <NumberInput
                size="xs"
                w={90}
                min={0}
                value={settings.advAstrolabeCount}
                onChange={(v) => updateAdvSetting('advAstrolabeCount', Number(v))}
                aria-label="Astrolabe count used"
              />
              <Text size="xs" c="dimmed">used</Text>
            </Group>
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
        <Stack gap={4}>
          <Group gap={8} align="center" wrap="nowrap">
            <Text size="xs" fw={500} style={{ flexShrink: 0 }}>Play style</Text>
            <SegmentedControl
              size="xs"
              value={isGroupPlay ? 'group' : 'solo'}
              onChange={(v) => setIsGroupPlay(v === 'group')}
              data={[
                { value: 'solo', label: 'Solo' },
                { value: 'group', label: 'Group / Party' },
              ]}
            />
          </Group>
          <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>
            If others mapped with you, choose Group / Party — it flags that the loot numbers assume more than one player.
          </Text>
          {isGroupPlay && (
            <Group gap={6} align="center" wrap="nowrap" mt={2}>
              <NumberInput
                size="xs" w={70} min={2} max={6}
                value={groupSize}
                onChange={(v) => setGroupSize(Math.min(6, Math.max(2, Number(v) || 2)))}
                aria-label="Party size including you"
              />
              <Text size="xs" c="dimmed">players (including you)</Text>
            </Group>
          )}
        </Stack>
        <Stack gap={2}>
          <TextInput size="xs" label="Session time (optional)"
            description="Prefilled with your estimated ACTIVE mapping time (breaks excluded) when available — adjust, or clear to not share it"
            placeholder="e.g. 245 or 4h"
            value={timeText} onChange={(e) => setTimeText(e.currentTarget.value)} />
          <Text size="xs" c={timeText.trim() !== '' && sessionMinutes == null ? 'orange' : 'dimmed'} style={{ fontSize: FONT.small }}>
            {timeCaption}
          </Text>
        </Stack>
        <Divider label="Preview" labelPosition="left" />
        <div style={{ background: COLOR.bgDeep, borderRadius: 6, padding: '8px 10px', maxHeight: 200, overflowY: 'auto' }}>
          <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: COLOR.textSoft, fontSize: FONT.small, lineHeight: 1.5 }}>
            {discordExport}
          </Text>
        </div>
        <CopyButton value={discordExport} timeout={2000}>
          {({ copied, copy }) => (
            <Button leftSection={copied ? <IconCheck size={14} /> : <IconBrandDiscord size={14} />} onClick={copy}
              color={copied ? 'teal' : 'indigo'} variant="light" fullWidth>
              {copied ? 'Copied to clipboard!' : 'Copy to Discord'}
            </Button>
          )}
        </CopyButton>
      </Stack>
    </Modal>
  );
};
