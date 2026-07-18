// google-scheduled-refresh.js
// Netlify scheduled function — runs daily at 07:00 Israel time (04:00 UTC)
// Defined in netlify.toml: [functions."google-scheduled-refresh"] schedule = "0 4 * * *"
// Refreshes Google Calendar + Gmail for ALL users who have connected Google accounts

exports.handler = async () => {
  const supabaseUrl   = process.env.SUPABASE_URL;
  const supabaseKey   = process.env.SUPABASE_SERVICE_KEY;
  const clientId      = process.env.GOOGLE_CLIENT_ID;
  const clientSecret  = process.env.GOOGLE_CLIENT_SECRET;

  if (!supabaseUrl || !supabaseKey || !clientId || !clientSecret) {
    console.error('[scheduled-refresh] Missing env vars');
    return { statusCode: 500, body: 'Missing env vars' };
  }

  // Get all users who have Google tokens
  const tokRes = await fetch(
    `${supabaseUrl}/rest/v1/google_tokens?select=user_id,access_token,refresh_token,expires_at&order=updated_at.desc`,
    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
  );
  const allTokens = await tokRes.json();
  if (!Array.isArray(allTokens) || !allTokens.length) {
    console.log('[scheduled-refresh] No users with Google tokens');
    return { statusCode: 200, body: 'No users' };
  }

  // Deduplicate by user_id (take first/freshest per user)
  const seen = new Set();
  const tokens = allTokens.filter(t => { if (seen.has(t.user_id)) return false; seen.add(t.user_id); return true; });

  const tz = 'Asia/Jerusalem';
  const nowDate = new Date();
  const todayStr    = nowDate.toLocaleDateString('en-CA', { timeZone: tz });
  const tomorrowStr = new Date(nowDate.getTime() + 864e5).toLocaleDateString('en-CA', { timeZone: tz });

  const results = await Promise.allSettled(tokens.map(tok => refreshUser(tok, {
    supabaseUrl, supabaseKey, clientId, clientSecret, tz, todayStr, tomorrowStr
  })));

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') console.log(`[scheduled-refresh] user ${tokens[i].user_id}: ok`);
    else console.error(`[scheduled-refresh] user ${tokens[i].user_id}: FAILED —`, r.reason);
  });

  return { statusCode: 200, body: JSON.stringify({ refreshed: tokens.length }) };
};

async function refreshUser(tok, { supabaseUrl, supabaseKey, clientId, clientSecret, tz, todayStr, tomorrowStr }) {
  const { user_id } = tok;
  let { access_token, refresh_token, expires_at } = tok;

  // Refresh OAuth token if expired (or expiring in <60s)
  if (new Date(expires_at) <= new Date(Date.now() + 60000)) {
    const refRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token, grant_type: 'refresh_token' })
    });
    const ref = await refRes.json();
    if (!ref.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(ref));
    access_token = ref.access_token;
    const newExpiry = new Date(Date.now() + (ref.expires_in || 3600) * 1000).toISOString();
    await fetch(`${supabaseUrl}/rest/v1/google_tokens?user_id=eq.${user_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey },
      body: JSON.stringify({ access_token, expires_at: newExpiry, updated_at: new Date().toISOString() })
    });
  }

  const authH = { Authorization: 'Bearer ' + access_token };

  // Calendar
  const timeMin = new Date(todayStr + 'T00:00:00+03:00').toISOString();
  const timeMax = new Date(tomorrowStr + 'T23:59:59+03:00').toISOString();
  const calRes  = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime&timeZone=${encodeURIComponent(tz)}`,
    { headers: authH }
  );
  const calData = await calRes.json();
  const allItems = calData.items || [];

  const _mapEvent = (ev, dateStr) => ({
    title: ev.summary || '(ללא שם)',
    time: ev.start?.dateTime
      ? new Date(ev.start.dateTime).toLocaleTimeString('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
      : 'כל היום',
    end_time: ev.end?.dateTime
      ? new Date(ev.end.dateTime).toLocaleTimeString('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
      : null,
    location: ev.location || '',
    date: dateStr
  });

  const calendarEvents  = allItems.filter(ev => (ev.start?.dateTime || ev.start?.date || '').slice(0, 10) === todayStr).map(ev => _mapEvent(ev, todayStr));
  const tomorrowEvents  = allItems.filter(ev => (ev.start?.dateTime || ev.start?.date || '').slice(0, 10) === tomorrowStr).map(ev => _mapEvent(ev, tomorrowStr));

  // Gmail
  let emailSummary = '';
  const gmailRes  = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread%20newer_than%3A7d&maxResults=50',
    { headers: authH }
  );
  const gmailData = await gmailRes.json();
  if (!gmailData.error) {
    const messages = gmailData.messages || [];
    const count    = messages.length;
    const countLabel = count >= 50 ? `${count}+` : String(count);
    if (messages.length > 0) {
      const subjects = await Promise.all(
        messages.slice(0, 5).map(async m => {
          const mRes  = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers: authH });
          const mData = await mRes.json();
          const headers = mData.payload?.headers || [];
          const subject  = headers.find(h => h.name === 'Subject')?.value || '(ללא נושא)';
          const from     = headers.find(h => h.name === 'From')?.value || '';
          const fromName = from.replace(/<.*>/, '').trim() || from;
          return `• ${fromName}: ${subject}`;
        })
      );
      const today = new Date().toLocaleDateString('he-IL', { timeZone: tz });
      emailSummary = `📧 מיילים לא נקראים — עדכון ${today}\n━━━━━━━━━━━━━━━━━━━━━━\n• ${countLabel} מיילים לא נקראים (7 ימים אחרונים)\n${subjects.join('\n')}`;
    } else {
      emailSummary = '📧 אין מיילים לא נקראים חדשים';
    }
  }

  // Urgent tasks for briefing
  const tasksRes = await fetch(
    `${supabaseUrl}/rest/v1/tasks?user_id=eq.${user_id}&status=eq.pending&priority=eq.urgent&select=title`,
    { headers: { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey } }
  );
  const urgentTasks = await tasksRes.json().catch(() => []);

  // Build briefing
  const now       = new Date().toISOString();
  const todayHe   = new Date().toLocaleDateString('he-IL', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' });
  const calSection    = calendarEvents.length > 0
    ? calendarEvents.map(e => `• ${e.time}${e.end_time ? '–' + e.end_time : ''} — ${e.title}${e.location ? ' 📍' + e.location : ''}`).join('\n')
    : '• אין אירועים מתוזמנים';
  const urgentSection = urgentTasks.length > 0
    ? urgentTasks.map(t => `• ⚠️ ${t.title}`).join('\n')
    : '• אין משימות דחופות';
  const emailLine = emailSummary ? emailSummary.split('\n').slice(0, 3).join('\n') : '• אין מיילים חדשים';
  const briefingText = `🌅 בריפינג בוקר — ${todayHe}\n━━━━━━━━━━━━━━\n📅 היומן היום\n${calSection}\n\n⚠️ דחוף לטיפול\n${urgentSection}\n\n📧 מיילים\n${emailLine}`;

  const _upsert = body => fetch(`${supabaseUrl}/rest/v1/sync_data?on_conflict=user_id,key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify(body)
  });

  await Promise.all([
    _upsert({ user_id, key: 'calendar-today',    value: { date: todayStr, events: calendarEvents, updated_at: now }, updated_at: now }),
    _upsert({ user_id, key: 'email-summary',     text_value: emailSummary, updated_at: now }),
    _upsert({ user_id, key: 'morning-briefing',  text_value: briefingText, updated_at: now }),
    _upsert({ user_id, key: 'calendar-upcoming', value: { events: tomorrowEvents, updated_at: now }, updated_at: now }),
    _upsert({ user_id, key: 'last-refresh',      value: {
      date: todayStr,
      time: new Date().toLocaleTimeString('he-IL', { timeZone: tz, hour: '2-digit', minute: '2-digit' }),
      status: 'success'
    }, updated_at: now })
  ]);
}
