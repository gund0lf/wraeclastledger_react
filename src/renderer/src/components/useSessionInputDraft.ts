import { useEffect, useReducer, useRef } from 'react';
import { useSessionStore, type SessionState } from '../store/useSessionStore';
import { InputDraft } from '../utils/inputDraft';
import { registerSessionInputDraft } from '../utils/sessionInputDrafts';

/** Only the small input redraws while typing; committed values still autosave. */
export function useSessionInputDraft<T extends string | number>(
  select: (state: SessionState) => T,
  onCommit: (value: T) => void,
  parse: (raw: string) => T,
  format: (value: T) => string = String,
) {
  const value = useSessionStore(select);
  const scope = useSessionStore((state) => `${state.sessionNonce}:${state.activeSessionId ?? 'working'}`);
  const [, render] = useReducer((revision: number) => revision + 1, 0);
  const ref = useRef<InputDraft<T> | null>(null);
  if (!ref.current) ref.current = new InputDraft({ value, scope }, format);
  const draft = ref.current;
  draft.sync({ value, scope });

  const change = (raw: string): void => {
    draft.edit(raw);
    render();
  };
  const flush = (): void => {
    const state = useSessionStore.getState();
    const next = draft.commit({
      value: select(state),
      scope: `${state.sessionNonce}:${state.activeSessionId ?? 'working'}`,
    }, parse);
    if (next !== undefined) onCommit(next);
  };
  const latestFlush = useRef(flush);
  latestFlush.current = flush;
  useEffect(() => {
    const flushLatest = (): void => latestFlush.current();
    const unregister = registerSessionInputDraft(flushLatest);
    return () => {
      unregister();
      // Closing/collapsing the editor also finishes its edit. Scope validation
      // in InputDraft prevents an old unmount from writing into a new session.
      flushLatest();
    };
  }, []);
  const commit = (): void => { flush(); render(); };

  return { raw: draft.raw, change, commit };
}
