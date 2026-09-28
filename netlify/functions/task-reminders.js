// task-reminders.js
// Netlify scheduled function — runs every 5 minutes
// Defined in netlify.toml: [functions."task-reminders"] schedule = "*/5 * * * *"
// Sends a Telegram message for each pending task of ADMIN_EMAIL whose reminder_at has arrived.
// Already-sent task ids are kept in sync_data (key 'reminders-sent') so nothing is sent twice.
// Any failure is itself reported to Telegram (every automation must alert on failure).

const LOOKBACK_MS = 60 * 60 * 1000; // catch up on runs Netlify skipped, without resending old history

exports.handler = async () => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const adminEmail  = process.env.ADMIN_EMAIL;
  const botToken    = process.env.TELEGRAM_BOT_TOKEN;
  const chatId      = process.env.TELEGRAM_CHAT_ID;

  if (!supabaseUrl || !supabaseKey || !adminEmail || !botToken || !chatId) {
    console.error('[task-reminders] Missing env vars');
    if (botToken && chatId) await sendTelegram(botToken, chatId, '⚠️ תזכורות משימות: חסרים משתני סביבה ב-Netlify');
    return { statusCode: 500, body: 'Missing env vars' };
  }

  const headers = { 'apikey': supabaseKey, 'Authorization': 'Bearer ' + supabaseKey, 'Content-Type': 'application/json' };

  try {
    const uid = await findUserId(supabaseUrl, headers, adminEmail);

    const now = new Date();
    const since = new Date(now.getTime() - LOOKBACK_MS);
    const q = `${supabaseUrl}/rest/v1/tasks?select=id,title,reminder_at,event_id,client_id` +
      `&user_id=eq.${uid}&status=eq.pending` +
      `&reminder_at=lte.${encodeURIComponent(now.toISOString())}` +
      `&reminder_at=gte.${encodeURIComponent(since.toISOString())}`;
    const tRes = await fetch(q, { headers });
    if (!tRes.ok) throw new Error('tasks query HTTP ' + tRes.status + ': ' + await tRes.text());
    const due = await tRes.json();
    if (!due.length) return { statusCode: 200, body: 'Nothing due' };

    const sRes = await fetch(`${supabaseUrl}/rest/v1/sync_data?select=value&user_id=eq.${uid}&key=eq.reminders-sent`, { headers });
    if (!sRes.ok) throw new Error('sync_data query HTTP ' + sRes.status);
    const sRows = await sRes.json();
    const sent = new Set((sRows[0] && Array.isArray(sRows[0].value)) ? sRows[0].value : []);

    const fresh = due.filter(t => !sent.has(t.id));
    if (!fresh.length) return { statusCode: 200, body: 'Already sent' };

    const eventNames = await lookupNames(supabaseUrl, headers, 'events', 'id,contact,title',
      fresh.map(t => t.event_id).filter(Boolean), e => e.contact || e.title);
    const clientNames = await lookupNames(supabaseUrl, headers, 'clients', 'id,full_name',
      fresh.map(t => t.client_id).filter(Boolean), c => c.full_name);

    for (const t of fresh) {
      const time = new Date(t.reminder_at).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' });
      const about = eventNames[t.event_id] ? `\n🎉 אירוע: ${eventNames[t.event_id]}`
                  : clientNames[t.client_id] ? `\n👤 ${clientNames[t.client_id]}` : '';
      await sendTelegram(botToken, chatId, `⏰ תזכורת (${time})\n${t.title}${about}`);
      sent.add(t.id);
    }

    // keep the list short: only the most recent ids matter for de-duplication
    const value = Array.from(sent).slice(-500);
    const up = await fetch(`${supabaseUrl}/rest/v1/sync_data?on_conflict=user_id,key`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify({ user_id: uid, key: 'reminders-sent', value, updated_at: now.toISOString() })
    });
    if (!up.ok) throw new Error('sync_data upsert HTTP ' + up.status + ': ' + await up.text());

    return { statusCode: 200, body: `Sent ${fresh.length}` };
  } catch (err) {
    console.error('[task-reminders]', err);
    await sendTelegram(botToken, chatId, '⚠️ תזכורות משימות נכשלו: ' + (err.message || err));
    return { statusCode: 500, body: String(err.message || err) };
  }
};

async function findUserId(supabaseUrl, headers, email) {
  const r = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, { headers });
  if (!r.ok) throw new Error('auth users HTTP ' + r.status);
  const d = await r.json();
  const u = (d.users || []).find(x => (x.email || '').toLowerCase() === email.toLowerCase());
  if (!u) throw new Error('user not found: ' + email);
  return u.id;
}

async function lookupNames(supabaseUrl, headers, table, select, ids, pick) {
  if (!ids.length) return {};
  const r = await fetch(`${supabaseUrl}/rest/v1/${table}?select=${select}&id=in.(${[...new Set(ids)].join(',')})`, { headers });
  if (!r.ok) return {}; // a missing name only makes the message shorter
  const out = {};
  for (const row of await r.json()) out[row.id] = pick(row);
  return out;
}

async function sendTelegram(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  if (!r.ok) console.error('[task-reminders] telegram HTTP', r.status, await r.text());
}
