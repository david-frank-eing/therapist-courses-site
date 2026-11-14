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
    assert.ok(s.includes('hasPaidTools'), f + ' should use hasPaidTools');
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
