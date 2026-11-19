import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FreeKind, Line, Payment } from './format';
import { localApi } from './local';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export type User = { userId: number; username: string; displayName: string; employeeId: number | null; companyId: number; companyName?: string };
export type Customer = { id: number; code: string; name: string; phone: string | null; address: string | null; status: string };
export type Product = { id: number; code: string; name: string; price: number; unit: string };
export type DocStatus = 'draft' | 'pending' | 'paid' | 'returned';
/** An invoice (dbo.InvoiceHead), a sales order / draft (sales.SalesOrders) or a return (sales.SalesReturns), as returned by the API. */
export type Doc = Partial<Payment> & {
  id: string; number: string; kind: 'invoice' | 'order' | 'return'; status: DocStatus; city?: string | null;
  customerId: number | null; customerCode: string | null; customerName: string; customerAddress: string | null;
  rep: string; date: string; dueDate: string; subTotal: number; discount: number; tax: number; net: number;
  notes: string; salesOrderNo: string | null; lines?: (Line & { amount: number; free?: FreeKind | null })[];
};

let token: string | null = null;
let onUnauthorized: () => void = () => {};
export const setToken = (t: string | null) => { token = t; };
export const setOnUnauthorized = (fn: () => void) => { onUnauthorized = fn; };

type Init = { method?: string; body?: unknown };
const ONLINE = ['/login', '/health', '/sync'];

/** Screens call this. Everything is answered from the phone's database (works offline); only login and sync go to the server. */
export function api<T>(path: string, init?: Init): Promise<T> {
  return ONLINE.includes(path) ? remote<T>(path, init) : localApi<T>(path, init);
}

/** Call the server. Errors carry the HTTP `status` (none when the server could not be reached). */
export async function remote<T>(path: string, init?: Init): Promise<T> {
  if (!API_URL) throw new Error('API URL is not configured (EXPO_PUBLIC_API_URL).');
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new Error('Cannot reach the server. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) onUnauthorized();
  // data.error on a 2xx: TEST_ROLLBACK's 299 "rolled back" reply, which must not count as saved.
  if (!res.ok || data.error) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data as T;
}

export type DocInput = {
  customerId: number; date: string; dueDate?: string; discount: number; tax: number; notes: string;
  lines: { productId: number; qty: number }[];
  /** Free issues (samples / exchanges): taken out of stock, never charged. */
  samples?: { productId: number; qty: number }[];
  exchanges?: { productId: number; qty: number }[];
  /** Required for invoices; orders and drafts are not paid yet. */
  payment?: Payment;
};

/**
 * Saved on the phone, then on Sync: invoice -> dbo.InvoiceHead; order and any draft -> sales.SalesOrders.
 * `draftNo`: an edited draft keeps its number. It is saved again, then (for an invoice) converted with the payment.
 */
export async function submitDoc(target: 'invoice' | 'order' | 'draft', body: DocInput, draftNo?: string) {
  if (draftNo) {
    const path = `/orders/${encodeURIComponent(draftNo)}`;
    const o = await api<Doc>(path, { method: 'POST', body: { ...body, status: target === 'order' ? 'submitted' : 'draft' } });
    if (target !== 'invoice') return o;
    return api<Doc>(`${path}/invoice`, { method: 'POST', body: { payment: body.payment, date: body.date, dueDate: body.dueDate } });
  }
  return target === 'invoice'
    ? api<Doc>('/invoices', { method: 'POST', body })
    : api<Doc>('/orders', { method: 'POST', body: { ...body, status: target === 'draft' ? 'draft' : 'submitted' } });
}

/** GET `path` on mount, whenever it changes, and each time the screen regains focus. Pass null to skip. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: !!path });
  const latest = useRef(path);
  latest.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setState(s => ({ ...s, loading: true, error: undefined }));
    try {
      const data = await api<T>(path);
      if (latest.current === path) setState({ data, loading: false });
    } catch (e) {
      if (latest.current === path) setState(s => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }, [path]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { ...state, reload: load };
}

export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
