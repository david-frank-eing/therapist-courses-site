// google-callback.js — exchanges OAuth code for tokens and stores in Supabase

exports.handler = async (event) => {
  const { code, state: userId, error } = event.queryStringParameters || {};

  if (error) {
    return redirect('/carlos-dashboard/?google_error=' + encodeURIComponent(error));
  }
  if (!code || !userId) {
    return redirect('/carlos-dashboard/?google_error=missing_params');
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri  = process.env.URL + '/.netlify/functions/google-callback';
  const supabaseUrl  = process.env.SUPABASE_URL;
  const supabaseKey  = process.env.SUPABASE_SERVICE_KEY;

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code, client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Get user's Google email
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokens.access_token }
    });
    const info = await infoRes.json();

    // Store tokens in Supabase
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/google_tokens?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        google_email: info.email || '',
        updated_at: new Date().toISOString()
      })
    });

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      throw new Error('Supabase error: ' + err);
    }

    return redirect('/carlos-dashboard/?google_connected=1');
  } catch (e) {
    console.error('google-callback error:', e);
    return redirect('/carlos-dashboard/?google_error=' + encodeURIComponent(e.message));
  }
};

function redirect(url) {
  return { statusCode: 302, headers: { Location: url } };
}
