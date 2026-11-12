// google-auth.js — starts the Google connection for the signed-in user.
// POST /.netlify/functions/google-auth   with  Authorization: Bearer <supabase session token>
// → { url }  (the Google consent screen)  + a short-lived cookie that google-callback checks.
// The user id comes from the verified session, never from the request. See google-oauth-state.js.

const oauthState = require('../lib/google-oauth-state.cjs');

exports.handler = async (event) => {
  const json = (statusCode, body, extra) => ({
    statusCode, headers: Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, extra || {}),
    body: JSON.stringify(body)
  });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  if (!clientId || !supabaseUrl || !serviceKey) return json(500, { error: 'not configured' });

  const headers = event.headers || {};
  const auth = String(headers.authorization || headers.Authorization || '');
  if (!/^Bearer\s+\S+/i.test(auth)) return json(401, { error: 'not signed in' });

  let userId;
  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: auth } });
    const u = r.ok ? await r.json() : null;
    userId = u && u.id;
  } catch (e) {
    return json(502, { error: 'auth check failed' });
  }
  if (!userId) return json(401, { error: 'not signed in' });

  const { state, cookie } = oauthState.create(process.env, userId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: process.env.URL + '/.netlify/functions/google-callback',
    response_type: 'code',
    scope: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/gmail.readonly'].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state
  });
  return json(200, { url: 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString() }, { 'Set-Cookie': cookie });
};
