// page-view.js
// Counts a visit to /welcome or /assistant (21/11/2026). No cookies, no address, no personal data:
// the table `page_views` gets (time, page, the ?src= tag from the link) and nothing else. The table is closed to the
// public, so this function (service key) is the only way in. It never fails loudly: the page must not care.

const MAX_BODY = 300;
const PAGES = ['welcome', 'assistant'];
const MAX_PER_MINUTE = 300;   // a flood is dropped silently

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj) });

// returns {page, src} or null
function validateView(b) {
  if (!b || typeof b !== 'object') return null;
  const page = String(b.page || '');
  if (!PAGES.includes(page)) return null;
  const src = String(b.src == null ? '' : b.src).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
  return { page, src };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false });
  const raw = event.body || '';
  if (raw.length > MAX_BODY) return json(413, { ok: false });
  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { ok: false }); }
  const v = validateView(body);
  if (!v) return json(400, { ok: false });

  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return json(200, { ok: false });
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  try {
    const minuteAgo = encodeURIComponent(new Date(Date.now() - 60 * 1000).toISOString());
    const r = await fetch(`${url}/rest/v1/page_views?select=id&created_at=gte.${minuteAgo}`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
    const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
    if (m && Number(m[1]) >= MAX_PER_MINUTE) return json(200, { ok: false });
    await fetch(`${url}/rest/v1/page_views`, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify(v) });
  } catch {
    console.error('[page-view] failed');
  }
  return json(200, { ok: true });
};

exports.validateView = validateView;
