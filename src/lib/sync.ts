import { remote, type Customer, type Doc, type Product } from './api';
import { getDb, type NumKind, type NumRange } from './db';

type SyncData = {
  customers: Customer[];
  products: (Product & { barcode: string | null })[];
  invoices: Doc[];
  orders: Doc[];
  numbers: Record<NumKind, NumRange>;
};

/** A queued item the sync could not send. `rejected`: the server refused it (it will never go through as it is). */
export class SyncError extends Error {
  constructor(message: string, public seq: number, public rejected: boolean) { super(message); }
}

/**
 * Sync button: send everything made offline (oldest first, so a new customer goes before its invoices),
 * then replace the phone's data with fresh data from the server. Stops at the first item that fails.
 */
export async function sync() {
  const db = getDb();
  let pushed = 0;
  for (;;) {
    const row = await db.getFirstAsync<{ seq: number; path: string; body: string }>('SELECT seq, path, body FROM outbox ORDER BY seq LIMIT 1');
    if (!row) break;
    try {
      await remote(row.path, { method: 'POST', body: JSON.parse(row.body) });
    } catch (e) {
      const { message, status } = e as Error & { status?: number };
      await db.runAsync('UPDATE outbox SET error = ? WHERE seq = ?', message, row.seq);
      throw new SyncError(message, row.seq, status === 400 || status === 404 || status === 409);
    }
    await db.runAsync('DELETE FROM outbox WHERE seq = ?', row.seq);
    pushed++;
  }

  const s = await remote<SyncData>('/sync');
  await db.withExclusiveTransactionAsync(async tx => {
    // Something saved while we were downloading would be wiped below: keep it and let the next sync send it first.
    if ((await tx.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM outbox'))?.n) throw new Error('New work was saved during the sync. Tap Sync again.');
    await tx.execAsync('DELETE FROM customers; DELETE FROM products; DELETE FROM docs;');
    const insert = async <R>(sql: string, rows: R[], values: (r: R) => (string | number | null)[]) => {
      const st = await tx.prepareAsync(sql);
      try { for (const r of rows) await st.executeAsync(values(r)); } finally { await st.finalizeAsync(); }
    };
    await insert('INSERT OR REPLACE INTO customers (id, code, name, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)', s.customers,
      c => [c.id, c.code, c.name, c.phone, c.address, c.status]);
    await insert('INSERT OR REPLACE INTO products (id, code, name, price, unit, barcode) VALUES (?, ?, ?, ?, ?, ?)', s.products,
      p => [p.id, p.code, p.name, p.price, p.unit, p.barcode]);
    await insert('INSERT OR REPLACE INTO docs (id, kind, status, customerName, date, net, json) VALUES (?, ?, ?, ?, ?, ?, ?)', [...s.invoices, ...s.orders],
      d => [d.id, d.kind, d.status, d.customerName, d.date, d.net, JSON.stringify(d)]);
    // Never step back in the rep's number range: the phone may already have used numbers the server has not seen.
    for (const [kind, n] of Object.entries(s.numbers)) {
      const cur = await tx.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', `num:${kind}`);
      const old = cur ? (JSON.parse(cur.value) as NumRange) : null;
      const last = old?.prefix === n.prefix ? Math.max(old.last, n.last) : n.last;
      await tx.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', `num:${kind}`, JSON.stringify({ ...n, last }));
    }
    await tx.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'lastSync', new Date().toISOString());
  });
  return { pushed };
}

/** Drop a queued item the server refuses, so the items after it can sync. The document stays on the phone until the next sync. */
export const discardOutbox = (seq: number) => getDb().runAsync('DELETE FROM outbox WHERE seq = ?', seq);
