// Run: npm run check
import assert from 'node:assert';
import { createThrottle, md5Candidates, signToken, verifyToken } from './auth.js';

assert.deepStrictEqual(md5Candidates('abc'), ['900150983cd24fb0d6963f7d28e17f72', 'ce1473cf80c6b3fda8e3dfc006adc315']);

const t = signToken({ uid: 1 }, 'secret');
assert.strictEqual(verifyToken(t, 'secret').uid, 1);
assert.strictEqual(verifyToken(t, 'other'), null, 'wrong secret must fail');
assert.strictEqual(verifyToken(t.replace(/^./, c => (c === 'e' ? 'f' : 'e')), 'secret'), null, 'tampered payload must fail');
assert.strictEqual(verifyToken(signToken({ uid: 1 }, 'secret', -1), 'secret'), null, 'expired must fail');
assert.strictEqual(verifyToken(undefined, 'secret'), null);

const th = createThrottle(2, 60_000);
th.fail('u'); assert.ok(!th.blocked('u'));
th.fail('u'); assert.ok(th.blocked('u'));
th.reset('u'); assert.ok(!th.blocked('u'));
console.log('auth checks passed');

// payment split
const { splitPayment } = await import('./payment.js');
assert.deepStrictEqual(splitPayment({ cash: 600, credit: 400 }, 1000), { cash: 600, cheque: 0, online: 0, credit: 400 });
assert.deepStrictEqual(splitPayment({ online: 250.5 }, 250.5), { cash: 0, cheque: 0, online: 250.5, credit: 0 });
assert.throws(() => splitPayment({ cash: 500 }, 1000), /add up/);
assert.throws(() => splitPayment(undefined, 0), /add up/, 'payment is required');
assert.throws(() => splitPayment({ cash: -5, credit: 1005 }, 1000), /Invalid cash/);
console.log('payment checks passed');
