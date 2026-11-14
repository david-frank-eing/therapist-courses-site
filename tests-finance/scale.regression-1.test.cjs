// Regression: ISSUE-006 — the admin function read only the first 200 accounts and 1000 profiles,
// so past 200 therapists the dashboard user list lost people and "invite" did not see existing accounts.
// Found by /qa on 2026-11-14 (scale run: 2000 users, 60 courses, 1200 patients, 1500 listings)
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

const N_USERS = 450;    // three pages of accounts (200 + 200 + 50)
const N_PROFILES = 1500; // two pages of rows (1000 + 500), more than the accounts on purpose
const uuid = i => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const email = i => `t${i}@example.com`;

function fakeSupabase(calls) {
  return async (url, opt = {}) => {
    url = String(url);
    calls.push({ url, method: opt.method || 'GET', headers: opt.headers || {}, body: opt.body });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
    if (url.endsWith('/auth/v1/user')) return ok({ id: uuid(0), email: 'admin@example.com' });
    if (url.includes('/auth/v1/admin/users?')) {
      const page = Number(new URL(url).searchParams.get('page') || 1);
      const per = Number(new URL(url).searchParams.get('per_page') || 50);
      const users = [];
      for (let i = (page - 1) * per; i < Math.min(page * per, N_USERS); i++)
        users.push({ id: uuid(i + 1), email: email(i + 1), created_at: new Date(2026, 0, 1 + (i % 300)).toISOString() });
      return ok({ users });
    }
    if (url.includes('/rest/v1/profiles?select=')) {
      const range = (opt.headers || {}).Range;
      const [from, to] = range ? range.split('-').map(Number) : [0, 999];
      const rows = [];
      for (let i = from; i <= Math.min(to, N_PROFILES - 1); i++)
        rows.push({ id: uuid(i + 1), full_name: `מטפל ${i + 1}`, subscription_tier: 'premium', finance_enabled: i % 2 === 0 });
      return ok(rows);
    }
    if (url.includes('/rest/v1/profiles?id=eq.')) return ok([{ id: 'x', subscription_tier: 'premium' }]);
    return ok({});
  };
}

async function call(event) {
  process.env.SUPABASE_URL = 'https://x.supabase.co';
  process.env.SUPABASE_SERVICE_KEY = 'service';
  process.env.ADMIN_EMAIL = 'admin@example.com';
  delete require.cache[require.resolve(path.join(root, 'netlify/functions/admin-users.js'))];
  const { handler } = require(path.join(root, 'netlify/functions/admin-users.js'));
  const res = await handler({ headers: { authorization: 'Bearer t' }, ...event });
  return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
}

test('the user list returns every account, past the first 200, with the tier and finance of each', async () => {
  const realFetch = global.fetch, calls = [];
  global.fetch = fakeSupabase(calls);
  try {
    const { status, body } = await call({ httpMethod: 'GET' });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.users.length, N_USERS, 'all 450 accounts, not 200');
    const last = body.users.find(u => u.email === email(N_USERS));
    assert.ok(last, 'the 450th account is in the list');
    assert.strictEqual(last.tier, 'premium', 'its tier comes from the profiles table');
    assert.strictEqual(typeof last.finance, 'boolean', 'its finance switch is known');
    assert.ok(calls.some(c => c.url.includes('page=3')), 'asked for the third page of accounts');
    assert.ok(calls.some(c => c.headers.Range === '1000-1999'), 'asked for the second page of profiles');
  } finally { global.fetch = realFetch; }
});

test('inviting an email that already has an account finds it even when it is account #430', async () => {
  const realFetch = global.fetch, calls = [];
  global.fetch = fakeSupabase(calls);
  try {
    const { status, body } = await call({ httpMethod: 'POST', body: JSON.stringify({ action: 'invite_user', email: 'T430@example.com', name: 'x' }) });
    assert.strictEqual(status, 200);
    assert.strictEqual(body.already_existed, true, 'recognised as existing (and the email check ignores case)');
    assert.ok(!calls.some(c => c.method === 'POST' && c.url.endsWith('/auth/v1/admin/users')), 'did not try to create a duplicate account');
  } finally { global.fetch = realFetch; }
});

test('long lists on the site are read in pages and drawn in parts', () => {
  const read = p => fs.readFileSync(path.join(root, p), 'utf8');
  for (const f of ['src/pages/CRM.tsx', 'src/pages/Board.tsx', 'src/components/admin/ListingsManager.tsx', 'src/pages/MyCourses.tsx'])
    assert.ok(read(f).includes('fetchAll<'), f + ' must read through fetchAll (Supabase cuts a single read at 1000 rows)');
  for (const f of ['src/pages/CRM.tsx', 'src/pages/Board.tsx', 'src/components/admin/ListingsManager.tsx'])
    assert.ok(/filtered\.slice\(0, shownCount\)/.test(read(f)), f + ' must draw a part of the list, not all of it');
  assert.ok(read('src/components/admin/UsersManager.tsx').includes('PAGE_FETCH'), 'the users tab pages through 1000-row reads');
});
