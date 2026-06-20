// google-data.js — fetches Calendar events + Gmail summary for a user
// Called from dashboard: /.netlify/functions/google-data
// Requires: Authorization: Bearer <supabase_jwt>

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const clientSecret= process.env.GOOGLE_CLIENT_SECRET;

  // Verify Supabase JWT and get user_id
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json(401, { error: 'No token' }, corsHeaders);

  let userId;
  try {
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + jwt }
    });
    const userData = await userRes.json();
    if (!userData.id) throw new Error('Invalid JWT');
    userId = userData.id;
  } catch (e) {
    return json(401, { error: 'Auth failed: ' + e.message }, corsHeaders);
  }

  // Fetch tokens from Supabase
  const tokRes = await fetch(`${supabaseUrl}/rest/v1/google_tokens?user_id=eq.${userId}`, {
    headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey }
  });
  const toks = await tokRes.json();
  if (!toks.length) return json(200, { connected: false }, corsHeaders);

  let { access_token, refresh_token, expires_at } = toks[0];

  // Refresh token if expired
  if (new Date(expires_at) <= new Date(Date.now() + 60000)) {
    try {
      const refRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          refresh_token, grant_type: 'refresh_token'
        })
      });
      const ref = await refRes.json();
      if (ref.access_token) {
        access_token = ref.access_token;
        const newExpiry = new Date(Date.now() + (ref.expires_in || 3600) * 1000).toISOString();
        await fetch(`${supabaseUrl}/rest/v1/google_tokens?user_id=eq.${userId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey
          },
          body: JSON.stringify({ access_token, expires_at: newExpiry, updated_at: new Date().toISOString() })
        });
      }
    } catch (e) {
      console.error('Token refresh error:', e);
    }
  }

  const authH = { Authorization: 'Bearer ' + access_token };

  // Fetch today's calendar events (Israel timezone)
  let calendarEvents = [];
  try {
    const now = new Date();
    const tz = 'Asia/Jerusalem';
    const todayStr = now.toLocaleDateString('en-CA', { timeZone: tz });
    const timeMin = new Date(todayStr + 'T00:00:00').toISOString();
    const timeMax = new Date(todayStr + 'T23:59:59').toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&timeZone=${encodeURIComponent(tz)}`,
      { headers: authH }
    );
    const calData = await calRes.json();
    calendarEvents = (calData.items || []).map(ev => ({
      title: ev.summary || '(ללא שם)',
      time: ev.start?.dateTime
        ? new Date(ev.start.dateTime).toLocaleTimeString('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
        : 'כל היום',
      end_time: ev.end?.dateTime
        ? new Date(ev.end.dateTime).toLocaleTimeString('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
        : null,
      location: ev.location || '',
      date: todayStr
    }));
  } catch (e) {
    console.error('Calendar fetch error:', e);
  }

  // Fetch unread Gmail summary
  let emailSummary = '';
  try {
    const gmailRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread+newer_than:1d&maxResults=20',
      { headers: authH }
    );
    const gmailData = await gmailRes.json();
    const messages = gmailData.messages || [];
    const count = gmailData.resultSizeEstimate || messages.length;

    if (messages.length > 0) {
      // Fetch subject lines of first 5
      const subjects = await Promise.all(
        messages.slice(0, 5).map(async m => {
          const mRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
            { headers: authH }
          );
          const mData = await mRes.json();
          const headers = mData.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '(ללא נושא)';
          const from = headers.find(h => h.name === 'From')?.value || '';
          const fromName = from.replace(/<.*>/, '').trim() || from;
          return `• ${fromName}: ${subject}`;
        })
      );
      const today = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' });
      emailSummary = `📧 מיילים לא נקראים — עדכון ${today}\n━━━━━━━━━━━━━━━━━━━━━━\n• ${count} מיילים לא נקראים\n${subjects.join('\n')}`;
    } else {
      emailSummary = '📧 אין מיילים לא נקראים חדשים';
    }
  } catch (e) {
    console.error('Gmail fetch error:', e);
  }

  // Fetch urgent tasks for briefing
  let urgentTasks = [];
  try {
    const tasksRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?user_id=eq.${userId}&status=eq.pending&priority=eq.urgent&select=title`,
      { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
    );
    urgentTasks = await tasksRes.json();
  } catch(e) { console.error('Tasks fetch error:', e); }

  // Build morning briefing
  const now = new Date().toISOString();
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const todayHe = new Date().toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: 'numeric', month: 'numeric' });

  const calSection = calendarEvents.length > 0
    ? calendarEvents.map(e => `• ${e.time}${e.end_time ? '–' + e.end_time : ''} — ${e.title}${e.location ? ' 📍' + e.location : ''}`).join('\n')
    : '• אין אירועים מתוזמנים';

  const urgentSection = urgentTasks.length > 0
    ? urgentTasks.map(t => `• ⚠️ ${t.title}`).join('\n')
    : '• אין משימות דחופות';

  const emailLine = emailSummary
    ? emailSummary.split('\n').slice(0, 3).join('\n')
    : '• אין מיילים חדשים';

  const briefingText = `🌅 בריפינג בוקר — ${todayHe}
━━━━━━━━━━━━━━
📅 היומן היום
${calSection}

⚠️ דחוף לטיפול
${urgentSection}

📧 מיילים
${emailLine}`;

  await Promise.all([
    fetch(`${supabaseUrl}/rest/v1/sync_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId, key: 'calendar-today',
        value: { date: todayStr, events: calendarEvents, updated_at: now },
        updated_at: now
      })
    }),
    fetch(`${supabaseUrl}/rest/v1/sync_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId, key: 'email-summary',
        text_value: emailSummary, updated_at: now
      })
    }),
    fetch(`${supabaseUrl}/rest/v1/sync_data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'apikey': supabaseKey,
        'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        user_id: userId, key: 'morning-briefing',
        text_value: briefingText, updated_at: now
      })
    })
  ]);

  return json(200, {
    connected: true,
    calendar: calendarEvents,
    emailSummary,
    updatedAt: now
  }, corsHeaders);
};

function json(status, body, headers = {}) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  };
}
