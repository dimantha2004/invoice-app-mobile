import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setOnUnauthorized, setToken, type User } from './api';

// ponytail: company header for printed invoices is fixed here. Read it from adm.Companies if more than one company prints.
export const COMPANY = { name: 'XYZ Company Pvt. Ltd', address: ['Colombo Road,', 'Colombo'] };

export const CUSTOMER_TYPES = ['Retail', 'Wholesale', 'Supermarket'];
export const CUSTOMER_STATUSES = ['Active', 'Inactive'];
export const RETURN_REASONS = ['Expired', 'Damaged', 'Wrong Item', 'Other'];
export const CITIES = ['Colombo', 'Kandy', 'Galle', 'Negombo', 'Jaffna', 'Kurunegala'];

const KEY = 'invoice-app-session';
type Session = { token: string; user: User };

function useSessionState() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  const save = (s: Session | null) => {
    setToken(s?.token ?? null);
    setSession(s);
    (s ? AsyncStorage.setItem(KEY, JSON.stringify(s)) : AsyncStorage.removeItem(KEY)).catch(() => {});
  };

  useEffect(() => {
    setOnUnauthorized(() => save(null));
    AsyncStorage.getItem(KEY)
      .then(s => { if (s) { const p = JSON.parse(s) as Session; setToken(p.token); setSession(p); } })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  return {
    ready,
    user: session?.user ?? null,
    login: async (username: string, password: string) => save(await api<Session>('/login', { method: 'POST', body: { username, password } })),
    logout: () => save(null),
  };
}

const Ctx = createContext<ReturnType<typeof useSessionState> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useSessionState()}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx)!;
