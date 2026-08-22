import { createStore, type StoreApi } from 'zustand/vanilla';
import type { JsonObject } from '../../../shared/sessionRecord';
import type {
  RepositorySessionSummary,
  SessionRepositoryDataMap,
  SessionRepositoryRequest,
  SessionSaveTarget,
  SessionTarget,
} from '../../../shared/sessionRepositoryIpc';
import type { SessionRepositoryClient } from './sessionRepositoryClient';

export type RepositoryBootstrapStatus = 'dormant' | 'loading' | 'ready' | 'failed';
export type RepositoryPayloadStatus = 'idle' | 'loading' | 'ready' | 'failed';
export type RepositorySaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

type SaveRequest = Extract<SessionRepositoryRequest, { operation: 'save' }>;

interface SaveWaiter {
  resolve: (data: SessionRepositoryDataMap['save']) => void;
  reject: (error: unknown) => void;
}

interface PendingSave {
  target: SessionSaveTarget;
  payload: JsonObject;
  waiters: SaveWaiter[];
}

export interface SessionRepositoryRuntimeState {
  bootstrapStatus: RepositoryBootstrapStatus;
  payloadStatus: RepositoryPayloadStatus;
  saveStatus: RepositorySaveStatus;
  sessions: RepositorySessionSummary[];
  activeTarget: SessionTarget | null;
  viewedTarget: SessionTarget | null;
  loadedTarget: SessionTarget | null;
  loadedGeneration: number | null;
  loadedPayload: JsonObject | null;
  bootstrapError: string | null;
  payloadError: string | null;
  saveError: string | null;
  bootstrap: () => Promise<void>;
  load: (target: SessionTarget) => Promise<void>;
  save: (target: SessionSaveTarget, payload: JsonObject) => Promise<SessionRepositoryDataMap['save']>;
  reset: () => void;
}

const sameTarget = (left: SessionTarget | null, right: SessionTarget | null): boolean => {
  if (left === null || right === null || left.kind !== right.kind) return left === right;
  return left.kind === 'working' || left.sessionId === (right as Extract<SessionTarget, { kind: 'session' }>).sessionId;
};

const sameSaveTarget = (left: SessionSaveTarget, right: SessionSaveTarget): boolean => {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'working') return true;
  if (left.kind === 'new') return left.name === (right as Extract<SessionSaveTarget, { kind: 'new' }>).name;
  return left.sessionId === (right as Extract<SessionSaveTarget, { kind: 'session' }>).sessionId;
};

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function replaceSummary(
  sessions: RepositorySessionSummary[],
  summary: RepositorySessionSummary | null,
): RepositorySessionSummary[] {
  if (summary === null) return sessions;
  return [...sessions.filter(({ id }) => id !== summary.id), summary]
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.id.localeCompare(right.id));
}

/**
 * Dormant Phase 2 repository state. Bootstrap returns summaries only; payloads
 * are loaded explicitly and lazily. Request epochs prevent late responses from
 * replacing newer navigation, and "saved" is set only after a repository ack.
 */
export function createSessionRepositoryStore(
  client: SessionRepositoryClient,
): StoreApi<SessionRepositoryRuntimeState> {
  let bootstrapEpoch = 0;
  let loadEpoch = 0;
  let saveEpoch = 0;
  let pendingSave: PendingSave | null = null;
  let currentSaveTarget: SessionSaveTarget | null = null;
  let saveDrain: Promise<void> | null = null;

  const initial = {
    bootstrapStatus: 'dormant' as const,
    payloadStatus: 'idle' as const,
    saveStatus: 'idle' as const,
    sessions: [],
    activeTarget: null,
    viewedTarget: null,
    loadedTarget: null,
    loadedGeneration: null,
    loadedPayload: null,
    bootstrapError: null,
    payloadError: null,
    saveError: null,
  };

  const store = createStore<SessionRepositoryRuntimeState>((set, get) => ({
    ...initial,
    bootstrap: async () => {
      if (get().saveStatus === 'saving') {
        throw new Error('Session repository cannot bootstrap while a save is pending');
      }
      const epoch = ++bootstrapEpoch;
      loadEpoch += 1;
      set({
        bootstrapStatus: 'loading',
        payloadStatus: 'idle',
        bootstrapError: null,
        payloadError: null,
        saveStatus: 'idle',
        saveError: null,
        loadedTarget: null,
        loadedGeneration: null,
        loadedPayload: null,
        sessions: [],
        activeTarget: null,
        viewedTarget: null,
      });
      try {
        const data = await client.request({ operation: 'bootstrap' });
        if (epoch !== bootstrapEpoch) return;
        set({
          bootstrapStatus: 'ready',
          sessions: data.sessions,
          activeTarget: data.activeTarget,
          viewedTarget: data.viewedTarget,
          bootstrapError: null,
        });
      } catch (error) {
        if (epoch !== bootstrapEpoch) return;
        set({ bootstrapStatus: 'failed', bootstrapError: message(error) });
      }
    },
    load: async (target) => {
      if (get().bootstrapStatus !== 'ready') {
        throw new Error('Session repository must finish bootstrap before loading a payload');
      }
      const epoch = ++loadEpoch;
      set({ payloadStatus: 'loading', payloadError: null, viewedTarget: target });
      try {
        const data = await client.request({ operation: 'load', target });
        if (epoch !== loadEpoch) return;
        if (!sameTarget(data.target, target)) {
          throw new Error('Session repository loaded a different target than requested');
        }
        set({
          payloadStatus: 'ready',
          loadedTarget: data.target,
          loadedGeneration: data.generation,
          loadedPayload: data.payload,
          payloadError: null,
        });
      } catch (error) {
        if (epoch !== loadEpoch) return;
        set({
          payloadStatus: 'failed',
          loadedTarget: null,
          loadedGeneration: null,
          loadedPayload: null,
          payloadError: message(error),
        });
      }
    },
    save: (target, payload) => {
      if (get().bootstrapStatus !== 'ready') {
        return Promise.reject(new Error('Session repository must finish bootstrap before saving a payload'));
      }
      if (target.kind === 'session' && !sameTarget(get().loadedTarget, target)) {
        return Promise.reject(new Error('A named session payload must be loaded before it can be saved'));
      }
      return new Promise<SessionRepositoryDataMap['save']>((resolve, reject) => {
        const queuedTarget = pendingSave?.target ?? currentSaveTarget;
        if (queuedTarget !== null && !sameSaveTarget(queuedTarget, target)) {
          reject(new Error('Cannot queue saves for different session targets'));
          return;
        }
        set({ saveStatus: 'saving', saveError: null });
        if (pendingSave !== null) {
          // Tier A sends complete snapshots. Keep only the newest queued body,
          // while every caller waits for the acknowledgement that covers it.
          pendingSave.payload = payload;
          pendingSave.waiters.push({ resolve, reject });
        } else {
          pendingSave = { target, payload, waiters: [{ resolve, reject }] };
        }
        ensureSaveDrain();
      });
    },
    reset: () => {
      bootstrapEpoch += 1;
      loadEpoch += 1;
      saveEpoch += 1;
      const resetError = new Error('Session repository state was reset');
      pendingSave?.waiters.forEach(({ reject }) => reject(resetError));
      pendingSave = null;
      set(initial);
    },
  }));

  async function drainSaves(): Promise<void> {
    while (pendingSave !== null) {
      const current = pendingSave;
      pendingSave = null;
      currentSaveTarget = current.target;
      const epoch = saveEpoch;
      const state = store.getState();
      const expectedGeneration = current.target.kind === 'new'
        ? null
        : sameTarget(state.loadedTarget, current.target) ? state.loadedGeneration : null;
      const request: SaveRequest = {
        operation: 'save',
        target: current.target,
        expectedGeneration,
        payload: current.payload,
      };
      try {
        const data = await client.request(request);
        if (epoch !== saveEpoch) {
          const resetError = new Error('Session repository state was reset');
          current.waiters.forEach(({ reject }) => reject(resetError));
          currentSaveTarget = null;
          return;
        }
        const loadedTarget = store.getState().loadedTarget;
        store.setState({
          saveStatus: pendingSave === null ? 'saved' : 'saving',
          saveError: null,
          sessions: replaceSummary(store.getState().sessions, data.summary),
          ...(current.target.kind === 'new' || sameTarget(loadedTarget, data.target)
            ? {
                viewedTarget: data.target,
                loadedTarget: data.target,
                loadedGeneration: data.generation,
                loadedPayload: current.payload,
                payloadStatus: 'ready' as const,
              }
            : {}),
        });
        current.waiters.forEach(({ resolve }) => resolve(data));
        const queuedAfterAck = pendingSave as PendingSave | null;
        if (current.target.kind === 'new' && queuedAfterAck?.target.kind === 'new') {
          queuedAfterAck.target = data.target;
        }
        currentSaveTarget = null;
      } catch (error) {
        if (epoch !== saveEpoch) {
          current.waiters.forEach(({ reject }) => reject(error));
          currentSaveTarget = null;
          return;
        }
        const queued = pendingSave as PendingSave | null;
        pendingSave = null;
        store.setState({ saveStatus: 'failed', saveError: message(error) });
        current.waiters.forEach(({ reject }) => reject(error));
        queued?.waiters.forEach(({ reject }) => reject(error));
        currentSaveTarget = null;
        return;
      }
    }
  }

  function ensureSaveDrain(): void {
    if (saveDrain !== null) return;
    saveDrain = drainSaves().finally(() => {
      saveDrain = null;
      // A caller awaiting the last acknowledgement can enqueue its next full
      // snapshot before this finally callback runs. Do not strand that save.
      if (pendingSave !== null) ensureSaveDrain();
    });
  }

  return store;
}
