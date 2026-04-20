import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { GitMerge, Mail, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !supabase) return;

    setStatus('sending');
    setErrorMsg('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      setStatus('error');
      setErrorMsg(error.message);
    } else {
      setStatus('sent');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-200">
            <GitMerge className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">EVM Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Anmelden mit Magic Link</p>
        </div>

        {status === 'sent' ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Link gesendet</h2>
            <p className="text-slate-500 text-sm">
              Prüfe dein E-Mail-Postfach für <span className="font-medium text-slate-700">{email}</span> und klicke auf den Login-Link.
            </p>
            <button
              onClick={() => { setStatus('idle'); setEmail(''); }}
              className="mt-6 text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Andere E-Mail verwenden
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              E-Mail-Adresse
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@firma.ch"
                required
                autoFocus
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
              />
            </div>

            {status === 'error' && (
              <div className="flex items-center gap-2 mt-3 text-sm text-rose-600">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg || 'Etwas ist schiefgelaufen. Versuche es nochmal.'}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'sending' || !email}
              className="w-full mt-5 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {status === 'sending' ? (
                <>Wird gesendet...</>
              ) : (
                <>Magic Link senden <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-slate-400 mt-6">
          Kein Passwort nötig — du erhältst einen Login-Link per E-Mail.
        </p>
      </div>
    </div>
  );
}
