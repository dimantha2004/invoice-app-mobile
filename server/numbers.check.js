// Run: npm run check
import assert from 'node:assert';
import { numberFormat, ownsNumber, ownsOldInvoiceNumber } from './numbers.js';

assert.deepStrictEqual(numberFormat('inv', 'MB', 12), { prefix: 'INVMB0012', digits: 5 });
assert.deepStrictEqual(numberFormat('inv', 'NR', 2099), { prefix: 'INVNR2099', digits: 5 }, 'INVNR209900001 is 14 chars');
assert.ok(ownsNumber('inv', 'MB', 12, 'INVMB001200001'));
assert.ok(ownsNumber('cus', 'MB', 12, 'CUS-012-00001'));
assert.ok(ownsNumber('mso', 'MB', 7, 'MSO007000123'));
assert.ok(!ownsNumber('inv', 'MB', 12, 'INVMB001300001'), "another rep's range");
assert.ok(!ownsNumber('inv', 'MB', 12, 'INVMB00120001'), 'too short');
assert.ok(!ownsNumber('inv', 'MB', 12, 'INVMB00120000A'), 'not digits');
assert.ok(!ownsNumber('cus', 'MB', 12, 'CUS-M00001'), 'old server pattern');
assert.ok(!ownsNumber('inv', 'MB', 1, 'INVMB10000001'), 'old server pattern');
assert.ok(!ownsNumber('rtv', 'MB', 12, undefined));
assert.throws(() => numberFormat('inv', 'MB', 12345), /too long/, 'rep code wider than 4');
assert.deepStrictEqual(numberFormat('cus', 'MB', 1234), { prefix: 'CUS-1234-', digits: 5 });
assert.ok(ownsOldInvoiceNumber('NR', 79, 'INVNR079000002'), 'made offline before the 4-digit rep code');
assert.ok(!ownsOldInvoiceNumber('NR', 79, 'INVNR007900002'), 'new format is not old');
assert.ok(!ownsOldInvoiceNumber('NR', 2099, 'INVNR209900001'), 'no old format for 4-digit reps');
console.log('numbers ok');
