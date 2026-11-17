// The "כספים" tab of the family bar, from the reminders page of the site (18/11/2026).
// /carlos-dashboard/#finance only changes the hash when you are already on /carlos-dashboard/, and the hash is read once
// at load, so the click did nothing. The bar now calls openFinance() there.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('the site copy of the family bar opens finance with openFinance() when the page has it', () => {
  const bar = read('public/carlos-dashboard/family-bar.js');
  assert.match(bar, /if \(!local\) \{/);
  assert.match(bar, /a\[data-p="fin"\]/);
  assert.match(bar, /typeof window\.openFinance === 'function'\) \{ e\.preventDefault\(\); window\.openFinance\(\); \}/);
});

test('the two copies of family-bar.js are the same', () => {
  assert.strictEqual(read('public/carlos-dashboard/family-bar.js').replace(/\r\n/g, '\n'),
    fs.readFileSync('H:/carlos/dashboard/family-bar.js', 'utf8').replace(/\r\n/g, '\n'));
});

test('openFinance says why when finance is not open for the account, instead of staying silent', () => {
  const app = read('public/carlos-dashboard/app.js');
  assert.match(app, /function openFinance\(\) \{\s*\n\s*if \(!window\._financeEnabled\) \{ toast\(/);
});

test('the rail button is called כווץ/הרחב עמודות in the rail and the mobile drawer', () => {
  const html = read('public/carlos-dashboard/index.html');
  assert.match(html, /<span class="ic-lbl">כווץ\/הרחב עמודות<\/span>/);
  assert.match(html, /⊟ כווץ\/הרחב עמודות<\/button>/);
  assert.ok(!html.includes('כווץ הכל'));
});
