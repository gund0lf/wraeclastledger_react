import {
  Modal, Stack, Text, Alert, TextInput, NumberInput, MultiSelect,
  Textarea, Group, SegmentedControl, Divider, Button, CopyButton,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { IconBrandDiscord, IconCheck } from '@tabler/icons-react';
import { useSessionKeys } from '../store/useSessionStore';
import { buildDiscordExport } from '../utils/discordExport';
import { parseTimeInput } from '../utils/sessionTime';
import { computeTimeEstimate, formatActiveTime } from '../utils/timeEstimate';
import { ALL_TYPE_TAGS, STRATEGY_API_URL, type Strategy } from '../utils/strategyConstants';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { missingShareFields } from '../utils/shareCompleteness';
import { buildUpdateComparison, rowDirection } from '../utils/updateCompare';
import { COLOR, FONT } from '../utils/uiTokens'
import { getManifest } from '../utils/gameData';
import { hasImpossibleAtlasPoints, leagueShareBlock } from '../utils/shareValidation';
import { DISCORD_MSG_LIMIT, STRAT_NAME_MAX, computeShareBudget } from '../utils/exportBudget';
import {
  EvidencePreflightError,
  prepareEvidenceSubmission,
  type EvidenceSubmissionProof,
} from '../utils/evidencePreflight';

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
  const evidenceTargetId = settings.evidenceTargetStrategyId ?? null;
  const evidenceTargetName = settings.evidenceTargetStrategyName ?? null;
  const evidenceExpectedRevision = settings.evidenceTargetExpectedRevision ?? null;
  const evidenceTargetFingerprint = settings.evidenceTargetSetupFingerprint ?? null;
  const clearEvidenceTarget = () => {
    updateSetting('evidenceTargetStrategyId', null);
    updateSetting('evidenceTargetStrategyName', null);
    updateSetting('evidenceTargetExpectedRevision', null);
    updateSetting('evidenceTargetSetupFingerprint', null);
  };
  const switchEvidenceToUpdate = () => {
    const id = evidenceTargetId;
    const name = evidenceTargetName;
    clearEvidenceTarget();
    updateSetting('updateTargetStrategyId', id);
    updateSetting('updateTargetStrategyName', name);
  };

  const [shareTags,  setShareTags]  = useState<string[]>(initialTags);
  const [stratName,  setStratName]  = useState('');
  const [stratNotes, setStratNotes] = useState('');
  const [isGroupPlay, setIsGroupPlay] = useState(false);
  const [groupSize,  setGroupSize]  = useState(2);
  const [timeText,   setTimeText]   = useState('');
  const [evidenceCurrent, setEvidenceCurrent] = useState<Strategy | null>(null);
  const [evidenceFetchError, setEvidenceFetchError] = useState<string | null>(null);
  const [evidenceProof, setEvidenceProof] = useState<EvidenceSubmissionProof | null>(null);
  const [evidencePreflightError, setEvidencePreflightError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !evidenceTargetId) {
      setEvidenceCurrent(null);
      setEvidenceFetchError(null);
      return;
    }
    let cancelled = false;
    setEvidenceCurrent(null);
    setEvidenceFetchError(null);
    fetch(`${STRATEGY_API_URL}/strategies/${evidenceTargetId}`)
      .then((response) => (
        response.ok ? response.json() : Promise.reject(new Error(String(response.status)))
      ))
      .then((strategy: Strategy) => {
        if (cancelled) return;
        const parsed = strategy.raw_export ? parseDiscordExport(strategy.raw_export) : null;
        if (!parsed || parsed.operationError) {
          setEvidenceFetchError('The current published strategy export cannot be verified.');
          return;
        }
        setEvidenceCurrent(strategy);
        setStratName(strategy.strategy_name || parsed.strategyName || '');
        setStratNotes(strategy.strategy_notes || parsed.strategyNotes || '');
        const apiTags = (strategy.type_tag ?? '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);
        setShareTags(apiTags.length > 0 ? apiTags : parsed.typeTags);
        setIsGroupPlay(parsed.isGroupPlay);
        setGroupSize(parsed.groupSize ?? 2);
      })
      .catch(() => {
        if (!cancelled) setEvidenceFetchError('Could not load the current published strategy. Evidence sharing is blocked until it can be rechecked.');
      });
    return () => { cancelled = true; };
  }, [opened, evidenceTargetId]);

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
  const activeManifest = getManifest();
  const timeCaption = timeText.trim() === ''
    ? 'Empty — time will not be shared'
    : sessionMinutes != null
      ? `Shared as ${sessionMinutes} min (${formatActiveTime(sessionMinutes * 60_000)})`
      : 'Not recognized — use minutes (245) or hours (4h / 4.5h)';

  // All math lives in utils/profit.ts via buildDiscordExport (WP1) — the export
  // is guaranteed to match the Dashboard.
  const baseDiscordExport = useMemo(() => buildDiscordExport({
    maps, settings, lootItems, baselineTotal, investmentNeutralization,
    stratName, stratNotes, shareTags, isGroupPlay,
    groupSize: isGroupPlay ? groupSize : null,
    sessionMinutes,
    updateStrategyId: evidenceTargetId ? null : updateTargetId,
    gameDataRevision: activeManifest.revision,
    gameDataPatchVersion: activeManifest.patchVersion,
  }), [maps, settings, lootItems, baselineTotal, investmentNeutralization,
       stratName, stratNotes, shareTags, isGroupPlay, groupSize, sessionMinutes,
       updateTargetId, evidenceTargetId, activeManifest.revision, activeManifest.patchVersion]);

  useEffect(() => {
    if (!opened || !evidenceTargetId) {
      setEvidenceProof(null);
      setEvidencePreflightError(null);
      return;
    }
    if (
      !evidenceCurrent?.raw_export
      || !Number.isInteger(evidenceCurrent.current_revision)
      || !Number.isInteger(evidenceExpectedRevision)
      || !evidenceTargetFingerprint
    ) {
      setEvidenceProof(null);
      if (!evidenceCurrent) setEvidencePreflightError(null);
      if (evidenceCurrent && !evidenceFetchError) {
        setEvidencePreflightError('The published strategy is missing revision or setup provenance.');
      }
      return;
    }
    let cancelled = false;
    setEvidenceProof(null);
    setEvidencePreflightError(null);
    prepareEvidenceSubmission({
      targetRawExport: evidenceCurrent.raw_export,
      targetCurrentRevision: evidenceCurrent.current_revision!,
      expectedRevision: evidenceExpectedRevision!,
      persistedTargetFingerprint: evidenceTargetFingerprint,
      localRawExport: baseDiscordExport,
      mapParsedAt: maps.map((map) => map.parsedAt),
    }).then((proof) => {
      if (!cancelled) setEvidenceProof(proof);
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (error instanceof EvidencePreflightError) {
        const fields = error.mismatches.map((mismatch) => mismatch.field).join(', ');
        setEvidencePreflightError(fields ? `${error.message} Incompatible: ${fields}.` : error.message);
      } else {
        setEvidencePreflightError('The evidence proof could not be generated.');
      }
    });
    return () => { cancelled = true; };
  }, [opened, evidenceTargetId, evidenceCurrent, evidenceExpectedRevision,
      evidenceTargetFingerprint, evidenceFetchError, baseDiscordExport, maps]);

  const discordExport = useMemo(() => {
    if (!evidenceTargetId || !evidenceProof || evidenceExpectedRevision == null) {
      return baseDiscordExport;
    }
    return buildDiscordExport({
      maps, settings, lootItems, baselineTotal, investmentNeutralization,
      stratName, stratNotes, shareTags, isGroupPlay,
      groupSize: isGroupPlay ? groupSize : null,
      sessionMinutes,
      updateStrategyId: null,
      evidence: {
        targetStrategyId: evidenceTargetId,
        expectedRevision: evidenceExpectedRevision,
        runKey: evidenceProof.runKey,
        runStartedAt: evidenceProof.runStartedAt,
        runEndedAt: evidenceProof.runEndedAt,
        setupFingerprint: evidenceProof.setupFingerprint,
      },
      gameDataRevision: activeManifest.revision,
      gameDataPatchVersion: activeManifest.patchVersion,
    });
  }, [baseDiscordExport, evidenceTargetId, evidenceExpectedRevision, evidenceProof,
      maps, settings, lootItems, baselineTotal, investmentNeutralization,
      stratName, stratNotes, shareTags, isGroupPlay, groupSize, sessionMinutes,
      activeManifest.revision, activeManifest.patchVersion]);

  // Same export with EMPTY notes: the character budget derives the live notes
  // cap from everything else in the card (exportBudget.ts). Cheap - the pure
  // builder already runs per keystroke for the preview.
  const discordExportNoNotes = useMemo(() => buildDiscordExport({
    maps, settings, lootItems, baselineTotal, investmentNeutralization,
    stratName, stratNotes: '', shareTags, isGroupPlay,
    groupSize: isGroupPlay ? groupSize : null,
    sessionMinutes,
    updateStrategyId: evidenceTargetId ? null : updateTargetId,
    evidence: evidenceTargetId && evidenceProof && evidenceExpectedRevision != null ? {
      targetStrategyId: evidenceTargetId,
      expectedRevision: evidenceExpectedRevision,
      runKey: evidenceProof.runKey,
      runStartedAt: evidenceProof.runStartedAt,
      runEndedAt: evidenceProof.runEndedAt,
      setupFingerprint: evidenceProof.setupFingerprint,
    } : null,
    gameDataRevision: activeManifest.revision,
    gameDataPatchVersion: activeManifest.patchVersion,
  }), [maps, settings, lootItems, baselineTotal, investmentNeutralization,
       stratName, shareTags, isGroupPlay, groupSize, sessionMinutes,
       updateTargetId, evidenceTargetId, evidenceExpectedRevision, evidenceProof,
       activeManifest.revision, activeManifest.patchVersion]);

  const budget = computeShareBudget(discordExport, discordExportNoNotes, stratNotes.length);
  // Ended/missing league blocks sharing outright (decided 2026-07-19): the
  // server rejects it anyway - stop the wasted export at the source.
  const leagueBlock = leagueShareBlock(settings.leagueName);

  const shareMissingFields = missingShareFields(parseDiscordExport(baseDiscordExport));
  const shareIncomplete = shareMissingFields.length > 0;
  const impossibleAtlasPoints = hasImpossibleAtlasPoints(settings.atlasPoints, settings.atlasPointsMax);
  // Preview is WITHHELD for invalid-content blocks (atlas, league); a size
  // overflow keeps the preview visible so the author can see what to trim.
  const evidenceBlocked = evidenceTargetId !== null && evidenceProof === null;
  const previewWithheld = impossibleAtlasPoints || leagueBlock !== null || evidenceBlocked || shareIncomplete;
  const copyDisabled = previewWithheld || !budget.fitsPlain;

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
        {evidenceTargetId && (
          <Alert color={evidenceFetchError || evidencePreflightError ? 'red' : 'teal'} variant="light" p="xs">
            <Text size="xs" mb={4}>
              Adding run {evidenceCurrent ? (evidenceCurrent.evidence_run_count ?? 1) + 1 : '...'} to {' '}
              <Text span fw={700}>{evidenceTargetName ?? 'your strategy'}</Text>
              {evidenceCurrent?.current_revision
                ? <Text span c="dimmed"> (published v{evidenceCurrent.current_revision})</Text>
                : null}
              . This adds evidence without replacing the published setup.
            </Text>
            {evidenceCurrent && (
              <Text size="xs" c="dimmed" mb={4}>
                Current pool: {evidenceCurrent.evidence_run_count ?? 1} run{(evidenceCurrent.evidence_run_count ?? 1) === 1 ? '' : 's'} / {' '}
                {evidenceCurrent.evidence_map_count ?? evidenceCurrent.map_count ?? 0} maps. This run: {maps.length} maps.
              </Text>
            )}
            {evidenceFetchError && <Text size="xs" mb={4}>{evidenceFetchError}</Text>}
            {evidencePreflightError && <Text size="xs" mb={4}>{evidencePreflightError}</Text>}
            {!evidenceFetchError && !evidencePreflightError && evidenceProof && (
              <Text size="xs" c="teal" mb={4}>
                Revision, setup and all {evidenceProof.mapCount} map timestamps verified.
              </Text>
            )}
            <Group gap="xs">
              <Button size="xs" variant="default" onClick={switchEvidenceToUpdate}>Replace instead</Button>
              <Button size="xs" variant="default" onClick={clearEvidenceTarget}>Share as new</Button>
              <Button size="xs" variant="subtle" onClick={onClose}>Cancel</Button>
            </Group>
          </Alert>
        )}
        {updateTargetId && (
          <Alert color="indigo" variant="light" p="xs">
            <Text size="xs" mb={4}>
              Replacing <Text span fw={700}>{updateTargetName ?? 'your strategy'}</Text>
              {compareCurrent?.current_revision ? <Text span c="dimmed"> (currently v{compareCurrent.current_revision})</Text> : null}
              {' '}— this share replaces your published result in place (votes and post date kept).
            </Text>

            <Text size="xs" c="dimmed" mb={4}>
              The replacement revision starts a fresh one-run evidence pool; the previous revision keeps its historical pool.
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
        {impossibleAtlasPoints && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              Atlas Tree reports {settings.atlasPoints}/{settings.atlasPointsMax} allocated points. Sharing is disabled because that exceeds the tree maximum; correct or reload the tree, then read its stats again.
            </Text>
          </Alert>
        )}
        {leagueBlock === 'ended' && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              {settings.leagueName} has ended — strategies can no longer be shared for this league. Its results live on in the Retrospectives boards.
            </Text>
          </Alert>
        )}
        {leagueBlock === 'missing' && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              This session has no confirmed league yet, and sharing requires one. Once a live league is detected (or you start a session under one), sharing unlocks.
            </Text>
          </Alert>
        )}
        {shareIncomplete && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              Sharing needs: {shareMissingFields.join('; ')}. The Discord bot enforces the same minimums.
            </Text>
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
          description="A short label others see in the Strategy Browser — not your private session name"
          placeholder="e.g. Shrine strat with Memory Tears"
          maxLength={STRAT_NAME_MAX}
          disabled={evidenceTargetId !== null}
          value={stratName} onChange={(e) => setStratName(e.currentTarget.value)} />
        <MultiSelect size="xs" label="Strategy type tags"
          description="Select tags that describe this strategy"
          data={ALL_TYPE_TAGS.map((t) => ({ value: t, label: t.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }))}
          value={shareTags} onChange={setShareTags} maxDropdownHeight={200} searchable clearable
          disabled={evidenceTargetId !== null} />
        <Stack gap={2}>
          <Textarea size="xs" label="Session notes (optional)"
            placeholder="Only what the setup can't show — e.g. prices assume early-week scarab costs"
            value={stratNotes} onChange={(e) => setStratNotes(e.currentTarget.value)}
            disabled={evidenceTargetId !== null}
            // Never hard-cut text the user already typed: if the budget shrinks
            // (e.g. more scarabs added), the red counter + disabled copy handle it.
            maxLength={Math.max(budget.notesMax, stratNotes.length)}
            autosize minRows={2} maxRows={4} />
          <Text size="xs" c={budget.notesRemaining < 0 ? 'red' : 'dimmed'} style={{ fontSize: FONT.small }}>
            {budget.notesRemaining < 0
              ? `Notes exceed the Discord card budget by ${-budget.notesRemaining} characters — trim them to share.`
              : `${budget.notesRemaining} characters left for notes (Discord card limit).`}
          </Text>
        </Stack>
        <Stack gap={4}>
          <Group gap={8} align="center" wrap="nowrap">
            <Text size="xs" fw={500} style={{ flexShrink: 0 }}>Play style</Text>
            <SegmentedControl
              size="xs"
              value={isGroupPlay ? 'group' : 'solo'}
              onChange={(v) => setIsGroupPlay(v === 'group')}
              disabled={evidenceTargetId !== null}
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
                disabled={evidenceTargetId !== null}
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
        <Text size="xs" c={!budget.fitsPlain ? 'red' : budget.fitsDecorated ? 'dimmed' : 'orange'} style={{ fontSize: FONT.small }}>
          {`Card size: ${budget.plainCardLength}/${DISCORD_MSG_LIMIT} plain | ${budget.decoratedCardLength}/${DISCORD_MSG_LIMIT} with emotes — `}
          {!budget.fitsPlain
            ? 'too large to post; trim notes.'
            : budget.fitsDecorated
              ? 'fits with app emotes.'
              : 'posts without app emotes (over the emote budget).'}
        </Text>
        {previewWithheld ? (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              {evidenceBlocked
                ? evidenceFetchError || evidencePreflightError
                  ? 'Preview withheld until the evidence preflight above passes.'
                  : 'Preparing the revision and setup evidence proof...'
                : shareIncomplete
                  ? 'Preview withheld until the share requirements above are complete.'
                : impossibleAtlasPoints
                ? 'Preview withheld until the impossible Atlas allocation is corrected.'
                : 'Preview withheld — this league no longer accepts new shares.'}
            </Text>
          </Alert>
        ) : (
          <div style={{ background: COLOR.bgDeep, borderRadius: 6, padding: '8px 10px', maxHeight: 200, overflowY: 'auto' }}>
            <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: COLOR.textSoft, fontSize: FONT.small, lineHeight: 1.5 }}>
              {discordExport}
            </Text>
          </div>
        )}
        <CopyButton value={discordExport} timeout={2000}>
          {({ copied, copy }) => (
            <Button leftSection={copied ? <IconCheck size={14} /> : <IconBrandDiscord size={14} />} onClick={copy}
              disabled={copyDisabled}
              color={copied ? 'teal' : 'indigo'} variant="light" fullWidth>
              {copied ? 'Copied to clipboard!' : 'Copy to Discord'}
            </Button>
          )}
        </CopyButton>
      </Stack>
    </Modal>
  );
};
