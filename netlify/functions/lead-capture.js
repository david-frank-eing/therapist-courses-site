// lead-capture.js — public endpoint for lead form submissions
// POST /.netlify/functions/lead-capture
// Body: { slug, type, name, phone, email?, notes?, date?, style?, attendees?, location?, website? }
// Routes:
//   type='therapy' → inserts into clients (status='lead', source='form')
//   type='event'   → inserts into events  (source='form', status='lead')
//
// This endpoint is open to the whole internet and writes into a user's CRM, so (12/11/2026):
//   - every field is trimmed, length-capped and type-checked here, not only in the form;
//   - "website" is a honeypot: people never see it, bots fill it — answered with a quiet ok;
//   - at most HOURLY_CAP form leads per user per hour, so nobody can flood someone's client list;
//   - database error text is logged, never returned.

const HOURLY_CAP = 15;
const MAX = { slug: 60, name: 80, phone: 25, email: 120, notes: 1000, style: 80, location: 120 };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

const text = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

// Returns { ok: true, lead } or { ok: false, error }. Pure, so it is tested without a network.
function validate(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (text(b.website, 200)) return { ok: true, bot: true };
  const slug = text(b.slug, MAX.slug);
  if (!/^[a-z0-9][a-z0-9-]{1,58}$/i.test(slug)) return { ok: false, error: 'Missing slug' };
  const name = text(b.name, MAX.name);
  if (name.length < 2) return { ok: false, error: 'שם הוא שדה חובה' };
  const phone = text(b.phone, MAX.phone);
  if (!/^[+0-9][0-9 ()\-.]{5,24}$/.test(phone) || phone.replace(/\D/g, '').length < 7) return { ok: false, error: 'מספר הטלפון לא תקין' };
  const email = text(b.email, MAX.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'כתובת המייל לא תקינה' };
  const date = text(b.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'התאריך לא תקין' };
  const attendees = parseInt(b.attendees, 10);
  return { ok: true, lead: {
    slug, name, phone, email, date: date || null,
    type: b.type === 'event' ? 'event' : 'therapy',
    notes: text(b.notes, MAX.notes), style: text(b.style, MAX.style), location: text(b.location, MAX.location),
    attendees: Number.isFinite(attendees) && attendees > 0 && attendees < 100000 ? attendees : null
  } };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });
  if ((event.body || '').length > 8000) return json(413, { error: 'הבקשה גדולה מדי' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const h = { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }

  const v = validate(body);
  if (!v.ok) return json(400, { error: v.error });
  if (v.bot) return json(200, { ok: true });
  const lead = v.lead;

  try {
    // 1. Resolve user_id from slug
    const profRes = await fetch(
      `${supabaseUrl}/rest/v1/booking_profiles?slug=eq.${encodeURIComponent(lead.slug)}&select=user_id&limit=1`, { headers: h });
    const profData = await profRes.json();
    if (!Array.isArray(profData) || !profData.length) return json(404, { error: 'Profile not found' });
    const userId = profData[0].user_id;
    const now = new Date();

    // 2. Flood guard: form leads this user received in the last hour, in both tables
    const since = encodeURIComponent(new Date(now.getTime() - 3600 * 1000).toISOString());
    const recent = await Promise.all(['clients', 'events'].map(async table => {
      const r = await fetch(`${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}&source=eq.form&created_at=gte.${since}&select=id&limit=${HOURLY_CAP}`, { headers: h });
      const rows = r.ok ? await r.json() : [];
      return Array.isArray(rows) ? rows.length : 0;
    }));
    if (recent[0] + recent[1] >= HOURLY_CAP) {
      console.warn('[lead-capture] hourly cap reached for user', userId);
      return json(429, { error: 'התקבלו הרבה פניות בזמן קצר. נסו שוב בעוד שעה' });
    }

    const stamp = now.toISOString();
    if (lead.type === 'event') {
      const insRes = await fetch(`${supabaseUrl}/rest/v1/events`, {
        method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: userId, contact: lead.name, phone: lead.phone, date: lead.date, style: lead.style || null,
          attendees: lead.attendees, location: lead.location || null, notes: lead.notes || null,
          source: 'form', status: 'lead', created_at: stamp, updated_at: stamp
        })
      });
      if (!insRes.ok) throw new Error('events insert ' + insRes.status + ': ' + (await insRes.text()).slice(0, 300));
      return json(200, { ok: true, type: 'event' });
    }

    // Default: therapy → clients table. Same phone again is answered with a quiet ok.
    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/clients?user_id=eq.${userId}&phone=eq.${encodeURIComponent(lead.phone)}&select=id&limit=1`, { headers: h });
    const dupData = await dupRes.json();
    if (Array.isArray(dupData) && dupData.length) return json(200, { ok: true, duplicate: true });

    const insRes = await fetch(`${supabaseUrl}/rest/v1/clients`, {
      method: 'POST', headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId, full_name: lead.name, phone: lead.phone, email: lead.email, notes: lead.notes,
        status: 'lead', source: 'form', created_at: stamp, updated_at: stamp
      })
    });
    if (!insRes.ok) throw new Error('clients insert ' + insRes.status + ': ' + (await insRes.text()).slice(0, 300));
    return json(200, { ok: true, type: 'therapy' });
  } catch (e) {
    console.error('[lead-capture]', e && e.message);
    return json(500, { error: 'לא הצלחנו לשמור את הפרטים. נסו שוב בעוד רגע' });
  }
};

exports.validate = validate;
exports.HOURLY_CAP = HOURLY_CAP;

function json(status, body) {
  return { statusCode: status, headers: cors, body: JSON.stringify(body) };
}
