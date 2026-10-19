// Run: npm run check
import assert from 'node:assert';
import { takeFrom } from './stock.js';

const batches = [{ id: 1, onHand: 0 }, { id: 2, onHand: 2.001 }, { id: 3, onHand: 5 }];
assert.deepStrictEqual(takeFrom(batches, 2), [{ id: 2, qty: 2 }], 'skips empty batch, stops when done');
assert.deepStrictEqual(takeFrom(batches, 4), [{ id: 2, qty: 2.001 }, { id: 3, qty: 1.999 }], 'oldest first, then the next');
assert.deepStrictEqual(takeFrom(batches, 10), [{ id: 2, qty: 2.001 }, { id: 3, qty: 5 }, { id: 1, qty: 2.999 }], 'short: rest goes negative on the first batch');
assert.deepStrictEqual(takeFrom([{ id: 7, onHand: -3 }], 1), [{ id: 7, qty: 1 }], 'already negative');
assert.deepStrictEqual(takeFrom([], 3), [], 'no batch: nothing to take');
console.log('stock ok');
