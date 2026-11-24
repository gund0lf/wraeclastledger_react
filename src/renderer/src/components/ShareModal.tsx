import {
  Modal, Stack, Text, Alert, TextInput, NumberInput, Combobox, Pill, useCombobox,
  Textarea, Group, SegmentedControl, Divider, Button, CopyButton,
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { IconBrandDiscord, IconCheck, IconPlus, IconPlaylistAdd, IconRefresh, IconLock } from '@tabler/icons-react';
import { useSessionKeys, useSessionStore } from '../store/useSessionStore';
import { restoreShareDraft } from '../utils/shareDraft';
import { buildDiscordExport, hasShareDivinePrice } from '../utils/discordExport';
import {
  buildDiscordSharePayload,
  DISCORD_SHARE_COMMAND_MAX,
} from '../utils/discordShareWire';
import { parseTimeInput } from '../utils/sessionTime';
import { computeTimeEstimate, formatActiveTime } from '../utils/timeEstimate';
import { manualRunTimerElapsed } from '../utils/manualRunTimer';
import { ALL_TYPE_TAGS, STRATEGY_API_URL, type Strategy } from '../utils/strategyConstants';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { missingShareFields } from '../utils/shareCompleteness';
import { investmentCompleteness } from '../utils/investmentCompleteness';
import { buildUpdateComparison, rowDirection } from '../utils/updateCompare';
import { COLOR, FONT } from '../utils/uiTokens'
import { getManifest } from '../utils/gameData';
import { hasImpossibleAtlasPoints, leagueShareBlock } from '../utils/shareValidation';
import {
  DISCORD_MSG_LIMIT,
  STRAT_NAME_MAX,
  compactPostedCardPreview,
  computeCompactShareBudget,
} from '../utils/exportBudget';
import {
  EvidencePreflightError,
  prepareEvidenceSubmission,
  type EvidenceSubmissionProof,
} from '../utils/evidencePreflight';
import './ShareModal.css';
import { AuthorShareControls } from './AuthorShareControls';
import { ManagePublicNames } from './ManagePublicNames';
import { migrateStrategyTarget } from '../../../shared/strategyTarget';
import { postedSharePresentation } from '../utils/postedSharePresentation';
import type { ShareWindowPresentation } from '../utils/shareWindowPresentation';

const SETUP_FIELD_LABELS: Record<string, string> = {
  leagueKey: 'League',
  mapType: 'Map type',
  partySize: 'Play style',
  chiselType: 'Chisel',
  scarabs: 'Scarabs',
  delirium: 'Delirium setup',
  astrolabeType: 'Astrolabe',
  atlasAllocationHash: 'Atlas tree',
  multiplyingModifiers: 'Multiplying Modifiers setup',
};

function ShareTagsField({ value, onChange, disabled }: {
  value: string[]; onChange: (tags: string[]) => void; disabled: boolean;
}) {
  const [search, setSearch] = useState('');
  const dropdown = useCombobox({ onDropdownClose: () => { setSearch(''); dropdown.resetSelectedOption(); } });
  const label = (tag: string) => tag.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  const options = ALL_TYPE_TAGS.filter((tag) => !value.includes(tag) && label(tag).toLowerCase().includes(search.toLowerCase()));
  return <Stack gap={4}>
    <Text size="xs" fw={500}>Tags</Text>
    <Combobox store={dropdown} withinPortal={false} onOptionSubmit={(tag) => {
      onChange([...value, tag]); setSearch(''); dropdown.resetSelectedOption(); dropdown.focusSearchInput();
    }}>
      <Combobox.DropdownTarget><Group gap={5} aria-label="Tags" w="100%">
        {value.map((tag) => <Pill key={tag} size="sm" withRemoveButton={!disabled}
          onRemove={() => onChange(value.filter((entry) => entry !== tag))}
          styles={{ root: { background: COLOR.bgHover, color: COLOR.textSoft } }}>{label(tag)}</Pill>)}
        {!value.length && disabled && <Text size="xs" c={COLOR.textDim}>No tags</Text>}
        {!disabled && <Combobox.EventsTarget targetType="button" withExpandedAttribute>
          <Button size="compact-xs" variant="subtle" onClick={() => dropdown.toggleDropdown()}>+ Add tag</Button>
        </Combobox.EventsTarget>}
      </Group></Combobox.DropdownTarget>
      {!disabled && <Combobox.Dropdown style={{ background: COLOR.bgInset }}>
        <Combobox.Search aria-label="Find a tag" placeholder="Search tags" value={search}
          styles={{ input: { background: COLOR.bgDeep, border: `1px solid ${COLOR.borderSoft}`, borderRadius: 4, width: '100%', margin: 0, marginBottom: 6 } }}
          onChange={(event) => { setSearch(event.currentTarget.value); dropdown.updateSelectedOptionIndex(); }} />
        <Combobox.Options style={{ maxHeight: 200, overflowY: 'auto' }}>
          {options.map((tag) => <Combobox.Option key={tag} value={tag} className="share-name-option" style={{ whiteSpace: 'nowrap' }}>{label(tag)}</Combobox.Option>)}
          {!options.length && <Combobox.Empty>No matching tags</Combobox.Empty>}
        </Combobox.Options>
      </Combobox.Dropdown>}
    </Combobox>
  </Stack>;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  /** Initial tags to pre-populate — auto-detected by the parent before opening. */
  initialTags: string[];
}

export const ShareModal = ({ opened, onClose, initialTags }: Props) => {
  const [authorReview, setAuthorReview] = useState<boolean | null>(null);
  const [authorReviewError, setAuthorReviewError] = useState<string | null>(null);
  const [manageNames, setManageNames] = useState(false);
  const [manageNamesAction, setManageNamesAction] = useState<'recover' | undefined>();
  const [authorFieldContainer, setAuthorFieldContainer] = useState<HTMLDivElement | null>(null);
  const [shareCompleted, setShareCompleted] = useState(false);
  useEffect(() => {
    if (!opened) return;
    let stopped = false;
    setAuthorReviewError(null);
    window.api.authorHandoff({ action: 'available' }).then((r) => {
      if (stopped) return;
      if (r.ok) setAuthorReview(r.value);
      else { setAuthorReview(null); setAuthorReviewError(r.error); }
    }).catch(() => { if (!stopped) { setAuthorReview(null); setAuthorReviewError('Could not check sharing capabilities. Close and reopen Share to retry.'); } });
    return () => { stopped = true; };
  }, [opened]);
  useEffect(() => { if (!opened) setManageNames(false); }, [opened]);
  const {
    maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems,
    manualRunTimer, investmentNeutralization, discordTag, setDiscordTag, updateAdvSetting, updateSetting,
    activeSessionId, sessionNonce, currentSessionIdentity,
  } = useSessionKeys(
    'maps', 'settings', 'lootItems', 'baselineItems', 'baselineTotal', 'manualLootItems',
    'manualRunTimer', 'investmentNeutralization', 'discordTag', 'setDiscordTag', 'updateAdvSetting', 'updateSetting',
    'activeSessionId', 'sessionNonce', 'currentSessionIdentity',
  );

  // Versioning client half: a session carrying an update target shares as an
  // UPDATE (marker line in the export). "Share as new instead" CLEARS the
  // persisted target — matrix case (c): later shares must not silently update.
  const updateTargetId   = authorReview === false ? settings.updateTargetStrategyId ?? null : null;
  const updateTargetName = settings.updateTargetStrategyName ?? null;
  const clearUpdateTarget = () => {
    updateSetting('updateTargetStrategyId', null);
    updateSetting('updateTargetStrategyName', null);
  };
  const evidenceTargetId = authorReview === false ? settings.evidenceTargetStrategyId ?? null : null;
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
  const [shareTracking, setShareTracking] = useState(false);
  const [sharePosted, setSharePosted] = useState(false);
  const [shareArchived, setShareArchived] = useState(false);
  const [sharePresentation, setSharePresentation] = useState<ShareWindowPresentation | null>(null);
  const currentShareTarget = useMemo(() => migrateStrategyTarget(settings as unknown as Record<string, unknown>), [settings]);
  const postedScope = JSON.stringify([currentSessionIdentity,
    currentShareTarget && currentShareTarget.state !== 'legacy_review' ? currentShareTarget.generation : null]);
  const postedDisplay = useMemo(() => {
    try {
      return { details: postedSharePresentation(sharePresentation?.scope === postedScope ? sharePresentation.snapshot : null), error: null };
    } catch (error) {
      return { details: null, error: error instanceof Error ? error.message : 'The saved posted details could not be read.' };
    }
  }, [sharePresentation, postedScope]);
  const postedDetails = sharePosted ? postedDisplay.details : null;
  const missingPostedDetails = sharePosted && !postedDetails;
  const [isGroupPlay, setIsGroupPlay] = useState(false);
  const [groupSize,  setGroupSize]  = useState(2);
  const [timeText,   setTimeText]   = useState('');
  const draftSessionId = `${activeSessionId ?? 'working'}:${sessionNonce}`;
  const draftKey = JSON.stringify([draftSessionId, currentSessionIdentity, settings.strategyTarget ?? null]);
  const activeDraftView = useRef({ opened, key: draftKey });
  activeDraftView.current = { opened, key: draftKey };
  const [draftRestoration, setDraftRestoration] = useState<{ key: string; error: string | null } | null>(null);
  const [storageRecoveryGeneration, setStorageRecoveryGeneration] = useState(0);
  const restoreOrdinaryDraft = authorReview === true && !settings.strategyTarget;
  const draftLoading = opened && (authorReview === null || (restoreOrdinaryDraft && draftRestoration?.key !== draftKey));
  const draftError = draftRestoration?.key === draftKey ? draftRestoration.error : null;
  useEffect(() => {
    if (!opened) { setDraftRestoration(null); return; }
    if (!restoreOrdinaryDraft) return;
    let stopped = false;
    setDraftRestoration(null);
    const isCurrent = () => {
      const store = useSessionStore.getState();
      return !stopped && activeDraftView.current.opened && activeDraftView.current.key === draftKey &&
        `${store.activeSessionId ?? 'working'}:${store.sessionNonce}` === draftSessionId &&
        store.currentSessionIdentity === currentSessionIdentity &&
        JSON.stringify([draftSessionId, currentSessionIdentity, store.settings.strategyTarget ?? null]) === draftKey;
    };
    if (!currentSessionIdentity) {
      setDraftRestoration({ key: draftKey, error: 'This session is not ready. Close and reopen Share after it loads.' });
      return;
    }
    void restoreShareDraft(window.api.authorHandoff, draftSessionId, currentSessionIdentity, isCurrent).then((draft) => {
      if (!isCurrent() || draft === undefined) return;
      setStratName(draft?.title ?? ''); setStratNotes(draft?.notes ?? '');
      setShareTags(draft?.tags ?? initialTags);
      setIsGroupPlay(draft?.group ?? settings.strategySourceParty?.group ?? false);
      setGroupSize(draft?.groupSize ?? settings.strategySourceParty?.size ?? 2);
      const estimate = computeTimeEstimate(maps);
      setTimeText(draft ? draft.time : estimate ? String(Math.round(estimate.activeMs / 60_000)) : '');
      setDraftRestoration({ key: draftKey, error: null });
    }).catch((error) => {
      if (isCurrent()) setDraftRestoration({ key: draftKey, error: error instanceof Error ? error.message :
        'Could not restore saved sharing details. Close and reopen Share to retry.' });
    });
    return () => { stopped = true; };
    // Defaults are sampled for this opening/view only, never reapplied over edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, restoreOrdinaryDraft, draftKey, draftSessionId, currentSessionIdentity, storageRecoveryGeneration]);
  const [evidenceCurrent, setEvidenceCurrent] = useState<Strategy | null>(null);
  const [evidenceFetchError, setEvidenceFetchError] = useState<string | null>(null);
  const [evidenceProof, setEvidenceProof] = useState<EvidenceSubmissionProof | null>(null);
  const [evidencePreflightError, setEvidencePreflightError] = useState<string | null>(null);
  const [evidenceMismatchFields, setEvidenceMismatchFields] = useState<string[]>([]);
  const [targetOptionsOpen, setTargetOptionsOpen] = useState(false);
  const [replacementDetailsOpen, setReplacementDetailsOpen] = useState(false);

  useEffect(() => {
    setTargetOptionsOpen(false);
    setReplacementDetailsOpen(false);
  }, [opened, evidenceTargetId, updateTargetId]);

  useEffect(() => {
    if (!opened || !evidenceTargetId) {
      setEvidenceCurrent(null);
      setEvidenceFetchError(null);
      setEvidenceMismatchFields([]);
      return;
    }
    let cancelled = false;
    setEvidenceCurrent(null);
    setEvidenceFetchError(null);
    setEvidenceMismatchFields([]);
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
    if (settings.strategySourceParty?.group !== null && settings.strategySourceParty?.group !== undefined) {
      setIsGroupPlay(settings.strategySourceParty.group);
      setGroupSize(settings.strategySourceParty.size ?? 2);
    }
    const savedTarget = settings.strategyTarget;
    if (savedTarget && savedTarget.state !== 'legacy_review' && stratName.trim() === '') setStratName(savedTarget.title);
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
  const capturedTime = computeTimeEstimate(maps);
  const manualTimerMs = manualRunTimerElapsed(manualRunTimer);
  const activeManifest = getManifest();
  const timeCaption = timeText.trim() === ''
    ? 'Empty — time will not be shared'
    : sessionMinutes != null
      ? capturedTime && sessionMinutes === Math.round(capturedTime.activeMs / 60_000)
        ? 'from your capture'
        : /[a-z]/i.test(timeText) ? `Shared as ${sessionMinutes} min` : ''
      : 'Not recognized — use minutes (245) or hours (4h / 4.5h)';

  // All math lives in utils/profit.ts via buildDiscordExport (WP1) — the export
  // is guaranteed to match the Dashboard.
  // This modal stays mounted in the workspace. A closed preview must not
  // rebuild the loot evidence or start compact encoding during session restore.
  const baseDiscordExport = useMemo(() => !opened ? '' : buildDiscordExport({
    maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems, investmentNeutralization,
    stratName, stratNotes, shareTags, isGroupPlay,
    groupSize: isGroupPlay ? groupSize : null,
    sessionMinutes,
    updateStrategyId: evidenceTargetId ? null : updateTargetId,
    gameDataRevision: activeManifest.revision,
    gameDataPatchVersion: activeManifest.patchVersion,
  }), [opened, maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems, investmentNeutralization,
       stratName, stratNotes, shareTags, isGroupPlay, groupSize, sessionMinutes,
       updateTargetId, evidenceTargetId, activeManifest.revision, activeManifest.patchVersion]);

  useEffect(() => {
    if (!opened || !evidenceTargetId) {
      setEvidenceProof(null);
      setEvidencePreflightError(null);
      setEvidenceMismatchFields([]);
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
    setEvidenceMismatchFields([]);
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
        setEvidencePreflightError(error.message);
        setEvidenceMismatchFields(error.mismatches.map(({ field }) => SETUP_FIELD_LABELS[field] ?? field));
      } else {
        setEvidencePreflightError('The evidence proof could not be generated.');
        setEvidenceMismatchFields([]);
      }
    });
    return () => { cancelled = true; };
  }, [opened, evidenceTargetId, evidenceCurrent, evidenceExpectedRevision,
      evidenceTargetFingerprint, evidenceFetchError, baseDiscordExport, maps]);

  const discordExport = useMemo(() => {
    if (!baseDiscordExport || !evidenceTargetId || !evidenceProof || evidenceExpectedRevision == null) {
      return baseDiscordExport;
    }
    return buildDiscordExport({
      maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems, investmentNeutralization,
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
      maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems, investmentNeutralization,
      stratName, stratNotes, shareTags, isGroupPlay, groupSize, sessionMinutes,
      activeManifest.revision, activeManifest.patchVersion]);

  // Same export with EMPTY notes: the character budget derives the live notes
  // cap from everything else in the card (exportBudget.ts). Cheap - the pure
  // builder already runs per keystroke for the preview.
  const discordExportNoNotes = useMemo(() => !opened ? '' : buildDiscordExport({
    maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems, investmentNeutralization,
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
  }), [opened, maps, settings, lootItems, baselineItems, baselineTotal, manualLootItems, investmentNeutralization,
       stratName, shareTags, isGroupPlay, groupSize, sessionMinutes,
       updateTargetId, evidenceTargetId, evidenceExpectedRevision, evidenceProof,
       activeManifest.revision, activeManifest.patchVersion]);

  const parsedDiscordExport = useMemo(() => discordExport ? parseDiscordExport(discordExport) : null, [discordExport]);
  const authorCore = useMemo(() => {
    try { return parsedDiscordExport ? buildDiscordSharePayload(parsedDiscordExport) : ''; }
    catch { return ''; } // The existing encoder reports the field/size error below.
  }, [parsedDiscordExport]);
  const [discordWireResult, setDiscordWireResult] = useState<{
    wire: string;
    error: string | null;
    pending: boolean;
  }>({ wire: '', error: null, pending: false });
  useEffect(() => {
    if (!parsedDiscordExport) {
      setDiscordWireResult({
        wire: '',
        error: 'The readable share could not be parsed. Review the required fields above.',
        pending: false,
      });
      return;
    }
    let cancelled = false;
    try {
      const payloadJson = buildDiscordSharePayload(parsedDiscordExport);
      setDiscordWireResult({ wire: '', error: null, pending: true });
      window.api.encodeDiscordShare(payloadJson).then((result) => {
        if (cancelled) return;
        setDiscordWireResult({
          wire: result.token ?? '',
          error: result.error
            ? `The compact Discord share could not be generated: ${result.error}`
            : null,
          pending: false,
        });
      }).catch((error: unknown) => {
        if (cancelled) return;
        const detail = error instanceof Error ? error.message : 'unknown encoding error';
        setDiscordWireResult({
          wire: '',
          error: `The compact Discord share could not be generated: ${detail}`,
          pending: false,
        });
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown encoding error';
      setDiscordWireResult({
        wire: '',
        error: `The compact Discord share could not be generated: ${detail}`,
        pending: false,
      });
    }
    return () => { cancelled = true; };
  }, [parsedDiscordExport]);
  const discordWire = discordWireResult.wire;
  const discordWireError = discordWireResult.error;
  const budget = computeCompactShareBudget(
    discordWire,
    discordExport,
    discordExportNoNotes,
    stratNotes.length,
    parsedDiscordExport?.lootSummary ?? null,
  );
  const submissionLimit = budget.fitsDirectWire
    ? DISCORD_MSG_LIMIT
    : DISCORD_SHARE_COMMAND_MAX;
  const budgetNearLimit = budget.wireLength >= submissionLimit * 0.9
    || budget.postedCardLength >= DISCORD_MSG_LIMIT * 0.9
    || budget.pooledPlainCardLength >= DISCORD_MSG_LIMIT * 0.9;
  const showBudgetDetails = Boolean(
    discordWireError
    || !budget.fitsWire
    || !budget.fitsPlain
    || !budget.fitsDirectWire
    || budget.decorationMode !== 'full'
    || budgetNearLimit,
  );
  const postedCardPreview = postedDetails?.preview ?? compactPostedCardPreview(
    discordExport,
    parsedDiscordExport?.lootSummary ?? null,
  );
  // Ended/missing league blocks sharing outright (decided 2026-07-19): the
  // server rejects it anyway - stop the wasted export at the source.
  const leagueBlock = leagueShareBlock(settings.leagueName);

  const shareMissingFields = missingShareFields(parseDiscordExport(baseDiscordExport));
  const missingDivinePrice = !hasShareDivinePrice(settings.divinePrice);
  const shareIncomplete = !missingDivinePrice && shareMissingFields.length > 0;
  const costCompleteness = useMemo(() => investmentCompleteness(settings), [settings]);
  const costsIncomplete = costCompleteness.hasIncompleteCosts;
  const impossibleAtlasPoints = hasImpossibleAtlasPoints(settings.atlasPoints, settings.atlasPointsMax);
  // Preview is WITHHELD for invalid-content blocks (atlas, league); a size
  // overflow keeps the preview visible so the author can see what to trim.
  const evidenceBlocked = evidenceTargetId !== null && evidenceProof === null;
  const previewWithheld = impossibleAtlasPoints
    || leagueBlock !== null
    || missingDivinePrice
    || evidenceBlocked
    || shareIncomplete
    || costsIncomplete;
  const unsupportedSavedTarget = authorReview === false && settings.strategyTarget != null && settings.strategyTarget.state !== 'legacy_review';
  const copyDisabled = authorReview !== false || unsupportedSavedTarget || previewWithheld || discordWireResult.pending
    || !discordWire || discordWire.length > DISCORD_SHARE_COMMAND_MAX || !budget.fitsPlain;

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

  const targetOperation = currentShareTarget && currentShareTarget.state !== 'legacy_review'
    ? currentShareTarget.operation : null;
  const targetTitle = currentShareTarget && currentShareTarget.state !== 'legacy_review'
    ? currentShareTarget.title || 'your strategy' : 'your strategy';
  const intentTitle = targetOperation === 'evidence' ? (shareCompleted ? 'Run added' : 'Add a run')
    : targetOperation === 'replace' ? (shareCompleted ? 'Runs replaced' : 'Replace runs')
    : shareCompleted ? 'Strategy shared' : 'New strategy';
  const intentDescription = targetOperation === 'evidence'
    ? `${shareCompleted ? 'Added to' : 'Adds this session to'} ${targetTitle}`
    : targetOperation === 'replace'
      ? `${shareCompleted ? 'Replaced the runs of' : 'Replaces the runs of'} ${targetTitle}. Votes are kept.`
      : shareCompleted ? 'Your strategy and its Discord card are published' : 'Creates a strategy and its Discord card';
  const IntentIcon = targetOperation === 'replace' ? IconRefresh : targetOperation === 'evidence' ? IconPlaylistAdd : IconPlus;
  const contentSizedDialog = manageNames || shareArchived || missingPostedDetails;

  return (
    <Modal opened={opened} onClose={manageNames ? () => setManageNames(false) : onClose}
      title={manageNames ? 'Public names' : 'Share My Session'} size={440} yOffset={16}
      classNames={{ content: 'share-dialog' }}
      styles={{
        content: { display: 'flex', flexDirection: 'column', height: contentSizedDialog ? 'auto' : 'min(820px, calc(100dvh - 32px))',
          maxHeight: 'calc(100dvh - 32px)', overflow: 'hidden',
          '--share-input-bg': COLOR.bgInset, '--share-input-text': COLOR.textSoft,
          '--share-input-border': COLOR.borderSoft, '--share-option-hover': COLOR.bgHover } as CSSProperties,
        header: { flexShrink: 0 },
        body: { display: 'flex', flexDirection: 'column', flex: contentSizedDialog ? '0 1 auto' : 1, minHeight: 0, padding: 0 },
      }}>
      {draftLoading && <Text size="xs" role="status">Restoring saved sharing details…</Text>}
      {draftError && restoreOrdinaryDraft && !(authorReview && opened && !manageNames) &&
        <Alert color="red" role="alert">{draftError}</Alert>}
      {authorReview && !manageNames && <Group gap="sm" mx={16} mb="sm" p="sm" wrap="nowrap"
        style={{ background: COLOR.surfaceSectionBg, borderLeft: `3px solid ${COLOR.info}`, borderRadius: 6 }}>
        <IntentIcon size={18} color={COLOR.accent} style={{ flexShrink: 0 }} />
        <Stack gap={2}>
          <Text size="sm" fw={600}>{currentShareTarget?.state === 'legacy_review'
            ? 'Review the saved target in the Strategy Browser' : intentTitle}</Text>
          <Text size="xs" c={COLOR.textDim}>{currentShareTarget?.state === 'legacy_review'
            ? 'Choose how to continue before sharing.' : intentDescription}</Text>
        </Stack>
      </Group>}
      <div className="share-scroll-body" style={manageNames || shareArchived || missingPostedDetails ? { display: 'none' } : undefined}>
      {sharePosted && !shareArchived && <Group gap="xs" wrap="nowrap" align="flex-start" mb="sm" p="xs"
        style={{ background: COLOR.surfaceInfoBg, border: `1px solid ${COLOR.surfaceInfoBorder}`, borderRadius: 6 }}>
        <IconLock size={15} color={COLOR.accent} style={{ flexShrink: 0, marginTop: 2 }} />
        <Text size="xs" c={COLOR.textSoft}>
          This share is posted. To change it later, use Continue in the Strategy Browser.
        </Text>
      </Group>}
      {authorReview && <div ref={setAuthorFieldContainer} style={{ marginBottom: 12, ...(shareArchived ? { display: 'none' } : {}) }} />}
      <fieldset className="share-form" disabled={draftLoading || shareTracking || sharePosted} data-readonly={sharePosted || undefined}
        style={shareArchived ? { display: 'none' } : undefined}>
      <Stack gap="sm">
        {!sharePosted && <>
        {evidenceTargetId && !evidenceFetchError && !evidencePreflightError && !evidenceProof && (
          <Group className="share-target-status" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>
              Checking whether this run can be added to{' '}
              <Text span fw={700}>{evidenceTargetName ?? 'your strategy'}</Text>…
            </Text>
          </Group>
        )}
        {evidenceTargetId && !evidenceFetchError && !evidencePreflightError && evidenceProof && (
          <Stack className="share-target-status" gap={4}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" style={{ minWidth: 0 }}>
                Add this run to <Text span fw={700}>{evidenceTargetName ?? 'your strategy'}</Text>
                {evidenceCurrent?.current_revision
                  ? <Text span c="dimmed"> · v{evidenceCurrent.current_revision}</Text>
                  : null}
              </Text>
              <Button size="compact-xs" variant="subtle"
                onClick={() => setTargetOptionsOpen((value) => !value)}>Change</Button>
            </Group>
            <Text size="xs" c="dimmed">
              {evidenceCurrent
                ? `${evidenceCurrent.evidence_run_count ?? 1} pooled run${(evidenceCurrent.evidence_run_count ?? 1) === 1 ? '' : 's'} · ${evidenceCurrent.evidence_map_count ?? evidenceCurrent.map_count ?? 0} maps · `
                : ''}
              This run: {maps.length} maps · setup and timestamps verified
            </Text>
            {targetOptionsOpen && (
              <Group gap="xs">
                <Button size="compact-xs" variant="default" onClick={clearEvidenceTarget}>
                  Publish separately
                </Button>
                <Button size="compact-xs" variant="default" onClick={switchEvidenceToUpdate}>
                  Replace published strategy
                </Button>
              </Group>
            )}
          </Stack>
        )}
        {evidenceTargetId && (evidenceFetchError || evidencePreflightError) && (
          <Alert color="red" variant="light" p="xs"
            title={`This run cannot be added to ${evidenceTargetName ?? 'the published strategy'}`}>
            <Stack gap={6}>
              <Text size="xs">{evidenceFetchError ?? evidencePreflightError}</Text>
              <Text size="xs" c="dimmed">
                Publish it as a separate strategy to keep both setups, or replace the published strategy only if that is what you intend.
              </Text>
              <Group gap="xs">
                <Button size="xs" onClick={clearEvidenceTarget}>Publish as a separate strategy</Button>
                <Button size="xs" variant="default" onClick={switchEvidenceToUpdate}>Replace published strategy</Button>
              </Group>
              {evidenceMismatchFields.length > 0 && (
                <Stack gap={2}>
                  <Button size="compact-xs" variant="subtle" style={{ alignSelf: 'flex-start' }}
                    onClick={() => setTargetOptionsOpen((value) => !value)}>
                    {targetOptionsOpen ? 'Hide setup differences' : 'Show setup differences'}
                  </Button>
                  {targetOptionsOpen && (
                    <Text size="xs" c="dimmed">Different: {evidenceMismatchFields.join(', ')}.</Text>
                  )}
                </Stack>
              )}
            </Stack>
          </Alert>
        )}
        {updateTargetId && (
          <Stack className="share-target-status" gap={4}>
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Text size="xs" style={{ minWidth: 0 }}>
                Replace <Text span fw={700}>{updateTargetName ?? 'your published strategy'}</Text>
                {compareCurrent?.current_revision
                  ? <Text span c="dimmed"> · currently v{compareCurrent.current_revision}</Text>
                  : null}
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={clearUpdateTarget}>Publish separately</Button>
            </Group>
            <Text size="xs" c="dimmed">
              This share becomes the new published revision. Votes and the original post date stay; its evidence pool starts with this run.
            </Text>
            {compareError && (
              <Text size="xs" c="dimmed" style={{ fontSize: FONT.small }}>{compareError}</Text>
            )}
            {compareRows && (
              <>
                <Button size="compact-xs" variant="subtle" style={{ alignSelf: 'flex-start' }}
                  onClick={() => setReplacementDetailsOpen((value) => !value)}>
                  {replacementDetailsOpen ? 'Hide changes' : 'Review changes'}
                </Button>
                {replacementDetailsOpen && (
                  <Stack gap={1}>
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
              </>
            )}
          </Stack>
        )}
        {authorReviewError && <Alert color="red" p="xs">{authorReviewError}</Alert>}
        {unsupportedSavedTarget && <Alert color="orange" p="xs">
          This session retains a continuation target that requires the updated sharing feature. Copy is blocked until that feature is available, or you explicitly choose a separate publication.
          <Button size="compact-xs" variant="subtle" onClick={() => updateSetting('strategyTarget', null)}>Clear target and share separately</Button>
        </Alert>}
        {authorReview === false && <TextInput
          size="xs"
          label="Your Discord tag"
          description="Used to highlight your own strategies in the Strategy Browser"
          placeholder="e.g. your-discord-name"
          value={discordTag}
          onChange={(e) => setDiscordTag(e.currentTarget.value)}
        />}
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
        {missingDivinePrice && !sharePosted && <Alert color="orange" role="alert">
          Set the Divine price in Investment before sharing. Choose your league manually there and refresh, or enter the price in chaos.
        </Alert>}
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
              This session has no confirmed league yet, and sharing requires one. Choose your league manually in Investment or retry Auto detection there.
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
        {costsIncomplete && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              Sharing is disabled until current-run costs are complete: {costCompleteness.incompleteCostLabels.join(', ')}.
              {' '}Unpriced items stay excluded from local profit in the meantime.
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
                disabled={shareTracking || sharePosted}
                onChange={(v) => updateAdvSetting('advAstrolabeCount', Number(v))}
                aria-label="Astrolabe count used"
              />
              <Text size="xs" c="dimmed">used</Text>
            </Group>
          </Alert>
        )}
        </>}
        <Text fw={600} c="dimmed" mt={4} style={{ fontSize: FONT.small, letterSpacing: '.08em' }}>STRATEGY</Text>
        <TextInput size="xs" label={<>Title <Text span inherit c={COLOR.textDim}>optional</Text></>}
          placeholder={sharePosted ? undefined : 'e.g. Shrine strat with Memory Tears'}
          maxLength={STRAT_NAME_MAX}
          disabled={evidenceTargetId !== null || shareTracking || sharePosted}
          value={postedDetails?.title ?? stratName} onChange={(e) => setStratName(e.currentTarget.value)} />
        <ShareTagsField value={postedDetails?.tags ?? shareTags} onChange={setShareTags}
          disabled={evidenceTargetId !== null || shareTracking || sharePosted || draftLoading} />
        <Stack gap={2}>
          <Textarea size="xs" label={<>Notes <Text span inherit c={COLOR.textDim}>optional · shown on the card</Text></>}
            placeholder={sharePosted ? undefined : "What the setup can't show"}
            value={postedDetails?.notes ?? stratNotes} onChange={(e) => setStratNotes(e.currentTarget.value)}
            disabled={evidenceTargetId !== null || shareTracking || sharePosted}
            // Never hard-cut text the user already typed: if the budget shrinks
            // (e.g. more scarabs added), the red counter + disabled copy handle it.
            maxLength={Math.max(budget.notesMax, stratNotes.length)}
            autosize minRows={2} maxRows={4} />
          {!sharePosted && <Text size="xs" c={budget.notesRemaining < 0 || !budget.fitsWire ? 'red' : 'dimmed'} style={{ fontSize: FONT.small }}>
            {!budget.fitsWire
              ? `Compact Discord submission exceeds the limit by ${budget.wireLength - DISCORD_MSG_LIMIT} characters — shorten the notes.`
              : budget.notesRemaining < 0
              ? `Notes exceed the Discord card budget by ${-budget.notesRemaining} characters — trim them to share.`
              : `${budget.notesRemaining} characters left for notes in the posted card.`}
          </Text>}
        </Stack>
        <Text fw={600} c="dimmed" mt={4} style={{ fontSize: FONT.small, letterSpacing: '.08em' }}>SESSION</Text>
        <div className="share-session-fields">
        <Stack gap={4}>
            <Text size="xs" fw={500} style={{ flexShrink: 0 }}>Play style</Text>
            <SegmentedControl
              size="xs"
              value={(postedDetails?.group ?? isGroupPlay) ? 'group' : 'solo'}
              onChange={(v) => setIsGroupPlay(v === 'group')}
              disabled={evidenceTargetId !== null || shareTracking || sharePosted}
              data={[
                { value: 'solo', label: 'Solo' },
                { value: 'group', label: 'Group' },
              ]}
            />
          {(postedDetails?.group ?? isGroupPlay) && (
            <Group gap={6} align="center" wrap="nowrap" mt={2}>
              <NumberInput
                size="xs" w={70} min={2} max={6}
                value={postedDetails ? postedDetails.groupSize ?? '' : groupSize}
                onChange={(v) => setGroupSize(Math.min(6, Math.max(2, Number(v) || 2)))}
                aria-label="Group size including you"
                disabled={evidenceTargetId !== null || shareTracking || sharePosted}
              />
              <Text size="xs" c="dimmed">players (including you)</Text>
            </Group>
          )}
        </Stack>
        <Stack gap={4}>
          <Text size="xs" fw={500} component="label" htmlFor="share-session-time">{postedDetails || capturedTime?.activeMs ? 'Session time' : 'Session time optional'}</Text>
          <Group gap="xs" align="flex-end">
            <TextInput size="xs" id="share-session-time" w={90} style={{ flexShrink: 0 }}
              placeholder={sharePosted ? undefined : 'e.g. 245 or 4h'}
              disabled={shareTracking || sharePosted}
              rightSection={/[a-z]/i.test(postedDetails?.time ?? timeText) ? undefined : <Text size="xs" c={COLOR.textDim}>min</Text>}
              rightSectionPointerEvents="none"
              value={postedDetails?.time ?? timeText} onChange={(e) => setTimeText(e.currentTarget.value)} />
            {(postedDetails ? !postedDetails.time : timeCaption) && <Text size="xs" pb={6}
              c={timeText.trim() !== '' && sessionMinutes == null ? 'orange' : 'dimmed'} style={{ fontSize: FONT.small, flex: '1 1 100px' }}>
              {postedDetails ? 'No time was shared' : timeCaption}
            </Text>}
          </Group>
          {!sharePosted && manualTimerMs > 0 && (
            <Group justify="space-between" gap="xs" wrap="wrap">
              <Text size="xs" c="dimmed">Manual timer: {formatActiveTime(manualTimerMs)}</Text>
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={shareTracking || sharePosted}
                onClick={() => setTimeText(String(Math.max(1, Math.round(manualTimerMs / 60_000))))}
              >
                Use manual timer
              </Button>
            </Group>
          )}
        </Stack>
        </div>
        <Divider label="Posted card preview" labelPosition="left" />
        {!sharePosted && (discordWireResult.pending || showBudgetDetails || discordWireError || !budget.fitsWire || !budget.fitsPlain) && <Text size="xs" c={discordWireError || !budget.fitsWire || !budget.fitsPlain ? 'red' : showBudgetDetails ? 'orange' : 'dimmed'} style={{ fontSize: FONT.small }}>
          {discordWireResult.pending
            ? 'Preparing compact submission...'
            : showBudgetDetails
              ? `Submission: ${budget.wireLength}/${submissionLimit} ${budget.fitsDirectWire ? 'message' : 'slash command'} | posted Discord card: ${budget.postedCardLength}/${DISCORD_MSG_LIMIT} ${budget.decorationMode === 'full' ? 'with app emotes' : budget.decorationMode === 'mixed' ? 'with mixed emotes' : 'with Unicode'} | future pooled card: ${budget.pooledPlainCardLength}/${DISCORD_MSG_LIMIT} — `
              : ''}
          {!discordWireResult.pending && (discordWireError
            ? 'compact submission unavailable.'
            : !budget.fitsWire
            ? 'compact submission is too large even for /wledger-share; trim notes.'
            : !budget.fitsPlain
            ? 'posted card is too large; trim notes.'
            : !budget.fitsDirectWire
              ? 'copy it into the payload field of /wledger-share.'
              : budget.decorationMode === 'full'
                ? showBudgetDetails
                  ? 'fits directly with app emotes.'
                  : ''
                : 'fits directly; only the emotes needed to stay under Discord\'s limit fall back.')}
        </Text>}
        {!sharePosted && discordWireError && !previewWithheld && (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">{discordWireError}</Text>
          </Alert>
        )}
        {!sharePosted && previewWithheld ? (
          <Alert color="red" variant="light" p="xs">
            <Text size="xs">
              {missingDivinePrice ? 'Preview needs a Divine price for this session.' :
              evidenceBlocked
                ? evidenceFetchError || evidencePreflightError
                  ? 'Preview withheld until the evidence preflight above passes.'
                  : 'Preparing the revision and setup evidence proof...'
                : shareIncomplete
                  ? 'Preview withheld until the share requirements above are complete.'
                : costsIncomplete
                  ? 'Preview withheld until the configured setup costs above have current prices and usage.'
                : impossibleAtlasPoints
                ? 'Preview withheld until the impossible Atlas allocation is corrected.'
                : 'Preview withheld — this league no longer accepts new shares.'}
            </Text>
          </Alert>
        ) : (
          <div style={{ background: COLOR.bgDeep, borderRadius: 6, padding: '8px 10px', maxHeight: 200, overflowY: 'auto' }}>
            <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: COLOR.textSoft, fontSize: FONT.small, lineHeight: 1.5 }}>
              {postedCardPreview}
            </Text>
          </div>
        )}
      </Stack>
      </fieldset>
      </div>
      <div className="share-footer" role="region" aria-label="Sharing status and actions"
        style={{ background: COLOR.bgRaised, borderTop: `1px solid ${COLOR.borderSoft}`, ...(manageNames ? { display: 'none' } : {}) }}>
        {sharePosted && postedDisplay.error && <Alert color="orange" role="alert">{postedDisplay.error}</Alert>}
        {authorReview && opened && <AuthorShareControls enabled={!manageNames}
          restorationError={restoreOrdinaryDraft ? draftError : null}
          onTrackingChange={setShareTracking}
          onPostedChange={setSharePosted}
          onArchivedChange={setShareArchived}
          onCompletedChange={setShareCompleted}
          onPresentationChange={setSharePresentation}
          onStorageRecovered={() => setStorageRecoveryGeneration(generation => generation + 1)}
          onClose={onClose}
          core={authorCore}
          raw={discordExport} blocked={draftLoading || !!draftError || previewWithheld || !budget.fitsPlain}
          fieldContainer={authorFieldContainer}
          onManage={(initialAction) => { setManageNamesAction(initialAction); setManageNames(true); }} />}
        {authorReview === false && <CopyButton value={discordWire} timeout={2000}>
          {({ copied, copy }) => (
            <Button leftSection={copied ? <IconCheck size={14} /> : <IconBrandDiscord size={14} />} onClick={copy}
              disabled={copyDisabled}
              color={copied ? 'teal' : 'indigo'} variant="light" fullWidth>
              {copied
                ? 'Copied to clipboard!'
                : !budget.fitsDirectWire && discordWire
                  ? 'Copy for /wledger-share'
                  : 'Copy to Discord'}
            </Button>
          )}
        </CopyButton>}
      </div>
      {authorReview && manageNames && <ManagePublicNames embedded opened={opened} initialAction={manageNamesAction} onClose={() => setManageNames(false)} />}
    </Modal>
  );
};
