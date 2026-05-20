import { useState, useEffect } from 'react';
import { isOnline, onNetworkChange } from '@core/sync/networkMonitor';

/** Returns live online/offline status. Updates in real-time on network change. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(isOnline());

  useEffect(() => {
    const unsub = onNetworkChange(setOnline);
    return unsub;
  }, []);

  return online;
}
