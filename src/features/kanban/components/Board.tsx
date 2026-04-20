import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import type { BoardFilters } from '../types';
import { BoardFiltersBar } from './BoardFilters';
import { Swimlane } from './Swimlane';

const EMPTY_FILTERS: BoardFilters = {
  search: '',
  instanceIds: [],
  projectIds: [],
  assignees: [],
};

export function Board(): React.JSX.Element {
  const { tickets, instances, projects, syncProgress, lastSyncAt, syncing, error, refresh } =
    useKanbanBoard();

  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);

  // Build lookup maps
  const instanceMap = useMemo(() => new Map(instances.map((i) => [i.id, i])), [instances]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  // Apply filters
  const filteredTickets = useMemo(() => {
    const searchLower = filters.search.toLowerCase();
    return tickets.filter((ticket) => {
      // Search filter
      if (
        searchLower &&
        !ticket.issue_key.toLowerCase().includes(searchLower) &&
        !(ticket.summary ?? '').toLowerCase().includes(searchLower)
      ) {
        return false;
      }

      // Instance filter
      if (filters.instanceIds.length > 0) {
        const project = projectMap.get(ticket.board_project_id);
        if (!project || !filters.instanceIds.includes(project.instance_id)) return false;
      }

      // Project filter
      if (filters.projectIds.length > 0 && !filters.projectIds.includes(ticket.board_project_id)) {
        return false;
      }

      // Assignee filter
      if (
        filters.assignees.length > 0 &&
        !filters.assignees.includes(ticket.assignee_name ?? '')
      ) {
        return false;
      }

      return true;
    });
  }, [tickets, filters, instanceMap, projectMap]);

  // Loading state: no data yet
  const isLoading = instances.length === 0 && projects.length === 0 && !error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Lade Board…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 m-4">
        Fehler beim Laden: {error}
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center py-16 text-slate-500 text-sm m-4">
        Noch keine Instanzen konfiguriert. Gehe zu Einstellungen.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <BoardFiltersBar
        instances={instances}
        tickets={tickets}
        filters={filters}
        onChange={setFilters}
        syncing={syncing}
        lastSyncAt={lastSyncAt}
        onSync={refresh}
      />

      <div className="flex flex-col gap-6 p-4 overflow-x-auto">
        {projects.map((project) => {
          const instance = instanceMap.get(project.instance_id);
          if (!instance) return null;

          const projectTickets = filteredTickets.filter(
            (t) => t.board_project_id === project.id,
          );

          return (
            <Swimlane
              key={project.id}
              project={project}
              instance={instance}
              tickets={projectTickets}
              syncProgress={syncProgress.get(project.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
