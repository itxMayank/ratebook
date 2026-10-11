/* The app's separate files (11 Oct 2026): index.html links app.css and strings.js with up-to-date version stamps, has no
   styles or text tables left inside it, and loads the texts before the app. Run: node tests/assets.test.js
   If this fails after editing app.css or strings.js, run: node tools/stamp.js */
const fs = require('fs'), path = require('path');
const { ok, done, ROOT } = require('./browser');
const { ASSETS, hash } = require('../tools/stamp');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), head = html.slice(0, html.indexOf('</head>'));
for (const f of ASSETS) ok(html.includes(`${f}?v=${hash(f)}"`), `${f} is linked with its current stamp (run node tools/stamp.js after editing it)`);
ok(!/<style>/.test(head), 'no styles left inside index.html (they live in app.css)');
ok(!/Object\.assign\(STR\.|const STR = \{/.test(html) && html.includes('const STR = window.RB_STR;'), 'no text tables left inside index.html (they live in strings.js)');
ok(html.indexOf('strings.js?v=') < html.indexOf('<script>\n(() => {'), 'strings.js loads before the app script');
global.window = {}; new Function(fs.readFileSync(path.join(ROOT, 'strings.js'), 'utf8'))();
const S = global.window.RB_STR;
ok(S && Object.keys(S.en).length > 900 && Object.keys(S.hi).length > 900, `strings.js has the English and Hindi texts (${Object.keys(S.en).length} / ${Object.keys(S.hi).length})`);
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok(/url\.search\.startsWith\('\?v='\)/.test(sw) && /saveAssets/.test(sw), 'the offline cache saves the stamped files with each copy of the page');
done();
