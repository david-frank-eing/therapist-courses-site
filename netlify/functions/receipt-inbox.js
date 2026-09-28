// receipt-inbox.js — receipts photographed in the dashboard (Carlos finance, SPEC 3.1).
// The phone uploads here; the file is kept in a private Supabase bucket until Carlos's PC has
// processed it (so nothing is lost while the PC is off) and a copy goes to David's Telegram chat.
//
// Phone  (Authorization: Bearer <supabase session token>, must be FINANCE_USER_ID):
//   POST {action:'upload', filename, mime, dataBase64}   → {ok, telegram}
// PC     (X-Finance-Secret, same secret as finance-sync):
//   POST {action:'list'}                                 → {files:[{path, name, created_at}]}
//   POST {action:'get', path}                            → {name, mime, dataBase64}
//   POST {action:'done', path}                           → moves inbox/… to done/…
const crypto = require('crypto');

const BUCKET = 'receipts-inbox';
const MAX_BYTES = 4 * 1024 * 1024;   // Netlify caps the request body at 6MB; base64 adds a third
const TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'application/pdf': '.pdf' };
const SAFE_PATH = /^inbox\/[0-9A-Za-z._-]+$/;

const out = (statusCode, obj) => ({
  statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(obj)
});

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return out(405, { error: 'POST only' });
  const env = process.env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !env.FINANCE_USER_ID) return out(500, { error: 'missing env' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (_) { return out(400, { error: 'bad json' }); }

  const svc = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_KEY };
  const storage = (path, init = {}) => fetch(`${env.SUPABASE_URL}/storage/v1/${path}`, { ...init, headers: { ...svc, ...(init.headers || {}) } });

  try {
    if (body.action === 'upload') {
      const user = await sessionUser(env, event);
      if (!user || user.id !== env.FINANCE_USER_ID) return out(403, { error: 'לא מורשה' });
      const ext = TYPES[body.mime];
      if (!ext) return out(400, { error: 'אפשר להעלות רק תמונה או PDF' });
      const bytes = Buffer.from(String(body.dataBase64 || ''), 'base64');
      if (!bytes.length) return out(400, { error: 'הקובץ ריק' });
      if (bytes.length > MAX_BYTES) return out(413, { error: 'הקובץ גדול מדי (עד 4MB). שלח אותו לקרלוס בטלגרם' });

      await ensureBucket(storage);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const name = `${stamp}_${crypto.randomBytes(3).toString('hex')}${ext}`;
      const up = await storage(`object/${BUCKET}/inbox/${name}`, { method: 'POST', headers: { 'Content-Type': body.mime }, body: bytes });
      if (!up.ok) throw new Error('storage upload ' + up.status + ': ' + (await up.text()).slice(0, 200));

      // the Telegram copy is a convenience: the stored file is what the PC processes
      const telegram = await sendToTelegram(env, bytes, body.mime, ext, String(body.filename || name));
      return out(200, { ok: true, telegram });
    }

    if (!authorizedPc(env, event)) return out(401, { error: 'unauthorized' });

    if (body.action === 'list') {
      await ensureBucket(storage);
      const r = await storage(`object/list/${BUCKET}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: 'inbox', limit: 20, sortBy: { column: 'created_at', order: 'asc' } })
      });
      if (!r.ok) throw new Error('storage list ' + r.status);
      const files = (await r.json()).filter(f => f.id && f.name).map(f => ({ path: 'inbox/' + f.name, name: f.name, created_at: f.created_at }));
      return out(200, { files });
    }

    const path = String(body.path || '');
    if (!SAFE_PATH.test(path)) return out(400, { error: 'bad path' });

    if (body.action === 'get') {
      const r = await storage(`object/${BUCKET}/${path}`);
      if (!r.ok) return out(r.status === 400 || r.status === 404 ? 404 : 502, { error: 'storage get ' + r.status });
      const buf = Buffer.from(await r.arrayBuffer());
      return out(200, { name: path.slice(6), mime: r.headers.get('content-type') || '', dataBase64: buf.toString('base64') });
    }

    if (body.action === 'done') {
      const r = await storage('object/move', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId: BUCKET, sourceKey: path, destinationKey: 'done/' + path.slice(6) })
      });
      if (!r.ok) throw new Error('storage move ' + r.status + ': ' + (await r.text()).slice(0, 200));
      return out(200, { ok: true });
    }

    return out(400, { error: 'unknown action' });
  } catch (err) {
    console.error('[receipt-inbox]', err);
    return out(500, { error: 'תקלה בשמירת הקבלה: ' + String(err.message || err).slice(0, 200) });
  }
};

async function sessionUser(env, event) {
  const auth = String((event.headers || {}).authorization || '');
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: auth } });
  return r.ok ? r.json() : null;
}

function authorizedPc(env, event) {
  const secret = Buffer.from(env.FINANCE_SYNC_SECRET || '');
  const got = Buffer.from(String((event.headers || {})['x-finance-secret'] || ''));
  return secret.length >= 32 && got.length === secret.length && crypto.timingSafeEqual(got, secret);
}

let bucketReady = false;
async function ensureBucket(storage) {
  if (bucketReady) return;
  const r = await storage('bucket', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES })
  });
  // 400/409 = already exists
  if (!r.ok && r.status !== 400 && r.status !== 409) throw new Error('storage bucket ' + r.status + ': ' + (await r.text()).slice(0, 200));
  bucketReady = true;
}

async function sendToTelegram(env, bytes, mime, ext, filename) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return false;
  try {
    const isPhoto = mime.startsWith('image/');
    const form = new FormData();
    form.append('chat_id', env.TELEGRAM_CHAT_ID);
    form.append('caption', '📸 קבלה מהאפליקציה · נשמרה. קרלוס יקרא אותה ויענה כאן');
    form.append(isPhoto ? 'photo' : 'document', new Blob([bytes], { type: mime }), filename.endsWith(ext) ? filename : filename + ext);
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${isPhoto ? 'sendPhoto' : 'sendDocument'}`, { method: 'POST', body: form });
    if (!r.ok) console.error('[receipt-inbox] telegram', r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.error('[receipt-inbox] telegram', e);
    return false;
  }
}
