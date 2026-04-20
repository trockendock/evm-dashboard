/**
 * InstanceForm – list, add, edit, and delete Jira instances.
 * Manages its own state via useJiraInstances.
 */

import { useState } from 'react';
import { Trash2, Edit2, Plus, X, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { useJiraInstances } from '../hooks/useJiraInstances';
import {
  upsertInstance,
  deleteInstance,
} from '../api/supabaseRepo';
import { encrypt } from '../api/crypto';
import { getMyself } from '../api/jiraEndpoints';
import type { JiraInstance } from '../types';

const PRESET_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9'] as const;

interface FormState {
  id?: string;
  name: string;
  host: string;
  email: string;
  token: string;
  color: string;
}

const emptyForm = (): FormState => ({
  name: '',
  host: '',
  email: '',
  token: '',
  color: PRESET_COLORS[0],
});

export function InstanceForm() {
  const { instances, loading, error, reload } = useJiraInstances();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'testing' }
    | { kind: 'ok'; name: string }
    | { kind: 'err'; msg: string }
  >({ kind: 'idle' });

  function openAdd() {
    setForm(emptyForm());
    setSaveError(null);
    setTestStatus({ kind: 'idle' });
    setShowForm(true);
  }

  function openEdit(inst: JiraInstance) {
    setForm({
      id: inst.id,
      name: inst.name,
      host: inst.host,
      email: inst.email,
      token: '', // never pre-fill – user must re-enter to change
      color: inst.color,
    });
    setSaveError(null);
    setTestStatus({ kind: 'idle' });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setSaveError(null);
    setTestStatus({ kind: 'idle' });
  }

  async function handleDelete(id: string) {
    if (!confirm('Instanz wirklich löschen? Alle verknüpften Projekte werden ebenfalls entfernt.')) return;
    try {
      await deleteInstance(id);
      reload();
    } catch (err) {
      alert(`Fehler beim Löschen: ${String(err)}`);
    }
  }

  async function handleTest() {
    if (!form.host || !form.email || !form.token) {
      setTestStatus({ kind: 'err', msg: 'Host, E-Mail und API-Token sind erforderlich.' });
      return;
    }
    setTestStatus({ kind: 'testing' });
    try {
      const me = await getMyself(form.host, form.email, form.token);
      setTestStatus({ kind: 'ok', name: me.displayName });
    } catch (err) {
      setTestStatus({ kind: 'err', msg: String(err) });
    }
  }

  async function handleSave() {
    if (!form.name.trim() || !form.host.trim() || !form.email.trim()) {
      setSaveError('Name, Host und E-Mail sind Pflichtfelder.');
      return;
    }
    if (!form.id && !form.token.trim()) {
      setSaveError('API-Token ist erforderlich.');
      return;
    }

    setSaving(true);
    setSaveError(null);

    try {
      // If editing without a new token, keep the existing encrypted token
      let encryptedToken: string;
      if (form.token.trim()) {
        encryptedToken = await encrypt(form.token.trim());
      } else {
        // Find the existing instance to preserve its token
        const existing = instances.find((i) => i.id === form.id);
        if (!existing) {
          setSaveError('Instanz nicht gefunden.');
          return;
        }
        encryptedToken = existing.api_token_encrypted;
      }

      const instancePayload = {
        user_id: null,
        name: form.name.trim(),
        host: form.host.trim(),
        email: form.email.trim(),
        api_token_encrypted: encryptedToken,
        color: form.color,
        // id must be a real string (not undefined) when provided
        ...(form.id ? { id: form.id } : { id: crypto.randomUUID() }),
      };
      await upsertInstance(instancePayload);

      reload();
      closeForm();
    } catch (err) {
      setSaveError(String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Lade Instanzen…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
          Fehler beim Laden: {error}
        </div>
      )}

      {/* Instance list */}
      {instances.length > 0 && (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {instances.map((inst) => (
              <li key={inst.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: inst.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{inst.name}</p>
                  <p className="text-xs text-slate-400 truncate">{inst.host}</p>
                </div>
                <button
                  onClick={() => openEdit(inst)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  title="Bearbeiten"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(inst.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  title="Löschen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {instances.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 text-center py-10 text-slate-400 text-sm">
          Noch keine Instanzen konfiguriert.
        </div>
      )}

      {/* Add button */}
      {!showForm && (
        <button
          onClick={openAdd}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Instanz hinzufügen
        </button>
      )}

      {/* Add / Edit form */}
      {showForm && (
        <div className="rounded-xl border border-indigo-200 bg-white shadow-sm p-5 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-slate-800">
              {form.id ? 'Instanz bearbeiten' : 'Neue Instanz'}
            </h3>
            <button
              onClick={closeForm}
              className="p-1 rounded text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="z.B. Mein Jira"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Host</label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="abc.atlassian.net"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">E-Mail</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@firma.ch"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                API-Token{form.id ? ' (leer lassen = unverändert)' : ''}
              </label>
              <input
                type="password"
                value={form.token}
                onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))}
                placeholder={form.id ? '••••••••' : 'Jira API-Token eingeben'}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400"
              />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">Farbe</label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className="w-7 h-7 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor: form.color === c ? '#1e293b' : 'transparent',
                    boxShadow: form.color === c ? '0 0 0 2px #fff, 0 0 0 4px #1e293b' : undefined,
                  }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Test connection */}
          <div className="space-y-1">
            <button
              onClick={handleTest}
              disabled={testStatus.kind === 'testing'}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
            >
              {testStatus.kind === 'testing' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Verbindung testen
            </button>
            {testStatus.kind === 'ok' && (
              <p className="flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle className="w-3.5 h-3.5" />
                Verbunden als {testStatus.name}
              </p>
            )}
            {testStatus.kind === 'err' && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <XCircle className="w-3.5 h-3.5" />
                Fehler: {testStatus.msg}
              </p>
            )}
          </div>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {saveError}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {form.id ? 'Speichern' : 'Hinzufügen'}
            </button>
            <button
              onClick={closeForm}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
