// tests-finance/finance-mobile.test.cjs — run: node --test "tests-finance/**/*.test.cjs"
const test = require('node:test');
const assert = require('node:assert');
const F = require('../public/carlos-dashboard/finance-mobile.js');

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
  assert.deepStrictEqual(F.requestPayload({ vendor: 'X', domain: 'DJ' }, { period: { key: '2026-07_2026-08' } }),
    { vendor: 'X', domain: 'DJ', period_key: '2026-07_2026-08' });
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
});
