/**
 * Evidence-target persistence matrix. The four target fields are an atomic
 * SessionSettings record: saved evidence runs survive save/load, while new
 * sessions and imports never inherit somebody else's targeting authority.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDiscordExport } from '../utils/discordExport';
import { parseDiscordExport } from '../utils/parseDiscordExport';
import { DEFAULT_SETTINGS, useSessionStore } from './useSessionStore';

const UUID = 'be00f19f-b74c-4c4f-9a1c-ee54d2ffaabc';
const FINGERPRINT = `sha256-v1:${'b'.repeat(64)}`;

function resetStore(): void {
  useSessionStore.setState({
    maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
    settings: { ...DEFAULT_SETTINGS },
    savedSessions: {}, activeSessionId: null, activeSessionName: null,
    sessionNotes: '',
  });
}

function setEvidenceTarget(): void {
  const state = useSessionStore.getState();
  state.updateSetting('updateTargetStrategyId', null);
  state.updateSetting('updateTargetStrategyName', null);
  state.updateSetting('evidenceTargetStrategyId', UUID);
  state.updateSetting('evidenceTargetStrategyName', 'Test strategy');
  state.updateSetting('evidenceTargetExpectedRevision', 7);
  state.updateSetting('evidenceTargetSetupFingerprint', FINGERPRINT);
}

describe('evidence target persistence matrix', () => {
  beforeEach(resetStore);

  it('survives save, switch away, and load', () => {
    setEvidenceTarget();
    useSessionStore.getState().saveAsNewSession('evidence run');
    const id = useSessionStore.getState().activeSessionId!;

    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().settings.evidenceTargetStrategyId).toBeNull();

    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().settings).toMatchObject({
      evidenceTargetStrategyId: UUID,
      evidenceTargetStrategyName: 'Test strategy',
      evidenceTargetExpectedRevision: 7,
      evidenceTargetSetupFingerprint: FINGERPRINT,
    });
  });

  it('fills every field with null when loading a pre-evidence saved session', () => {
    setEvidenceTarget();
    useSessionStore.getState().saveAsNewSession('legacy');
    const id = useSessionStore.getState().activeSessionId!;
    const saved = useSessionStore.getState().savedSessions[id];
    const legacy = { ...saved.settings } as Record<string, unknown>;
    delete legacy.evidenceTargetStrategyId;
    delete legacy.evidenceTargetStrategyName;
    delete legacy.evidenceTargetExpectedRevision;
    delete legacy.evidenceTargetSetupFingerprint;
    useSessionStore.setState({
      savedSessions: {
        [id]: { ...saved, settings: legacy as unknown as typeof saved.settings },
      },
    });

    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().settings).toMatchObject({
      evidenceTargetStrategyId: null,
      evidenceTargetStrategyName: null,
      evidenceTargetExpectedRevision: null,
      evidenceTargetSetupFingerprint: null,
    });
  });

  it('a genuinely new session and share-as-new both clear the target', () => {
    setEvidenceTarget();
    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().settings.evidenceTargetStrategyId).toBeNull();

    setEvidenceTarget();
    const state = useSessionStore.getState();
    state.updateSetting('evidenceTargetStrategyId', null);
    state.updateSetting('evidenceTargetStrategyName', null);
    state.updateSetting('evidenceTargetExpectedRevision', null);
    state.updateSetting('evidenceTargetSetupFingerprint', null);
    state.saveAsNewSession('shared as new');
    const id = useSessionStore.getState().activeSessionId!;
    useSessionStore.getState().newSession();
    useSessionStore.getState().loadSession(id);
    expect(useSessionStore.getState().settings.evidenceTargetStrategyId).toBeNull();
  });

  it('parses evidence provenance without adopting it into the store', () => {
    const exported = buildDiscordExport({
      maps: [{ quantity: 80, rarity: 60, packSize: 40, moreCurrency: 100, moreScarabs: 0 }],
      settings: { ...DEFAULT_SETTINGS, divinePrice: 300 },
      lootItems: [], baselineTotal: 0, investmentNeutralization: 0,
      evidence: {
        targetStrategyId: UUID,
        expectedRevision: 7,
        runKey: `sha256-v1:${'a'.repeat(64)}`,
        runStartedAt: '2026-07-29T18:00:00.000Z',
        runEndedAt: '2026-07-29T18:30:00.000Z',
        setupFingerprint: FINGERPRINT,
      },
    });
    expect(parseDiscordExport(exported)).toMatchObject({
      operation: 'evidence',
      evidenceTargetStrategyId: UUID,
    });

    useSessionStore.getState().newSession();
    expect(useSessionStore.getState().settings.evidenceTargetStrategyId).toBeNull();
  });
});
