// Run: npm run check
import assert from 'node:assert';
import { numberFormat, ownsNumber } from './numbers.js';

assert.deepStrictEqual(numberFormat('inv', 'MB', 12), { prefix: 'INVMB012', digits: 6 });
assert.ok(ownsNumber('inv', 'MB', 12, 'INVMB012000001'));
assert.ok(ownsNumber('cus', 'MB', 12, 'CUS-012-00001'));
assert.ok(ownsNumber('mso', 'MB', 7, 'MSO007000123'));
assert.ok(!ownsNumber('inv', 'MB', 12, 'INVMB013000001'), "another rep's range");
assert.ok(!ownsNumber('inv', 'MB', 12, 'INVMB01200001'), 'too short');
assert.ok(!ownsNumber('inv', 'MB', 12, 'INVMB01200000A'), 'not digits');
assert.ok(!ownsNumber('cus', 'MB', 12, 'CUS-M00001'), 'old server pattern');
assert.ok(!ownsNumber('inv', 'MB', 1, 'INVMB10000001'), 'old server pattern');
assert.ok(!ownsNumber('rtv', 'MB', 12, undefined));
assert.throws(() => numberFormat('inv', 'MB', 1234), /too long/, 'INVMB1234000001 is 15 chars');
assert.deepStrictEqual(numberFormat('cus', 'MB', 1234), { prefix: 'CUS-1234-', digits: 5 });
console.log('numbers ok');
