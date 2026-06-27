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
    try {
      const [usersRes, profRes] = await Promise.all([
        fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
          headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
        }),
        fetch(`${supabaseUrl}/rest/v1/profiles?select=id,full_name,subscription_tier`, {
          headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
        })
      ]);

      const usersText = await usersRes.text();
      const profText  = await profRes.text();

      let usersData = {};
      let profiles  = [];
      try { usersData = JSON.parse(usersText); } catch (_) { return json(500, { error: 'Users parse error: ' + usersText.slice(0, 100) }, cors); }
      try { profiles  = JSON.parse(profText);  } catch (_) { profiles = []; }

      const users = usersData.users || [];
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
    } catch (e) {
      return json(500, { error: 'GET failed: ' + e.message }, cors);
    }
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

      try {
        // Step 1: check if user already exists
        let existingUser = null;
        try {
          const existRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=200`, {
            headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
          });
          if (existRes.ok) {
            const existData = await existRes.json();
            existingUser = (existData.users || []).find(u => u.email === email) || null;
          }
        } catch (_) { /* ignore — if check fails, proceed to invite */ }

        // Step 2: if exists, just upgrade tier
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

        // Step 3: create user account (email confirmed, no password)
        const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
          body: JSON.stringify({
            email,
            email_confirm: true,
            user_metadata: { full_name: name || '' }
          })
        });
        const createText = await createRes.text();
        let createData = {};
        try { createData = JSON.parse(createText); } catch (_) { createData = { error: createText }; }

        if (!createRes.ok) {
          const errMsg = createData.msg || createData.message || createData.error_description || createData.error || `HTTP ${createRes.status}: ${createText.slice(0, 200)}`;
          return json(500, { error: errMsg }, cors);
        }

        const newUserId = createData.id;
        if (!newUserId) return json(500, { error: 'לא התקבל מזהה: ' + createText.slice(0, 200) }, cors);

        // Step 4: wait for Supabase trigger to create the profile row, then update to premium
        // Using 1500ms — trigger can be slow under load
        await new Promise(r => setTimeout(r, 1500));

        // Try PATCH with return=representation so we can detect 0-row updates
        const patchRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${newUserId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Prefer: 'return=representation' },
          body: JSON.stringify({ subscription_tier: 'premium', full_name: name || '' })
        });

        // If PATCH returned [] (no row existed yet) → INSERT it directly
        let patchedRows = [];
        try { patchedRows = await patchRes.json(); } catch (_) { patchedRows = []; }
        if (!Array.isArray(patchedRows) || patchedRows.length === 0) {
          await fetch(`${supabaseUrl}/rest/v1/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Prefer: 'resolution=merge-duplicates' },
            body: JSON.stringify({ id: newUserId, full_name: name || '', subscription_tier: 'premium' })
          });
        }

        // Step 5: generate password-reset link so user can set their password
        let loginLink = null;
        try {
          const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
            body: JSON.stringify({ type: 'recovery', email })
          });
          if (linkRes.ok) {
            const linkData = await linkRes.json();
            loginLink = linkData.action_link || linkData.hashed_token || null;
          }
        } catch (_) { /* generate_link optional */ }

        return json(200, { ok: true, login_link: loginLink, user: { id: newUserId, email, name: name || '', tier: 'premium' } }, cors);

      } catch (e) {
        return json(500, { error: e.message || 'שגיאה לא צפויה' }, cors);
      }
    }

    // ── delete_user ──
    if (body.action === 'delete_user') {
      const { userId } = body;
      if (!userId) return json(400, { error: 'Missing userId' }, cors);
      const r = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
      });
      if (!r.ok) {
        const txt = await r.text();
        return json(500, { error: 'Delete failed: ' + txt.slice(0, 100) }, cors);
      }
      return json(200, { ok: true }, cors);
    }

    return json(400, { error: 'Unknown action' }, cors);
  }

  return json(405, { error: 'Method not allowed' }, cors);
};

function json(status, body, headers = {}) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}
