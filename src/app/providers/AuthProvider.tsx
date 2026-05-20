import React, { useEffect, createContext, useContext } from 'react';
import { useAuthStore } from '@core/auth/authStore';
import { restoreSession } from '@core/auth/authService';
import { initDatabase } from '@core/db/client';
import type { RegisteredPharmacy } from '@core/types';

interface AuthContextValue {
  currentUser: RegisteredPharmacy | null;
  isAuthenticated: boolean;
  isOfflineSession: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAuthenticated: false,
  isOfflineSession: false,
});

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}

interface Props {
  children: React.ReactNode;
  /** Rendered while the session is being restored (splash / loading state). */
  loadingFallback?: React.ReactNode;
  /** Rendered when no session exists (login screen). */
  loginFallback: React.ReactNode;
}

export function AuthProvider({ children, loadingFallback, loginFallback }: Props) {
  const { currentUser, isAuthenticated, isOfflineSession, isRestoringSession, setUser, setRestoringSession } =
    useAuthStore();

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        // Initialize SQLite DB and run pending migrations
        await initDatabase();

        // Try to restore a previous session (Supabase JWT or local token)
        const user = await restoreSession();

        if (!cancelled) {
          if (user) setUser(user);
          setRestoringSession(false);
        }
      } catch (err) {
        console.error('[AuthProvider] Boot error:', err);
        if (!cancelled) setRestoringSession(false);
      }
    }

    boot();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isRestoringSession) {
    return <>{loadingFallback ?? <div className="flex items-center justify-center h-screen text-gray-400">Starting MDXera ERP…</div>}</>;
  }

  return (
    <AuthContext.Provider value={{ currentUser, isAuthenticated, isOfflineSession }}>
      {isAuthenticated ? children : loginFallback}
    </AuthContext.Provider>
  );
}
