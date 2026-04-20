import { AlertTriangle, Loader2 } from 'lucide-react';
import type { BoardProject, JiraInstance, SyncProgress, Ticket } from '../types';
import { Column } from './Column';
import { InstanceBadge } from './InstanceBadge';

interface SwimlaneProps {
  project: BoardProject;
  instance: JiraInstance;
  tickets: Ticket[];
  syncProgress: SyncProgress | undefined;
}

export function Swimlane({ project, instance, tickets, syncProgress }: SwimlaneProps) {
  const todoTickets = tickets.filter((t) => t.status_category === 'todo');
  const inProgressTickets = tickets.filter((t) => t.status_category === 'in_progress');
  const doneTickets = tickets.filter((t) => t.status_category === 'done');

  return (
    <div className="flex flex-row gap-4">
      {/* Left sidebar */}
      <div className="sticky left-0 w-48 shrink-0 flex flex-col gap-2 pt-2 px-2">
        <InstanceBadge name={instance.name} color={instance.color} />
        <p className="text-sm font-semibold text-slate-800 leading-snug">
          {project.project_name}
        </p>
        <p className="text-xs text-slate-400 font-mono">{project.project_key}</p>

        {/* Sync status */}
        {syncProgress?.status === 'syncing' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Synchronisierung…
          </div>
        )}
        {syncProgress?.status === 'error' && (
          <div className="flex items-start gap-1.5 text-xs text-red-600">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span className="truncate max-w-36" title={syncProgress.error}>
              {syncProgress.error ?? 'Fehler'}
            </span>
          </div>
        )}
        {syncProgress?.status === 'done' && (
          <span className="text-xs text-slate-400">&#10003;</span>
        )}
      </div>

      {/* Columns */}
      <Column category="todo" tickets={todoTickets} instanceHost={instance.host} />
      <Column category="in_progress" tickets={inProgressTickets} instanceHost={instance.host} />
      <Column category="done" tickets={doneTickets} instanceHost={instance.host} />
    </div>
  );
}
