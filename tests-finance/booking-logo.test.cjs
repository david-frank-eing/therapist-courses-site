// The therapist's logo on the public booking page (17/11/2026).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the migration adds one nullable text column and nothing destructive', () => {
  const sql = read('supabase/migrations/20261117010000_booking_logo.sql');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT ''/);
  assert.ok(!/DROP|DELETE|TRUNCATE/i.test(sql.replace(/--.*$/gm, '')));
});

test('the public booking page draws the logo only when there is one', () => {
  const page = read('src/pages/BookingPage.tsx');
  assert.match(page, /logo_url\?: string/);
  assert.match(page, /\{profile\.logo_url && \(\s*<img\s+src=\{profile\.logo_url\}/);
});

test('the settings check type and size before uploading, and the save survives a missing column', () => {
  const app = read('public/carlos-dashboard/app.js');
  assert.match(app, /_BKP_IMAGE_EXT = \{ 'image\/png': 'png', 'image\/jpeg': 'jpg', 'image\/webp': 'webp', 'image\/gif': 'gif' \}/);
  assert.match(app, /file\.size > 2 \* 1024 \* 1024/);
  assert.ok(!/image\/svg/.test(app.slice(app.indexOf('_BKP_IMAGE_EXT'), app.indexOf('_BKP_IMAGE_EXT') + 300)), 'the avatars bucket does not take SVG');
  assert.match(app, /logo_url: document\.getElementById\('bkp-logo'\)\.value\.trim\(\)/);
  const api = read('public/carlos-dashboard/supabase-api.js');
  assert.match(api, /logo_skipped: true/);
});

test('the local booking page builds the logo with the DOM and accepts only http(s) or uploads/', () => {
  const html = fs.readFileSync('H:/carlos/dashboard/booking.html', 'utf8');
  assert.match(html, /createElement\('img'\)/);
  assert.ok(html.includes(String.raw`uploads\/[\w.-]+$`) && html.includes('https?:'), 'only http(s) or uploads/ addresses');
  assert.ok(!/innerHTML[^\n]*logo_url/.test(html), 'logo_url must never go through innerHTML');
});
