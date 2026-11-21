// assistant-cleanup.js
// Runs once a day (see netlify.toml). Keeps the promise made to visitors: a conversation with the business assistant
// is deleted after 90 days. A plan the person SAVED (table business_plans) is not touched: it is his, and he can
// delete it himself. Also trims the technical tables, which hold no personal data.

const CONVERSATION_DAYS = 90;
const USAGE_DAYS = 3;
const VIEWS_DAYS = 180;

const daysAgo = (n) => encodeURIComponent(new Date(Date.now() - n * 24 * 3600 * 1000).toISOString());

exports.handler = async () => {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('[assistant-cleanup] Missing Supabase env vars'); return { statusCode: 500, body: 'missing env' }; }
  const headers = { apikey: key, Authorization: 'Bearer ' + key, Prefer: 'return=representation' };
  const result = {};
  for (const [table, days] of [['assistant_conversations', CONVERSATION_DAYS], ['assistant_usage', USAGE_DAYS], ['page_views', VIEWS_DAYS]]) {
    try {
      const r = await fetch(`${url}/rest/v1/${table}?select=id&created_at=lt.${daysAgo(days)}`, { method: 'DELETE', headers });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      result[table] = (await r.json()).length;
    } catch (e) {
      console.error(`[assistant-cleanup] ${table} failed:`, e && e.message);
      result[table] = 'failed';
    }
  }
  console.log('[assistant-cleanup] deleted', JSON.stringify(result));
  return { statusCode: 200, body: JSON.stringify(result) };
};

exports.LIMITS = { CONVERSATION_DAYS, USAGE_DAYS, VIEWS_DAYS };
