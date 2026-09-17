// tests-finance/finance-sync.test.cjs — run: node --test tests-finance/
const test = require('node:test');
const assert = require('node:assert');
const { makeHandler } = require('../netlify/functions/finance-sync.js');

const SECRET = 'x'.repeat(43);
const UID = '0b8a4a8e-1111-2222-3333-444455556666';
const ENV = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc', FINANCE_SYNC_SECRET: SECRET, FINANCE_USER_ID: UID };

function fakeFetch(replies = []) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const r = replies.shift();
    return { ok: true, status: 200, text: async () => (r === undefined ? '' : JSON.stringify(r)) };
  };
  return { fetch, calls };
}
const ev = (body, secret = SECRET, method = 'POST') =>
  ({ httpMethod: method, headers: { 'x-finance-secret': secret }, body: JSON.stringify(body) });

test('wrong or missing secret is 403 and never reaches Supabase', async () => {
  const f = fakeFetch();
  const h = makeHandler({ env: ENV, fetch: f.fetch });
  assert.strictEqual((await h(ev({ action: 'pull' }, 'y'.repeat(43)))).statusCode, 403);
  assert.strictEqual((await h(ev({ action: 'pull' }, ''))).statusCode, 403);
  assert.strictEqual(f.calls.length, 0);
});

test('a short secret in the environment refuses everything', async () => {
  const h = makeHandler({ env: { ...ENV, FINANCE_SYNC_SECRET: 'short' }, fetch: fakeFetch().fetch });
  assert.strictEqual((await h(ev({ action: 'pull' }, 'short'))).statusCode, 403);
});

test('GET is 405, bad user id is 500', async () => {
  assert.strictEqual((await makeHandler({ env: ENV, fetch: fakeFetch().fetch })(ev({}, SECRET, 'GET'))).statusCode, 405);
  assert.strictEqual((await makeHandler({ env: { ...ENV, FINANCE_USER_ID: 'x' }, fetch: fakeFetch().fetch })(ev({ action: 'pull' }))).statusCode, 500);
});

test('pull only touches David rows and marks them running', async () => {
  const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const taken = [{ id: B, cmd: 'mark-sent', payload: {}, created_at: '2026-09-18T10:01:00Z' },
                 { id: A, cmd: 'vendor-domain', payload: {}, created_at: '2026-09-18T10:00:00Z' }];
  const f = fakeFetch([null, null, null, [{ id: A }, { id: B }], taken]);
  const res = await makeHandler({ env: ENV, fetch: f.fetch })(ev({ action: 'pull' }));
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body).requests.map(r => r.id), [A, B]);
  assert.ok(f.calls[4].url.includes(`id=in.(${A},${B})`));
  for (const c of f.calls.filter(c => c.url.includes('finance_requests'))) assert.ok(c.url.includes(`user_id=eq.${UID}`), c.url);
  const patch = f.calls[4];
  assert.strictEqual(patch.method, 'PATCH');
  assert.ok(patch.url.includes('status=eq.pending'));
  assert.strictEqual(patch.body.status, 'running');
  assert.strictEqual(f.calls[0].body.user_id, UID);
});

test('done validates the id and keeps only ok + message', async () => {
  const f = fakeFetch();
  const h = makeHandler({ env: ENV, fetch: f.fetch });
  assert.strictEqual((await h(ev({ action: 'done', id: "1' or 1=1", result: {} }))).statusCode, 400);
  const id = '6f1c2d3e-4a5b-4c6d-8e7f-001122334455';
  assert.strictEqual((await h(ev({ action: 'done', id, result: { ok: true, message: 'בוצע', extra: 'no' } }))).statusCode, 200);
  assert.deepStrictEqual(f.calls[0].body.result, { ok: true, message: 'בוצע' });
  assert.strictEqual(f.calls[0].body.status, 'done');
  assert.ok(f.calls[0].url.includes(`user_id=eq.${UID}`) && f.calls[0].url.includes('status=eq.running'));
});

test('snapshot needs version 1 and is stored for David', async () => {
  const f = fakeFetch();
  const h = makeHandler({ env: ENV, fetch: f.fetch });
  assert.strictEqual((await h(ev({ action: 'snapshot', data: { v: 2 } }))).statusCode, 400);
  assert.strictEqual((await h(ev({ action: 'snapshot', data: { v: 1, period: {} } }))).statusCode, 200);
  assert.strictEqual(f.calls[0].body.user_id, UID);
  assert.deepStrictEqual(f.calls[0].body.data, { v: 1, period: {} });
});

test('release rejects bad ids and does nothing for an empty list', async () => {
  const f = fakeFetch();
  const h = makeHandler({ env: ENV, fetch: f.fetch });
  assert.strictEqual((await h(ev({ action: 'release', ids: "not-array" }))).statusCode, 400);
  assert.strictEqual((await h(ev({ action: 'release', ids: ["1' or 1=1"] }))).statusCode, 400);
  assert.strictEqual((await h(ev({ action: 'release', ids: Array.from({ length: 21 }, () => '6f1c2d3e-4a5b-4c6d-8e7f-001122334455') }))).statusCode, 400);
  const res = await h(ev({ action: 'release', ids: [] }));
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), { ok: true });
  assert.strictEqual(f.calls.length, 0);
});

test('release puts running ids back to pending for David only', async () => {
  const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'bbbbbbbb-0000-4000-8000-000000000002';
  const f = fakeFetch();
  const h = makeHandler({ env: ENV, fetch: f.fetch });
  const res = await h(ev({ action: 'release', ids: [A, B] }));
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(JSON.parse(res.body), { ok: true });
  assert.strictEqual(f.calls.length, 1);
  const patch = f.calls[0];
  assert.strictEqual(patch.method, 'PATCH');
  assert.ok(patch.url.includes(`user_id=eq.${UID}`));
  assert.ok(patch.url.includes('status=eq.running'));
  assert.ok(patch.url.includes(`id=in.(${A},${B})`));
  assert.deepStrictEqual(patch.body, { status: 'pending', picked_at: null });
});

test('unknown action is 400', async () => {
  assert.strictEqual((await makeHandler({ env: ENV, fetch: fakeFetch().fetch })(ev({ action: 'delete' }))).statusCode, 400);
});
