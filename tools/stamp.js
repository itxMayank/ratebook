/* Version stamps for the app's separate files. index.html links each one as "file?v=<hash of its content>", so a phone
   always fetches a changed file (the offline cache keeps each stamped address until it changes) and never pairs a new page
   with an old stylesheet. Run after editing any file listed here:  node tools/stamp.js
   (tests/assets.test.js fails if a stamp is out of date.) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const ASSETS = ['app.css', 'strings.js', 'shops.js', 'search.js', 'print.js', 'reports.js', 'settings.js', 'lock.js', 'bills.js', 'customers.js', 'vendors.js', 'prices.js', 'billing.js', 'app.js'];
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
if (require.main === module) {
  for (const f of PAGES) { const p = path.join(ROOT, f), before = fs.readFileSync(p, 'utf8'); let after = f === 'index.html' ? stamped(before) : before; after = withCsp(after);
    if (after !== before) { fs.writeFileSync(p, after); console.log(f + ': stamps / script digests updated'); } }
}
module.exports = { ASSETS, hash, stamped, withCsp, PAGES };
