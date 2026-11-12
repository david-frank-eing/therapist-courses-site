// tests-finance/security.test.cjs — run: node --test "tests-finance/**/*.test.cjs"
// The fixes of 12/11/2026, before more people get access: Google connection, lead form, escaping.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const oauth = require('../netlify/lib/google-oauth-state.cjs');
const ENV = { SUPABASE_SERVICE_KEY: 'service-key-for-tests-0123456789abcdef' };
const ALICE = '11111111-1111-4111-8111-111111111111';
const MALLORY = '22222222-2222-4222-8222-222222222222';
const cookieOf = c => c.split(';')[0];

test('google state: the browser that started the flow gets its own user id back', () => {
  const { state, cookie } = oauth.create(ENV, ALICE);
  assert.strictEqual(oauth.verify(ENV, state, cookieOf(cookie)), ALICE);
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Lax/);
});

test('google state: a consent link opened in another browser is refused', () => {
  const mallory = oauth.create(ENV, MALLORY);          // Mallory starts the flow and sends the link to Alice
  assert.strictEqual(oauth.verify(ENV, mallory.state, ''), null);                    // Alice has no cookie
  const alice = oauth.create(ENV, ALICE);              // ...or a cookie from a flow of her own
  assert.strictEqual(oauth.verify(ENV, mallory.state, cookieOf(alice.cookie)), null);
});

test('google state: the user id cannot be swapped, forged or replayed late', () => {
  const { state, cookie } = oauth.create(ENV, ALICE, 1000);
  const [, expiry, nonce, sig] = Buffer.from(state, 'base64url').toString().split('.');
  const swapped = Buffer.from([MALLORY, expiry, nonce, sig].join('.')).toString('base64url');
  assert.strictEqual(oauth.verify(ENV, swapped, cookieOf(cookie), 2000), null);
  assert.strictEqual(oauth.verify(ENV, state, cookieOf(cookie), 2000), ALICE);
  assert.strictEqual(oauth.verify(ENV, state, cookieOf(cookie), 1000 + 11 * 60 * 1000), null);      // expired
  assert.strictEqual(oauth.verify({ SUPABASE_SERVICE_KEY: 'another-key-0123456789abcdefghij' }, state, cookieOf(cookie), 2000), null);
  for (const junk of ['', 'abc', ALICE, null, undefined, 'a.b.c.d']) assert.strictEqual(oauth.verify(ENV, junk, cookieOf(cookie)), null);
});

test('google-auth refuses a request that carries no session, and never reads a user id from the URL', async () => {
  const { handler } = require('../netlify/functions/google-auth.js');
  const env = { GOOGLE_CLIENT_ID: 'cid', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: ENV.SUPABASE_SERVICE_KEY, URL: 'https://site.example' };
  Object.assign(process.env, env);
  const realFetch = global.fetch;
  try {
    let r = await handler({ httpMethod: 'GET', headers: {}, queryStringParameters: { user_id: ALICE } });
    assert.strictEqual(r.statusCode, 405);
    r = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: { user_id: ALICE } });
    assert.strictEqual(r.statusCode, 401);
    global.fetch = async () => ({ ok: false, json: async () => ({}) });               // Supabase rejects the token
    r = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer bad' } });
    assert.strictEqual(r.statusCode, 401);
    global.fetch = async () => ({ ok: true, json: async () => ({ id: ALICE }) });     // a real session
    r = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, queryStringParameters: { user_id: MALLORY } });
    assert.strictEqual(r.statusCode, 200);
    const state = new URL(JSON.parse(r.body).url).searchParams.get('state');
    assert.strictEqual(oauth.verify(process.env, state, cookieOf(r.headers['Set-Cookie'])), ALICE);   // not MALLORY
  } finally { global.fetch = realFetch; }
});

test('google-callback stores nothing when the state does not verify', async () => {
  const { handler } = require('../netlify/functions/google-callback.js');
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({}), text: async () => '' }; };
  try {
    const r = await handler({ queryStringParameters: { code: 'c', state: MALLORY }, headers: {} });   // the old attack: a bare user id
    assert.strictEqual(r.statusCode, 302);
    assert.match(r.headers.Location, /google_error=/);
    assert.strictEqual(calls, 0);                        // no token exchange, no database write
  } finally { global.fetch = realFetch; }
});

test('lead form: fields are checked and capped on the server', () => {
  const { validate } = require('../netlify/functions/lead-capture.js');
  const good = { slug: 'david-frank', name: 'דנה כהן', phone: '052-1234567', email: 'd@x.co', notes: 'x'.repeat(5000) };
  const ok = validate(good);
  assert.ok(ok.ok && ok.lead.type === 'therapy' && ok.lead.notes.length === 1000);
  assert.strictEqual(validate(Object.assign({}, good, { website: 'http://spam' })).bot, true);       // honeypot
  for (const bad of [{ phone: 'call me' }, { phone: '12' }, { name: 'a' }, { slug: '../x' }, { email: 'nope' }, { date: '12/11/2026' }]) {
    assert.strictEqual(validate(Object.assign({}, good, bad)).ok, false, JSON.stringify(bad));
  }
  assert.strictEqual(validate(Object.assign({}, good, { type: 'event', attendees: '120' })).lead.attendees, 120);
  assert.strictEqual(validate(null).ok, false);
});

test('lead form: flood guard answers 429 and database errors are not echoed', async () => {
  const lc = require('../netlify/functions/lead-capture.js');
  Object.assign(process.env, { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: ENV.SUPABASE_SERVICE_KEY });
  const body = JSON.stringify({ slug: 'david-frank', name: 'דנה כהן', phone: '052-1234567' });
  const realFetch = global.fetch, realErr = console.error, realWarn = console.warn;
  console.error = console.warn = () => {};
  try {
    const many = Array.from({ length: lc.HOURLY_CAP }, (_, i) => ({ id: i }));
    global.fetch = async url => ({ ok: true, json: async () => (String(url).includes('booking_profiles') ? [{ user_id: ALICE }] : many), text: async () => '' });
    let r = await lc.handler({ httpMethod: 'POST', body });
    assert.strictEqual(r.statusCode, 429);
    global.fetch = async (url, opt) => {
      if (String(url).includes('booking_profiles')) return { ok: true, json: async () => [{ user_id: ALICE }] };
      if (opt && opt.method === 'POST') return { ok: false, status: 500, text: async () => 'relation "clients" column secret_internal_detail' };
      return { ok: true, json: async () => [] };
    };
    r = await lc.handler({ httpMethod: 'POST', body });
    assert.strictEqual(r.statusCode, 500);
    assert.ok(!r.body.includes('secret_internal_detail'));
  } finally { global.fetch = realFetch; console.error = realErr; console.warn = realWarn; }
});

test('dashboard: text from the booking form and from Google Calendar is escaped before it reaches the page', () => {
  const app = fs.readFileSync(path.join(__dirname, '../public/carlos-dashboard/app.js'), 'utf8');
  assert.ok(app.includes('<div class="cal-title">${_esc(ev.title || \'\')}</div>'));
  assert.ok(app.includes('${_esc(ev.location)}'));
  assert.ok(!/class="cal-title">\$\{ev\.title/.test(app));
  assert.ok(!app.includes("google-auth?user_id="));                       // the user id no longer travels in a URL
  // _esc itself, run on a hostile name
  const m = app.match(/function _esc\(s\) \{\s*return [^\n]*\n\s*\}/);
  assert.ok(m, '_esc not found');
  const esc = new Function(m[0] + '; return _esc;')();
  assert.strictEqual(esc('<img src=x onerror=alert(1)>"'), '&lt;img src=x onerror=alert(1)&gt;&quot;');
});
