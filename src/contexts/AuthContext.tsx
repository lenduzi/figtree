import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { syncTimeZone } from '@/lib/notifications';

type AuthContextType = {
  session: Session | null;
  status: 'loading' | 'ready';
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthContextType['status']>(supabase ? 'loading' : 'ready');

  useEffect(() => {
    if (!supabase) return;
    let isMounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setSession(data.session);
      setStatus('ready');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      // Token refreshes hand out a new session object for the same user; keep
      // the old one so the user id stays stable and data isn't reloaded.
      setSession(prev => (prev?.user.id === nextSession?.user.id && prev && nextSession ? prev : nextSession));
      setStatus('ready');
    });
    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    syncTimeZone().catch((error) => console.error('Figtree: failed to save timezone', error));
  }, [userId]);

  return <AuthContext.Provider value={{ session, status }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
