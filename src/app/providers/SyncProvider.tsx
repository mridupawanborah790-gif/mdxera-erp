import React, { useEffect, createContext, useContext, useState } from 'react';
import { SyncEngine, type SyncStatus } from '@core/sync/SyncEngine';
import { useAuthStore } from '@core/auth/authStore';

const SUPABASE_URL =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ??
  'https://sblmbkgoiefqzykjksgm.supabase.co';

interface SyncContextValue {
  syncStatus: SyncStatus;
  pendingCount: number;
  forceSync: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue>({
  syncStatus: 'idle',
  pendingCount: 0,
  forceSync: async () => {},
});

export function useSyncStatus(): SyncContextValue {
  return useContext(SyncContext);
}

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, isAuthenticated } = useAuthStore();
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !currentUser) return;

    SyncEngine.start(currentUser.organization_id, SUPABASE_URL);

    const unsubscribe = SyncEngine.on((status) => {
      setSyncStatus(status);
      SyncEngine.pendingCount().then(setPendingCount).catch(() => {});
    });

    return () => {
      unsubscribe();
      SyncEngine.stop();
    };
  }, [isAuthenticated, currentUser?.organization_id]);

  const forceSync = async () => {
    await SyncEngine.forceSync();
    setPendingCount(await SyncEngine.pendingCount());
  };

  return (
    <SyncContext.Provider value={{ syncStatus, pendingCount, forceSync }}>
      {children}
    </SyncContext.Provider>
  );
}
