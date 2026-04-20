import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { BoardFilters, BoardProject, JiraInstance, Ticket } from '../types';

interface BoardFiltersProps {
  instances: JiraInstance[];
  projects: BoardProject[];
  tickets: Ticket[];
  filters: BoardFilters;
  onChange: (f: BoardFilters) => void;
  syncing: boolean;
  lastSyncAt: Date | null;
  onSync: () => void;
}

export function BoardFiltersBar({
  instances,
  tickets,
  filters,
  onChange,
  syncing,
  lastSyncAt,
  onSync,
}: BoardFiltersProps) {
  const [searchDraft, setSearchDraft] = useState(filters.search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external filter changes back to draft (e.g. on reset)
  useEffect(() => {
    setSearchDraft(filters.search);
  }, [filters.search]);

  function handleSearchChange(value: string) {
    setSearchDraft(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: value });
    }, 200);
  }

  function toggleInstance(id: string) {
    const next = filters.instanceIds.includes(id)
      ? filters.instanceIds.filter((x) => x !== id)
      : [...filters.instanceIds, id];
    onChange({ ...filters, instanceIds: next });
  }

  function toggleAssignee(name: string) {
    const next = filters.assignees.includes(name)
      ? filters.assignees.filter((x) => x !== name)
      : [...filters.assignees, name];
    onChange({ ...filters, assignees: next });
  }

  // Derive unique assignees from tickets (excluding nulls)
  const uniqueAssignees = Array.from(
    new Set(tickets.map((t) => t.assignee_name).filter((n): n is string => n != null)),
  ).sort();

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 py-3 flex flex-wrap gap-2 items-center">
      {/* Search */}
      <input
        type="search"
        value={searchDraft}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Suchen…"
        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 w-44"
      />

      {/* Instance filter pills */}
      {instances.map((inst) => {
        const active = filters.instanceIds.includes(inst.id);
        return (
          <button
            key={inst.id}
            onClick={() => toggleInstance(inst.id)}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? 'border-transparent text-white'
                : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
            }`}
            style={active ? { backgroundColor: inst.color, borderColor: inst.color } : undefined}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: active ? '#fff' : inst.color }}
            />
            {inst.name}
          </button>
        );
      })}

      {/* Assignee filter pills */}
      {uniqueAssignees.map((name) => {
        const active = filters.assignees.includes(name);
        return (
          <button
            key={name}
            onClick={() => toggleAssignee(name)}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
            }`}
          >
            {name}
          </button>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Last sync label */}
      {lastSyncAt && (
        <span className="text-xs text-slate-400">
          Zuletzt sync: {lastSyncAt.toLocaleTimeString('de-CH')}
        </span>
      )}

      {/* Sync button */}
      <button
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
        Sync
      </button>
    </div>
  );
}
