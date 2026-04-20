import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import type { BoardFilters, StatusCategory, Ticket } from '../types';
import { BoardFiltersBar } from './BoardFilters';

const EMPTY_FILTERS: BoardFilters = {
  search: '',
  instanceIds: [],
  projectIds: [],
  assignees: [],
};

type SortKey =
  | 'instance'
  | 'project'
  | 'key'
  | 'type'
  | 'summary'
  | 'status'
  | 'category'
  | 'priority'
  | 'assignee'
  | 'due_date'
  | 'epic'
  | 'updated';

type SortDir = 'asc' | 'desc';

const CATEGORY_LABEL: Record<StatusCategory, string> = {
  todo: 'Zu erledigen',
  in_progress: 'In Bearbeitung',
  done: 'Erledigt',
};

export function List(): React.JSX.Element {
  const { tickets, instances, projects, syncProgress, lastSyncAt, syncing, error, refresh } =
    useKanbanBoard();

  const [filters, setFilters] = useState<BoardFilters>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>('instance');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Build lookup maps
  const instanceMap = new Map(instances.map((i) => [i.id, i]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  // Apply filters
  const searchLower = filters.search.toLowerCase();
  const filteredTickets = tickets.filter((ticket) => {
    if (
      searchLower &&
      !ticket.issue_key.toLowerCase().includes(searchLower) &&
      !(ticket.summary ?? '').toLowerCase().includes(searchLower)
    ) {
      return false;
    }

    if (filters.instanceIds.length > 0) {
      const project = projectMap.get(ticket.board_project_id);
      if (!project || !filters.instanceIds.includes(project.instance_id)) return false;
    }

    if (filters.projectIds.length > 0 && !filters.projectIds.includes(ticket.board_project_id)) {
      return false;
    }

    if (
      filters.assignees.length > 0 &&
      !filters.assignees.includes(ticket.assignee_name ?? '')
    ) {
      return false;
    }

    return true;
  });

  // Sorting helper
  function getTicketSortValue(ticket: Ticket, key: SortKey): string {
    const project = projectMap.get(ticket.board_project_id);
    const instance = project ? instanceMap.get(project.instance_id) : undefined;

    switch (key) {
      case 'instance':
        return instance?.name ?? '';
      case 'project':
        return project?.project_name ?? '';
      case 'key':
        return ticket.issue_key;
      case 'type':
        return ticket.issue_type ?? '';
      case 'summary':
        return ticket.summary ?? '';
      case 'status':
        return ticket.status_name ?? '';
      case 'category':
        return CATEGORY_LABEL[ticket.status_category];
      case 'priority':
        return ticket.priority ?? '';
      case 'assignee':
        return ticket.assignee_name ?? '';
      case 'due_date':
        return ticket.due_date ?? '';
      case 'epic':
        return ticket.epic_name ?? ticket.epic_key ?? '';
      case 'updated':
        return ticket.jira_updated_at ?? '';
    }
  }

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const av = getTicketSortValue(a, sortKey);
    const bv = getTicketSortValue(b, sortKey);
    const cmp = av.localeCompare(bv);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d: SortDir) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function sortIndicator(key: SortKey): string {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  const isLoading = instances.length === 0 && projects.length === 0 && !error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-slate-500">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-sm">Lade Liste…</span>
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

  const columns: { key: SortKey; label: string }[] = [
    { key: 'instance', label: 'Instanz' },
    { key: 'project', label: 'Projekt' },
    { key: 'key', label: 'Key' },
    { key: 'type', label: 'Type' },
    { key: 'summary', label: 'Zusammenfassung' },
    { key: 'status', label: 'Status' },
    { key: 'category', label: 'Kategorie' },
    { key: 'priority', label: 'Priorität' },
    { key: 'assignee', label: 'Bearbeiter' },
    { key: 'due_date', label: 'Fälligkeit' },
    { key: 'epic', label: 'Epic' },
    { key: 'updated', label: 'Aktualisiert' },
  ];

  // Mark syncProgress usage to avoid unused variable warning
  void syncProgress;

  return (
    <div className="flex flex-col h-full">
      <BoardFiltersBar
        instances={instances}
        projects={projects}
        tickets={tickets}
        filters={filters}
        onChange={setFilters}
        syncing={syncing}
        lastSyncAt={lastSyncAt}
        onSync={refresh}
      />

      {/* Ticket count */}
      <div className="flex justify-end px-4 py-2">
        <span className="text-xs text-slate-500">
          {sortedTickets.length} Ticket{sortedTickets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto flex-1 px-4 pb-6">
        <table className="min-w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2 text-left text-xs font-semibold text-slate-600 whitespace-nowrap cursor-pointer select-none hover:text-indigo-600 transition-colors"
                >
                  {col.label}
                  {sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedTickets.map((ticket) => {
              const project = projectMap.get(ticket.board_project_id);
              const instance = project ? instanceMap.get(project.instance_id) : undefined;
              const instanceHost = instance?.host ?? '';
              const isDuePast =
                ticket.due_date != null && new Date(ticket.due_date) < new Date();

              function handleRowClick() {
                if (instanceHost) {
                  window.open(`https://${instanceHost}/browse/${ticket.issue_key}`, '_blank');
                }
              }

              return (
                <tr
                  key={ticket.id}
                  onClick={handleRowClick}
                  className="border-b border-slate-100 hover:bg-indigo-50 cursor-pointer transition-colors"
                >
                  {/* Instanz */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {instance && (
                      <span
                        className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: instance.color + '20',
                          color: instance.color,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: instance.color }}
                        />
                        {instance.name}
                      </span>
                    )}
                  </td>
                  {/* Projekt */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                    {project?.project_name ?? '—'}
                  </td>
                  {/* Key */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-xs text-slate-500">{ticket.issue_key}</span>
                  </td>
                  {/* Type */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {ticket.issue_type_icon_url && (
                        <img
                          src={ticket.issue_type_icon_url}
                          alt={ticket.issue_type ?? ''}
                          width={14}
                          height={14}
                        />
                      )}
                      <span className="text-xs text-slate-600">{ticket.issue_type ?? '—'}</span>
                    </div>
                  </td>
                  {/* Zusammenfassung */}
                  <td className="px-3 py-2 max-w-xs">
                    <span className="text-sm text-slate-800 line-clamp-1">
                      {ticket.summary ?? '—'}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                      {ticket.status_name ?? '—'}
                    </span>
                  </td>
                  {/* Kategorie */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                    {CATEGORY_LABEL[ticket.status_category]}
                  </td>
                  {/* Priorität */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {ticket.priority_icon_url && (
                        <img
                          src={ticket.priority_icon_url}
                          alt={ticket.priority ?? ''}
                          width={12}
                          height={12}
                        />
                      )}
                      <span className="text-xs text-slate-600">{ticket.priority ?? '—'}</span>
                    </div>
                  </td>
                  {/* Bearbeiter */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {ticket.assignee_avatar_url && (
                        <img
                          src={ticket.assignee_avatar_url}
                          alt={ticket.assignee_name ?? ''}
                          className="w-5 h-5 rounded-full"
                        />
                      )}
                      <span className="text-xs text-slate-600">
                        {ticket.assignee_name ?? '—'}
                      </span>
                    </div>
                  </td>
                  {/* Fälligkeit */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ticket.due_date ? (
                      <span
                        className={`text-xs ${isDuePast ? 'text-red-600 font-medium' : 'text-slate-600'}`}
                      >
                        {new Date(ticket.due_date).toLocaleDateString('de-CH')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  {/* Epic */}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {ticket.epic_key ? (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium truncate max-w-24 inline-block"
                        style={{
                          backgroundColor: (ticket.epic_color ?? '#6366f1') + '20',
                          color: ticket.epic_color ?? '#6366f1',
                        }}
                        title={ticket.epic_name ?? ticket.epic_key}
                      >
                        {ticket.epic_name ?? ticket.epic_key}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  {/* Aktualisiert */}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                    {ticket.jira_updated_at
                      ? new Date(ticket.jira_updated_at).toLocaleDateString('de-CH')
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {sortedTickets.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-slate-400">
                  Keine Tickets
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
