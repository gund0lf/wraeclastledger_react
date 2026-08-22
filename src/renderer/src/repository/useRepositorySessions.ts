import { useEffect, useMemo, useState } from 'react';
import type { SavedSession } from '../types';
import { useSessionStore } from '../store/useSessionStore';
import { loadRepositorySessionForInspection } from './sessionRepositoryRuntime';

const payloadCache = new Map<string, { generation: number; session: SavedSession }>();

export function useRepositorySessions(
  requestedIds: readonly string[],
  enabled = true,
): { sessions: Record<string, SavedSession>; loading: boolean; error: string | null } {
  const summaries = useSessionStore((state) => state.repositorySessions);
  const requestKey = useMemo(() => [...new Set(requestedIds)].sort().join('\n'), [requestedIds]);
  const [sessions, setSessions] = useState<Record<string, SavedSession>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setSessions({});
      setLoading(false);
      setError(null);
      return;
    }
    const ids = requestKey ? requestKey.split('\n') : [];
    let cancelled = false;
    setLoading(ids.length > 0);
    setError(null);
    void Promise.all(ids.map(async (id) => {
      const generation = summaries.find((summary) => summary.id === id)?.generation;
      if (generation === undefined) throw new Error(`Session ${id} is missing from the repository catalogue`);
      const cached = payloadCache.get(id);
      if (cached?.generation === generation) return [id, cached.session] as const;
      const session = await loadRepositorySessionForInspection(id);
      payloadCache.set(id, { generation, session });
      return [id, session] as const;
    })).then((entries) => {
      if (cancelled) return;
      setSessions(Object.fromEntries(entries));
      setLoading(false);
    }).catch((reason) => {
      if (cancelled) return;
      setSessions({});
      setLoading(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { cancelled = true; };
  }, [enabled, requestKey, summaries]);

  return { sessions, loading, error };
}
