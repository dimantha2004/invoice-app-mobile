/**
 * Split `qty` over a product's warehouse batches, given in the order to use them ({ id, onHand }[]).
 * Batches with stock are emptied in turn; whatever is still owed comes off the first batch and takes it negative
 * (the sale already happened offline, like the ERP's own "allow negative stock"). Empty when there is no batch at all.
 */
export function takeFrom(batches, qty) {
  const out = [];
  let left = qty;
  for (const b of batches) {
    if (left <= 0) break;
    const n = Math.min(left, b.onHand);
    if (n > 0) { out.push({ id: b.id, qty: n }); left = Math.round((left - n) * 1e6) / 1e6; }
  }
  if (left > 0 && batches.length) out.push({ id: batches[0].id, qty: left });
  return out;
}
