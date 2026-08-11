import { createAuditLog, fetchProfile, logAuthActivity } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { type Session, type User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    try {
      const fetched = await fetchProfile();
      setProfile(fetched);
    } catch (err) {
      console.error('Failed to fetch profile:', err);
      setProfile(null);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      if (data.session) {
        await loadProfile();
      }
      setLoading(false);
    };

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      (async () => {
        setSession(newSession);
        if (newSession) {
          await loadProfile();
        } else {
          setProfile(null);
        }
        setLoading(false);
      })();
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data?.user) {
      const { error: logError } = await supabase.from('auth_activity_logs').insert([
        {
          user_id: data.user.id,
          user_email: data.user.email ?? null,
          display_name: null,
          event_type: 'login',
          details: `User logged in: ${email}`,
          created_at: new Date().toISOString(),
        },
      ]);
      if (logError) {
        console.error('Failed to log auth activity:', logError);
      }
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    await createAuditLog('user.signup', 'user', null, `New account registered: ${email}`);
    return { error: null };
  };

  const signOut = async () => {
    if (session?.user?.email) {
      try {
        await logAuthActivity('logout', `User signed out: ${session.user.email}`);
      } catch (err) {
        console.error('Failed to log auth activity:', err);
      }
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  };

  const isAdmin = profile?.role === 'admin';
  // Ensure the designated administrator email always has admin privileges in the UI
  const designatedAdminEmail = 'ptasfia789@gmail.com';
  const isDesignatedAdmin = session?.user?.email === designatedAdminEmail;
  const effectiveIsAdmin = isAdmin || isDesignatedAdmin;

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, isAdmin: effectiveIsAdmin, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
