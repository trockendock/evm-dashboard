import { useCallback, useEffect, useState } from 'react';
import { getInstances } from '../api/supabaseRepo';
import type { JiraInstance } from '../types';

export interface UseJiraInstancesReturn {
  instances: JiraInstance[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useJiraInstances(): UseJiraInstancesReturn {
  const [instances, setInstances] = useState<JiraInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    getInstances()
      .then((data) => {
        if (cancelled) return;
        setInstances(data);
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
  }, [tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);

  return { instances, loading, error, reload };
}
