import * as SQLite from 'expo-sqlite';
import type { User } from './api';

/**
 * The phone's own database: everything the app shows is read from here, so it works offline.
 * One file per user, so a rep's unsynced work never mixes with another rep's on a shared phone.
 *   outbox: requests made offline, sent to the server in order on Sync.
 *   meta:   'num:<kind>' = { prefix, digits, last } — this rep's own number range (see server/numbers.js).
 */
const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS customers (id INTEGER, code TEXT PRIMARY KEY, name TEXT, phone TEXT, address TEXT, status TEXT);
  CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, code TEXT, name TEXT, price REAL, unit TEXT, barcode TEXT);
  CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, kind TEXT, status TEXT, customerName TEXT, date TEXT, net REAL, json TEXT);
  CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, body TEXT, error TEXT);
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);`;

export type Db = SQLite.SQLiteDatabase;
let db: Db | null = null;
let user: User | null = null;

export async function openDb(u: User) {
  if (db && user?.userId === u.userId) return;
  await db?.closeAsync();
  db = await SQLite.openDatabaseAsync(`invoice-${u.userId}.db`);
  user = u;
  await db.execAsync(SCHEMA);
}

export const getDb = () => db ?? (() => { throw new Error('Please log in again.'); })();
export const currentUser = () => user!;

/** Run `fn` in one exclusive transaction (a document and its outbox row are saved together or not at all). */
export async function write<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  let out!: T;
  await getDb().withExclusiveTransactionAsync(async tx => { out = await fn(tx); });
  return out;
}

export type NumKind = 'inv' | 'mso' | 'rtv' | 'cus';
export type NumRange = { prefix: string; digits: number; last: number };

async function range(x: Db, kind: NumKind) {
  const r = await x.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', `num:${kind}`);
  if (!r) throw new Error('Tap Sync once while online before creating documents.');
  return JSON.parse(r.value) as NumRange;
}
const format = (n: NumRange, i: number) => {
  if (String(i).length > n.digits) throw new Error(`Number range ${n.prefix} is full.`);
  return n.prefix + String(i).padStart(n.digits, '0');
};

/** The number the next document of this kind will get (shown on forms before saving). */
export const peekNo = async (kind: NumKind, x: Db = getDb()) => { const n = await range(x, kind); return format(n, n.last + 1); };

/** Use up the next number. Call inside `write` so a failed save does not skip a number. */
export async function takeNo(x: Db, kind: NumKind) {
  const n = await range(x, kind);
  const no = format(n, n.last + 1);
  await x.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', `num:${kind}`, JSON.stringify({ ...n, last: n.last + 1 }));
  return no;
}
