/* admin.html → a shop's own page (13 Oct 2026): tapping a shop card opens #shop/<code> with Overview, Speed (14 days of timings
   from the shop's script v47+, a chart of the average wait per day split into script / phone & internet, "What to fix" worked
   out from the timings, by action, by phone type), Errors and Setup. An older script gets a note instead of the history.
   Run: node tests/adminshop.test.js */
const fs = require('fs'), path = require('path');
const { launch, ok, done, ROOT } = require('./browser');
const { withCsp } = require('../tools/stamp');
const html = withCsp(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').replace(/const DIR_URL = "[^"]*";/, 'const DIR_URL = "https://script.google.com/macros/s/DIRECTORY/exec";'));
const DIR = 'https://script.google.com/macros/s/DIRECTORY/exec';
const shops = [{ code: 'main', name: 'Gupta Plastics & Packaging', status: 'live', version: 47, scriptId: 'm', deploymentId: 'd', apiUrl: 'x', editUrl: 'https://script.google.com/d/m/edit', sheetUrl: 'https://docs.google.com/spreadsheets/d/s/edit' },
  { code: 'SHARMA-ABCDEFGHJK', name: 'Sharma Traders', status: 'live', version: 46, scriptId: 's', deploymentId: 'd2', apiUrl: 'y' }];
// 14 days of history in the shape the script keeps (PERFD_*): India days
const bk = (i, n) => { const b = new Array(8).fill(0); b[i] = n; return b; };
const days = []; for (let i = 13; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
  days.push({ d, a: { listBills: [200, 0, 0, 0, 0, 200 * 3200].concat(bk(5, 200)), list: [100, 0, 10, 0, 0, 100 * 1500].concat(bk(3, 100)), takeBill: [50, 0, 0, 10, 10 * 6000, 40 * 900].concat([0, 0, 40, 0, 0, 0, 10, 0]) },
    p: { listBills: [150, 150 * 3200, 150 * (4500 + (i === 2 ? 3000 : 0))].concat(bk(6, 150), bk(3, 150)), takeBill: [40, 40 * 900, 40 * 1400].concat(bk(3, 40), bk(1, 40)) }, l: { 'Android · Chrome · app': [190, 190 * 3900] } }); }
const full = { ok: true, sv: 47, items: 412, bills: { today: 23, todayAmt: 18450, month: 410, monthAmt: 512000, all: 900 }, tbills: {}, mode: 'live', sessions: 4, users: 3, cells: 1200000, triggers: ['autoBackup', 'watchSheet'], approveNew: false, perfDays: days, rows: { Bills: 9000, 'Test Bills': 40, Items: 412 } };
(async () => {
  const b = await launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  const asked = [];
  await p.route(DIR, async r => { const bd = JSON.parse(r.request().postData()); asked.push(bd.action + (bd.code ? ':' + bd.code : '')); const send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, ...o }) });
    if (bd.action === 'list') return send({ shops });
    if (bd.action === 'latest') return send({ latest: { sv: 47 } });
    if (bd.action === 'recheck') return send({ health: { main: { ok: true, sv: 47, items: 412, bills: full.bills, tbills: {}, sessions: 4 }, 'SHARMA-ABCDEFGHJK': { ok: true, sv: 46, bills: {}, tbills: {} } } });
    if (bd.action === 'shopHealth') return send({ health: bd.code === 'main' ? full : { ok: true, sv: 46, bills: {}, tbills: {}, perf: [{ a: 'list', n: 12, p50: 900, p95: 2100 }], reqs: 12 } });
    if (bd.action === 'errors') return send({ errors: bd.code === 'main' ? [{ t: Date.now() - 6e5, shop: 'main', kind: 'sheet', where: 'takeBill', m: 'Exceeded maximum execution time' }] : [] });
    return send({}); });
  await p.addInitScript(() => { localStorage.setItem('rbadm_tok', '"T"'); });
  await p.goto('https://rb.test/admin.html'); await p.waitForTimeout(700);

  // A. the card opens the shop's page
  ok(await p.isVisible('#shops [data-act=open][data-code=main]'), 'A1 each card has a Details button');
  await p.click('#shops .card[data-open=main] .stats'); await p.waitForTimeout(600);
  ok(/#shop\/main$/.test(p.url()) && await p.isVisible('#s-shop') && !(await p.isVisible('#s-app')), 'A2 tapping the card opens the shop\'s own page (#shop/main)');
  ok(/Gupta Plastics & Packaging/.test(await p.textContent('#sp .sp-head')) && await p.$$eval('.sp-nav a', a => a.map(x => x.textContent).join()) === 'Overview,Speed,Errors,Setup', 'A3 name in full, and the four sections listed at the top');
  ok(asked.includes('shopHealth:main') && asked.includes('errors:main'), 'A4 the page asks for that shop\'s full health and its errors');

  // B. speed: tiles, chart, tooltip, table
  const tiles = await p.textContent('#sp-speed .tiles');
  ok(/Typical wait on phones/.test(tiles) && /In the script/.test(tiles) && /%/.test(tiles), 'B1 speed tiles: typical wait, script time, phone & internet share');
  ok(await p.$$eval('#sp-chart .hit', h => h.length) === 7 && await p.$$eval('#sp-chart .c1', h => h.length) === 7 && await p.$$eval('#sp-chart .c2', h => h.length) === 7, 'B2 7 days: one stacked column per day (script + phone & internet)');
  const box = await p.$eval('#sp-chart .hit[data-i="4"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height - 10]; });
  await p.mouse.move(box[0], box[1]); await p.waitForTimeout(100);
  const tip = await p.textContent("#tip");
  ok(await p.isVisible('#tip') && /average wait/.test(tip) && /in the script/.test(tip) && /phone & internet/.test(tip) && /requests/.test(tip), 'B3 hovering a day shows its numbers (whole wait, script, phone & internet, requests)');
  await p.mouse.move(5, 5); await p.waitForTimeout(80); ok(!(await p.isVisible('#tip')), 'B4 …and hides when the pointer leaves');
  await p.focus('#sp-chart .hit[data-i="0"]'); ok(await p.isVisible('#tip'), 'B5 the same numbers on keyboard focus');
  await p.click('#sp-tbl summary'); ok(await p.$$eval('#sp-tbl tbody tr', r => r.length) === 7, 'B6 "Show as table": one row per day');
  ok(/Phone & internet/.test(await p.textContent('.legend')) && /In the script/.test(await p.textContent('.legend')), 'B7 legend names both parts');
  await p.click('#sp-days button[data-d="14"]'); await p.waitForTimeout(200);
  ok(await p.$$eval('#sp-chart .hit', h => h.length) === 14 && await p.evaluate(() => localStorage.rbadm_spd) === '14', 'B8 14 days: 14 columns, choice remembered');

  // C. what to fix
  const fixes = await p.$$eval('.fix', f => f.map(x => [x.className, x.querySelector('.ft b').textContent, x.textContent]));
  const has = re => fixes.find(f => re.test(f[1]));
  ok(has(/Past bills is slow because the Bills tab is big/) && /9,040 rows/.test(has(/Past bills/)[2]) && /Archive/.test(has(/Past bills/)[2]), 'C1 Past bills slow + a big Bills tab → archive old bills');
  ok(has(/waking up/) && /10\+ quiet minutes/.test(has(/waking up/)[2]), 'C2 slow first requests after quiet spells → keep the script ready');
  ok(has(/Price list is rarely served from the saved reply/) && /10%/.test(has(/Price list is rarely/)[2]), 'C3 price list mostly built from the sheet → find what keeps changing its version');
  const lost = fixes.map(f => { const m = /≈ (\d+) (min|s) of waiting a day/.exec(f[2]); return m ? +m[1] * (m[2] === 'min' ? 60 : 1) : -1; });
  ok(fixes.every(f => /medium/.test(f[0]) && /Worth fixing/.test(f[2])) && lost.every(v => v > 0) && lost.every((v, i) => !i || v <= lost[i - 1]), 'C4 each says how much waiting it costs a day, biggest first (' + lost.join(', ') + ' s)');
  const rows = await p.$$eval('#sp-speed .arows', a => a.map(x => x.textContent));
  ok(/^Past bills/.test(rows[0].trim()) && /phone/.test(rows[0]) && /Android · Chrome · app/.test(rows[1]), 'C5 by action (most waiting first) and by phone type');

  // D. errors and setup
  ok(/Exceeded maximum execution time/.test(await p.textContent('#sp-err')), 'D1 this shop\'s errors (7 days) on its page');
  ok(await p.isVisible('#sp-set [data-act=update]') && await p.getAttribute('#sp-set a[href*="spreadsheets"]', 'target') === '_blank' && /Bills 9,000 rows/.test((await p.textContent('#sp-set')).replace(/\s+/g, ' ')), 'D2 setup: update, open sheet, size of the tabs');

  // E. back, and an older script
  await p.click('#sp-back'); await p.waitForTimeout(300);
  ok(await p.isVisible('#s-app') && !(await p.isVisible('#s-shop')) && !/#shop/.test(p.url()), 'E1 All shops goes back to the list');
  await p.click('#shops [data-act=open][data-code="SHARMA-ABCDEFGHJK"]'); await p.waitForTimeout(600);
  ok(/v47 or newer/.test(await p.textContent('#sp-speed')) && /typical/.test(await p.textContent('#sp-speed')), 'E2 a shop on an older script: a note to update, plus its last few hours of timings');
  await p.goBack(); await p.waitForTimeout(300); ok(await p.isVisible('#s-app'), 'E3 the browser\'s Back also returns to the list');

  // F. phone width, dark
  await p.setViewportSize({ width: 360, height: 800 }); await p.goto('https://rb.test/admin.html#shop/main'); await p.waitForTimeout(900);
  ok(await p.isVisible('#sp-chart svg') && await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'F1 360 px wide: opens straight from the link, nothing spills sideways');
  ok(await p.evaluate(() => [...document.querySelectorAll('#sp .stat b, #sp .stat small, #sp .fix b')].every(e => e.scrollWidth <= e.clientWidth + 1)), 'F2 no number or title cut off');
  await p.click('#theme button[data-th=dark]'); await p.waitForTimeout(100);
  ok(await p.$eval('#sp-chart .c1', e => getComputedStyle(e).fill) === 'rgb(110, 107, 240)' && await p.$eval('#sp-chart .c2', e => getComputedStyle(e).fill) === 'rgb(21, 154, 166)', 'F3 dark mode: the chart uses its dark-mode colours');
  if (process.env.SHOT) { await p.screenshot({ path: process.env.SHOT + '/shop-phone-dark.png', fullPage: true }); await p.click('#theme button[data-th=light]'); await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(300); await p.screenshot({ path: process.env.SHOT + '/shop-laptop.png', fullPage: true }); }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
