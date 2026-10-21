/* Version stamps for the app's separate files. index.html links each one as "file?v=<hash of its content>", so a phone
   always fetches a changed file (the offline cache keeps each stamped address until it changes) and never pairs a new page
   with an old stylesheet. Run after editing any file listed here:  node tools/stamp.js
   (tests/assets.test.js fails if a stamp is out of date.) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const ASSETS = ['app.css', 'strings.js', 'shops.js', 'money.js', 'search.js', 'print.js', 'reports.js', 'settings.js', 'lock.js', 'bills.js', 'customers.js', 'vendors.js', 'prices.js', 'billing.js', 'app.js'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 10);
function stamped(html) {
  for (const f of ASSETS) html = html.replace(new RegExp(`(["'])${f.replace('.', '\\.')}\\?v=[^"']*\\1`), `$1${f}?v=${hash(f)}$1`);
  return html;
}
/* The pages' Content-Security-Policy (12 Oct 2026) lets the browser run only our own script files plus the small scripts written
   into the page itself, each allowed by its exact digest. Editing such a script changes its digest, so this keeps the list current. */
const PAGES = ['index.html', 'vendor.html', 'admin.html'];
const inlineHashes = html => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => "'sha256-" + crypto.createHash('sha256').update(m[1], 'utf8').digest('base64') + "'");
const withCsp = html => html.replace(/(script-src 'self')[^;"]*;/, (m, a) => `${a} ${inlineHashes(html).join(' ')};`);
/* money.js (bill sums) is also the sheet script's: everything after its "use strict" is copied into Code.gs between these markers,
   so the app and the sheet add up bills with the same code (tests/money.test.js checks the copy). */
const MONEY_A = '/* ==== money.js: copied by tools/stamp.js, edit money.js instead ==== */', MONEY_B = '/* ==== end of money.js ==== */';
const moneyBody = () => { const m = fs.readFileSync(path.join(ROOT, 'money.js'), 'utf8'), k = m.indexOf('"use strict";\n'); return m.slice(k + 14).trim(); };
const withMoney = gs => { const a = gs.indexOf(MONEY_A), b = gs.indexOf(MONEY_B); if (a < 0 || b < a) throw new Error('Code.gs: money.js markers missing');
  return gs.slice(0, a + MONEY_A.length) + '\n' + moneyBody() + '\n' + gs.slice(b); };
if (require.main === module) {
  { const p = path.join(ROOT, 'Code.gs'), before = fs.readFileSync(p, 'utf8'), after = withMoney(before); if (after !== before) { fs.writeFileSync(p, after); console.log('Code.gs: money.js copied in'); } }
  for (const f of PAGES) { const p = path.join(ROOT, f), before = fs.readFileSync(p, 'utf8'); let after = f === 'index.html' ? stamped(before) : before; after = withCsp(after);
    if (after !== before) { fs.writeFileSync(p, after); console.log(f + ': stamps / script digests updated'); } }
}
module.exports = { ASSETS, hash, stamped, withCsp, PAGES, withMoney, moneyBody, MONEY_A, MONEY_B };
