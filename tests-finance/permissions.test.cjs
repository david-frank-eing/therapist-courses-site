// tests-finance/permissions.test.cjs — the permissions table (tier_access) and the places that must follow it
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('migration: admin is always allowed, a missing row falls back to premium/vip, only admins write', () => {
  const sql = read('supabase/migrations/20261114010000_tier_access.sql');
  assert.match(sql, /p\.is_admin = true/);
  assert.match(sql, /IN \('premium', 'vip'\)/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /FOR ALL USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/);
  // today's behaviour is seeded, so running it changes nothing by itself
  for (const [tier, v] of [['free', 'false'], ['basic', 'false'], ['premium', 'true'], ['vip', 'true']]) {
    assert.match(sql, new RegExp("'paid_tools', '" + tier + "', +" + v));
  }
});

test('the site and the dashboard gate use the table, not a hard-coded tier list', () => {
  for (const f of ['src/pages/CRM.tsx', 'src/pages/ClientDetail.tsx', 'src/pages/Home.tsx', 'src/components/Header.tsx', 'src/pages/ComingSoon.tsx']) {
    const s = read(f);
    assert.ok(s.includes('hasPaidTools') || s.includes('can("'), f + ' should ask the permissions (can / hasPaidTools)');
    assert.ok(!/\['premium', ?'vip'\]\.includes|\["premium", "vip"\]\.includes/.test(s), f + ' still hard-codes premium/vip');
  }
  assert.match(read('public/carlos-dashboard/index.html'), /from\('tier_access'\)/);
});

test('an admin is never bounced to the dashboard while the admin check is still loading', () => {
  assert.match(read('src/pages/ComingSoon.tsx'), /!isLoading && !isAdmin/);
  assert.match(read('src/App.tsx'), /MAINTENANCE_MODE && isLoading/);
});

test('the dashboard links back to the therapist site', () => {
  assert.match(read('public/carlos-dashboard/index.html'), /href="\/home"[^>]*>→ חזרה למרחב למטפלים/);
});

test('home tiles show no numbers', () => {
  const s = read('src/pages/Home.tsx');
  assert.ok(!/it\.count|courseCount|clientCount/.test(s));
});

test('tier features: four tools, today\'s behaviour seeded, admin always allowed, every tool table mapped', () => {
  const sql = read('supabase/migrations/20261115010000_tier_features.sql');
  assert.match(sql, /p\.is_admin = true/);
  // the new rows copy the combined row, so running it changes nothing
  assert.match(sql, /COALESCE\(pt\.allowed, t\.tier IN \('premium', 'vip'\)\)/);
  assert.match(sql, /ON CONFLICT \(feature, tier\) DO NOTHING/);
  assert.match(sql, /RAISE EXCEPTION 'Stopped, nothing changed/);
  const map = {
    clients: ['clients', 'sessions', 'events'],
    tasks: ['tasks', 'habit_definitions', 'habits_log', 'weekly_plan', 'daily_plan', 'time_log', 'journal_entries'],
    booking: ['booking_profiles', 'availability_slots', 'booking_notifs'],
    content: ['content_items', 'publishing_log'],
  };
  for (const [f, tables] of Object.entries(map))
    for (const t of tables) assert.ok(sql.includes("['" + t + "', '" + f + "']"), t + ' -> ' + f);
  assert.ok(!/DROP TABLE|DELETE FROM|TRUNCATE/i.test(sql), 'must not delete data');
});

test('the site, the database and the dashboard use the same rule for a tool', () => {
  assert.ok(read('src/lib/tiers.ts').includes('find(feature) ?? find("paid_tools")'));
  const gate = read('public/carlos-dashboard/index.html');
  assert.ok(gate.includes("pick(f) || pick('paid_tools')"));
  assert.ok(gate.includes('window._features = features'));
  assert.ok(read('src/pages/CRM.tsx').includes('can("clients")'));
  assert.ok(read('src/pages/ClientDetail.tsx').includes('can("clients")'));
});

test('tier plans: seeded with today\'s pricing texts, everyone reads, only admins write', () => {
  const sql = read('supabase/migrations/20261115000000_tier_plans.sql');
  assert.match(sql, /FOR SELECT USING \(true\)/);
  assert.match(sql, /FOR ALL USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/);
  for (const [tier, price] of [['free', 0], ['basic', 49], ['premium', 99], ['vip', 149]])
    assert.match(sql, new RegExp("\\('" + tier + "', +U&'[^']+', +" + price + ","));
  assert.match(sql, /ON CONFLICT \(tier\) DO NOTHING/);
  // the pricing page no longer hard-codes the plans
  assert.ok(!read('src/components/PricingPreview.tsx').includes('const tiers = ['));
});

test('locked screens do not name a fixed tier (the admin decides which plan opens what)', () => {
  for (const f of ['src/pages/CRM.tsx', 'src/pages/Home.tsx'])
    assert.ok(!/פיצ'ר פרימיום|זמין בפרימיום|זמינות בפרימיום|שדרוג לפרימיום/.test(read(f)), f);
});

test('SQL from 15/11 on keeps Hebrew out of the data: letters are written as codes, so pasting cannot garble them', () => {
  const dir = path.join(root, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(f => f >= '20261115' && f.endsWith('.sql'))) {
    const code = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('--')).join('\n');
    assert.ok(!/[\u0590-\u05FF]/.test(code), f + ': Hebrew letters outside comments (write them as U& codes)');
  }
  const fix = read('supabase/migrations/20261115030000_tier_plans_fix_text.sql');
  assert.ok(/^[\x00-\x7F]*$/.test(fix), 'the fix file must be plain ASCII');
  assert.match(fix, /ON CONFLICT \(tier\) DO UPDATE SET/);
});
