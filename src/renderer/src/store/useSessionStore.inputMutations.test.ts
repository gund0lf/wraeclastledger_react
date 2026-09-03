import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, flushActiveSessionAutoSave, useSessionStore } from './useSessionStore';
import { InputDraft } from '../utils/inputDraft';
import { SESSION_PAYLOAD_STATE_KEYS } from '../repository/sessionPayloadCodec';

describe('input mutation boundaries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    flushActiveSessionAutoSave();
    useSessionStore.setState({
      settings: { ...DEFAULT_SETTINGS, scarabs: DEFAULT_SETTINGS.scarabs.map((slot) => ({ ...slot })) },
      savedSessions: {}, activeSessionId: null, activeSessionName: null,
      maps: [], lootItems: [], baselineItems: [], baselineTotal: 0,
      manualLootItems: [], manualStatistics: {}, sessionNotes: '', discordTag: '',
    });
  });
  afterEach(() => {
    flushActiveSessionAutoSave();
    vi.useRealTimers();
  });

  it('does not emit settings or preference changes for unchanged inputs', () => {
    const before = useSessionStore.getState();
    const notify = vi.fn();
    const unsubscribe = useSessionStore.subscribe(notify);
    try {
      before.updateSetting('baseMapCost', before.settings.baseMapCost);
      before.updateAdvSetting('advGemName', before.settings.advGemName);
      before.updateAdvSetting('advGemCount', before.settings.advGemCount);
      before.updateScarab(0, 'name', '');
      before.updateScarab(0, 'cost', 0);
      before.clearScarab(0);
      before.setDivinePriceManual(before.settings.divinePrice);
      before.setDiscordTag(before.discordTag);
      before.setSessionNotes(before.sessionNotes);
      expect(useSessionStore.getState()).toBe(before);
      expect(notify).not.toHaveBeenCalled();
    } finally { unsubscribe(); }
  });

  it('preserves existing Atlas invalidation and advanced split side effects on real edits', () => {
    const state = useSessionStore.getState();
    state.updateAdvSetting('advSplitPrice', 25);
    expect(useSessionStore.getState().settings.isSplitSession).toBe(true);
    state.updateAdvSetting('advSplitPrice', 0);
    expect(useSessionStore.getState().settings.isSplitSession).toBe(false);
    state.updateSetting('bestiaryAtlasSetup', { einharChance: 100 });
    state.updateSetting('atlasTreeUrl', 'https://pathofpathing.com/?v=changed');
    expect(useSessionStore.getState().settings.bestiaryAtlasSetup).toBeUndefined();
  });

  it.each(['scarab', 'gem'] as const)('%s typing schedules no session save until one deliberate commit', (kind) => {
    const state = useSessionStore.getState();
    const read = () => {
      const current = useSessionStore.getState();
      return {
        value: kind === 'scarab' ? current.settings.scarabs[0].name : current.settings.advGemName,
        scope: `${current.sessionNonce}:${current.activeSessionId ?? 'working'}`,
      };
    };
    const apply = (value: string) => kind === 'scarab'
      ? state.updateScarab(0, 'name', value) : state.updateAdvSetting('advGemName', value);
    // This is the production repository subscription's exact payload-change gate.
    const scheduled = vi.fn();
    const unsubscribe = useSessionStore.subscribe((next, previous) => {
      if (SESSION_PAYLOAD_STATE_KEYS.some((key) => next[key] !== previous[key])) scheduled();
    });
    try {
      const draft = new InputDraft(read(), String);
      const text = kind === 'scarab' ? 'Bestiary Scarab' : 'Empower';
      for (let i = 1; i <= text.length; i += 1) draft.edit(text.slice(0, i));
      expect(scheduled).not.toHaveBeenCalled();
      const value = draft.commit(read(), String);
      if (value !== undefined) apply(value);
      const duplicate = draft.commit(read(), String);
      if (duplicate !== undefined) apply(duplicate);
      expect(scheduled).toHaveBeenCalledTimes(1);
      expect(read().value).toBe(text);
      apply(text);
      expect(scheduled).toHaveBeenCalledTimes(1);
    } finally { unsubscribe(); }
  });

  it('still autosaves real edits and flushes them to the old session before a switch', () => {
    const state = useSessionStore.getState();
    state.saveAsNewSession('Input test');
    const id = useSessionStore.getState().activeSessionId!;
    state.updateScarab(0, 'name', 'Bestiary Scarab');
    state.updateScarab(0, 'cost', 15);
    state.updateAdvSetting('advGemName', 'Empower');
    vi.advanceTimersByTime(800);
    expect(useSessionStore.getState().savedSessions[id].settings).toMatchObject({
      advGemName: 'Empower', scarabs: [{ name: 'Bestiary Scarab', cost: 15 }, ...DEFAULT_SETTINGS.scarabs.slice(1)],
    });
    state.updateAdvSetting('advGemName', 'Enlighten');
    state.newSession();
    expect(useSessionStore.getState().savedSessions[id].settings.advGemName).toBe('Enlighten');
    expect(useSessionStore.getState().settings.advGemName).toBe('');
  });

  it('clears name and price once, and skips another clear', () => {
    const state = useSessionStore.getState();
    state.updateScarab(0, 'name', 'Bestiary Scarab');
    state.updateScarab(0, 'cost', 15);
    state.clearScarab(0);
    const cleared = useSessionStore.getState();
    expect(cleared.settings.scarabs[0]).toEqual({ name: '', cost: 0 });
    state.clearScarab(0);
    expect(useSessionStore.getState()).toBe(cleared);
  });
});
