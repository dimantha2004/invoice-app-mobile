import type { Customer, Doc, DocInput, Product } from './api';
import { currentUser, getDb, peekNo, takeNo, write, type Db } from './db';
import { today, type FreeKind, type Payment } from './format';

/**
 * The server's routes, answered from the phone's database so every screen works offline.
 * Same paths and response shapes as server/index.js. Writes also queue the request in `outbox`; Sync sends it later
 * with the number, customer code and prices the phone used, so the ERP stores exactly what was printed.
 */
/** Request body: a DocInput for invoices/orders, form fields for customers/returns. Every field is validated here. */
type Body = DocInput & Record<string, unknown>;
type DocLine = NonNullable<Doc['lines']>[number];

const fail = (msg: string): never => { throw new Error(msg); };
const round2 = (n: number) => Math.round(n * 100) / 100;
const money = (v: unknown, name: string) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) fail(`Invalid ${name}`);
  return round2(n);
};
const str = (v: unknown, max: number, name: string, required = false) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(`${name} is required`);
  if (s.length > max) fail(`${name} is too long (max ${max})`);
  return s;
};
const isoDate = (v: unknown, name: string) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fail(`Invalid ${name}`));

const PAY_KEYS = ['cash', 'cheque', 'online', 'credit'] as const;
/** Same rule as splitPayment in server/payment.js (keep the two in sync): the parts must add up to `net`. */
function splitPayment(p: Partial<Payment> | undefined, net: number): Payment {
  const pay = { cash: 0, cheque: 0, online: 0, credit: 0 };
  for (const k of PAY_KEYS) pay[k] = money(p?.[k], `${k} amount`);
  const sum = PAY_KEYS.reduce((s, k) => s + pay[k], 0);
  if (!p || Math.abs(sum - net) > 0.005) fail(`Payment amounts must add up to the invoice total (Rs. ${net.toFixed(2)})`);
  return pay;
}

/** Price lines from the products downloaded at the last sync. Free issues are price 0. */
async function priceLines(x: Db, lines: { productId: number; qty: number }[] | undefined, free?: FreeKind): Promise<DocLine[]> {
  if (!free && !lines?.length) fail('Add at least one item');
  const qty = new Map<number, number>();
  for (const l of lines ?? []) {
    const n = Number(l.qty);
    if (!Number.isInteger(n) || n <= 0 || n > 100000) fail('Quantity must be a whole number above 0');
    qty.set(Number(l.productId), (qty.get(Number(l.productId)) ?? 0) + n);
  }
  const out: DocLine[] = [];
  for (const [id, n] of qty) {
    const p = (await x.getFirstAsync<Product>('SELECT id, code, name, price, unit FROM products WHERE id = ?', id)) ?? fail('One or more items are no longer available');
    const price = free ? 0 : p.price;
    out.push({ productId: p.id, code: p.code, name: p.name, unit: p.unit, price, qty: n, amount: round2(price * n), free: free ?? null });
  }
  return out;
}

/** Invoice/order fields from the form, plus the body the server needs to store exactly this document. */
export const inactiveMsg = (name: string) => `${name} is inactive. You cannot create invoices or orders for an inactive customer.`;

async function build(x: Db, b: DocInput) {
  const c = (await x.getFirstAsync<Customer>('SELECT * FROM customers WHERE id = ?', Number(b.customerId))) ?? fail('Customer not found');
  if (c.status === 'Inactive') fail(inactiveMsg(c.name));
  const date = isoDate(b.date, 'date');
  const dueDate = b.dueDate ? isoDate(b.dueDate, 'due date') : date;
  if (dueDate < date) fail('End date cannot be before start date');
  const discount = money(b.discount, 'discount'), tax = money(b.tax, 'tax'), notes = str(b.notes, 1000, 'Notes');
  const sold = await priceLines(x, b.lines);
  const lines = [...sold, ...(await priceLines(x, b.samples, 'sample')), ...(await priceLines(x, b.exchanges, 'exchange'))];
  const subTotal = round2(sold.reduce((s, l) => s + l.amount, 0));
  if (discount > subTotal) fail('Discount cannot be more than the total');
  const net = round2(subTotal - discount + tax);
  const doc = {
    customerId: c.id, customerCode: c.code, customerName: c.name, customerAddress: c.address, rep: currentUser().displayName,
    date, dueDate, subTotal, discount, tax, net, notes, salesOrderNo: null, lines,
  };
  const body = {
    customerCode: c.code, date, dueDate, discount, tax, notes, samples: b.samples ?? [], exchanges: b.exchanges ?? [],
    lines: sold.map(l => ({ productId: l.productId, qty: l.qty, price: l.price })),
  };
  return { doc, body };
}

const putDoc = (x: Db, d: Doc) =>
  x.runAsync('INSERT OR REPLACE INTO docs (id, kind, status, customerName, date, net, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
    d.id, d.kind, d.status, d.customerName, d.date, d.net, JSON.stringify(d));
const getDoc = async (x: Db, id: string, kind: Doc['kind']) => {
  const r = await x.getFirstAsync<{ json: string }>('SELECT json FROM docs WHERE id = ? AND kind = ?', id, kind);
  return r ? (JSON.parse(r.json) as Doc) : fail(`${{ invoice: 'Invoice', order: 'Order', return: 'Return' }[kind]} not found`);
};
const queue = (x: Db, path: string, body: unknown) => x.runAsync('INSERT INTO outbox (path, body) VALUES (?, ?)', path, JSON.stringify(body));

const SORT: Record<string, string> = { newest: 'date DESC, id DESC', oldest: 'date ASC, id ASC', amount: 'net DESC' };
async function listDocs(where: string[], args: string[], sort?: string) {
  const rows = await getDb().getAllAsync<{ json: string }>(`SELECT json FROM docs WHERE ${where.join(' AND ')} ORDER BY ${SORT[sort ?? ''] ?? SORT.newest}`, ...args);
  return rows.map(r => JSON.parse(r.json) as Doc);
}
const count = async (sql: string, ...args: string[]) => (await getDb().getFirstAsync<{ n: number }>(sql, ...args))?.n ?? 0;
/** Invoice count and totals, with the amount per payment type (a mix payment counts under each of its parts). */
const sums = (rows: Doc[]) => {
  const sum = (k: 'net' | 'discount' | 'tax' | keyof Payment) => round2(rows.reduce((s, d) => s + (d[k] ?? 0), 0));
  return { count: rows.length, amount: sum('net'), discount: sum('discount'), tax: sum('tax'), cash: sum('cash'), cheque: sum('cheque'), online: sum('online'), credit: sum('credit') };
};
/** Extra WHERE for list screens: text search on number/customer and an optional day. */
function listFilter(q: Record<string, string>, where: string[], args: string[]) {
  if (q.q) { where.push('(id LIKE ? OR customerName LIKE ?)'); args.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.date) { where.push('date = ?'); args.push(isoDate(q.date, 'date')); }
}

export async function localApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return (await route(init?.method ?? 'GET', path, (init?.body ?? {}) as Body)) as T;
}

async function route(method: string, path: string, b: Body): Promise<unknown> {
  const [p, qs = ''] = path.split('?');
  const q: Record<string, string> = Object.fromEntries(qs.split('&').filter(Boolean).map(kv => {
    const [k, v = ''] = kv.split('=');
    return [k, decodeURIComponent(v)];
  }));
  const like = `%${q.q ?? ''}%`;
  const m = (re: RegExp) => { const r = p.match(re); return r ? decodeURIComponent(r[1]) : null; };
  let id: string | null;

  if (method === 'GET') {
    if (p === '/customers') {
      return getDb().getAllAsync<Customer>(`SELECT id, code, name, phone, address, status FROM customers
        WHERE name LIKE ? OR code LIKE ? OR phone LIKE ? ORDER BY name`, like, like, like);
    }
    if (p === '/customers/next-code') return { code: await peekNo('cus') };
    if (p === '/products') {
      return getDb().getAllAsync<Product>(`SELECT id, code, name, price, unit FROM products
        WHERE name LIKE ? OR code LIKE ? OR barcode LIKE ? ORDER BY name LIMIT 100`, like, like, like);
    }
    if (p === '/invoices/next-number') return { number: await peekNo('inv') };
    if (p === '/orders/next-number') return { number: await peekNo('mso') };
    if (p === '/returns/next-number') return { number: await peekNo('rtv') };
    if (p === '/invoices') {
      const where = [`kind = 'invoice'`], args: string[] = [];
      if (q.status === 'pending' || q.status === 'paid') { where.push('status = ?'); args.push(q.status); }
      listFilter(q, where, args);
      const rows = await listDocs(where, args, q.sort);
      return { rows, ...sums(rows) };
    }
    if ((id = m(/^\/invoices\/([^/]+)$/))) return getDoc(getDb(), id, 'invoice');
    if (p === '/orders' || p === '/returns') {
      const where = [p === '/orders' ? `kind = 'order' AND status IN ('draft', 'pending')` : `kind = 'return'`], args: string[] = [];
      listFilter(q, where, args);
      return listDocs(where, args, q.sort);
    }
    if ((id = m(/^\/orders\/([^/]+)$/))) return getDoc(getDb(), id, 'order');
    if ((id = m(/^\/returns\/([^/]+)$/))) return getDoc(getDb(), id, 'return');
    if (p === '/stats') {
      const t = today();
      const todays = await listDocs([`kind = 'invoice'`, 'date = ?'], [t]);
      // Payments today: today's invoices that took any cash/cheque/online, plus older invoices paid off today on this phone.
      const paid = new Set(todays.filter(d => (d.cash ?? 0) + (d.cheque ?? 0) + (d.online ?? 0) > 0).map(d => d.id));
      for (const r of await getDb().getAllAsync<{ no: string }>('SELECT no FROM paylog WHERE date = ?', t)) paid.add(r.no);
      return {
        orders: await count(`SELECT COUNT(*) n FROM docs WHERE kind = 'order' AND status IN ('draft', 'pending') AND date = ?`, t),
        invoices: todays.length,
        payments: paid.size,
        pending: await count('SELECT COUNT(*) n FROM outbox'),
      };
    }
    // ponytail: built from the invoices on this phone (the last 60 days, see /sync). Ask the server if longer ranges are needed.
    if (p === '/reports') {
      const from = isoDate(q.from, 'from date'), to = isoDate(q.to, 'to date');
      if (to < from) fail('To date cannot be before from date');
      const rows = await listDocs([`kind = 'invoice'`, 'date >= ?', 'date <= ?'], [from, to], 'oldest');
      const items = new Map<string, { code: string; name: string; unit: string; qty: number; amount: number }>();
      for (const l of rows.flatMap(d => d.lines ?? []).filter(l => !l.free)) {
        const it = items.get(l.code) ?? { code: l.code, name: l.name, unit: l.unit, qty: 0, amount: 0 };
        items.set(l.code, { ...it, qty: it.qty + l.qty, amount: round2(it.amount + l.amount) });
      }
      return { ...sums(rows), items: [...items.values()].sort((a, b) => b.amount - a.amount) };
    }
  }

  if (method === 'POST') {
    if (p === '/customers') {
      const name = str(b.name, 255, 'Customer name', true);
      str(b.type, 50, 'Customer type', true);
      const phone = str(b.phone, 20, 'Contact number', true);
      if (!/^\+?[0-9 ]{9,15}$/.test(phone)) fail('Invalid contact number');
      const address = [str(b.address1, 100, 'Address line 1', true), str(b.address2, 100, 'Address line 2'), str(b.city, 50, 'City', true)].filter(Boolean).join(', ');
      return write(async tx => {
        const code = await takeNo(tx, 'cus');
        // Not in the ERP yet, so no CustomerId: offline customers get negative ids until the next sync replaces them.
        const { id } = (await tx.getFirstAsync<{ id: number }>('SELECT min(COALESCE(MIN(id), 0), 0) - 1 id FROM customers'))!;
        const c: Customer = { id, code, name, phone: phone || null, address: address || null, status: b.status === 'Inactive' ? 'Inactive' : 'Active' };
        await tx.runAsync('INSERT INTO customers (id, code, name, phone, address, status) VALUES (?, ?, ?, ?, ?, ?)', c.id, c.code, c.name, c.phone, c.address, c.status);
        await queue(tx, '/customers', { ...b, name, phone, code });
        return c;
      });
    }
    if (p === '/invoices') {
      return write(async tx => {
        const { doc, body } = await build(tx, b);
        const pay = splitPayment(b.payment, doc.net);
        const no = await takeNo(tx, 'inv');
        const d: Doc = { ...doc, id: no, number: no, kind: 'invoice', status: pay.credit > 0 ? 'pending' : 'paid', ...pay };
        await putDoc(tx, d);
        await queue(tx, '/invoices', { ...body, number: no, payment: pay });
        return d;
      });
    }
    if (p === '/orders') {
      const draft = b.status === 'draft';
      return write(async tx => {
        const { doc, body } = await build(tx, b);
        const no = await takeNo(tx, 'mso');
        const d: Doc = { ...doc, id: no, number: no, kind: 'order', status: draft ? 'draft' : 'pending' };
        await putDoc(tx, d);
        await queue(tx, '/orders', { ...body, number: no, status: draft ? 'draft' : 'submitted' });
        return d;
      });
    }
    if ((id = m(/^\/orders\/([^/]+)$/))) {
      const no = id, draft = b.status === 'draft';
      return write(async tx => {
        if ((await getDoc(tx, no, 'order')).status !== 'draft') fail('Only drafts can be edited');
        const { doc, body } = await build(tx, b);
        const d: Doc = { ...doc, id: no, number: no, kind: 'order', status: draft ? 'draft' : 'pending' };
        await putDoc(tx, d);
        await queue(tx, `/orders/${encodeURIComponent(no)}`, { ...body, status: draft ? 'draft' : 'submitted' });
        return d;
      });
    }
    if ((id = m(/^\/orders\/([^/]+)\/invoice$/))) {
      const order = id;
      return write(async tx => {
        const o = await getDoc(tx, order, 'order');
        if (o.status === 'paid') fail('This order is already invoiced');
        const c = await tx.getFirstAsync<{ status: string }>('SELECT status FROM customers WHERE id = ?', o.customerId);
        if (c?.status === 'Inactive') fail(inactiveMsg(o.customerName));
        // An edited draft sends the dates picked on the form; "Convert to Invoice" invoices it today.
        const date = b.date ? isoDate(b.date, 'date') : today();
        const dueDate = b.dueDate ? isoDate(b.dueDate, 'due date') : o.dueDate > date ? o.dueDate : date;
        if (dueDate < date) fail('End date cannot be before start date');
        const pay = splitPayment(b.payment, o.net);
        const no = await takeNo(tx, 'inv');
        const d: Doc = {
          ...o, id: no, number: no, kind: 'invoice', status: pay.credit > 0 ? 'pending' : 'paid', date, dueDate,
          salesOrderNo: o.number, rep: currentUser().displayName, ...pay,
        };
        await putDoc(tx, d);
        await putDoc(tx, { ...o, status: 'paid' });
        await queue(tx, `/orders/${encodeURIComponent(order)}/invoice`, { payment: pay, number: no, date, dueDate });
        return d;
      });
    }
    if ((id = m(/^\/invoices\/([^/]+)\/pay$/))) {
      const no = id;
      return write(async tx => {
        const d = await getDoc(tx, no, 'invoice');
        const due = d.credit ?? 0;
        if (due <= 0) fail('This invoice is already paid');
        const pay = splitPayment(b.payment, due);
        if (pay.credit >= due) fail('Enter the amount being paid');
        const paid: Doc = {
          ...d, cash: round2((d.cash ?? 0) + pay.cash), cheque: round2((d.cheque ?? 0) + pay.cheque), online: round2((d.online ?? 0) + pay.online),
          credit: pay.credit, status: pay.credit > 0 ? 'pending' : 'paid',
        };
        await putDoc(tx, paid);
        await tx.runAsync('DELETE FROM paylog WHERE date < ?', today());
        await tx.runAsync('INSERT INTO paylog (no, date) VALUES (?, ?)', no, today());
        // `due` lets the server spot a payment it already has (sync retried after a lost reply).
        await queue(tx, `/invoices/${encodeURIComponent(no)}/pay`, { payment: pay, due });
        return paid;
      });
    }
    if (p === '/returns') {
      const number = str(b.number, 50, 'Return PO number', true).replace(/^#/, '');
      const date = isoDate(b.date, 'date');
      const reason = str(b.reason, 100, 'Reason', true);
      const city = str(b.city, 100, 'City', true);
      const tax = money(b.tax, 'tax');
      const notes = str(b.notes, 800, 'Notes');
      return write(async tx => {
        const c = (await tx.getFirstAsync<Customer>('SELECT * FROM customers WHERE id = ?', Number(b.customerId))) ?? fail('Select a customer');
        if (await tx.getFirstAsync('SELECT 1 FROM docs WHERE id = ?', number)) fail(`Number ${number} is already used`);
        const lines = await priceLines(tx, b.lines);
        // The suggested number uses this rep's range; a typed-in PO number leaves the range alone.
        if (number === (await peekNo('rtv', tx))) await takeNo(tx, 'rtv');
        const subTotal = round2(lines.reduce((s, l) => s + l.amount, 0));
        const d: Doc = {
          id: number, number, kind: 'return', status: b.status === 'draft' ? 'draft' : 'returned',
          customerId: c.id, customerCode: c.code, customerName: c.name, customerAddress: c.address, rep: currentUser().displayName,
          date, dueDate: date, subTotal, discount: 0, tax, net: round2(subTotal + tax),
          notes: `Reason: ${reason}${notes ? ` | ${notes}` : ''}`, salesOrderNo: null, city, lines, // same Remarks text the server stores
        };
        await putDoc(tx, d);
        await queue(tx, '/returns', { ...b, customerCode: c.code, number, lines: lines.map(l => ({ productId: l.productId, qty: l.qty, price: l.price })) });
        return d;
      });
    }
  }

  throw new Error(`Not available offline: ${method} ${p}`);
}
