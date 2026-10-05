import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FreeKind, Line, Payment } from './format';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export type User = { userId: number; username: string; displayName: string; employeeId: number | null; companyId: number };
export type Customer = { id: number; code: string; name: string; phone: string | null; address: string | null; status: string };
export type Product = { id: number; code: string; name: string; price: number; unit: string };
export type DocStatus = 'draft' | 'pending' | 'paid';
/** An invoice (dbo.InvoiceHead) or a sales order / draft (sales.SalesOrders), as returned by the API. */
export type Doc = Partial<Payment> & {
  id: string; number: string; kind: 'invoice' | 'order'; status: DocStatus;
  customerId: number | null; customerCode: string | null; customerName: string; customerAddress: string | null;
  rep: string; date: string; dueDate: string; subTotal: number; discount: number; tax: number; net: number;
  notes: string; salesOrderNo: string | null; lines?: (Line & { amount: number; free?: FreeKind | null })[];
};

let token: string | null = null;
let onUnauthorized: () => void = () => {};
export const setToken = (t: string | null) => { token = t; };
export const setOnUnauthorized = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
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
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
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

/** Invoice -> dbo.InvoiceHead; order and any draft -> sales.SalesOrders. */
export function submitDoc(target: 'invoice' | 'order' | 'draft', body: DocInput) {
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
