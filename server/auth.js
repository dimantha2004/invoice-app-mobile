import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * adm.Logins.PasswordHash holds lowercase hex MD5. MD5 is one-way, so we hash the
 * typed password and compare. Both UTF-8 and UTF-16LE (SQL HASHBYTES on NVARCHAR)
 * encodings are accepted because we don't know which one the ERP used.
 */
export const md5Candidates = password => [
  createHash('md5').update(password, 'utf8').digest('hex'),
  createHash('md5').update(password, 'utf16le').digest('hex'),
];

const b64 = s => Buffer.from(s).toString('base64url');
const sig = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url');

/** Minimal signed token (HMAC-SHA256): base64url(payload).signature */
export function signToken(payload, secret, ttlHours = 12) {
  const data = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlHours * 3600_000 }));
  return `${data}.${sig(data, secret)}`;
}

export function verifyToken(token, secret) {
  const [data, s] = String(token ?? '').split('.');
  if (!data || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(sig(data, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(data, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

/** In-memory login throttle: max `limit` failures per key within `windowMs`. */
export function createThrottle(limit = 5, windowMs = 5 * 60_000) {
  const fails = new Map();
  return {
    blocked(key) {
      const f = fails.get(key);
      if (f && Date.now() - f.first > windowMs) fails.delete(key);
      return (fails.get(key)?.count ?? 0) >= limit;
    },
    fail(key) {
      const f = fails.get(key) ?? { count: 0, first: Date.now() };
      f.count++;
      fails.set(key, f);
    },
    reset(key) { fails.delete(key); },
  };
}
