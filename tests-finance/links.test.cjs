// tests-finance/links.test.cjs — run: node --test "tests-finance/**/*.test.cjs"
// No dead links: every internal link in the React site must lead to a route that exists in App.tsx
// (13/11/2026: /pricing, /profile and /my-courses were linked from five places and led to "not found").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const routes = [...read('src/App.tsx').matchAll(/<Route path="([^"]+)"/g)].map(m => m[1]).filter(r => r !== '*');
// served outside the React app (public/ folder)
const STATIC = [/^\/carlos-dashboard\//];
const matches = (link, route) =>
  new RegExp('^' + route.replace(/:[A-Za-z]+/g, '[^/]+') + '$').test(link);

test('App.tsx has routes, and the catch-all is last', () => {
  assert.ok(routes.length >= 12, 'routes found: ' + routes.length);
  const app = read('src/App.tsx');
  assert.ok(app.lastIndexOf('<Route path="*"') > app.lastIndexOf('<Route path="/'), 'a route after the catch-all never matches');
});

test('every internal link, navigate() and redirect points at a real route', () => {
  const dead = [];
  for (const file of walk(path.join(root, 'src'))) {
    const src = fs.readFileSync(file, 'utf8');
    const found = [
      ...src.matchAll(/\b(?:to|href)=\{?["'`](\/[^"'`]*)["'`]/g),
      ...src.matchAll(/\bnavigate\(\s*["'`](\/[^"'`]*)["'`]/g),
      ...src.matchAll(/location\.href\s*=\s*["'`](\/[^"'`]*)["'`]/g),
      ...src.matchAll(/:\s*["'`](\/(?:pricing|profile|my-courses|courses|auth|board|crm|admin)[^"'`]*)["'`]/g),
    ];
    for (const m of found) {
      const link = m[1].replace(/\$\{[^}]*\}/g, 'x').split(/[?#]/)[0] || '/';
      if (STATIC.some(re => re.test(link))) continue;
      if (!routes.some(r => matches(link, r))) dead.push(path.relative(root, file) + ' -> ' + m[1]);
    }
  }
  assert.deepStrictEqual(dead, []);
});

test('the dashboard builds its public links from the address it is served at, not from a typed host name', () => {
  const app = read('public/carlos-dashboard/app.js');
  const typed = app.split('\n').filter(l => /https?:\/\/[\w-]+\.netlify\.app/.test(l)).map(l => l.trim());
  assert.deepStrictEqual(typed, [], 'a typed host breaks the day the site moves to its own domain (and one was misspelled)');
  assert.ok(app.includes('${window.location.origin}/carlos-dashboard/lead-form.html?slug='));
});
