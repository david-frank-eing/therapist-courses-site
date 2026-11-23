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
  assert.match(read('src/components/WorkshopSection.tsx'), /לפרטים ולהרשמה לסדנה/);
  assert.match(read('src/components/WorkshopSection.tsx'), /אם יש לכם יכולת לעזור לאנשים, מגיע להם לפחות לדעת שאתם קיימים\./);
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
  assert.match(lib, /!w\.enabled \|\| !w\.title\.trim\(\)/, 'switched off or empty = nothing shown');
  assert.match(lib, /import\.meta\.env\.DEV/, 'the default text is a development-only preview');
  assert.match(read('src/components/WorkshopSection.tsx'), /if \(!workshop\) return null;/);
});
