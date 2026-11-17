// lead-submit.js
// Netlify function behind the /welcome landing page form (18/11/2026).
// The browser posts {name, phone, email, note, consent, source, website} here. The page never writes to Supabase
// directly: the table `leads` has no public policy, so this function (service key) is the only way in.
// It validates, rate-limits, saves, and sends a short Telegram message. A Telegram failure never loses the lead.

const MAX_BODY = 4000;
const PER_CONTACT_PER_DAY = 3;
const TOTAL_PER_HOUR = 30;

function cleanText(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Israeli numbers: digits only, +972 / 972 turned into a leading 0. 9 digits (landline) or 10 (mobile).
function normalizePhone(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.startsWith('972')) d = '0' + d.slice(3);
  return /^0\d{8,9}$/.test(d) ? d : '';
}

function normalizeEmail(v) {
  const e = cleanText(v, 200).toLowerCase();
  return e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : '';
}

// returns {ok:true, lead} or {ok:false, error}  (error is a Hebrew sentence shown next to the form)
function validateLead(b) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'הבקשה לא תקינה' };
  const name = cleanText(b.name, 80);
  if (name.length < 2) return { ok: false, error: 'נא לכתוב שם מלא' };
  const phone = normalizePhone(b.phone);
  if (!phone) return { ok: false, error: 'מספר הטלפון לא נראה תקין' };
  const email = normalizeEmail(b.email);
  if (!email) return { ok: false, error: 'כתובת המייל לא נראית תקינה' };
  if (b.consent !== true) return { ok: false, error: 'כדי להמשיך צריך לאשר יצירת קשר' };
  const note = cleanText(b.note, 500);
  const source = cleanText(b.source, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return { ok: true, lead: { name, phone, email, note, consent: true, consent_at: new Date().toISOString(), source } };
}

const json = (statusCode, obj) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(obj) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'שיטה לא נתמכת' });
  const raw = event.body || '';
  if (raw.length > MAX_BODY) return json(413, { error: 'הבקשה גדולה מדי' });

  let body;
  try { body = JSON.parse(raw); } catch { return json(400, { error: 'הבקשה לא תקינה' }); }

  // honeypot: a hidden field real people never fill. Answer "ok" so a bot learns nothing, and save nothing.
  if (body && typeof body === 'object' && String(body.website || '').trim() !== '') return json(200, { ok: true });

  const v = validateLead(body);
  if (!v.ok) return json(400, { error: v.error });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!supabaseUrl || !supabaseKey) {
    console.error('[lead-submit] Missing Supabase env vars');
    return json(500, { error: 'משהו השתבש, נסו שוב בעוד רגע' });
  }
  const headers = { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' };

  try {
    // rate limits, counted from the table itself
    const dayAgo = encodeURIComponent(new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    const hourAgo = encodeURIComponent(new Date(Date.now() - 3600 * 1000).toISOString());
    // two plain eq filters (no or=(...)): an email may contain commas or brackets that would change the filter
    const samePhone = await count(supabaseUrl, headers, `leads?select=id&created_at=gte.${dayAgo}&phone=eq.${v.lead.phone}`);
    const sameEmail = await count(supabaseUrl, headers, `leads?select=id&created_at=gte.${dayAgo}&email=eq.${encodeURIComponent(v.lead.email)}`);
    if (Math.max(samePhone, sameEmail) >= PER_CONTACT_PER_DAY) return json(429, { error: 'כבר קיבלנו ממך כמה פניות היום. נחזור אליך בקרוב' });
    const lastHour = await count(supabaseUrl, headers, `leads?select=id&created_at=gte.${hourAgo}`);
    if (lastHour >= TOTAL_PER_HOUR) return json(429, { error: 'יש עומס כרגע, נסו שוב מאוחר יותר' });

    const ins = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(v.lead),
    });
    if (!ins.ok) throw new Error('insert HTTP ' + ins.status);
  } catch (err) {
    // never print the visitor's details in the log, only the reason
    console.error('[lead-submit] save failed:', err && err.message);
    if (botToken && chatId) await sendTelegram(botToken, chatId, '⚠️ פנייה מדף הנחיתה לא נשמרה (שגיאת שרת). כדאי לבדוק את Netlify.');
    return json(500, { error: 'משהו השתבש, נסו שוב בעוד רגע' });
  }

  if (botToken && chatId) {
    const l = v.lead;
    const text = `📩 פנייה חדשה מדף הנחיתה\n👤 ${l.name}\n📞 ${l.phone}\n✉️ ${l.email}` + (l.note ? `\n💬 ${l.note}` : '') + (l.source ? `\n🔗 ${l.source}` : '');
    await sendTelegram(botToken, chatId, text);
  }
  return json(200, { ok: true });
};

async function count(supabaseUrl, headers, path) {
  const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
  if (!r.ok) throw new Error('count HTTP ' + r.status);
  const m = /\/(\d+)$/.exec(r.headers.get('content-range') || '');
  return m ? Number(m[1]) : 0;
}

async function sendTelegram(token, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!r.ok) console.error('[lead-submit] telegram HTTP', r.status);
  } catch (e) {
    console.error('[lead-submit] telegram failed');
  }
}

exports.validateLead = validateLead;
exports.normalizePhone = normalizePhone;
exports.normalizeEmail = normalizeEmail;
