export type Line = { productId: number; code: string; name: string; unit: string; price: number; qty: number };

export const lineTotal = (l: Line) => l.price * l.qty;

export function totals(lines: Line[], discount = 0, tax = 0) {
  const subTotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  return { subTotal, net: Math.max(0, subTotal - discount + tax) };
}

/** How an invoice is settled. One non-zero amount = a single payment type, several = a mix; any credit leaves it pending. */
export type Payment = { cash: number; cheque: number; online: number; credit: number };
export const PAY_TYPES = [['cash', 'Cash'], ['cheque', 'Cheque'], ['online', 'Online Transfer'], ['credit', 'Credit']] as const;
/** { cash: 600, credit: 400 } -> "Cash + Credit" */
export const payLabel = (p: Partial<Payment>) => PAY_TYPES.filter(([k]) => (p[k] ?? 0) > 0).map(([, label]) => label).join(' + ');
/** Amount paid per type for a mix payment: { cash: 600, cheque: 300, credit: 100 } -> [['Cash', 600], ['Cheque', 300]].
 *  Empty for a single payment type; credit is left out (it's shown as Balance Due). */
export const payParts = (p: Partial<Payment>) => !payLabel(p).includes(' + ') ? [] :
  PAY_TYPES.filter(([k]) => k !== 'credit' && (p[k] ?? 0) > 0).map(([k, label]) => [label, p[k]!] as const);

/** Free issues: items given without charge (never in the invoice amount, only taken out of stock). */
export type FreeKind = 'sample' | 'exchange';
export const FREE_TYPES = [['sample', 'Free Samples'], ['exchange', 'Free Exchange']] as const;
/** One kind of free issue as text for the note under an invoice: "Rice x 2 Kg, Sugar x 1 Unit" ('' when there are none). */
export const freeNote = (lines: { name: string; qty: number; unit: string; free?: FreeKind | null }[] = [], kind: FreeKind) =>
  lines.filter(l => l.free === kind).map(l => `${l.name} x ${l.qty} ${l.unit}`).join(', ');

/** Merge newly picked lines into existing ones, summing qty for the same product. */
export function mergeLines(existing: Line[], added: Line[]) {
  const out = existing.map(l => ({ ...l }));
  for (const a of added) {
    const hit = out.find(l => l.productId === a.productId);
    if (hit) hit.qty += a.qty;
    else out.push({ ...a });
  }
  return out;
}

/** rs(5500) -> "Rs. 5500", rs(1100, 2) -> "Rs. 1100.00" */
export const rs = (n: number, decimals = 0) => `Rs. ${n.toFixed(decimals)}`;

/** 150000 -> "Rs.150 000" (summary card style) */
export const rsSpaced = (n: number) => `Rs.${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO date string (yyyy-mm-dd) in local time. */
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
/** "2026-01-07" -> "07/01/2026" */
export const dmy = (s: string) => s.split('-').reverse().join('/');
/** "2026-01-07" -> "07 Wed. 2026" (summary card style) */
export const dayCard = (s: string) => {
  const d = fromIso(s);
  return `${pad(d.getDate())} ${d.toLocaleDateString('en-US', { weekday: 'short' })}. ${d.getFullYear()}`;
};
export const addDays = (s: string, days: number) => {
  const d = fromIso(s);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};
export const today = () => isoDay(new Date());
