// Run: node --experimental-strip-types src/lib/format.check.ts
import assert from 'node:assert';
import { totals, mergeLines, payLabel, freeNote, rs, rsSpaced, dmy, addDays, type Line } from './format.ts';

const rice: Line = { productId: 1, code: '#R01', name: 'Rice', unit: '1 Kg', price: 220, qty: 5 };
assert.deepStrictEqual(totals([rice]), { subTotal: 1100, net: 1100 });
assert.deepStrictEqual(totals([rice], 100, 50), { subTotal: 1100, net: 1050 });
assert.strictEqual(totals([rice], 5000).net, 0);
const merged = mergeLines([rice], [{ ...rice, qty: 2 }, { ...rice, productId: 2, name: 'Sugar' }]);
assert.deepStrictEqual(merged.map(l => l.qty), [7, 5]);
assert.strictEqual(rice.qty, 5, 'mergeLines must not mutate input');
assert.strictEqual(rs(1100, 2), 'Rs. 1100.00');
assert.strictEqual(rsSpaced(150000), 'Rs.150 000');
assert.strictEqual(dmy('2026-01-07'), '07/01/2026');
assert.strictEqual(addDays('2026-01-30', 3), '2026-02-02');
assert.strictEqual(payLabel({ cash: 600, cheque: 0, online: 0, credit: 400 }), 'Cash + Credit');
assert.strictEqual(payLabel({ online: 50 }), 'Online Transfer');
assert.strictEqual(payLabel({}), '');
const issued = [{ ...rice }, { ...rice, name: 'Sugar', qty: 2, free: 'sample' as const }, { ...rice, name: 'Tea', qty: 1, free: 'exchange' as const }];
assert.strictEqual(freeNote(issued, 'sample'), 'Sugar x 2 1 Kg');
assert.strictEqual(freeNote(issued, 'exchange'), 'Tea x 1 1 Kg');
assert.strictEqual(freeNote([rice], 'sample'), '');
assert.strictEqual(freeNote(undefined, 'exchange'), '');
console.log('format checks passed');
