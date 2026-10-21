/* The app's separate files (11 Oct 2026): index.html links app.css, strings.js and the code files (vendors.js, app.js) with
   up-to-date version stamps, has no styles, text tables or app code left inside it, and loads the texts first and app.js last.
   Run: node tests/assets.test.js    If this fails after editing one of those files, run: node tools/stamp.js */
const fs = require('fs'), path = require('path');
const { ok, done, ROOT, codeFiles } = require('./browser');
const { ASSETS, hash } = require('../tools/stamp');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), head = html.slice(0, html.indexOf('</head>'));
for (const f of ASSETS) ok(html.includes(`${f}?v=${hash(f)}"`), `${f} is linked with its current stamp (run node tools/stamp.js after editing it)`);
ok(!/<style>/.test(head), 'no styles left inside index.html (they live in app.css)');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), files = codeFiles(), code = files.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
ok(files.length >= 2 && files[files.length - 1] === 'app.js' && files.every(f => require('../tools/stamp').ASSETS.includes(f)), 'code files load in order with app.js last (it starts the app): ' + files.join(', '));
ok(!/Object\.assign\(STR\.|const STR = \{/.test(html + code.join('')) && app.includes('const STR = window.RB_STR;'), 'no text tables left in the page or app code (they live in strings.js)');
const inl = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(inl.length <= 3 && inl.every(s => s.length < 400), 'no app code left inside index.html (only the tiny start-up lines in <head> and the font switch; the app lives in app.js)');
ok(files.every(f => html.indexOf('strings.js?v=') > 0 && html.indexOf('strings.js?v=') < html.indexOf(f + '?v=')), 'strings.js loads before the code files');
ok(files.every(f => html.indexOf(f + '?v=') > html.indexOf('id="toast"')) && !/<script[^>]*src="[^"]*"[^>]*(defer|async|type="module")/.test(html), 'code files load at the end of the page as plain scripts (the page is built when they run)');
ok(code.every(c => /^\/\*[\s\S]*?\*\/\n"use strict";/.test(c)), 'every code file runs in strict mode (its first statement)');
{ const dup = {}; for (const [i, c] of code.entries()) for (const m of c.matchAll(/^(?:function\*?|async function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) (dup[m[1]] = dup[m[1]] || new Set()).add(files[i]);
  const two = Object.keys(dup).filter(k => dup[k].size > 1); ok(two.length === 0, 'no top-level name is declared in two code files' + (two.length ? ': ' + two.join(', ') : '')); }
global.window = {}; new Function(fs.readFileSync(path.join(ROOT, 'strings.js'), 'utf8'))();
const S = global.window.RB_STR;
ok(S && Object.keys(S.en).length > 900 && Object.keys(S.hi).length > 900, `strings.js has the English and Hindi texts (${Object.keys(S.en).length} / ${Object.keys(S.hi).length})`);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok(/url\.search\.startsWith\('\?v='\)/.test(sw) && /saveAssets/.test(sw), 'the offline cache saves the stamped files with each copy of the page');
{ const need = +(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').match(/const NEED_SV=(\d+)/) || [])[1], min = +(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').match(/const MIN_SV = (\d+)/) || [])[1];
  ok(need >= 60 && need === min, `the oldest supported script version is the same in the app and the dashboard (v${need})`); }
{ const st = require('../tools/stamp'), files = st.serverFiles();
  ok(files.length >= 10 && fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8') === st.buildCode(), `Code.gs is exactly server/*.gs joined (${files.length} files); run node tools/stamp.js after editing them`); }
done();
