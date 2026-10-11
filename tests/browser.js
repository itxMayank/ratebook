/* Shared helpers for the simulated-phone tests: serve index.html at https://rb.test/, expose internals as window.T,
   and mock the Google backends. Uses the repo's Playwright (CI) or the one preinstalled in Claude's cloud sandbox. */
const fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..');
const MAIN_API = 'https://script.google.com/macros/s/AKfycbxbvn-XbelK8mOeearCSHcnewrDevNfInjFggxH-60fzOiHpdEjkb9-BrJdfTOSVx_J/exec';
const DIR = 'https://dir.test/exec';
/* The page links app.css and strings.js as separate files. Most tests serve the page from one fake address that answers every
   request with the page itself, so by default they're put back inline here; pass {files:true} to keep the links (sw.test.js
   serves the real files). */
const inlineFiles = html => html
  .replace(/<link rel="stylesheet" href="app\.css\?v=[^"]*">/, () => '<style>' + fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8') + '</style>')
  .replace(/<script src="strings\.js\?v=[^"]*"><\/script>/, () => '<script>' + fs.readFileSync(path.join(ROOT, 'strings.js'), 'utf8') + '</script>');
function appHtml(expose = 'S,LOCK,appLock,appUnlock,apiPost0,flushBills,sync,shopsKnown', opt = {}) {
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return (opt.files ? raw : inlineFiles(raw))
    .replace(/const DIR_URL = "[^"]*";/, `const DIR_URL = "${DIR}";`)
    .replace('boot();\n})();\n</script>', `boot();\nwindow.T={${expose}};\n})();\n</script>`);
}
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
async function launch() {
  return pw.chromium.launch(exe ? { executablePath: exe } : {});
}
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const done = () => process.exit(fails ? 1 : 0);
module.exports = { pw, appHtml, inlineFiles, launch, ok, done, MAIN_API, DIR, ROOT, exe };
