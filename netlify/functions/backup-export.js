// backup-export.js — nightly backup of Carlos's cloud data, pulled by the PC
// (H:\carlos\scripts\backup_cloud.py). Only the PC calls this, with X-Finance-Secret.
// POST {action:'tables'}                          → {tables:[...]}
// POST {action:'rows', table, offset}             → {rows:[...], more}   (500 per page, by id)
// POST {action:'files'}                           → {files:[{bucket, path, size, updated_at}]}
// POST {action:'file-url', bucket, path}          → {url}   (signed for 10 minutes; files can exceed the 6MB response cap)
// POST {action:'restore-row', table, row}         → upserts one row by id (used by the restore check and by a real restore)
const crypto = require('crypto');

const PAGE = 500;   // long journal/content rows: keep a page well under the 6MB response cap
// every table that holds data David entered. Left out on purpose:
//  google_tokens  — live access tokens; reconnecting Google recreates them
//  sync_data      — calendar/email/briefing snapshots, rebuilt from Google every day
//  finance_state / finance_requests — the PC's finance snapshot and tap queue; the source is on the PC
//  usage_events   — click analytics; changes every day and isn't worth restoring
const TABLES = [
  'tasks', 'habit_definitions', 'habits_log', 'weekly_plan', 'daily_plan', 'time_log', 'content_items',
  'clients', 'events', 'journal_entries', 'dashboard_config', 'availability_slots',
  'appointments', 'booking_notifs', 'booking_profiles', 'publishing_log', 'playbooks'
];
const BUCKETS = ['content-creatives', 'receipts-inbox'];

const out = (statusCode, obj) => ({
  statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj)
});

function authorized(env, event) {
  const secret = Buffer.from(env.FINANCE_SYNC_SECRET || '');
  const got = Buffer.from(String((event.headers || {})['x-finance-secret'] || ''));
  return secret.length >= 32 && got.length === secret.length && crypto.timingSafeEqual(got, secret);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  const env = process.env;
  if (!authorized(env, event)) return out(401, { error: 'unauthorized' });
  const uid = env.FINANCE_USER_ID;
  const svc = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY };
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return out(400, { error: 'bad json' }); }

  try {
    if (body.action === 'tables') return out(200, { tables: TABLES });

    if (body.action === 'rows') {
      if (!TABLES.includes(body.table)) return out(400, { error: 'unknown table' });
      const offset = Math.max(0, parseInt(body.offset, 10) || 0);
      // order by id so pages are stable; Range asks PostgREST for exactly one page.
      // A table keyed only by user_id (one row per user) has no id column: then no order is needed.
      const page = order => fetch(`${env.SUPABASE_URL}/rest/v1/${body.table}?select=*&user_id=eq.${uid}${order}`, {
        headers: { ...svc, Range: `${offset}-${offset + PAGE - 1}`, 'Range-Unit': 'items', Prefer: 'count=exact' }
      });
      let r = await page('&order=id.asc');
      let text = await r.text();
      if (!r.ok && /column [\w."]*id[" ]* does not exist/i.test(text) && !/user_id/.test(text)) {
        r = await page('');
        text = await r.text();
      }
      if (!r.ok) {
        // a table that doesn't exist on this database is reported, not fatal
        if (r.status === 404 || /does not exist|Could not find the table/i.test(text)) return out(200, { rows: [], more: false, missing: true });
        throw new Error(`${body.table} ${r.status}: ${text.slice(0, 200)}`);
      }
      const rows = JSON.parse(text || '[]');
      const total = parseInt(String(r.headers.get('content-range') || '').split('/')[1], 10);
      return out(200, { rows, total: isNaN(total) ? null : total, more: !isNaN(total) && offset + rows.length < total });
    }

    if (body.action === 'files') {
      const files = [];
      for (const bucket of BUCKETS) await listBucket(env, svc, bucket, '', files);
      return out(200, { files });
    }

    if (body.action === 'file-url') {
      if (!BUCKETS.includes(body.bucket) || !/^[\w\-./ ]+$/.test(String(body.path || '')) || String(body.path).includes('..'))
        return out(400, { error: 'bad file' });
      const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/${body.bucket}/${encodeURI(body.path)}`, {
        method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 600 })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.signedURL) throw new Error('sign ' + r.status);
      return out(200, { url: `${env.SUPABASE_URL}/storage/v1${j.signedURL}` });
    }

    if (body.action === 'restore-row') {
      if (!TABLES.includes(body.table)) return out(400, { error: 'unknown table' });
      const row = body.row;
      if (!row || typeof row !== 'object' || !row.id || row.user_id !== uid) return out(400, { error: 'bad row' });
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${body.table}?on_conflict=id`, {
        method: 'POST', headers: { ...svc, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(row)
      });
      if (!r.ok) throw new Error(`restore ${body.table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return out(200, { ok: true });
    }

    return out(400, { error: 'unknown action' });
  } catch (err) {
    console.error('[backup-export]', err);
    return out(500, { error: String(err.message || err).slice(0, 300) });
  }
};

// Storage lists one folder level at a time: entries without an id are folders
async function listBucket(env, svc, bucket, prefix, files, depth = 0) {
  if (depth > 4) return;
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/list/${bucket}`, {
      method: 'POST', headers: { ...svc, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } })
    });
    if (r.status === 400 || r.status === 404) return;   // bucket doesn't exist (yet)
    if (!r.ok) throw new Error(`list ${bucket} ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      const path = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id) files.push({ bucket, path, size: (it.metadata && it.metadata.size) || null, updated_at: it.updated_at });
      else await listBucket(env, svc, bucket, path, files, depth + 1);
    }
    if (items.length < 1000) return;
  }
}
