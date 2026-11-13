// tests-finance/isolation.live.cjs — a LIVE check against the real database. Not part of the automatic tests.
//
// Question it answers: can one user read or change another user's data?
// It signs in as two throw-away test users (A and B), lets B create one marker row in each table,
// and then tries, as A, to read / change / delete B's rows and to create rows in B's name.
// Every attempt must fail or return nothing. The marker rows are deleted at the end.
//
// How to run (after two test users exist and are approved in "ניהול משתמשים"):
//   1. create  %USERPROFILE%\.carlos\isolation.env  with four lines (outside the repository on purpose):
//        ISO_A_EMAIL=...   ISO_A_PASSWORD=...   ISO_B_EMAIL=...   ISO_B_PASSWORD=...
//   2. node tests-finance/isolation.live.cjs
// Use test accounts only: never the admin account, never a real person's account.
const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const site = readEnv(path.join(__dirname, '..', '.env'));
const cred = Object.assign(readEnv(path.join(require('node:os').homedir(), '.carlos', 'isolation.env')), process.env);
const URL = site.VITE_SUPABASE_URL, KEY = site.VITE_SUPABASE_PUBLISHABLE_KEY;

// table → a minimal row B can create (user_id is added). Tables B cannot write to are still read-tested.
const TABLES = {
  tasks: { title: 'isolation-test marker' },
  journal_entries: { date: '2000-01-01', body: 'isolation-test marker' },
  content_items: { title: 'isolation-test marker' },
  events: { title: 'isolation-test marker' },
  time_log: { label: 'isolation-test marker', seconds: 1 },
  sync_data: { key: 'isolation-test', text_value: 'marker' },
  clients: { full_name: 'isolation-test marker', phone: '0500000000' },
};
const READ_ONLY = ['google_tokens', 'finance_state', 'finance_requests', 'booking_notifs', 'appointments', 'habit_definitions',
  'habits_log', 'weekly_plan', 'daily_plan', 'publishing_log', 'dashboard_config', 'usage_events'];

async function signIn(email, password) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`sign-in failed for ${email}: ${error ? error.message : 'no user'}`);
  return { sb, id: data.user.id, email };
}

(async () => {
  for (const k of ['ISO_A_EMAIL', 'ISO_A_PASSWORD', 'ISO_B_EMAIL', 'ISO_B_PASSWORD']) {
    if (!cred[k]) { console.error(`missing ${k} (see the top of this file)`); process.exit(2); }
  }
  if (!URL || !KEY) { console.error('missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env'); process.exit(2); }
  const A = await signIn(cred.ISO_A_EMAIL, cred.ISO_A_PASSWORD);
  const B = await signIn(cred.ISO_B_EMAIL, cred.ISO_B_PASSWORD);
  if (A.id === B.id) { console.error('A and B are the same user'); process.exit(2); }

  const leaks = [], notes = [], markers = [];
  const leak = (table, what) => { leaks.push(`${table}: ${what}`); console.log(`  LEAK  ${table}: ${what}`); };

  for (const [table, row] of Object.entries(TABLES)) {
    // B creates a marker row of his own
    const made = await B.sb.from(table).insert(Object.assign({ user_id: B.id }, row)).select('id').maybeSingle();
    const markerId = made.data && made.data.id;
    if (markerId) markers.push([table, markerId]);
    else notes.push(`${table}: B could not create a marker (${made.error ? made.error.message.slice(0, 80) : 'no row'}), read-only checks only`);

    // A reads B's rows
    const read = await A.sb.from(table).select('*').eq('user_id', B.id).limit(5);
    if (read.data && read.data.length) leak(table, `A read ${read.data.length} row(s) of B`);
    // A creates a row in B's name
    const forged = await A.sb.from(table).insert(Object.assign({ user_id: B.id }, row)).select('id').maybeSingle();
    if (forged.data && forged.data.id) { leak(table, 'A created a row in B\'s name'); markers.push([table, forged.data.id]); }
    if (markerId) {
      // A changes / deletes B's marker; then B checks it is intact
      await A.sb.from(table).update({ user_id: A.id }).eq('id', markerId);
      await A.sb.from(table).delete().eq('id', markerId);
      const still = await B.sb.from(table).select('id,user_id').eq('id', markerId).maybeSingle();
      if (!still.data) leak(table, 'A deleted B\'s row');
      else if (still.data.user_id !== B.id) leak(table, 'A took over B\'s row');
    }
    console.log(`  ${table}: checked`);
  }
  for (const table of READ_ONLY) {
    const read = await A.sb.from(table).select('*').eq('user_id', B.id).limit(5);
    if (read.data && read.data.length) leak(table, `A read ${read.data.length} row(s) of B`);
    console.log(`  ${table}: read checked${read.error ? ' (' + read.error.message.slice(0, 60) + ')' : ''}`);
  }
  // profiles: A must not read B's profile, nor make himself admin / premium / finance
  const prof = await A.sb.from('profiles').select('*').eq('id', B.id);
  if (prof.data && prof.data.length) leak('profiles', 'A read B\'s profile');
  await A.sb.from('profiles').update({ is_admin: true, finance_enabled: true, subscription_tier: 'vip' }).eq('id', A.id);
  const mine = await A.sb.from('profiles').select('*').eq('id', A.id).maybeSingle();
  if (mine.data && mine.data.is_admin === true) leak('profiles', 'A made himself admin');
  if (mine.data && mine.data.finance_enabled === true) leak('profiles', 'A switched finance on for himself');
  if (mine.data && mine.data.subscription_tier === 'vip') leak('profiles', 'A upgraded his own tier');
  console.log('  profiles: checked');

  // clean up: each marker is removed by whoever owns it
  for (const [table, id] of markers) { await B.sb.from(table).delete().eq('id', id); await A.sb.from(table).delete().eq('id', id); }

  console.log('');
  notes.forEach(n => console.log('note: ' + n));
  if (leaks.length) { console.log(`\nFAILED: ${leaks.length} leak(s)`); process.exit(1); }
  console.log(`\nPASSED: ${Object.keys(TABLES).length + READ_ONLY.length + 1} tables, user A could not read or change anything of user B`);
})().catch(e => { console.error('could not run: ' + e.message); process.exit(2); });
