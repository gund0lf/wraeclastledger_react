export type SessionMutationOrigin = 'user' | 'automatic';

let automaticMutationDepth = 0;

/**
 * Session payload writes normally represent direct user intent. Derived or
 * infrastructure writes must opt into this wrapper so repository autosave can
 * persist them without treating them as the first authored edit after load.
 * Zustand subscriptions run synchronously, so a scoped counter is sufficient.
 */
export function withAutomaticSessionMutation<T>(mutation: () => T): T {
  automaticMutationDepth += 1;
  try {
    return mutation();
  } finally {
    automaticMutationDepth -= 1;
  }
}

export function isAutomaticSessionMutation(): boolean {
  return automaticMutationDepth > 0;
}
