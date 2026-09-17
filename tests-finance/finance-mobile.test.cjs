// tests-finance/finance-mobile.test.cjs — run: node --test "tests-finance/**/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// finance-mobile.js is a plain browser script (module.exports guarded by `typeof module`).
// The repo root is "type":"module", so a plain require() of a .js file here would be treated
// as ESM; loading it into a fresh CommonJS-like vm context sidesteps that without needing a
// package.json inside public/carlos-dashboard (which would get published).
const src = fs.readFileSync(path.join(__dirname, '../public/carlos-dashboard/finance-mobile.js'), 'utf8');
const ctx = { module: { exports: {} }, console, Intl };
vm.runInNewContext(src, ctx);
const F = ctx.module.exports;

const NOW = new Date('2026-09-18T10:00:00+03:00');

test('deadline text', () => {
  assert.strictEqual(F.deadlineText({ days_left: 27, deadline_label: '15/10' }), 'עוד 27 ימים עד 15/10');
  assert.strictEqual(F.deadlineText({ days_left: 1, deadline_label: '15/10' }), 'מחר ה-15/10');
  assert.strictEqual(F.deadlineText({ days_left: 0, deadline_label: '15/10' }), 'היום ה-15/10');
  assert.strictEqual(F.deadlineText({ days_left: -3, deadline_label: '15/10' }), 'עבר ה-15/10, לפני 3 ימים');
});

test('pc status', () => {
  assert.match(F.pcStatus(null, NOW), /עוד לא העלה/);
  assert.strictEqual(F.pcStatus({ pc_seen_at: '2026-09-18T06:58:00Z' }, NOW), null);
  assert.match(F.pcStatus({ pc_seen_at: '2026-09-18T06:40:00Z' }, NOW), /המחשב לא מחובר מאז 9:40/);
});

test('package text', () => {
  assert.strictEqual(F.packageText({ state: 'none' }), 'החבילה עוד לא נבנתה. בונים במחשב');
  assert.strictEqual(F.packageText({ state: 'built', files: 42 }), 'החבילה מוכנה במחשב (42 קבצים), עוד לא נשלחה');
  assert.strictEqual(F.packageText({ state: 'stale' }), 'משהו השתנה אחרי הבנייה. בנה שוב במחשב');
  assert.strictEqual(F.packageText({ state: 'sent', sent_at: '2026-09-17T00:14:00', sent_how: 'auto' }), 'נשלחה לרו"ח ב-17/9 (זוהה אוטומטית)');
});

test('mark sent only for a built, unlocked package', () => {
  assert.strictEqual(F.canMarkSent({ locked: false, package: { state: 'built' } }), true);
  assert.strictEqual(F.canMarkSent({ locked: false, package: { state: 'stale' } }), false);
  assert.strictEqual(F.canMarkSent({ locked: true, package: { state: 'sent' } }), false);
});

test('request carries the period key and only the given fields', () => {
  // deepEqual, not deepStrictEqual: the returned object was built inside the vm context used to
  // load finance-mobile.js, so it has a different realm's Object.prototype than this literal.
  assert.deepEqual(F.requestPayload({ vendor: 'X', domain: 'DJ' }, { period: { key: '2026-07_2026-08' } }),
    { vendor: 'X', domain: 'DJ', period_key: '2026-07_2026-08' });
});

test('spending commands carry the spend key; receipt-confirm does not', () => {
  const snap = { period: { key: '2026-07_2026-08' }, spend_key: '2026-08' };
  assert.deepEqual(F.requestPayload({ vendor: 'X', category: 'Y' }, snap, 'vendor-category'),
    { vendor: 'X', category: 'Y', period_key: '2026-07_2026-08', spend_key: '2026-08' });
  assert.deepEqual(F.requestPayload({ vendor: 'X', domain: 'Y' }, snap, 'vendor-domain'),
    { vendor: 'X', domain: 'Y', period_key: '2026-07_2026-08', spend_key: '2026-08' });
  assert.deepEqual(F.requestPayload({}, snap, 'domains-accept-all'),
    { period_key: '2026-07_2026-08', spend_key: '2026-08' });
  assert.deepEqual(F.requestPayload({ id: '1', ver: 2 }, snap, 'receipt-confirm'),
    { id: '1', ver: 2, period_key: '2026-07_2026-08' });
});

test('slices group the rest after 6 and keep the exact total', () => {
  const rows = [9, 8, 7, 6, 5, 4, 3.33, 2.34].map((t, i) => ({ name: 'c' + i, total: t }));
  const s = F.slices(rows, () => '#000');
  assert.strictEqual(s.length, 7);
  assert.strictEqual(s[6].name, 'שאר (2)');
  assert.strictEqual(s[6].total, 5.67);
});

test('charts escape names', () => {
  const html = F.donut([{ name: '<b>', total: 10, color: '#000', key: '<b>' }], 10, true, 'הכל');
  assert.ok(!html.includes('<b>') && html.includes('&lt;b&gt;'));
  assert.match(F.bars([{ name: '2026-07', total: 5 }], 5), /יולי/);
  assert.ok(!F.bars([{ name: '<x>-07', total: 1 }], 1).includes('<x>'));
});
