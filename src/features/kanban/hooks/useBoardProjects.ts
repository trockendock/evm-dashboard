import { useCallback, useEffect, useState } from 'react';
import { getBoardProjects } from '../api/supabaseRepo';
import type { BoardProject } from '../types';

export interface UseBoardProjectsReturn {
  projects: BoardProject[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useBoardProjects(instanceId?: string): UseBoardProjectsReturn {
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getBoardProjects(instanceId)
      .then((data) => {
        if (cancelled) return;
        setProjects(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [instanceId, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { projects, loading, error, reload };
}
