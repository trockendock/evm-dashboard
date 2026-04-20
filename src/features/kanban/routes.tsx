import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, ArrowLeft } from 'lucide-react';
import { Board } from './components/Board';
import { List } from './components/List';
import { SettingsPage } from './settings/SettingsPage';

type KanbanView = 'board' | 'list' | 'settings';

export function KanbanRoutes(): React.JSX.Element {
  const [view, setView] = useState<KanbanView>('board');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 text-slate-900">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between">
          {/* Left: back-to-portfolio + section title */}
          <div className="flex items-center gap-3">
            {view === 'settings' ? (
              <button
                onClick={() => setView('board')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Zurück
              </button>
            ) : (
              <Link
                to="/portfolio"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Portfolio
              </Link>
            )}
            <span className="text-sm font-semibold text-slate-800">Kanban</span>
          </div>

          {/* Center: tab links (only when not in settings) */}
          {view !== 'settings' && (
            <nav className="flex gap-1">
              <button
                onClick={() => setView('board')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  view === 'board'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                Board
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
                  view === 'list'
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                Liste
              </button>
            </nav>
          )}

          {/* Right: settings gear (hidden when already in settings) */}
          <div className="flex items-center">
            {view !== 'settings' && (
              <button
                onClick={() => setView('settings')}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                title="Einstellungen"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        {view === 'board' && <Board />}
        {view === 'list' && <List />}
        {view === 'settings' && <SettingsPage onBack={() => setView('board')} />}
      </main>
    </div>
  );
}
