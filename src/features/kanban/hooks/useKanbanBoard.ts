import { useCallback, useEffect, useRef, useState } from 'react';
import { loadCache, revalidate } from '../api/syncEngine';
import {
  getBoardProjects,
  getInstances,
  getStatusOverrides,
} from '../api/supabaseRepo';
import type {
  BoardProject,
  JiraInstance,
  StatusOverride,
  SyncProgress,
  Ticket,
} from '../types';
import { useVisibilityRefresh } from './useVisibilityRefresh';

export interface UseKanbanBoardReturn {
  tickets: Ticket[];
  instances: JiraInstance[];
  projects: BoardProject[];
  syncProgress: Map<string, SyncProgress>;
  lastSyncAt: Date | null;
  syncing: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKanbanBoard(): UseKanbanBoardReturn {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [instances, setInstances] = useState<JiraInstance[]>([]);
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [syncProgress, setSyncProgress] = useState<Map<string, SyncProgress>>(
    new Map(),
  );
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Increment to trigger a full refresh cycle
  const [cycle, setCycle] = useState(0);

  // Track if the component is still mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!mountedRef.current) return;

      setError(null);
      setSyncProgress(new Map());

      // ── Step 1: Load instances and projects ──────────────────────────────
      let loadedInstances: JiraInstance[];
      let loadedProjects: BoardProject[];

      try {
        [loadedInstances, loadedProjects] = await Promise.all([
          getInstances(),
          getBoardProjects(),
        ]);
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setError(String(err));
        return;
      }

      if (cancelled || !mountedRef.current) return;

      setInstances(loadedInstances);
      setProjects(loadedProjects);

      // ── Step 2: Load cache tickets immediately ───────────────────────────
      const projectIds = loadedProjects.map((p) => p.id);

      try {
        const cached = await loadCache(projectIds);
        if (cancelled || !mountedRef.current) return;
        setTickets(cached);
      } catch {
        // Cache miss is non-fatal — continue to revalidate
      }

      if (cancelled || !mountedRef.current) return;

      // ── Step 3: Build status overrides map ───────────────────────────────
      let overridesMap: Map<string, StatusOverride[]> = new Map();
      try {
        const overrideArrays = await Promise.all(
          loadedProjects.map((p) =>
            getStatusOverrides(p.id).then((overrides) => ({ id: p.id, overrides })),
          ),
        );
        if (cancelled || !mountedRef.current) return;
        overridesMap = new Map(
          overrideArrays.map(({ id, overrides }) => [id, overrides]),
        );
      } catch {
        // Non-fatal — proceed with empty overrides
      }

      if (cancelled || !mountedRef.current) return;

      // ── Step 4: Revalidate in background ─────────────────────────────────
      setSyncing(true);

      await revalidate(
        loadedInstances,
        loadedProjects,
        overridesMap,
        (progress) => {
          if (cancelled || !mountedRef.current) return;
          setSyncProgress((prev) => {
            const next = new Map(prev);
            next.set(progress.projectId, progress);
            return next;
          });
        },
      );

      if (cancelled || !mountedRef.current) return;

      // ── Step 5: Reload tickets from cache after sync ──────────────────────
      try {
        const fresh = await loadCache(projectIds);
        if (cancelled || !mountedRef.current) return;
        setTickets(fresh);
      } catch {
        // Leave stale tickets in place
      }

      if (!cancelled && mountedRef.current) {
        setSyncing(false);
        setLastSyncAt(new Date());
      }
    }

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  // Derived: syncing is true if any project is currently in 'syncing' status
  const isSyncing =
    syncing ||
    Array.from(syncProgress.values()).some((p) => p.status === 'syncing');

  const refresh = useCallback(() => {
    setCycle((n) => n + 1);
  }, []);

  // Re-run full cycle when the tab becomes visible again
  useVisibilityRefresh(refresh);

  return {
    tickets,
    instances,
    projects,
    syncProgress,
    lastSyncAt,
    syncing: isSyncing,
    error,
    refresh,
  };
}
