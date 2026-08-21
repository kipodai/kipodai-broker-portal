import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [state, setState] = useState({ loading: true, authenticated: false, role: null });

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const data = await api.getSession();
      setState({ loading: false, authenticated: data.authenticated, role: data.role || null });
    } catch {
      setState({ loading: false, authenticated: false, role: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SessionContext.Provider value={{ ...state, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
