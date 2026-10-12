import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import { api, setOnUnauthorized, setToken, type User } from './api';
import { openDb } from './db';
import { sync } from './sync';

// ponytail: company header for printed invoices is fixed here. Read it from adm.Companies if more than one company prints.
export const COMPANY = { name: 'XYZ Company Pvt. Ltd', address: ['Colombo Road,', 'Colombo'] };

export const CUSTOMER_TYPES = ['Retail', 'Wholesale', 'Supermarket'];
export const CUSTOMER_STATUSES = ['Active', 'Inactive'];
export const RETURN_REASONS = ['Expired', 'Damaged', 'Wrong Item', 'Other'];
export const CITIES = ['Colombo', 'Kandy', 'Galle', 'Negombo', 'Jaffna', 'Kurunegala'];

const KEY = 'invoice-app-session';
type Session = { token: string; user: User };

/*
 * Offline login: after every successful online login the phone keeps a salted, stretched hash of the password (never the
 * password). With no connection, the typed password is checked against it. Only users who have logged in online on this
 * phone can log in offline; the server still checks the real password and token before anything syncs.
 */
const OFFLINE_KEY = 'invoice-app-offline-logins';
type OfflineLogin = { salt: string; hash: string; session: Session };
// ponytail: repeated SHA-256 because expo-crypto has no PBKDF2/scrypt. Move to a real KDF if the phone's storage can't be trusted.
const ROUNDS = 2000;

async function hashPassword(password: string, salt: string) {
  let h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `${salt}:${password}`);
  for (let i = 0; i < ROUNDS; i++) h = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, salt + h);
  return h;
}
const offlineLogins = async () => JSON.parse((await AsyncStorage.getItem(OFFLINE_KEY)) ?? '{}') as Record<string, OfflineLogin>;

async function rememberLogin(username: string, password: string, session: Session) {
  const salt = Array.from(Crypto.getRandomBytes(16), b => b.toString(16).padStart(2, '0')).join('');
  const all = await offlineLogins();
  all[username.toLowerCase()] = { salt, hash: await hashPassword(password, salt), session };
  await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(all));
}

async function loginOffline(username: string, password: string) {
  const saved = (await offlineLogins())[username.toLowerCase()];
  if (!saved) throw new Error('No internet connection. Log in online once on this phone to use offline login.');
  if ((await hashPassword(password, saved.salt)) !== saved.hash) throw new Error('Invalid username or password');
  return saved.session;
}

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
    // The saved session keeps working offline (even past the token's expiry): only Sync needs a valid token.
    AsyncStorage.getItem(KEY)
      .then(async s => { if (s) { const p = JSON.parse(s) as Session; await openDb(p.user); setToken(p.token); setSession(p); } })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  return {
    ready,
    user: session?.user ?? null,
    /**
     * Online: the server checks the password, then the phone syncs. If the server can't be reached at all, the password is
     * checked against this phone's saved hash. A server that answers (wrong password, disabled user, too many tries) is never bypassed.
     */
    login: async (username: string, password: string) => {
      let s: Session;
      try {
        s = await api<Session>('/login', { method: 'POST', body: { username, password } });
      } catch (e) {
        const status = (e as { status?: number }).status;
        if (status !== undefined && status < 500) throw e;
        s = await loginOffline(username, password);
        await openDb(s.user);
        save(s);
        return;
      }
      await rememberLogin(username, password, s).catch(() => {});
      await openDb(s.user);
      save(s);
      sync().catch(e => Alert.alert('Sync failed', `${(e as Error).message}\n\nTap Sync on Home to try again.`));
    },
    logout: () => save(null),
  };
}

const Ctx = createContext<ReturnType<typeof useSessionState> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={useSessionState()}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx)!;
