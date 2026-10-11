/* Version stamps for the app's separate files. index.html links each one as "file?v=<hash of its content>", so a phone
   always fetches a changed file (the offline cache keeps each stamped address until it changes) and never pairs a new page
   with an old stylesheet. Run after editing any file listed here:  node tools/stamp.js
   (tests/assets.test.js fails if a stamp is out of date.) */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const ASSETS = ['app.css', 'strings.js', 'shops.js', 'search.js', 'print.js', 'reports.js', 'settings.js', 'lock.js', 'bills.js', 'customers.js', 'vendors.js', 'billing.js', 'app.js'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 10);
function stamped(html) {
  for (const f of ASSETS) html = html.replace(new RegExp(`(["'])${f.replace('.', '\\.')}\\?v=[^"']*\\1`), `$1${f}?v=${hash(f)}$1`);
  return html;
}
if (require.main === module) {
  const p = path.join(ROOT, 'index.html'), before = fs.readFileSync(p, 'utf8'), after = stamped(before);
  if (after !== before) { fs.writeFileSync(p, after); console.log('index.html stamps updated:', ASSETS.map(f => f + '?v=' + hash(f)).join(', ')); }
  else console.log('stamps already up to date');
}
module.exports = { ASSETS, hash, stamped };
