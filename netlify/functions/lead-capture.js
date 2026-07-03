// lead-capture.js — public endpoint for lead form submissions
// POST /.netlify/functions/lead-capture
// Body: { slug, type, name, phone, email?, notes?, date?, style?, attendees?, location? }
// Routes:
//   type='therapy' → inserts into clients (status='lead', source='form')
//   type='event'   → inserts into events  (source='form', status='lead')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;
  const h = {
    'Content-Type': 'application/json',
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey
  };

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }); }

  const { slug, type, name, phone, email, notes, date, style, attendees, location } = body;

  if (!slug)  return json(400, { error: 'Missing slug' });
  if (!name)  return json(400, { error: 'שם הוא שדה חובה' });
  if (!phone) return json(400, { error: 'טלפון הוא שדה חובה' });

  // 1. Resolve user_id from slug
  const profRes = await fetch(
    `${supabaseUrl}/rest/v1/booking_profiles?slug=eq.${encodeURIComponent(slug)}&select=user_id&limit=1`,
    { headers: h }
  );
  const profData = await profRes.json();
  if (!Array.isArray(profData) || !profData.length) {
    return json(404, { error: 'Profile not found' });
  }
  const userId = profData[0].user_id;
  const now    = new Date().toISOString();

  // 2. Route by type
  if (type === 'event') {
    // Insert into events table
    const insRes = await fetch(`${supabaseUrl}/rest/v1/events`, {
      method: 'POST',
      headers: { ...h, Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id:   userId,
        contact:   name,
        phone:     phone,
        date:      date || null,
        style:     style || null,
        attendees: attendees ? parseInt(attendees, 10) : null,
        location:  location || null,
        notes:     notes || null,
        source:    'form',
        status:    'lead',
        created_at: now,
        updated_at: now
      })
    });
    if (!insRes.ok) {
      const e = await insRes.text();
      return json(500, { error: 'DB error: ' + e.slice(0, 150) });
    }
    return json(200, { ok: true, type: 'event' });
  }

  // Default: type === 'therapy' → clients table
  // Check for duplicate by phone
  const dupRes = await fetch(
    `${supabaseUrl}/rest/v1/clients?user_id=eq.${userId}&phone=eq.${encodeURIComponent(phone)}&select=id&limit=1`,
    { headers: h }
  );
  const dupData = await dupRes.json();
  if (Array.isArray(dupData) && dupData.length) {
    // Already exists — return ok silently (don't tell spammers)
    return json(200, { ok: true, duplicate: true });
  }

  const insRes = await fetch(`${supabaseUrl}/rest/v1/clients`, {
    method: 'POST',
    headers: { ...h, Prefer: 'return=minimal' },
    body: JSON.stringify({
      user_id:    userId,
      full_name:  name,
      phone:      phone,
      email:      email || '',
      notes:      notes || '',
      status:     'lead',
      source:     'form',
      created_at: now,
      updated_at: now
    })
  });
  if (!insRes.ok) {
    const e = await insRes.text();
    return json(500, { error: 'DB error: ' + e.slice(0, 150) });
  }
  return json(200, { ok: true, type: 'therapy' });
};

function json(status, body) {
  return { statusCode: status, headers: cors, body: JSON.stringify(body) };
}
