/* Shared helpers for the simulated-phone tests: serve index.html at https://rb.test/, expose internals as window.T,
   and mock the Google backends. Uses the repo's Playwright (CI) or the one preinstalled in Claude's cloud sandbox. */
const fs = require('fs'), path = require('path');
let pw; try { pw = require('playwright'); } catch { pw = require('/opt/node-tools/node_modules/playwright'); }
const ROOT = path.join(__dirname, '..');
const MAIN_API = 'https://script.google.com/macros/s/AKfycbxbvn-XbelK8mOeearCSHcnewrDevNfInjFggxH-60fzOiHpdEjkb9-BrJdfTOSVx_J/exec';
const DIR = 'https://dir.test/exec';
/* The page links app.css, strings.js and app.js as separate files. Most tests serve the page from one fake address that answers
   every request with the page itself, so by default they're put back inline here; pass {files:true} to keep the links (sw.test.js
   serves the real files). `expose` (e.g. 'S,LOCK,appLock') makes those app names readable from the test as window.T: the line is
   added right after the app code, in the same script (inline) or as a small script after app.js (files). */
const DIR_RE = /const DIR_URL = "[^"]*";/;
const tHook = expose => expose ? `\nwindow.T={${expose}};` : '';
const inlineFiles = (html, expose, opt = {}) => html
  .replace(/<link rel="stylesheet" href="app\.css\?v=[^"]*">/, () => '<style>' + fs.readFileSync(path.join(ROOT, 'app.css'), 'utf8') + '</style>')
  .replace(/<script src="strings\.js\?v=[^"]*"><\/script>/, () => '<script>' + fs.readFileSync(path.join(ROOT, 'strings.js'), 'utf8') + '</script>')
  .replace(/<script src="app\.js\?v=[^"]*"><\/script>/, () => {
    let js = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    if (opt.dir) js = js.replace(DIR_RE, `const DIR_URL = "${opt.dir}";`);
    return '<script>' + js + tHook(expose) + '</script>';
  });
function appHtml(expose = 'S,LOCK,appLock,appUnlock,apiPost0,flushBills,sync,shopsKnown', opt = {}) {
  const raw = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!opt.files) return inlineFiles(raw, expose, { dir: DIR });
  return raw.replace(/(<script src="app\.js\?v=[^"]*"><\/script>)/, (m) => m + '<script>' + tHook(expose) + '</script>');
}
/* app.js as served when {files:true}: the test Directory link in place of the real one. */
const appJs = () => fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').replace(DIR_RE, `const DIR_URL = "${DIR}";`);
const exe = process.env.CHROME || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome') ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' : undefined);
async function launch() {
  return pw.chromium.launch(exe ? { executablePath: exe } : {});
}
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const done = () => process.exit(fails ? 1 : 0);
module.exports = { pw, appHtml, inlineFiles, appJs, launch, ok, done, MAIN_API, DIR, ROOT, exe };
