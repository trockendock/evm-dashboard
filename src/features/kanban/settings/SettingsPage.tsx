/**
 * SettingsPage – top-level settings page for the Kanban feature.
 * Three tabs: Instanzen / Projekte / Status-Overrides.
 */

import { useEffect, useState } from 'react';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useJiraInstances } from '../hooks/useJiraInstances';
import { getBoardProjects } from '../api/supabaseRepo';
import type { BoardProject } from '../types';
import { InstanceForm } from './InstanceForm';
import { ProjectPicker } from './ProjectPicker';
import { StatusOverrideEditor } from './StatusOverrideEditor';

type Tab = 'instanzen' | 'projekte' | 'overrides';

interface SettingsPageProps {
  onBack: () => void;
}

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'instanzen', label: 'Instanzen' },
  { id: 'projekte', label: 'Projekte' },
  { id: 'overrides', label: 'Status-Overrides' },
];

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('instanzen');
  const { instances, loading: instancesLoading } = useJiraInstances();

  const [boardProjects, setBoardProjects] = useState<BoardProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Load board projects when switching to the Overrides or Projekte tab
  useEffect(() => {
    if (activeTab === 'overrides' || activeTab === 'projekte') {
      setProjectsLoading(true);
      getBoardProjects()
        .then(setBoardProjects)
        .catch(() => {/* silently ignore – errors shown per-component */})
        .finally(() => setProjectsLoading(false));
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Page header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Zum Board
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <h1 className="text-lg font-bold text-slate-900">Kanban Einstellungen</h1>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <nav className="flex gap-0">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {activeTab === 'instanzen' && (
          <section>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-800">Jira-Instanzen</h2>
              <p className="text-sm text-slate-500 mt-1">
                Verbinde deine Jira-Instanzen über Host, E-Mail und API-Token.
              </p>
            </div>
            {instancesLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lade…
              </div>
            ) : (
              <InstanceForm />
            )}
          </section>
        )}

        {activeTab === 'projekte' && (
          <section>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-800">Projekte</h2>
              <p className="text-sm text-slate-500 mt-1">
                Wähle aus, welche Projekte auf dem Kanban-Board angezeigt werden.
              </p>
            </div>
            {instancesLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lade Instanzen…
              </div>
            ) : (
              <ProjectPicker instances={instances} />
            )}
          </section>
        )}

        {activeTab === 'overrides' && (
          <section>
            <div className="mb-5">
              <h2 className="text-base font-semibold text-slate-800">Status-Overrides</h2>
              <p className="text-sm text-slate-500 mt-1">
                Überschreibe pro Projekt, welchem Board-Bereich ein Jira-Status zugeordnet wird.
              </p>
            </div>
            {instancesLoading || projectsLoading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Lade…
              </div>
            ) : (
              <StatusOverrideEditor projects={boardProjects} instances={instances} />
            )}
          </section>
        )}
      </div>
    </div>
  );
}
