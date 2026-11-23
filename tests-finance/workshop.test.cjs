// The upcoming workshop on the home page (24/11/2026): editable in Admin, shown in a card, a floating button and a pop-up.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const noComments = s => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

test('the workshop table: public read, admin-only write, https-only link, history by trigger, no Hebrew in SQL', () => {
  const raw = read('supabase/migrations/20261124000000_site_workshop.sql');
  const sql = raw.replace(/--.*$/gm, '');
  assert.ok(!/[֐-׿]/.test(raw), 'no Hebrew in SQL that David pastes');
  assert.match(sql, /ALTER TABLE public\.site_workshop ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /ON public\.site_workshop FOR SELECT USING \(true\)/);
  assert.match(sql, /ON public\.site_workshop\s+FOR ALL USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\) WITH CHECK \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/);
  assert.match(sql, /register_url ~ '\^https:\/\/\[\^\[:space:\]\]\+\$'/, 'the link must be a plain https address');
  assert.match(sql, /CHECK \(id = 1\)/, 'one row');
  assert.match(sql, /AFTER UPDATE ON public\.site_workshop/);
  assert.match(sql, /ON public\.site_workshop_history\s+FOR SELECT USING \(public\.has_role/, 'history is admin-only');
  assert.match(sql, /LIMIT 50/);
  assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM public\.site_workshop\b(?!_)/i.test(sql));
});

test('only a plain https address becomes a link, in the code and in the admin screen', () => {
  const lib = read('src/lib/workshop.ts');
  const m = /\(\/(\^https:.*?\$)\/\.test\(u\.trim\(\)\)/.exec(lib);
  assert.ok(m, 'safeUrl uses a strict pattern');
  const re = new RegExp(m[1]);
  assert.ok(re.test('https://wa.me/972500000000'));
  assert.ok(re.test('https://pay.example.com/workshop?id=3'));
  for (const bad of ['javascript:alert(1)', 'http://example.com', 'https://', 'data:text/html,x', '//evil.com', 'https://a b', '']) assert.ok(!re.test(bad), bad);
  assert.match(read('src/components/admin/WorkshopManager.tsx'), /\^https:\\\/\\\/\[\^\\s\]\+\$/, 'the admin screen refuses anything else too');
  const sec = read('src/components/WorkshopSection.tsx') + read('src/components/WorkshopPopup.tsx');
  assert.ok(!/href=\{w\.register_url\}|href=\{workshop\.register_url\}/.test(sec), 'a link is always passed through safeUrl first');
  assert.match(sec, /rel="noopener noreferrer"/);
});

test('the approved text: names as in the logo, 4.5 hours including the break', () => {
  const lib = read('src/lib/workshop.ts');
  assert.match(lib, /title: "מטפל טוב זה כבר לא מספיק"/);
  assert.match(lib, /duration_text: "4\.5 שעות כולל הפסקה"/);
  assert.match(lib, /date_text: "29\.12\.26"/);
  assert.match(lib, /price_text: "79 ₪ בהרשמה מוקדמת"/);
  assert.match(lib, /button_text: "אני רוצה להירשם"/);
  const all = lib + read('src/components/WorkshopSection.tsx') + read('src/components/WorkshopPopup.tsx');
  assert.ok(!/הכל בידיים/.test(all), 'the brand is written "הכול בידיים", as in the logo');
  assert.ok(!/שם זמני/.test(all), 'the "temporary name" note never reaches the public');
  assert.match(lib, /about_button: "לפרטים ולהרשמה לסדנה"/);
  assert.match(lib, /about_quote: "אם יש לכם יכולת לעזור לאנשים, מגיע להם לפחות לדעת שאתם קיימים\."/);
});

test('every text can be changed from the admin: workshop, "about me", the floating button and its pop-up', () => {
  const m = read('src/components/admin/WorkshopManager.tsx');
  for (const key of ['title', 'date_text', 'duration_text', 'price_text', 'description', 'register_url', 'about_title', 'about_text', 'about_quote', 'about_button',
    'popup_button', 'popup_form_title', 'popup_submit', 'popup_thanks_title', 'popup_thanks_text']) {
    assert.match(m, new RegExp(`key: "${key}"`), key + ' has an editor field');
    assert.match(read('supabase/migrations/20261124000000_site_workshop.sql'), key === 'title' ? /title\s+TEXT/ : new RegExp(key), key + ' has a column');
  }
  // the public components read those texts from the row, not from fixed strings
  const sec = read('src/components/WorkshopSection.tsx');
  assert.match(sec, /texts\.about_text/);
  const pop = read('src/components/WorkshopPopup.tsx');
  for (const k of ['popup_button', 'popup_form_title', 'popup_submit', 'popup_thanks_title', 'popup_thanks_text']) assert.match(pop, new RegExp(`workshop\\.${k}`), k);
  // an empty field falls back to the default text, never to a blank
  assert.match(read('src/lib/workshop.ts'), /FALLBACK_KEYS/);
});

test('Google and link previews are editable: tables, edge function, pure rewriter, admin screen', async () => {
  const raw = read('supabase/migrations/20261124000000_site_workshop.sql');
  const sql = raw.replace(/--.*$/gm, '');
  assert.ok(!/[֐-׿]/.test(raw), 'no Hebrew in SQL that David pastes');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.site_seo/);
  assert.match(sql, /CHECK \(page IN \('default', 'welcome', 'assistant'\)\)/);
  assert.match(sql, /ON public\.site_seo FOR SELECT USING \(true\)/);
  assert.match(sql, /ON public\.site_seo\s+FOR ALL USING \(public\.has_role\(auth\.uid\(\), 'admin'\)\)/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS about_text/, 'safe on top of an earlier run');

  const { applySeo, pageKey, esc } = await import(require('url').pathToFileURL(path.join(root, 'netlify/edge-functions/lib/seo-apply.mjs')).href);
  assert.strictEqual(pageKey('/'), 'default'); assert.strictEqual(pageKey('/welcome'), 'welcome'); assert.strictEqual(pageKey('/assistant'), 'assistant'); assert.strictEqual(pageKey('/courses'), 'default');
  const html = read('index.html');
  const out = applySeo(html, { title: 'כותרת חדשה', description: 'תיאור חדש', og_title: 'כותרת תצוגה', og_description: 'תיאור תצוגה' });
  assert.match(out, /<title>כותרת חדשה<\/title>/);
  assert.match(out, /name="description" content="תיאור חדש"/);
  assert.match(out, /og:title" content="כותרת תצוגה"/);
  assert.match(out, /og:description" content="תיאור תצוגה"/);
  assert.ok(out.includes('og:image') && out.includes('<div id="root">'), 'the rest of the page is untouched');
  assert.strictEqual(applySeo(html, { title: '', description: '  ', og_title: '', og_description: '' }), html, 'empty fields leave the page as it is');
  assert.strictEqual(applySeo(html, null), html);
  // nothing the owner types can break out of the tag
  const evil = applySeo(html, { title: '</title><script>alert(1)</script>', description: '"><script>alert(2)</script>', og_title: 'a"b', og_description: "$& $1 <b>" });
  assert.ok(!/<script>alert/.test(evil), 'no injected script');
  assert.ok(!evil.includes('"><script'), 'no attribute break-out');
  assert.match(evil, /og:description" content="\$&amp; \$1 &lt;b&gt;"/, '$ patterns are inserted literally');
  assert.strictEqual(esc('<>&"'), '&lt;&gt;&amp;&quot;');

  const fn = read('netlify/edge-functions/seo-meta.js');
  assert.match(fn, /export default async/);
  assert.match(fn, /catch \{\s*return response;/, 'any failure returns the page untouched');
  assert.match(fn, /response\.clone\(\)\.text\(\)/, 'the original response is never consumed');
  assert.match(fn, /AbortController/, 'a slow database never holds a page');
  assert.match(fn, /excludedPath/);
  assert.match(fn, /includes\("text\/html"\)/, 'only pages are touched');
  assert.ok(!/SERVICE_KEY|service/i.test(fn), 'the edge function uses only the public key');

  const mgr = read('src/components/admin/SeoManager.tsx');
  assert.match(mgr, /from\("site_seo"\)/);
  assert.match(read('src/pages/Admin.tsx'), /<SeoManager \/>/);
  assert.match(read('src/pages/Admin.tsx'), /<TabsTrigger value="seo">גוגל ותצוגת קישור<\/TabsTrigger>/);
  // the defaults match what index.html says today, so switching the function on changes nothing by itself
  const seo = read('src/lib/seo.ts');
  assert.ok(seo.includes('הכול בידיים | הצד העסקי של הקליניקה, למטפלים עצמאיים') && html.includes('הכול בידיים | הצד העסקי של הקליניקה, למטפלים עצמאיים'));
});

test('history of the workshop and of the Google texts: admin-only, written only by triggers, loadable into the editor', () => {
  const raw = read('supabase/migrations/20261124000000_site_workshop.sql');
  const sql = raw.replace(/--.*$/gm, '');
  assert.ok(!/[֐-׿]/.test(raw), 'no Hebrew in SQL that David pastes');
  for (const t of ['site_workshop_history', 'site_seo_history']) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`), t);
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon`), t);
    assert.match(sql, new RegExp(`ON public\\.${t}\\s+FOR SELECT USING \\(public\\.has_role\\(auth\\.uid\\(\\), 'admin'\\)\\)`), t + ' is admin-only');
  }
  assert.ok(!/ON public\.site_(workshop|seo)_history\s+FOR (INSERT|UPDATE|DELETE|ALL)/i.test(sql), 'no write policy on a history table');
  assert.match(sql, /AFTER INSERT OR UPDATE ON public\.site_seo/);
  assert.match(sql, /LIMIT 200/);
  assert.match(sql, /IS NOT DISTINCT FROM OLD\.title/, 'a save that changes nothing adds no version');
  assert.match(sql, /NEW\.title = '' AND NEW\.description = ''/, 'the empty rows made by the file are not history');
  for (const [file, table] of [['src/components/admin/WorkshopManager.tsx', 'site_workshop_history'], ['src/components/admin/SeoManager.tsx', 'site_seo_history']]) {
    const ui = read(file);
    assert.match(ui, new RegExp(`from\\("${table}"\\)`), file);
    assert.match(ui, /טען לעורך/, file);
    assert.match(ui, /הגרסה הנוכחית/, file);
    assert.ok(!new RegExp(`${table}"\\)\\.(insert|update|delete|upsert)`).test(ui), file + ' never writes the history');
  }
});

test('the changelog is kept up to date and says where the readable copy is', () => {
  const log = read('docs/CHANGELOG.he.md');
  assert.match(log, /## 24\/11\/2026: הסדנה בדף הראשי/);
  assert.match(log, /דוחות קרלוס/);
  assert.match(log, /build_changelog\.py/);
  assert.match(log, /היסטוריה שבתוך כל לשונית בניהול/);
});

test('plan names are not shown to the public: home, hero, guest menu, footer', () => {
  assert.ok(!/PricingPreview/.test(read('src/pages/Index.tsx')), 'no plans section on the home page');
  assert.ok(!/\/pricing/.test(read('src/components/HeroSection.tsx')), 'no plans button in the hero');
  const header = read('src/components/Header.tsx');
  const guest = /const guestLinks = \[([\s\S]*?)\];/.exec(header)[1];
  assert.ok(!/pricing/.test(guest), 'no plans link in the guest menu');
  assert.ok(!/\/pricing/.test(read('src/components/Footer.tsx')), 'no plans link in the footer');
  assert.match(read('src/App.tsx'), /<Route path="\/pricing"/, 'the page itself still exists for signed-in flows');
});

test('the pop-up: a button the visitor presses (never opens by itself), consent required, goes to the leads function', () => {
  const p = noComments(read('src/components/WorkshopPopup.tsx'));
  assert.match(p, /\/\.netlify\/functions\/lead-submit/);
  assert.match(p, /source: "workshop"/);
  assert.match(p, /note: workshopNote\(workshop\)/, 'the lead says which workshop');
  assert.match(p, /if \(!consent\) return setError/);
  assert.match(p, /ws-website/, 'honeypot field');
  assert.ok(!/setTimeout|setInterval/.test(p), 'nothing opens on a timer');
  assert.ok(!/useEffect\(\(\) => \{\s*setOpen\(true\)/.test(p), 'nothing opens on load');
  assert.match(p, /<Link to="\/privacy"/);
  for (const page of ['src/pages/Index.tsx', 'src/pages/Welcome.tsx']) assert.match(read(page), /<WorkshopPopup \/>/, page);
});

test('the admin screen: its own tab, a live preview, a switch, and the home page hides everything when it is off', () => {
  assert.match(read('src/pages/Admin.tsx'), /<WorkshopManager \/>/);
  assert.match(read('src/pages/Admin.tsx'), /<TabsTrigger value="workshop">סדנה<\/TabsTrigger>/);
  const m = read('src/components/admin/WorkshopManager.tsx');
  assert.match(m, /<WorkshopCard w=\{form\} preview \/>/);
  assert.match(m, /להציג את הסדנה באתר/);
  const lib = read('src/lib/workshop.ts');
  assert.match(lib, /!row\.enabled \|\| !row\.title\.trim\(\)/, 'switched off or empty = nothing shown');
  assert.match(lib, /import\.meta\.env\.DEV/, 'the default text is a development-only preview');
  assert.match(read('src/components/WorkshopSection.tsx'), /if \(!workshop\) return null;/);
});
