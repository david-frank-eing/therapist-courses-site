// The business assistant (/assistant, 19/11/2026): database rules, the Netlify function (with a fake database and a fake
// model), and checks on the pages. No network, no real key.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

process.env.ASSISTANT_RETRY_MS = '0';   // no real pause before the one retry in tests
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const fn = require(path.join(root, 'netlify/functions/assistant-chat.js'));
const { handler, validateChatOutput, validatePlan, buildChatSystem, turnNote, LIMITS } = fn;

const SQL = read('supabase/migrations/20261119000000_business_assistant.sql').replace(/--.*$/gm, '');

// ------------------------------------------------------------------ the database file
test('the migration: browser cannot write conversations, users read and delete only their own', () => {
  assert.ok(!/[֐-׿]/.test(read('supabase/migrations/20261119000000_business_assistant.sql')), 'no Hebrew in SQL that David pastes');
  for (const t of ['assistant_conversations', 'assistant_config', 'business_plans', 'assistant_usage']) {
    assert.match(SQL, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`), t);
    assert.match(SQL, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon`), t + ' closed to anon');
  }
  assert.match(SQL, /REVOKE INSERT, UPDATE ON public\.assistant_conversations FROM authenticated/);
  assert.ok(!/ON public\.assistant_conversations\s+FOR (INSERT|UPDATE|ALL)/i.test(SQL), 'no write policy on conversations');
  assert.match(SQL, /ON public\.assistant_conversations\s+FOR SELECT USING \(auth\.uid\(\) = user_id\)/);
  assert.match(SQL, /ON public\.assistant_conversations\s+FOR DELETE USING \(auth\.uid\(\) = user_id\)/);
  assert.match(SQL, /REVOKE ALL ON public\.assistant_usage FROM anon, authenticated/);
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/i.test(SQL));
});

test('the migration: plans are own-rows only for all four actions, exactly three actions, at most 20 plans', () => {
  for (const kind of ['SELECT USING', 'INSERT WITH CHECK', 'UPDATE USING', 'DELETE USING']) {
    assert.match(SQL, new RegExp(`ON public\\.business_plans FOR ${kind} \\(auth\\.uid\\(\\) = user_id\\)`), kind);
  }
  assert.match(SQL, /jsonb_array_length\(actions\) = 3/);
  assert.match(SQL, />= 20 THEN/);
});

test('the migration: the admin sees questions through a function that does not return user_id', () => {
  const m = /FUNCTION public\.admin_assistant_questions[\s\S]*?\$\$;/.exec(SQL);
  assert.ok(m, 'function exists');
  assert.match(m[0], /has_role\(auth\.uid\(\), 'admin'\)/);
  assert.match(m[0], /SECURITY DEFINER/);
  const returns = /RETURNS TABLE \(([^)]*)\)/.exec(m[0])[1];
  assert.ok(!/user_id|guest_hash/.test(returns), 'no identity in the result');
  assert.match(returns, /is_registered BOOLEAN/, 'the admin sees registered or guest');
  const select = /RETURN QUERY\s+SELECT([\s\S]*?)FROM/.exec(m[0])[1];
  // the only mention of user_id allowed is the yes/no test; the identity itself must not be selected
  assert.ok(/\(c\.user_id IS NOT NULL\)/.test(select), 'registered flag is a plain yes/no');
  assert.ok(!/user_id|guest_hash/.test(select.replace('(c.user_id IS NOT NULL)', '')), 'no identity selected');
  assert.match(SQL, /DROP FUNCTION IF EXISTS public\.admin_assistant_questions\(INTEGER, INTEGER\)/);
  assert.match(SQL, /REVOKE ALL ON FUNCTION public\.admin_assistant_questions\(INTEGER, INTEGER\) FROM PUBLIC, anon/);
});

test('the migration: the owner instructions are admin-only and size-limited', () => {
  assert.match(SQL, /Admins manage assistant config[\s\S]*?has_role\(auth\.uid\(\), 'admin'\)/);
  assert.match(SQL, /<= 8000/);
});

// ------------------------------------------------------------------ validation of the model's output
test('chat output: only known kinds, short text, options only for a question', () => {
  assert.strictEqual(validateChatOutput(null), null);
  assert.strictEqual(validateChatOutput({ kind: 'hack', text: 'x', options: [] }), null);
  assert.strictEqual(validateChatOutput({ kind: 'question', text: '   ', options: [] }), null);
  const q = validateChatOutput({ kind: 'question', text: 'q'.repeat(900), options: ['a', 'b', 'c', 'd', 'e', ''] });
  assert.strictEqual(q.text.length, 400);
  assert.deepStrictEqual(q.options, ['a', 'b', 'c', 'd']);
  assert.deepStrictEqual(validateChatOutput({ kind: 'reply', text: 'ok', options: ['a'] }).options, []);
});

test('a plan needs three actions (extra ones are cut) and every main part', () => {
  const p = { business_summary: 's', channel: 'c', why: 'w', actions: ['1', '2', '3', '4'], outreach_message: 'm', next_step: 'n' };
  assert.deepStrictEqual(validatePlan(p).actions, ['1', '2', '3']);
  assert.strictEqual(validatePlan({ ...p, actions: ['1', '2'] }), null);
  assert.strictEqual(validatePlan({ ...p, channel: '' }), null);
  assert.strictEqual(validatePlan({ ...p, outreach_message: '' }), null);
  assert.strictEqual(validatePlan('x'), null);
});

test('the system prompt keeps the business-only rule and puts the owner text after it, unable to cancel it', () => {
  const s = buildChatSystem({ guidelines: 'GUIDE-X', question_bank: 'BANK-X', examples: 'EX-X' });
  assert.ok(s.indexOf('מחוץ לתחום') < s.indexOf('GUIDE-X'), 'the fixed rules come first');
  for (const w of ['GUIDE-X', 'BANK-X', 'EX-X']) assert.ok(s.includes(w), w);
  assert.match(s, /ולא מבטל אותם/);
  assert.match(s, /שאלות קליניות/);
  assert.match(s, /לעולם אל תשאל ואל תציע עבודה אונליין/, 'hands-on professions are never offered online work');
  assert.ok(!/אזור או אונליין/.test(s), 'the old "area or online" question is gone');
  assert.ok(!buildChatSystem({}).includes('מידע מהבעלים'), 'no owner block when nothing is written');
  assert.match(turnNote(5, 'open'), /ready/);
  assert.match(turnNote(1, 'done', { channel: 'c', business_summary: 's' }), /reply/);
});

// ------------------------------------------------------------------ the function, with a fake database and a fake model
const SB = 'https://db.example';
function fakeWorld({ modelChat, modelPlan, counts = {} } = {}) {
  const w = { convs: {}, usage: [], claude: [], telegram: [], claudeFail: null, cfg: { guidelines: '', question_bank: '', examples: '' }, logged: [], modelChat, modelPlan };
  w.fetch = async (url, opt = {}) => {
    url = String(url);
    const method = opt.method || 'GET';
    const ok = (data, extra = {}) => ({ ok: true, status: 200, headers: { get: (h) => (extra[h.toLowerCase()] ?? null) }, json: async () => data });
    if (url.startsWith('https://api.telegram.org')) { w.telegram.push(JSON.parse(opt.body)); return ok({}); }
    if (url.startsWith('https://api.anthropic.com')) {
      const body = JSON.parse(opt.body);
      w.claude.push(body);
      const failure = w.claudeFail && w.claudeFail(w.claude.length);   // {status, message} or null
      if (failure) {
        const res = { ok: false, status: failure.status, headers: { get: () => null }, json: async () => ({ error: { message: failure.message } }) };
        res.clone = () => res;
        return res;
      }
      const isPlan = body.output_config.format.schema.properties.actions;
      const out = (isPlan ? w.modelPlan : w.modelChat)(body);
      return ok({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(out) }] });
    }
    if (url.includes('/auth/v1/user')) {
      const t = /Bearer (.+)/.exec(opt.headers.Authorization)[1];
      const m = /^jwt-(.+)$/.exec(t);
      return m ? ok({ id: m[1] }) : { ok: false, status: 401, headers: { get: () => null }, json: async () => ({}) };
    }
    if (url.includes('/rest/v1/assistant_usage')) {
      if (method === 'POST') { [].concat(JSON.parse(opt.body)).forEach((r) => w.usage.push(r)); return ok(null); }
      if (url.includes('kind=eq.alert')) return ok(null, { 'content-range': `0-0/${w.usage.filter((u) => u.kind === 'alert').length}` });
      const subj = /subject=eq\.([^&]+)/.exec(url);
      const n = subj ? (counts[decodeURIComponent(subj[1])] ?? w.usage.filter((u) => u.subject === decodeURIComponent(subj[1])).length) : (counts.total ?? w.usage.length);
      return ok(null, { 'content-range': `0-0/${n}` });
    }
    if (url.includes('/rest/v1/assistant_config')) return ok([w.cfg]);
    if (url.includes('/rest/v1/assistant_conversations')) {
      if (method === 'POST') {
        const row = { id: crypto.randomUUID(), status: 'open', turns: 0, off_topic_count: 0, messages: [], result: null, ...JSON.parse(opt.body) };
        w.convs[row.id] = row;
        return ok([row]);
      }
      const id = /id=eq\.([0-9a-f-]+)/.exec(url)[1];
      if (method === 'PATCH') { Object.assign(w.convs[id], JSON.parse(opt.body)); return ok(null); }
      return ok(w.convs[id] ? [w.convs[id]] : []);
    }
    throw new Error('unexpected fetch ' + url);
  };
  return w;
}

async function withWorld(world, body) {
  const real = global.fetch, realErr = console.error;
  Object.assign(process.env, { SUPABASE_URL: SB, SUPABASE_SERVICE_KEY: 'svc', ANTHROPIC_API_KEY: 'sk-test' });
  global.fetch = world.fetch;
  console.error = (...a) => world.logged.push(a.join(' '));
  try { return await body(); } finally {
    global.fetch = real; console.error = realErr;
    for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'ANTHROPIC_API_KEY', 'ASSISTANT_MODEL_CHAT', 'ASSISTANT_MODEL_PLAN']) delete process.env[k];
  }
}

const GT = 'g'.repeat(24);
const post = (b, jwt) => handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '9.9.9.9', ...(jwt ? { authorization: 'Bearer ' + jwt } : {}) }, body: JSON.stringify(b) });
const q = (text = 'מה התחום שלכם?') => ({ kind: 'question', text, options: ['א', 'ב'] });
const PLAN = { business_summary: 'סיכום', channel: 'חברים וקהילה', why: 'כי', actions: ['א', 'ב', 'ג'], outreach_message: 'שלום', next_step: 'להתקשר' };

test('bad requests are refused before any database or model call', async () => {
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('no network expected'); };
  try {
    assert.strictEqual((await handler({ httpMethod: 'GET' })).statusCode, 405);
    assert.strictEqual((await handler({ httpMethod: 'POST', body: 'x'.repeat(LIMITS.MAX_BODY + 1) })).statusCode, 413);
    assert.strictEqual((await handler({ httpMethod: 'POST', body: '{nope' })).statusCode, 400);
    assert.strictEqual((await post({ action: 'message', text: 'a', guest_token: GT })).statusCode, 400, 'too short');
    assert.strictEqual((await post({ action: 'message', text: 'שלום', conversation_id: 'not-a-uuid', guest_token: GT })).statusCode, 400);
    assert.strictEqual((await post({ action: 'message', text: 'שלום', guest_token: 'short' })).statusCode, 400);
  } finally { global.fetch = realFetch; }
});

test('without the model key the assistant says it is unavailable (and calls nothing)', async () => {
  const realFetch = global.fetch;
  global.fetch = () => { throw new Error('no network expected'); };
  Object.assign(process.env, { SUPABASE_URL: SB, SUPABASE_SERVICE_KEY: 'svc' });
  delete process.env.ANTHROPIC_API_KEY;
  try { assert.strictEqual((await post({ action: 'message', text: 'שלום', guest_token: GT })).statusCode, 503); }
  finally { global.fetch = realFetch; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; }
});

test('a guest conversation: question, stored history, the small model for the chat and the strong one for the plan', async () => {
  const w = fakeWorld({ modelChat: () => q(), modelPlan: () => PLAN });
  w.cfg = { guidelines: 'GUIDE-ZZ', question_bank: '', examples: '' };
  await withWorld(w, async () => {
    process.env.ASSISTANT_MODEL_PLAN = 'plan-model-x';
    const r1 = JSON.parse((await post({ action: 'message', text: 'אני מטפלת חדשה', guest_token: GT })).body);
    assert.strictEqual(r1.kind, 'question');
    assert.ok(r1.conversation_id);
    assert.strictEqual(w.claude[0].model, 'claude-haiku-5-5');
    assert.ok(w.claude[0].system[0].text.includes('GUIDE-ZZ'), 'the owner guidelines reach the model');
    assert.ok(!w.claude[0].tool_choice, 'no forced tool use (rejected by these models)');
    const conv = w.convs[r1.conversation_id];
    assert.strictEqual(conv.user_id, null);
    assert.strictEqual(conv.guest_hash, crypto.createHash('sha256').update(GT).digest('hex'), 'only a hash of the guest token is stored');
    assert.deepStrictEqual(conv.messages.map(m => m.role), ['user', 'assistant']);
    assert.strictEqual(w.usage.length, 1);
    assert.ok(w.usage[0].subject.startsWith('ip:') && !w.usage[0].subject.includes('9.9.9.9'), 'the address is never stored');

    // the plan is refused until the assistant said it is ready
    assert.strictEqual((await post({ action: 'plan', conversation_id: r1.conversation_id, guest_token: GT })).statusCode, 409);
    w.modelChat = () => ({ kind: 'ready', text: 'מכין תוכנית', options: [] });
    const r2 = JSON.parse((await post({ action: 'message', text: 'בבית, שעתיים בשבוע', conversation_id: r1.conversation_id, guest_token: GT })).body);
    assert.strictEqual(r2.kind, 'ready');
    const p = JSON.parse((await post({ action: 'plan', conversation_id: r1.conversation_id, guest_token: GT })).body);
    assert.strictEqual(p.kind, 'plan');
    assert.strictEqual(p.result.actions.length, 3);
    assert.strictEqual(w.claude[w.claude.length - 1].model, 'plan-model-x', 'the plan uses the plan model');
    assert.strictEqual(w.convs[r1.conversation_id].status, 'done');
    // a guest cannot keep chatting after the result
    const more = await post({ action: 'message', text: 'עוד שאלה', conversation_id: r1.conversation_id, guest_token: GT });
    assert.strictEqual(more.statusCode, 403);
    assert.strictEqual(JSON.parse(more.body).code, 'guest_done');
  });
});

test('after five answers the server moves on to the plan even if the model keeps asking', async () => {
  const w = fakeWorld({ modelChat: () => q(), modelPlan: () => PLAN });
  await withWorld(w, async () => {
    let id, last;
    for (let i = 0; i < LIMITS.MAX_QUESTION_TURNS; i++) {
      last = JSON.parse((await post({ action: 'message', text: 'תשובה מספר ' + i, conversation_id: id, guest_token: GT })).body);
      id = last.conversation_id;
    }
    assert.strictEqual(last.kind, 'ready');
  });
});

test('off-topic messages are turned down, counted three times, and the third locks the conversation', async () => {
  const w = fakeWorld({ modelChat: () => ({ kind: 'off_topic', text: 'אני עוזר רק בצד העסקי', options: [] }) });
  await withWorld(w, async () => {
    let id, r;
    for (let i = 0; i < LIMITS.OFF_TOPIC_LOCK; i++) {
      r = JSON.parse((await post({ action: 'message', text: 'מה מזג האוויר ' + i, conversation_id: id, guest_token: GT })).body);
      id = r.conversation_id;
    }
    assert.strictEqual(r.locked, true);
    assert.strictEqual(w.convs[id].status, 'locked');
    assert.strictEqual(w.convs[id].turns, 0, 'off-topic messages are not answers');
    assert.strictEqual(w.usage.length, LIMITS.OFF_TOPIC_LOCK * 3, 'each off-topic message counts 3 times against the limit');
    const again = await post({ action: 'message', text: 'שוב', conversation_id: id, guest_token: GT });
    assert.strictEqual(again.statusCode, 403);
    assert.strictEqual(JSON.parse(again.body).code, 'locked');
    assert.ok(w.convs[id].messages.some(m => m.topic === false), 'off-topic messages are marked for the admin');
  });
});

test('a signed-in user keeps talking after the plan; a question or ready from the model becomes a reply', async () => {
  const w = fakeWorld({ modelChat: () => q(), modelPlan: () => PLAN });
  await withWorld(w, async () => {
    const uid = '11111111-1111-1111-1111-111111111111';
    w.modelChat = () => ({ kind: 'ready', text: 'מוכן', options: [] });
    const r1 = JSON.parse((await post({ action: 'message', text: 'שלום, יש לי קליניקה', guest_token: GT }, 'jwt-' + uid)).body);
    assert.strictEqual(w.convs[r1.conversation_id].user_id, uid, 'the conversation belongs to the verified user');
    assert.strictEqual(w.convs[r1.conversation_id].guest_hash, null);
    await post({ action: 'plan', conversation_id: r1.conversation_id }, 'jwt-' + uid);
    w.modelChat = () => ({ kind: 'question', text: 'עוד שאלה?', options: ['x'] });
    const r2 = JSON.parse((await post({ action: 'message', text: 'איך מתמחרים?', conversation_id: r1.conversation_id }, 'jwt-' + uid)).body);
    assert.strictEqual(r2.kind, 'reply');
    assert.deepStrictEqual(r2.options, []);
  });
});

test('a conversation belongs to its owner only (other guest, other user, guest vs user)', async () => {
  const w = fakeWorld({ modelChat: () => q() });
  await withWorld(w, async () => {
    const a = '11111111-1111-1111-1111-111111111111', b = '22222222-2222-2222-2222-222222222222';
    const own = JSON.parse((await post({ action: 'message', text: 'שלום', guest_token: GT }, 'jwt-' + a)).body).conversation_id;
    const peek = (body, jwt) => post({ action: 'message', text: 'מציץ', conversation_id: own, ...body }, jwt);
    assert.strictEqual((await peek({}, 'jwt-' + b)).statusCode, 404, 'other user');
    assert.strictEqual((await peek({ guest_token: 'h'.repeat(24) })).statusCode, 404, 'a guest cannot open a user conversation');
    assert.strictEqual((await peek({ guest_token: GT })).statusCode, 404, 'not even with a token');
    const guestConv = JSON.parse((await post({ action: 'message', text: 'שלום', guest_token: GT })).body).conversation_id;
    assert.strictEqual((await post({ action: 'message', text: 'x1', conversation_id: guestConv, guest_token: 'h'.repeat(24) })).statusCode, 404, 'other guest');
    assert.strictEqual((await post({ action: 'message', text: 'x2', conversation_id: guestConv }, 'jwt-' + a)).statusCode, 404, 'a user cannot open a guest conversation');
    assert.strictEqual((await post({ action: 'plan', conversation_id: own }, 'jwt-' + b)).statusCode, 404);
  });
});

test('a guest gets 10 calls a day and is sent to sign up after that', () => {
  assert.strictEqual(LIMITS.GUEST_PER_DAY, 10);
  const chat = read('src/components/assistant/ChatPanel.tsx');
  assert.match(chat, /code === "guest_done" \|\| code === "too_long" \|\| code === "guest_limit"/);
  assert.match(chat, /הרשמה חינם/);
  assert.match(chat, /navigate\("\/auth\?redirect=\/assistant"\)/);
});

test('the admin list marks registered or guest, and filters by it', () => {
  const mgr = read('src/components/admin/AssistantManager.tsx');
  assert.match(mgr, /is_registered/);
  assert.match(mgr, /רק רשומים/);
  assert.ok(!/user_id/.test(mgr.replace(/\/\/.*$/gm, '')), 'the admin screen code never asks for the identity (comments aside)');
});

test('limits: a guest 10 a day, a user 100 a day, the whole system 600 a day', async () => {
  const uid = '11111111-1111-1111-1111-111111111111';
  const w = fakeWorld({ modelChat: () => q(), counts: { ['ip:' + crypto.createHmac('sha256', 'svc').update('9.9.9.9').digest('hex').slice(0, 24)]: LIMITS.GUEST_PER_DAY } });
  await withWorld(w, async () => {
    const g = await post({ action: 'message', text: 'שלום', guest_token: GT });
    assert.strictEqual(g.statusCode, 429);
    assert.strictEqual(JSON.parse(g.body).code, 'guest_limit');
    assert.strictEqual(w.claude.length, 0, 'no model call once over the limit');
  });
  const w2 = fakeWorld({ modelChat: () => q(), counts: { [uid]: LIMITS.USER_PER_DAY - 1 } });
  await withWorld(w2, async () => {
    assert.strictEqual((await post({ action: 'message', text: 'שלום', guest_token: GT }, 'jwt-' + uid)).statusCode, 200, 'the 100th message is allowed');
    w2.usage.push({ subject: uid });
    const w3counts = LIMITS.USER_PER_DAY;
    const w3 = fakeWorld({ modelChat: () => q(), counts: { [uid]: w3counts } });
    await withWorld(w3, async () => {
      const r = await post({ action: 'message', text: 'שלום', guest_token: GT }, 'jwt-' + uid);
      assert.strictEqual(r.statusCode, 429);
      assert.strictEqual(JSON.parse(r.body).code, 'daily_limit');
    });
  });
  const w4 = fakeWorld({ modelChat: () => q(), counts: { total: LIMITS.TOTAL_PER_DAY } });
  await withWorld(w4, async () => {
    const r = await post({ action: 'message', text: 'שלום', guest_token: GT }, null);
    assert.strictEqual(r.statusCode, 429);
    assert.strictEqual(JSON.parse(r.body).code, 'busy');
  });
});

test('a broken model answer is retried once, then reported; nothing the person wrote reaches the log', async () => {
  let calls = 0;
  const w = fakeWorld({ modelChat: () => { calls++; return { kind: 'nonsense' }; } });
  await withWorld(w, async () => {
    const r = await post({ action: 'message', text: 'סוד-סודי-של-המטפלת', guest_token: GT });
    assert.strictEqual(r.statusCode, 502);
    assert.strictEqual(calls, 2);
    assert.ok(!w.logged.join('\n').includes('סודי'), 'no conversation text in logs');
    assert.ok(!r.body.includes('סודי'));
  });
  // an API failure
  const w2 = fakeWorld({ modelChat: () => q() });
  const orig = w2.fetch;
  w2.fetch = async (u, o) => (String(u).startsWith('https://api.anthropic.com') ? { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) } : orig(u, o));
  await withWorld(w2, async () => {
    const r = await post({ action: 'message', text: 'סוד-נוסף', guest_token: GT });
    assert.strictEqual(r.statusCode, 503, 'an API 500 is treated as a passing overload');
    assert.ok(!w2.logged.join('\n').includes('סוד-נוסף'));
  });
});

test('a passing overload is retried once; a lasting one is reported as busy', async () => {
  const w = fakeWorld({ modelChat: () => q() });
  w.claudeFail = (n) => (n === 1 ? { status: 529, message: 'Overloaded' } : null);
  await withWorld(w, async () => {
    assert.strictEqual((await post({ action: 'message', text: 'שלום עולם', guest_token: GT })).statusCode, 200, 'second try works');
    assert.strictEqual(w.claude.length, 2);
  });
  const w2 = fakeWorld({ modelChat: () => q() });
  w2.claudeFail = () => ({ status: 429, message: 'rate limit' });
  await withWorld(w2, async () => {
    const r = await post({ action: 'message', text: 'שלום עולם', guest_token: GT });
    assert.strictEqual(r.statusCode, 503);
    assert.strictEqual(JSON.parse(r.body).code, 'ai_busy');
    assert.strictEqual(w2.claude.length, 2, 'exactly one retry');
    assert.strictEqual(w2.telegram.length, 0, 'a passing overload does not bother the owner');
  });
});

test('no credit or a bad key: the person sees "unavailable" and the owner gets one Telegram message an hour', async () => {
  for (const failure of [{ status: 400, message: 'Your credit balance is too low to access the Anthropic API.' }, { status: 401, message: 'invalid x-api-key' }]) {
    const w = fakeWorld({ modelChat: () => q() });
    w.claudeFail = () => failure;
    await withWorld(w, async () => {
      process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_CHAT_ID = '1';
      try {
        const r1 = await post({ action: 'message', text: 'שלום עולם', guest_token: GT });
        assert.strictEqual(r1.statusCode, 503);
        assert.strictEqual(JSON.parse(r1.body).code, 'unavailable');
        assert.strictEqual(w.telegram.length, 1, 'the owner was told');
        assert.ok(!/sk-|key/i.test(r1.body), 'nothing about the key reaches the visitor');
        await post({ action: 'message', text: 'שוב', guest_token: GT });
        assert.strictEqual(w.telegram.length, 1, 'not again within the hour');
        assert.strictEqual(w.claude.length, failure.status === 400 ? 2 : 2, 'no pointless retries');
      } finally { delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_CHAT_ID; }
    });
  }
});

test('the model rejecting the optional tuning parameters is retried once without them', async () => {
  const w = fakeWorld({ modelChat: () => q() });
  const orig = w.fetch;
  let n = 0;
  w.fetch = async (u, o) => {
    if (String(u).startsWith('https://api.anthropic.com') && n++ === 0) return { ok: false, status: 400, headers: { get: () => null }, json: async () => ({}) };
    return orig(u, o);
  };
  await withWorld(w, async () => {
    const r = await post({ action: 'message', text: 'שלום עולם', guest_token: GT });
    assert.strictEqual(r.statusCode, 200);
    const second = w.claude[0];
    assert.ok(!second.thinking && !second.cache_control && !second.output_config.effort, 'plain retry');
  });
});

// ------------------------------------------------------------------ the pages
test('the key stays on the server and the pages never render model text as HTML', () => {
  const files = ['src/lib/assistant.ts', 'src/pages/BusinessAssistant.tsx', 'src/components/assistant/ChatPanel.tsx', 'src/components/assistant/PlanView.tsx',
    'src/components/assistant/SavedPlans.tsx', 'src/components/assistant/MyConversations.tsx', 'src/components/admin/AssistantManager.tsx'];
  for (const f of files) {
    const t = read(f);
    assert.ok(!/ANTHROPIC|api\.anthropic\.com|x-api-key/i.test(t), f + ' must not know the key or the API');
    assert.ok(!/dangerouslySetInnerHTML|innerHTML/.test(t), f + ' renders text only');
  }
  assert.match(read('src/lib/assistant.ts'), /\/\.netlify\/functions\/assistant-chat/);
});

test('/assistant is routed, open to guests in maintenance mode, linked from the menu', () => {
  const app = read('src/App.tsx');
  assert.match(app, /<Route path="\/assistant" element=\{<BusinessAssistant \/>\} \/>/);
  assert.match(app, /pathname === "\/assistant"/);
  assert.match(read('src/components/Header.tsx'), /href: "\/assistant"/);
  assert.match(read('src/pages/Admin.tsx'), /<AssistantManager \/>/);
});

test('guests save through sign-in (the plan waits in the browser), signed-in users save straight to their account', () => {
  const chat = read('src/components/assistant/ChatPanel.tsx');
  assert.match(chat, /navigate\("\/auth\?redirect=\/assistant"\)/);
  assert.match(chat, /savePending\(result, convId\)/);
  assert.match(chat, /insertPlan\(userId, result, convId\)/);
  assert.match(chat, /שמור את התוכנית שלי/);
  const page = read('src/pages/BusinessAssistant.tsx');
  assert.match(page, /יש תוכנית שעוד לא נשמרה/, 'a waiting plan is offered, never saved silently');
  assert.match(page, /key=\{chatKey\}/, 'a new conversation is a fresh panel');
  assert.match(read('src/components/assistant/ChatPanel.tsx'), /שיחה חדשה/);
});

test('/welcome offers the assistant and a free sign-up that opens on the sign-up form', () => {
  const w = read('src/pages/Welcome.tsx');
  assert.match(w, /<Link to="\/assistant">נסו את העוזר העסקי בחינם<\/Link>/);
  assert.match(w, /<Link to="\/auth\?mode=signup&redirect=\/assistant">הרשמה חינם<\/Link>/);
  assert.match(read('src/pages/Auth.tsx'), /searchParams\.get\("mode"\) === "signup" \? "signup" : "login"/);
});

test('the counters: closed table, admin-only funnel numbers, only the two public pages are counted', async () => {
  const sql = read('supabase/migrations/20261121000000_assistant_stats.sql');
  const code = sql.replace(/--.*$/gm, '');
  assert.ok(!/[֐-׿]/.test(sql), 'no Hebrew in SQL that David pastes');
  assert.match(code, /ALTER TABLE public\.page_views ENABLE ROW LEVEL SECURITY/);
  assert.match(code, /REVOKE ALL ON public\.page_views FROM anon, authenticated/);
  assert.match(code, /CHECK \(page IN \('welcome', 'assistant'\)\)/);
  assert.match(code, /admin_assistant_stats[\s\S]*?has_role\(auth\.uid\(\), 'admin'\)/);
  assert.ok(!/user_id\s*,|SELECT[^;]*\bemail\b/i.test(code.replace(/user_id IS (NOT )?NULL/g, '')), 'no identity in the numbers');
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM/i.test(code));

  const { validateView, handler } = require(path.join(root, 'netlify/functions/page-view.js'));
  assert.deepStrictEqual(validateView({ page: 'welcome', src: 'WhatsApp<x>' }), { page: 'welcome', src: 'whatsappx' });
  assert.strictEqual(validateView({ page: 'admin' }), null, 'only the two public pages');
  assert.strictEqual(validateView({ page: 'welcome', src: 'x'.repeat(80) }).src.length, 20);
  assert.strictEqual((await handler({ httpMethod: 'GET' })).statusCode, 405);
  assert.strictEqual((await handler({ httpMethod: 'POST', body: 'x'.repeat(500) })).statusCode, 413);
  assert.strictEqual((await handler({ httpMethod: 'POST', body: JSON.stringify({ page: 'nope' }) })).statusCode, 400);

  // a good view is stored with the page and the tag only (no headers, no address)
  const real = global.fetch; const sent = [];
  process.env.SUPABASE_URL = SB; process.env.SUPABASE_SERVICE_KEY = 'svc';
  global.fetch = async (u, o = {}) => { sent.push({ u: String(u), o }); return { ok: true, status: 200, headers: { get: () => '0-0/0' }, json: async () => [] }; };
  try {
    const r = await handler({ httpMethod: 'POST', headers: { 'x-nf-client-connection-ip': '9.9.9.9' }, body: JSON.stringify({ page: 'assistant', src: 'wa' }) });
    assert.strictEqual(r.statusCode, 200);
    const ins = sent.find(s => s.o.method === 'POST');
    assert.deepStrictEqual(JSON.parse(ins.o.body), { page: 'assistant', src: 'wa' });
    assert.ok(!JSON.stringify(sent).includes('9.9.9.9'), 'the address never leaves the function');
  } finally { global.fetch = real; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; }

  assert.match(read('src/pages/Welcome.tsx'), /trackPage\("welcome"\)/);
  assert.match(read('src/pages/BusinessAssistant.tsx'), /trackPage\("assistant"\)/);
  assert.ok(!/document\.cookie|localStorage/.test(read('src/lib/track.ts').replace(/\/\/.*$/gm, '')), 'no cookies, no persistent storage');
});

test('the daily cleanup deletes conversations after 90 days and leaves saved plans alone', async () => {
  const cleanup = require(path.join(root, 'netlify/functions/assistant-cleanup.js'));
  assert.strictEqual(cleanup.LIMITS.CONVERSATION_DAYS, 90);
  assert.match(read('netlify.toml'), /\[functions\."assistant-cleanup"\]\s+schedule = "[^"]+"/);
  const real = global.fetch; const calls = [];
  process.env.SUPABASE_URL = SB; process.env.SUPABASE_SERVICE_KEY = 'svc';
  global.fetch = async (u, o = {}) => { calls.push({ u: String(u), m: o.method }); return { ok: true, status: 200, json: async () => [{ id: 1 }, { id: 2 }] }; };
  try {
    const res = await cleanup.handler();
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(calls.map(c => c.m), ['DELETE', 'DELETE', 'DELETE']);
    assert.ok(calls.every(c => /created_at=lt\./.test(c.u)), 'only by age');
    assert.ok(!calls.some(c => /business_plans/.test(c.u)), 'a saved plan is never deleted by age');
    const conv = new Date(decodeURIComponent(/created_at=lt\.([^&]+)/.exec(calls[0].u)[1]));
    const ageDays = (Date.now() - conv.getTime()) / 86400000;
    assert.ok(ageDays > 89.9 && ageDays < 90.1, 'the cutoff is 90 days');
  } finally { global.fetch = real; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SERVICE_KEY; }
});

test('a new member who lands on "coming soon" is offered the assistant, and the wording matches the business message', () => {
  const cs = read('src/pages/ComingSoon.tsx');
  assert.strictEqual((cs.match(/navigate\("\/assistant"\)/g) || []).length, 2, 'guest and waiting member both get the button');
  assert.match(cs, /נסו את העוזר העסקי בחינם/);
  assert.match(cs, /<h1[^>]*>העוזר העסקי פתוח עכשיו<\/h1>/, 'the screen leads with the open assistant');
  assert.match(cs, /ייפתחו בקרוב/, 'and says plainly that the rest opens later');
  assert.ok(!/מחכים לאישור גישה|שלבי בנייה סופיים/.test(cs), 'no confusing "waiting for approval" wording');
  assert.ok(!/פלטפורמת קורסים מקצועית|פלטפורמת הקורסים/.test(read('src/components/Footer.tsx') + read('src/pages/Auth.tsx') + read('src/hooks/useSiteSettings.ts')), 'no "course platform" wording');
  assert.match(read('src/pages/Auth.tsx'), /aria-label=\{showPassword \? "הסתר סיסמה" : "הצג סיסמה"\}/);
  assert.match(read('src/pages/Pricing.tsx'), /<h1 className="sr-only">/);
});

test('the instructions history: admin-only, written only by a trigger, last 100 kept, loadable into the editor', () => {
  const raw = read('supabase/migrations/20261121010000_assistant_config_history.sql');
  const code = raw.replace(/--.*$/gm, '');
  assert.ok(!/[֐-׿]/.test(raw), 'no Hebrew in SQL that David pastes');
  assert.match(code, /ALTER TABLE public\.assistant_config_history ENABLE ROW LEVEL SECURITY/);
  assert.match(code, /REVOKE ALL ON public\.assistant_config_history FROM anon/);
  assert.match(code, /FOR SELECT USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/);
  assert.ok(!/FOR (INSERT|UPDATE|DELETE|ALL)/i.test(code), 'no write policy: only the trigger writes');
  assert.match(code, /SECURITY DEFINER/);
  assert.match(code, /AFTER INSERT OR UPDATE ON public\.assistant_config/);
  assert.match(code, /LIMIT 100/);
  assert.match(code, /IS NOT DISTINCT FROM OLD\.guidelines/, 'an unchanged save adds no version');
  const ui = read('src/components/admin/AssistantManager.tsx');
  assert.match(ui, /from\("assistant_config_history"\)/);
  assert.match(ui, /טען לעורך/);
  assert.ok(!/assistant_config_history"\)\.(insert|update|delete)/.test(ui), 'the screen never writes the history');
});

test('the changelog exists and covers the launch preparation', () => {
  const log = read('docs/CHANGELOG.he.md');
  for (const part of ['21/11/2026', '19/11/2026', '18/11/2026']) assert.ok(log.includes(part), part);
  assert.match(log, /החלטות שעדיין פתוחות/);
});

test('the link preview carries the business message and our own image, nothing from the template', () => {
  const html = read('index.html');
  assert.ok(!/lovable/i.test(html), 'no template branding in the preview');
  assert.match(html, /<title>הכול בידיים \| הצד העסקי של הקליניקה<\/title>/);
  assert.match(html, /og:image" content="https:\/\/[^"]+\/og-image\.png"/);
  assert.ok(fs.existsSync(path.join(root, 'public/og-image.png')), 'the preview image exists');
  assert.ok(!/סרטונים|פרקטיקה הטיפולית/.test(html), 'the old "videos and professional resources" wording is gone');
});

test('the lib never writes conversations from the browser', () => {
  const lib = read('src/lib/assistant.ts');
  assert.ok(!/from\("assistant_conversations"\)\.(insert|update|upsert)/.test(lib));
  assert.match(lib, /from\("business_plans"\)\.insert/);
});
