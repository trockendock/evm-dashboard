/**
 * ProjectPicker – per-instance checkbox list to select which Jira projects appear on the board.
 */

import { useCallback, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { getBoardProjects, upsertBoardProject, deleteBoardProject } from '../api/supabaseRepo';
import { decrypt } from '../api/crypto';
import { getProjects } from '../api/jiraEndpoints';
import type { JiraInstance, BoardProject } from '../types';

interface ProjectPickerProps {
  instances: JiraInstance[];
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface InstanceState {
  available: JiraProject[];
  selected: BoardProject[];
  loading: boolean;
  loaded: boolean;
  error: string | null;
}

function useInstanceProjectState(instance: JiraInstance) {
  const [state, setState] = useState<InstanceState>({
    available: [],
    selected: [],
    loading: false,
    loaded: false,
    error: null,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const plainToken = await decrypt(instance.api_token_encrypted);
      const [available, selected] = await Promise.all([
        getProjects(instance.host, instance.email, plainToken),
        getBoardProjects(instance.id),
      ]);
      setState({ available, selected, loading: false, loaded: true, error: null });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, loaded: true, error: String(err) }));
    }
  }, [instance]);

  return { state, load, setState };
}

interface InstanceSectionProps {
  instance: JiraInstance;
}

function InstanceSection({ instance }: InstanceSectionProps) {
  const { state, load, setState } = useInstanceProjectState(instance);

  async function handleToggle(project: JiraProject, checked: boolean) {
    if (checked) {
      // Add to board
      try {
        const bp = await upsertBoardProject({
          id: crypto.randomUUID(),
          instance_id: instance.id,
          project_key: project.key,
          project_name: project.name,
          jql_override: null,
          display_order: 0,
        });
        setState((s) => ({ ...s, selected: [...s.selected, bp] }));
      } catch (err) {
        alert(`Fehler beim Hinzufügen: ${String(err)}`);
      }
    } else {
      // Remove from board
      const existing = state.selected.find((bp) => bp.project_key === project.key);
      if (!existing) return;
      try {
        await deleteBoardProject(existing.id);
        setState((s) => ({
          ...s,
          selected: s.selected.filter((bp) => bp.id !== existing.id),
        }));
      } catch (err) {
        alert(`Fehler beim Entfernen: ${String(err)}`);
      }
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Instance header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: instance.color }}
        />
        <span className="text-sm font-semibold text-slate-800">{instance.name}</span>
        <span className="text-xs text-slate-400">{instance.host}</span>
        {state.loaded && (
          <button
            onClick={load}
            disabled={state.loading}
            className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
            title="Projekte neu laden"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="p-4">
        {!state.loaded && (
          <button
            onClick={load}
            disabled={state.loading}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {state.loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Projekte laden
          </button>
        )}

        {state.loaded && state.error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            Fehler: {state.error}
          </p>
        )}

        {state.loaded && !state.error && state.available.length === 0 && (
          <p className="text-sm text-slate-400">Keine Projekte gefunden.</p>
        )}

        {state.loading && state.loaded && (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Lade…
          </div>
        )}

        {state.loaded && !state.error && state.available.length > 0 && (
          <ul className="space-y-1 max-h-64 overflow-y-auto">
            {state.available.map((project) => {
              const isSelected = state.selected.some(
                (bp) => bp.project_key === project.key,
              );
              return (
                <li key={project.key}>
                  <label className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => handleToggle(project, e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-400 w-16 flex-shrink-0">
                      {project.key}
                    </span>
                    <span className="text-sm text-slate-700 group-hover:text-slate-900 truncate">
                      {project.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ProjectPicker({ instances }: ProjectPickerProps) {
  if (instances.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center py-10 text-slate-400 text-sm">
        Keine Instanzen konfiguriert. Füge zuerst eine Instanz hinzu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {instances.map((inst) => (
        <InstanceSection key={inst.id} instance={inst} />
      ))}
    </div>
  );
}
