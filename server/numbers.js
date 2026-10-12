/**
 * Document numbers are made on the phone (offline), so each sales rep owns a range: the rep code (login id, 3+ digits)
 * is part of every number. Two reps can never make the same number; the server only checks the number is in the
 * caller's own range.
 *   invoice INV{MAINLOC}{rep}{000001}   order MSO{rep}{000001}   return RTV{rep}{000001}   customer CUS-{rep}-{00001}
 */
export const repCode = userId => String(userId).padStart(3, '0');

// ponytail: max lengths assumed from the ERP (InvoiceNo is 14 wide). Check INFORMATION_SCHEMA and adjust if a column differs.
const KINDS = {
  inv: { prefix: (loc, rep) => `INV${loc}${rep}`, digits: 6, max: 14 },
  mso: { prefix: (_, rep) => `MSO${rep}`, digits: 6, max: 50 },
  rtv: { prefix: (_, rep) => `RTV${rep}`, digits: 6, max: 50 },
  cus: { prefix: (_, rep) => `CUS-${rep}-`, digits: 5, max: 20 },
};
export const KIND_LIST = Object.keys(KINDS);

const fail0 = msg => { throw new Error(msg); };

/** { prefix, digits } for one kind of document of this rep. Fails if the numbers would not fit the ERP column. */
export function numberFormat(kind, mainLoc, userId, fail = fail0) {
  const k = KINDS[kind];
  const prefix = k.prefix(mainLoc, repCode(userId));
  if (prefix.length + k.digits > k.max) fail(`Rep code ${repCode(userId)} is too long for ${kind} numbers`);
  return { prefix, digits: k.digits };
}

/** True when `no` is a well-formed number in this rep's own range. */
export function ownsNumber(kind, mainLoc, userId, no, fail = fail0) {
  const { prefix, digits } = numberFormat(kind, mainLoc, userId, fail);
  return typeof no === 'string' && no.length === prefix.length + digits && no.startsWith(prefix) && /^\d+$/.test(no.slice(prefix.length));
}
