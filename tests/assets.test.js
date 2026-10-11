/* The app's separate files (11 Oct 2026): index.html links app.css, strings.js and app.js with up-to-date version stamps, has
   no styles, text tables or app code left inside it, and loads the texts before the app. Run: node tests/assets.test.js
   If this fails after editing app.css, strings.js or app.js, run: node tools/stamp.js */
const fs = require('fs'), path = require('path');
const { ok, done, ROOT } = require('./browser');
const { ASSETS, hash } = require('../tools/stamp');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), head = html.slice(0, html.indexOf('</head>'));
for (const f of ASSETS) ok(html.includes(`${f}?v=${hash(f)}"`), `${f} is linked with its current stamp (run node tools/stamp.js after editing it)`);
ok(!/<style>/.test(head), 'no styles left inside index.html (they live in app.css)');
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
ok(!/Object\.assign\(STR\.|const STR = \{/.test(html + app) && app.includes('const STR = window.RB_STR;'), 'no text tables left in the page or app code (they live in strings.js)');
const inl = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok(inl.length <= 2 && inl.every(s => s.length < 400), 'no app code left inside index.html (only the two tiny start-up lines in <head>; the app lives in app.js)');
ok(html.indexOf('strings.js?v=') > 0 && html.indexOf('strings.js?v=') < html.indexOf('app.js?v='), 'strings.js loads before app.js');
ok(html.lastIndexOf('app.js?v=') > html.indexOf('id="toast"') && !/<script[^>]*app\.js[^>]*(defer|async|type="module")/.test(html), 'app.js loads at the end of the page as a plain script (the page is built when it runs)');
ok(/^\/\*[\s\S]*?\*\/\n"use strict";/.test(app), 'app.js runs in strict mode (its first statement)');
global.window = {}; new Function(fs.readFileSync(path.join(ROOT, 'strings.js'), 'utf8'))();
const S = global.window.RB_STR;
ok(S && Object.keys(S.en).length > 900 && Object.keys(S.hi).length > 900, `strings.js has the English and Hindi texts (${Object.keys(S.en).length} / ${Object.keys(S.hi).length})`);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok(/url\.search\.startsWith\('\?v='\)/.test(sw) && /saveAssets/.test(sw), 'the offline cache saves the stamped files with each copy of the page');
done();
