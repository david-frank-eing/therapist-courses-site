// The /welcome landing page and its leads (18/11/2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const { validateLead, normalizePhone, normalizeEmail, handler } = require(path.join(root, 'netlify/functions/lead-submit.js'));

const good = { name: 'דנה כהן', phone: '050-123 4567', email: 'Dana@Example.com', note: 'שיווק', consent: true, source: 'wa' };

test('the migration closes the table to the public and keeps the consent', () => {
  const sql = read('supabase/migrations/20261118000000_leads.sql');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.leads FROM anon/);
  assert.match(sql, /consent\s+BOOLEAN NOT NULL CHECK \(consent = true\)/);
  assert.match(sql, /email\s+TEXT NOT NULL/);
  assert.ok(!/FOR (SELECT|INSERT)[^;]*(true|anon)/i.test(sql.replace(/--.*$/gm, '')), 'no public policy');
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/i.test(sql.replace(/--.*$/gm, '')));
  assert.ok(!/[֐-׿]/.test(sql), 'no Hebrew in SQL that David pastes');
});

test('a valid lead is cleaned: phone to local format, email to lower case', () => {
  const r = validateLead(good);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.lead.phone, '0501234567');
  assert.strictEqual(r.lead.email, 'dana@example.com');
  assert.strictEqual(r.lead.consent, true);
  assert.strictEqual(r.lead.source, 'wa');
});

test('+972 numbers become 0-numbers, bad numbers are refused', () => {
  assert.strictEqual(normalizePhone('+972 50-123-4567'), '0501234567');
  assert.strictEqual(normalizePhone('03-1234567'), '031234567');
  for (const bad of ['123', '', 'abc', '05012', '0501234567890', null]) assert.strictEqual(normalizePhone(bad), '', String(bad));
});

test('a lead is refused without a name, a phone, an email or the consent', () => {
  assert.strictEqual(validateLead({ ...good, name: 'א' }).ok, false);
  assert.strictEqual(validateLead({ ...good, phone: '12' }).ok, false);
  assert.strictEqual(validateLead({ ...good, email: 'nope' }).ok, false);
  assert.strictEqual(validateLead({ ...good, email: 'a@b' }).ok, false);
  assert.strictEqual(validateLead({ ...good, consent: false }).ok, false);
  assert.strictEqual(validateLead({ ...good, consent: 'true' }).ok, false, 'only a real true counts');
  assert.strictEqual(validateLead({ ...good, consent: undefined }).ok, false);
  assert.strictEqual(validateLead(null).ok, false);
});

test('long text is cut and control characters removed; source keeps only safe characters', () => {
  const r = validateLead({ ...good, name: 'x'.repeat(300), note: 'y'.repeat(900) + '\u0000', source: 'Ad<script>1_a-b' });
  assert.strictEqual(r.lead.name.length, 80);
  assert.strictEqual(r.lead.note.length, 500);
  assert.strictEqual(r.lead.source, 'adscript1_a-b');
  assert.strictEqual(normalizeEmail('a'.repeat(120) + '@b.co'), '', 'email over 120 characters');
});

test('the function answers 405, 413, 400 and the honeypot without touching the database', async () => {
  const saved = { u: process.env.SUPABASE_URL, k: process.env.SUPABASE_SERVICE_KEY };
  delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('the function must not call the network here'); };
  try {
    assert.strictEqual((await handler({ httpMethod: 'GET' })).statusCode, 405);
    assert.strictEqual((await handler({ httpMethod: 'POST', body: 'x'.repeat(5000) })).statusCode, 413);
    assert.strictEqual((await handler({ httpMethod: 'POST', body: '{not json' })).statusCode, 400);
    assert.strictEqual((await handler({ httpMethod: 'POST', body: JSON.stringify({ ...good, consent: false }) })).statusCode, 400);
    const bot = await handler({ httpMethod: 'POST', body: JSON.stringify({ ...good, website: 'http://spam' }) });
    assert.strictEqual(bot.statusCode, 200, 'a bot is told ok and nothing is saved');
    assert.deepStrictEqual(JSON.parse(bot.body), { ok: true });
    const noEnv = await handler({ httpMethod: 'POST', body: JSON.stringify(good) });
    assert.strictEqual(noEnv.statusCode, 500);
    assert.ok(!/50123|dana/i.test(noEnv.body), 'an error never echoes the visitor details');
  } finally {
    global.fetch = realFetch;
    if (saved.u) process.env.SUPABASE_URL = saved.u;
    if (saved.k) process.env.SUPABASE_SERVICE_KEY = saved.k;
  }
});

test('the function saves a good lead, then sends Telegram, and a Telegram failure keeps the lead', async () => {
  process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_KEY = 'k';
  process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_CHAT_ID = '1';
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opt = {}) => {
    calls.push({ url: String(url), method: opt.method || 'GET', body: opt.body });
    if (String(url).includes('api.telegram.org')) throw new Error('telegram down');
    if (opt.method === 'POST') return { ok: true, status: 201, headers: { get: () => null } };
    return { ok: true, status: 200, headers: { get: () => '*/0' } };
  };
  try {
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(good) });
    assert.strictEqual(res.statusCode, 200);
    const insert = calls.find(c => c.method === 'POST' && c.url.endsWith('/rest/v1/leads'));
    assert.ok(insert, 'the lead was inserted');
    assert.strictEqual(JSON.parse(insert.body).email, 'dana@example.com');
    assert.ok(calls.some(c => c.url.includes('api.telegram.org')), 'telegram was tried');
    assert.ok(!calls.some(c => /or=\(/.test(c.url)), 'no or=(...) filter built from the email');
  } finally {
    global.fetch = realFetch;
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) delete process.env[k];
  }
});

test('the rate limit refuses a fourth lead from the same phone in a day', async () => {
  process.env.SUPABASE_URL = 'https://db.example'; process.env.SUPABASE_SERVICE_KEY = 'k';
  const realFetch = global.fetch;
  let inserted = false;
  global.fetch = async (url, opt = {}) => {
    if (opt.method === 'POST') { inserted = true; return { ok: true, status: 201, headers: { get: () => null } }; }
    return { ok: true, status: 200, headers: { get: () => '0-0/3' } };
  };
  try {
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify(good) });
    assert.strictEqual(res.statusCode, 429);
    assert.strictEqual(inserted, false);
  } finally {
    global.fetch = realFetch;
    delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY;
  }
});

test('the page: consent box is empty by default and required, email field exists, no direct database write', () => {
  const page = read('src/pages/Welcome.tsx');
  assert.match(page, /useState\(false\);\s*\n\s*const \[website/, 'consent starts unchecked');
  assert.match(page, /if \(!consent\) return setError/);
  assert.match(page, /id="lead-email"/);
  assert.match(page, /id="lead-phone"/);
  assert.match(page, /lead-submit/);
  assert.ok(!/supabase/i.test(page), 'the page never talks to Supabase directly');
  assert.match(page, /aria-hidden="true"[^>]*>\s*\n?\s*<label htmlFor="lead-website"/, 'honeypot hidden from screen readers');
  assert.ok(!/left:\s*"-\d+px"/.test(page), 'a far-off-screen honeypot makes the RTL page scroll sideways');
  const app = read('src/App.tsx');
  assert.match(app, /location\.pathname === "\/welcome"/, 'the maintenance gate must let guests see /welcome');
});

test('the page speaks about business and never calls itself a therapy course or training', () => {
  const page = read('src/pages/Welcome.tsx');
  assert.ok(!/קורס טיפולי|הכשרה מקצועית/.test(page), 'the page does not describe itself as a therapy course or a professional training');
  for (const phrase of ['תוכן מקצועי', 'ללמוד לטפל', 'הכשרה טיפולית', 'קורס הכשרה']) {
    assert.ok(!page.includes(phrase), 'must not promise: ' + phrase);
  }
});

test('the route, the admin tab and the leads screen exist', () => {
  assert.match(read('src/App.tsx'), /<Route path="\/welcome" element=\{<Welcome \/>\} \/>/);
  const admin = read('src/pages/Admin.tsx');
  assert.match(admin, /<TabsTrigger value="leads">/);
  assert.match(admin, /<LeadsManager /);
  const mgr = read('src/components/admin/LeadsManager.tsx');
  assert.match(mgr, /mailto:\$\{r\.email\}/);
  assert.match(mgr, /consent_at/);
});
