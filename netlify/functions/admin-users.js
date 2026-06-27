// admin-users.js — user management for admin only
// GET  /.netlify/functions/admin-users         → list all users + tiers
// POST /.netlify/functions/admin-users         → { action:'set_tier', userId, tier }

const ADMIN_EMAIL = 'david1.frank@gmail.com';

exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: cors, body: '' };

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_KEY;

  // Verify JWT + confirm admin
  const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'No token' }, cors);

  let callerEmail;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + jwt }
    });
    const u = await r.json();
    if (!u.id) throw new Error('invalid jwt');
    callerEmail = u.email;
  } catch (e) {
    return json(401, { error: 'Auth failed' }, cors);
  }

  if (callerEmail !== ADMIN_EMAIL) return json(403, { error: 'Forbidden' }, cors);

  // ── GET: list users ──────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const [usersRes, profRes] = await Promise.all([
      fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
      }),
      fetch(`${supabaseUrl}/rest/v1/profiles?select=id,full_name,subscription_tier`, {
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
      })
    ]);

    const { users = [] } = await usersRes.json();
    const profiles       = await profRes.json();
    const profMap = {};
    (Array.isArray(profiles) ? profiles : []).forEach(p => { profMap[p.id] = p; });

    const result = users
      .filter(u => u.email)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(u => ({
        id:         u.id,
        email:      u.email,
        name:       profMap[u.id]?.full_name || '',
        tier:       profMap[u.id]?.subscription_tier || 'free',
        created_at: u.created_at
      }));

    return json(200, { users: result }, cors);
  }

  // ── POST: set tier / invite user ────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Bad JSON' }, cors); }

    // ── set_tier ──
    if (body.action === 'set_tier') {
      const { userId, tier } = body;
      const valid = ['free', 'basic', 'premium', 'vip'];
      if (!userId || !valid.includes(tier)) return json(400, { error: 'Invalid params' }, cors);

      const r = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey, Authorization: 'Bearer ' + serviceKey
        },
        body: JSON.stringify({ subscription_tier: tier })
      });
      if (!r.ok) return json(500, { error: 'DB update failed' }, cors);
      return json(200, { ok: true }, cors);
    }

    // ── invite_user ──
    if (body.action === 'invite_user') {
      const { email, name } = body;
      if (!email || !email.includes('@')) return json(400, { error: 'אימייל לא תקין' }, cors);

      // Check if user already exists — if so, just update their tier
      const existRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=10`, {
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
      });
      const existData = await existRes.json();
      const existingUser = (existData.users || []).find(u => u.email === email);
      if (existingUser) {
        await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${existingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
          body: JSON.stringify({ subscription_tier: 'premium', ...(name ? { full_name: name } : {}) })
        });
        return json(200, {
          ok: true, already_existed: true,
          user: { id: existingUser.id, email, name: name || existingUser.user_metadata?.full_name || '', tier: 'premium' }
        }, cors);
      }

      // Send Supabase invite email
      const invRes = await fetch(`${supabaseUrl}/auth/v1/admin/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey, Authorization: 'Bearer ' + serviceKey
        },
        body: JSON.stringify({ email })
      });
      const invData = await invRes.json();
      if (!invRes.ok) {
        const errMsg = invData.msg || invData.message || invData.error_description || invData.error || JSON.stringify(invData);
        return json(500, { error: errMsg }, cors);
      }

      const newUserId = invData.id;

      // Upsert profile with premium tier
      await fetch(`${supabaseUrl}/rest/v1/profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: serviceKey, Authorization: 'Bearer ' + serviceKey,
          Prefer: 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          id: newUserId,
          full_name: name || '',
          subscription_tier: 'premium'
        })
      });

      return json(200, {
        ok: true,
        user: { id: newUserId, email, name: name || '', tier: 'premium' }
      }, cors);
    }

    return json(400, { error: 'Unknown action' }, cors);
  }

  return json(405, { error: 'Method not allowed' }, cors);
};

function json(status, body, headers = {}) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}
