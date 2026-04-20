/**
 * StatusOverrideEditor – per-project override of Jira status → board column.
 */

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import {
  getStatusOverrides,
  upsertStatusOverride,
  deleteStatusOverride,
} from '../api/supabaseRepo';
import { decrypt } from '../api/crypto';
import { getProjectStatuses } from '../api/jiraEndpoints';
import type { BoardProject, JiraInstance, JiraRawStatus, StatusCategory, StatusOverride } from '../types';

interface StatusOverrideEditorProps {
  projects: BoardProject[];
  instances: JiraInstance[];
}

const CATEGORY_LABELS: Record<string, string> = {
  new: 'Zu erledigen',
  indeterminate: 'In Bearbeitung',
  done: 'Erledigt',
};

const OVERRIDE_OPTIONS: Array<{ value: StatusCategory | ''; label: string }> = [
  { value: '', label: 'Standard' },
  { value: 'todo', label: 'Zu erledigen' },
  { value: 'in_progress', label: 'In Bearbeitung' },
  { value: 'done', label: 'Erledigt' },
];

interface ProjectSectionState {
  expanded: boolean;
  statuses: JiraRawStatus[];
  overrides: StatusOverride[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

interface ProjectSectionProps {
  project: BoardProject;
  instance: JiraInstance;
}

function ProjectSection({ project, instance }: ProjectSectionProps) {
  const [state, setState] = useState<ProjectSectionState>({
    expanded: false,
    statuses: [],
    overrides: [],
    loading: false,
    loaded: false,
    error: null,
  });

  const loadData = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const plainToken = await decrypt(instance.api_token_encrypted);
      const [statuses, overrides] = await Promise.all([
        getProjectStatuses(instance.host, instance.email, plainToken, project.project_key),
        getStatusOverrides(project.id),
      ]);
      setState((s) => ({
        ...s,
        statuses,
        overrides,
        loading: false,
        loaded: true,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, loaded: true, error: String(err) }));
    }
  }, [instance, project]);

  async function handleToggle() {
    const nextExpanded = !state.expanded;
    setState((s) => ({ ...s, expanded: nextExpanded }));
    if (nextExpanded && !state.loaded) {
      await loadData();
    }
  }

  async function handleOverrideChange(status: JiraRawStatus, value: StatusCategory | '') {
    const existingOverride = state.overrides.find(
      (o) => o.jira_status_id === status.id,
    );

    if (value === '') {
      // Remove override
      if (existingOverride) {
        try {
          await deleteStatusOverride(existingOverride.id);
          setState((s) => ({
            ...s,
            overrides: s.overrides.filter((o) => o.id !== existingOverride.id),
          }));
        } catch (err) {
          alert(`Fehler beim Entfernen: ${String(err)}`);
        }
      }
    } else {
      // Upsert override
      try {
        const saved = await upsertStatusOverride({
          board_project_id: project.id,
          jira_status_id: status.id,
          category: value,
        });
        setState((s) => {
          const filtered = s.overrides.filter((o) => o.jira_status_id !== status.id);
          return { ...s, overrides: [...filtered, saved] };
        });
      } catch (err) {
        alert(`Fehler beim Speichern: ${String(err)}`);
      }
    }
  }

  const hasOverrides = state.overrides.length > 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Header / Toggle */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        {state.expanded ? (
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
        )}
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: instance.color }}
        />
        <span className="text-sm font-medium text-slate-600">{instance.name}</span>
        <span className="text-slate-300">/</span>
        <span className="text-sm font-semibold text-slate-800">{project.project_name}</span>
        <span className="text-xs font-mono text-slate-400">({project.project_key})</span>
        {hasOverrides && (
          <span className="ml-auto text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
            {state.overrides.length} Override{state.overrides.length !== 1 ? 's' : ''}
          </span>
        )}
        {state.loading && (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 ml-auto" />
        )}
      </button>

      {/* Expanded content */}
      {state.expanded && (
        <div className="border-t border-slate-100 px-4 py-4">
          {state.error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              Fehler: {state.error}
            </p>
          )}

          {state.loading && !state.loaded && (
            <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Lade Status…
            </div>
          )}

          {state.loaded && !state.error && state.statuses.length === 0 && (
            <p className="text-sm text-slate-400">Keine Status gefunden.</p>
          )}

          {state.loaded && !state.error && state.statuses.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs font-medium text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left pb-2 pr-4">Status-Name</th>
                  <th className="text-left pb-2 pr-4">Jira Standard-Kategorie</th>
                  <th className="text-left pb-2">Override → Kategorie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {state.statuses.map((status) => {
                  const override = state.overrides.find(
                    (o) => o.jira_status_id === status.id,
                  );
                  const currentValue: StatusCategory | '' = override?.category ?? '';
                  const jiraLabel =
                    CATEGORY_LABELS[status.statusCategory.key] ??
                    status.statusCategory.key;

                  return (
                    <tr key={status.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 font-medium text-slate-700">
                        {status.name}
                      </td>
                      <td className="py-2 pr-4 text-slate-500">{jiraLabel}</td>
                      <td className="py-2">
                        <select
                          value={currentValue}
                          onChange={(e) =>
                            handleOverrideChange(
                              status,
                              e.target.value as StatusCategory | '',
                            )
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
                        >
                          {OVERRIDE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusOverrideEditor({ projects, instances }: StatusOverrideEditorProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center py-10 text-slate-400 text-sm">
        Keine Projekte auf dem Board. Füge zuerst Projekte unter "Projekte" hinzu.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map((project) => {
        const instance = instances.find((i) => i.id === project.instance_id);
        if (!instance) return null;
        return (
          <ProjectSection key={project.id} project={project} instance={instance} />
        );
      })}
    </div>
  );
}
