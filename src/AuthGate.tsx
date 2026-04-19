import { useEffect, useState, type ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { supabase } from './lib/supabase';
import LoginPage from './components/LoginPage';

type SessionState = 'loading' | 'offline' | 'authenticated' | 'anonymous';

interface AuthGateProps {
  children: (ctx: { onLogout: () => Promise<void> }) => ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const [state, setState] = useState<SessionState>(() => (supabase ? 'loading' : 'offline'));

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setState(session ? 'authenticated' : 'anonymous');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setState(session ? 'authenticated' : 'anonymous');
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Session wird geprüft...</p>
        </div>
      </div>
    );
  }

  if (state === 'anonymous') return <LoginPage />;

  const onLogout = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  return <>{children({ onLogout })}</>;
}
