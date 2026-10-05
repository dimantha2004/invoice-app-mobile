export const PAY_KEYS = ['cash', 'cheque', 'online', 'credit'];

/**
 * How an invoice is settled: { cash, cheque, online, credit } must add up to the invoice total.
 * One non-zero amount = a single payment type, several = a mix. Any credit part leaves the invoice pending.
 */
export function splitPayment(p, net, fail = msg => { throw new Error(msg); }) {
  const pay = {};
  for (const k of PAY_KEYS) {
    const n = Number(p?.[k] ?? 0);
    if (!Number.isFinite(n) || n < 0 || n > 1e9) fail(`Invalid ${k} amount`);
    pay[k] = Math.round(n * 100) / 100;
  }
  const sum = PAY_KEYS.reduce((s, k) => s + pay[k], 0);
  if (!p || Math.abs(sum - net) > 0.005) fail(`Payment amounts must add up to the invoice total (Rs. ${net.toFixed(2)})`);
  return pay;
}
