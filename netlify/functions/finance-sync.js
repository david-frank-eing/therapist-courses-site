// finance-sync.js — the PC side of "finance on the phone" (Carlos finance, plan 6).
// Only Carlos's PC calls this, with X-Finance-Secret. The phone reads/writes the tables directly under RLS.
// POST {action:'pull'}                      → {requests:[{id,cmd,payload,created_at}]}  (marks them running)
// POST {action:'done', id, result:{ok,message}}
// POST {action:'release', ids:[...]}        → puts running ids back to pending (PC ran out of time budget)
// POST {action:'snapshot', data:{v:1,…}}
const crypto = require('crypto');

const MAX_BODY = 2 * 1024 * 1024;
const STALE_PENDING_MIN = 24 * 60;   // the PC was off for a day: the tap is too old to trust
const STALE_RUNNING_MIN = 10;        // the PC died in the middle
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function makeHandler({ env, fetch }) {
  const uid = env.FINANCE_USER_ID || '';
  const out = (statusCode, obj) => ({
    statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj)
  });

  async function rest(method, pathAndQuery, body, extra) {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      method,
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY,
                 'Content-Type': 'application/json', ...extra },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`supabase ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }

  function authorized(event) {
    const secret = Buffer.from(env.FINANCE_SYNC_SECRET || '');
    const got = Buffer.from(String((event.headers || {})['x-finance-secret'] || ''));
    return secret.length >= 32 && got.length === secret.length && crypto.timingSafeEqual(got, secret);
  }

  const ago = min => encodeURIComponent(new Date(Date.now() - min * 60000).toISOString());
  const mine = `finance_requests?user_id=eq.${uid}`;

  async function pull() {
    const now = new Date().toISOString();
    await rest('POST', 'finance_state?on_conflict=user_id', { user_id: uid, pc_seen_at: now },
      { Prefer: 'resolution=merge-duplicates' });
    const expired = { status: 'failed', done_at: now, result: { ok: false, message: 'המחשב לא הגיע לזה בזמן. נסה שוב' } };
    await rest('PATCH', `${mine}&status=eq.pending&created_at=lt.${ago(STALE_PENDING_MIN)}`, expired);
    await rest('PATCH', `${mine}&status=eq.running&picked_at=lt.${ago(STALE_RUNNING_MIN)}`, expired);
    const pending = await rest('GET', `${mine}&status=eq.pending&order=created_at.asc&limit=5&select=id`);
    if (!pending || !pending.length) return { requests: [] };
    const ids = pending.map(r => r.id).filter(id => UUID.test(id)).join(',');
    const taken = await rest('PATCH', `${mine}&status=eq.pending&id=in.(${ids})&select=id,cmd,payload,created_at`,
      { status: 'running', picked_at: now }, { Prefer: 'return=representation' }) || [];
    taken.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return { requests: taken };
  }

  async function done(body) {
    const id = String(body.id || '');
    if (!UUID.test(id)) return out(400, { error: 'bad id' });
    const r = body.result || {};
    const result = { ok: r.ok === true, message: String(r.message || '').slice(0, 500) };
    await rest('PATCH', `${mine}&status=eq.running&id=eq.${id}`,
      { status: result.ok ? 'done' : 'failed', result, done_at: new Date().toISOString() });
    return out(200, { ok: true });
  }

  async function release(body) {
    const ids = body.ids;
    if (!Array.isArray(ids) || ids.length > 20 || !ids.every(id => UUID.test(id))) return out(400, { error: 'bad ids' });
    if (!ids.length) return out(200, { ok: true });
    await rest('PATCH', `${mine}&status=eq.running&id=in.(${ids.join(',')})`, { status: 'pending', picked_at: null });
    return out(200, { ok: true });
  }

  async function snapshot(body) {
    if (!body.data || typeof body.data !== 'object' || body.data.v !== 1) return out(400, { error: 'bad snapshot' });
    const now = new Date().toISOString();
    await rest('POST', 'finance_state?on_conflict=user_id', { user_id: uid, data: body.data, made_at: now, pc_seen_at: now },
      { Prefer: 'resolution=merge-duplicates' });
    return out(200, { ok: true });
  }

  return async function handler(event) {
    if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !UUID.test(uid)) return out(500, { error: 'not configured' });
    if (!authorized(event)) return out(403, { error: 'Forbidden' });
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    if (Buffer.byteLength(raw) > MAX_BODY) return out(413, { error: 'too big' });
    let body;
    try { body = JSON.parse(raw || '{}'); } catch (e) { return out(400, { error: 'bad json' }); }
    try {
      if (body.action === 'pull') return out(200, await pull());
      if (body.action === 'done') return await done(body);
      if (body.action === 'release') return await release(body);
      if (body.action === 'snapshot') return await snapshot(body);
      return out(400, { error: 'unknown action' });
    } catch (e) {
      console.error('[finance-sync]', e.message);
      return out(502, { error: 'supabase failed' });
    }
  };
}

exports.makeHandler = makeHandler;
exports.handler = event => makeHandler({ env: process.env, fetch })(event);
