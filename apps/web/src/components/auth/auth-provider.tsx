'use client';

import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase';
import { apiClient } from '@/lib/api-client';

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  token: string | null;
  isLoading: boolean;
  signInWithPassword: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  setDevToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Hook API client token provider to current token state
  useEffect(() => {
    apiClient.setTokenProvider(() => token);
  }, [token]);

  useEffect(() => {
    // Check if a dev token was stored in sessionStorage
    if (typeof window !== 'undefined') {
      const storedDevToken = sessionStorage.getItem('replaylab_dev_token');
      if (storedDevToken) {
        setToken(storedDevToken);
        // Synthesize minimal user object
        setUser({
          id: 'dev_user',
          app_metadata: {},
          user_metadata: { name: 'Developer User' },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as User);
        setIsLoading(false);
        return;
      }
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      // Supabase is not configured (e.g. initial dev or mock mode)
      setIsLoading(false);
      return;
    }

    // Initialize session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setToken(session?.access_token ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setToken(session?.access_token ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { error: new Error('Supabase client is not configured') };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { error: new Error('Supabase client is not configured') };
    }
    const { error } = await supabase.auth.signUp({ email, password });
    return { error };
  };

  const signOut = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('replaylab_dev_token');
    }
    setToken(null);
    setUser(null);
    setSession(null);

    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
  };

  const setDevToken = (newDevToken: string | null) => {
    if (typeof window !== 'undefined') {
      if (newDevToken) {
        sessionStorage.setItem('replaylab_dev_token', newDevToken);
      } else {
        sessionStorage.removeItem('replaylab_dev_token');
      }
    }
    setToken(newDevToken);
    if (newDevToken) {
      setUser({
        id: 'dev_user',
        app_metadata: {},
        user_metadata: { name: 'Developer User' },
        aud: 'authenticated',
        created_at: new Date().toISOString(),
      } as User);
    } else {
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      session,
      token,
      isLoading,
      signInWithPassword,
      signUp,
      signOut,
      setDevToken,
    }),
    [user, session, token, isLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
