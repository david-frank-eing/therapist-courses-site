// google-auth.js — redirects user to Google OAuth consent screen
// Called from dashboard Settings: /carlos-dashboard/ → /.netlify/functions/google-auth?user_id=...

exports.handler = async (event) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.URL + '/.netlify/functions/google-callback';

  if (!clientId) {
    return { statusCode: 500, body: 'GOOGLE_CLIENT_ID not configured' };
  }

  const userId = event.queryStringParameters?.user_id || '';
  const scope = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/gmail.readonly'
  ].join(' ');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    state: userId  // pass user_id through OAuth flow
  });

  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  return {
    statusCode: 302,
    headers: { Location: url }
  };
};
