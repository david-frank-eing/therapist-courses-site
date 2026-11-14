// tests-finance/areas.test.cjs — run: node --test "tests-finance/**/*.test.cjs"
// "הצג שמות": the registries are the single source of area names. Every code must be unique and
// must point at something that really exists in the page it describes.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const dash = JSON.parse(read('public/carlos-dashboard/areas.json'));
const courses = JSON.parse(read('public/areas-courses.json'));

test('codes are unique, prefixed, and every area has a name and a place in the code', () => {
  for (const reg of [dash, courses]) {
    const seen = new Set();
    for (const a of reg.areas) {
      assert.match(a.code, new RegExp('^' + reg.prefix + '\\d+$'), a.code);
      assert.ok(!seen.has(a.code), 'duplicate ' + a.code);
      seen.add(a.code);
      assert.ok(a.name && a.name.trim().length > 1, a.code + ' has no name');
      assert.ok(a.where, a.code + ' has no "where"');
      assert.ok(a.sel || a.h || a.kind === 'window', a.code + ' has nothing to find it by');
    }
  }
});

test('dashboard: every selector names an id or class that exists in the page or in the scripts that build it', () => {
  const html = read('public/carlos-dashboard/index.html');
  const scripts = ['mobile-home.js', 'finance-mobile.js'].map(f => read('public/carlos-dashboard/' + f)).join('\n');
  for (const a of dash.areas) {
    for (const token of a.sel.match(/[#.][A-Za-z][\w-]*/g) || []) {
      const name = token.slice(1);
      const inHtml = token[0] === '#' ? html.includes(`id="${name}"`) : new RegExp(`class="[^"]*\\b${name}\\b`).test(html);
      const inJs = scripts.includes(`'${name}'`) || scripts.includes(`"${name}"`);
      assert.ok(inHtml || inJs, `${a.code}: ${token} not found`);
    }
  }
});

test('courses: every data-area code in the registry is on a component, and the other way round', () => {
  const files = ['src/pages/Admin.tsx', 'src/pages/CoursePage.tsx', 'src/pages/Courses.tsx',
    'src/pages/CourseEditor.tsx', 'src/pages/Home.tsx', 'src/components/Header.tsx',
    'src/components/admin/UsersManager.tsx', 'src/components/admin/TiersManager.tsx',
    'src/pages/MyCourses.tsx', 'src/pages/Account.tsx'].map(read).join('\n');
  const marked = new Set((files.match(/data-area="K\d+"/g) || []).map(m => m.slice(11, -1)));
  const wanted = new Set(courses.areas.filter(a => /data-area/.test(a.sel || '')).map(a => a.code));
  assert.deepStrictEqual([...marked].sort(), [...wanted].sort());
});

test('only an admin gets the button, in both places', () => {
  assert.match(read('src/components/AreaNamesToggle.tsx'), /if \(!isAdmin\) return null;/);
  const html = read('public/carlos-dashboard/index.html');
  assert.match(html, /id="areas-rail-btn" style="display:none"/);
  assert.match(html, /id="areas-mnav-btn" style="display:none"/);
  const app = read('public/carlos-dashboard/app.js');
  const block = app.slice(app.indexOf('if (window._isAdmin) {\n    const adminBtn'), app.indexOf('// Admin modal close'));
  assert.ok(block.includes("'areas-rail-btn'") && block.includes("'areas-mnav-btn'"));
});

test('the engine draws a layer and never touches storage or the network beyond its registry', () => {
  const engine = read('public/areas-engine.js');
  assert.ok(!/localStorage|sessionStorage|document\.cookie|XMLHttpRequest/.test(engine));
  assert.strictEqual((engine.match(/fetch\(/g) || []).length, 1);
});

test('course editor: the old dialogs are gone and nothing points at them; /home needs a login', () => {
  for (const f of ['CourseFormDialog', 'ResourceManagerDialog', 'VideoManagerDialog']) {
    assert.ok(!fs.existsSync(path.join(root, 'src/components/admin', f + '.tsx')), f + ' should be deleted');
    assert.ok(!read('src/pages/Admin.tsx').includes(f), 'Admin.tsx still references ' + f);
  }
  assert.match(read('src/App.tsx'), /path="\/admin\/course\/:id"/);
  assert.match(read('src/pages/Home.tsx'), /if \(!user\) return <Navigate to="\/auth/);
});
