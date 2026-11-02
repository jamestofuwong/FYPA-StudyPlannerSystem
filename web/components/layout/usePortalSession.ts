'use client';

import { useCallback, useEffect, useState } from 'react';

export type SessionStatus = 'idle' | 'login-pending' | 'logged-in' | 'login-error';

// Student portal session shared by the classic top bar and the Meadow sidebar:
// polls the scraper status every 2s and exposes the log in / log out actions.
export function usePortalSession() {
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('idle');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/scraper/status');
      if (!res.ok) return;
      const data = await res.json();
      setSessionStatus(data.sessionStatus ?? 'idle');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const id = setInterval(fetchStatus, 2000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const login = async () => {
    await fetch('/api/scraper/login', { method: 'POST' });
    setSessionStatus('login-pending');
  };

  const logout = async () => {
    await fetch('/api/scraper/logout', { method: 'POST' });
    setSessionStatus('idle');
  };

  return { sessionStatus, login, logout };
}
