// tests-finance/ux.test.cjs — the small site-wide fixes from the 15/11/2026 review
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

test('no browser confirm() boxes in the site pages (the site dialog is used)', () => {
  const mine = ['src/pages/Admin.tsx', 'src/components/admin/ListingsManager.tsx', 'src/pages/CourseEditor.tsx',
    'src/pages/CRM.tsx', 'src/pages/ClientDetail.tsx', 'src/pages/ListingPage.tsx', 'src/components/admin/UsersManager.tsx'];
  for (const f of mine) {
    const s = read(f);
    assert.ok(!/(^|[^.\w])confirm\(`/m.test(s), f + ' still uses the browser confirm()');
    if (/confirm\(\{/.test(s)) assert.ok(s.includes('useConfirm()'), f + ' must take confirm from useConfirm()');
  }
  assert.ok(read('src/App.tsx').includes('<ConfirmProvider>'));
});

test('"not found" is in Hebrew, with the header and a way home', () => {
  const s = read('src/pages/NotFound.tsx');
  assert.ok(s.includes('הדף לא נמצא'));
  assert.ok(s.includes('<Header />'));
  assert.ok(!/Oops|Page not found|Return to Home/.test(s));
});

test('sign-in errors are shown in Hebrew', () => {
  for (const f of ['src/pages/Auth.tsx', 'src/pages/ResetPassword.tsx']) {
    const s = read(f);
    assert.ok(!/description: error\.message/.test(s), f + ' shows the raw English error');
    assert.ok(s.includes('authErrorHe(error)'), f);
  }
  const lib = read('src/lib/authErrors.ts');
  assert.ok(lib.includes('invalid login credentials'));
});

test('footer: "about" works from every page, the year is not fixed, categories filter the catalog', () => {
  const f = read('src/components/Footer.tsx');
  assert.ok(f.includes('href="/#about"'));
  assert.ok(!f.includes('© 2025'));
  assert.ok(f.includes('/courses?category=ai'));
  assert.ok(read('src/pages/Courses.tsx').includes('params.get("category")'));
});

test('the logo takes a signed-in user to their home', () => {
  assert.ok(read('src/components/Header.tsx').includes('to={user ? "/home" : "/"}'));
});

test('home: what the plan opens first, the rest in one line', () => {
  const s = read('src/pages/Home.tsx');
  assert.ok(s.includes('const open = items.filter((it) => !it.lockedTier)'));
  assert.ok(s.includes('לא כלול בתכנית שלך'));
});

test('pricing: a member asks to switch plans instead of being sent to sign-in', () => {
  const s = read('src/components/PricingPreview.tsx');
  assert.ok(s.includes('התכנית הנוכחית שלך'));
  assert.ok(s.includes('href="#contact"'));
});

test('course progress: each user reads and writes only their own rows; the site works without the table', () => {
  const sql = read('supabase/migrations/20261115020000_lesson_progress.sql');
  for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
    assert.ok(sql.includes('FOR ' + cmd + ' USING (auth.uid() = user_id)') || sql.includes('FOR ' + cmd + ' WITH CHECK (auth.uid() = user_id)'), cmd);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  const lib = read('src/lib/progress.ts');
  assert.ok(lib.includes('return error ? null'), 'a missing table must read as "no tracking", not crash');
  const page = read('src/pages/CoursePage.tsx');
  assert.ok(page.includes('resumeFrom(') && page.includes('markViewed('));
});

test('"my courses" and "my account" are real pages, behind sign-in, and in the personal menu', () => {
  const app = read('src/App.tsx');
  assert.ok(app.includes('path="/my-courses" element={<MyCourses />}'));
  assert.ok(app.includes('path="/account" element={<Account />}'));
  assert.ok(read('src/pages/MyCourses.tsx').includes('Navigate to="/auth?redirect=/my-courses"'));
  assert.ok(read('src/pages/Account.tsx').includes('Navigate to="/auth?redirect=/account"'));
  const h = read('src/components/Header.tsx');
  assert.ok(h.includes('to="/account"') && h.includes('to="/my-courses"'));
  assert.ok(!h.includes('הפרופיל שלי'), 'the old "profile" item led to the dashboard');
});
