/**
 * Document numbers are made on the phone (offline), so each sales rep owns a range: the rep code (login id, 3+ digits)
 * is part of every number. Two reps can never make the same number; the server only checks the number is in the
 * caller's own range.
 *   invoice INV{MAINLOC}{rep 4}{00001}   order MSO{rep}{000001}   return RTV{rep}{000001}   customer CUS-{rep}-{00001}
 * InvoiceNo is only 14 wide, so invoices use a fixed 4-digit rep code (login ids go past 999) and a 5-digit sequence.
 */
export const repCode = (userId, width = 3) => String(userId).padStart(width, '0');

// ponytail: max lengths assumed from the ERP (InvoiceNo is 14 wide). Check INFORMATION_SCHEMA and adjust if a column differs.
const KINDS = {
  inv: { prefix: (loc, rep) => `INV${loc}${rep}`, rep: 4, digits: 5, max: 14 },
  mso: { prefix: (_, rep) => `MSO${rep}`, digits: 6, max: 50 },
  rtv: { prefix: (_, rep) => `RTV${rep}`, digits: 6, max: 50 },
  cus: { prefix: (_, rep) => `CUS-${rep}-`, digits: 5, max: 20 },
};
export const KIND_LIST = Object.keys(KINDS);

const fail0 = msg => { throw new Error(msg); };

/** { prefix, digits } for one kind of document of this rep. Fails if the numbers would not fit the ERP column. */
export function numberFormat(kind, mainLoc, userId, fail = fail0) {
  const k = KINDS[kind];
  const rep = repCode(userId, k.rep);
  const prefix = k.prefix(mainLoc, rep);
  if (rep.length > (k.rep ?? rep.length) || prefix.length + k.digits > k.max) fail(`Rep code ${rep} is too long for ${kind} numbers`);
  return { prefix, digits: k.digits };
}

const inRange = ({ prefix, digits }, no) =>
  typeof no === 'string' && no.length === prefix.length + digits && no.startsWith(prefix) && /^\d+$/.test(no.slice(prefix.length));

/** True when `no` is a well-formed number in this rep's own range. */
export const ownsNumber = (kind, mainLoc, userId, no, fail = fail0) => inRange(numberFormat(kind, mainLoc, userId, fail), no);

// ponytail: invoices made offline before the 4-digit rep code (INV{loc}{rep 3}{000001}) are still accepted. Drop with OLD_MAINLOC.
export const ownsOldInvoiceNumber = (mainLoc, userId, no) => userId < 1000 && inRange({ prefix: `INV${mainLoc}${repCode(userId)}`, digits: 6 }, no);
