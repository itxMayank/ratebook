/* admin.html look refresh (20 Oct 2026, Mayank): rounded cards like the app; on the shops list a greeting, the four figures,
   and filter chips All · Needs you · Update ready; the first time a view shows, its blocks fade up one after another and the
   money counts up (once, not on every refresh); names wrap instead of being cut; a shop's page is tabs (tested in adminshop).
   Run: node tests/adminlook.test.js */
const fs = require('fs'), path = require('path');
const { launch, ok, done, ROOT } = require('./browser');
const { withCsp } = require('../tools/stamp');
const html = withCsp(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').replace(/const DIR_URL = "[^"]*";/, 'const DIR_URL = "https://script.google.com/macros/s/DIRECTORY/exec";'));
const DIR = 'https://script.google.com/macros/s/DIRECTORY/exec';
const shops = [{ code: 'main', name: 'Gupta Plastics & Packaging Wholesale and Retail Suppliers', status: 'live', version: 67, scriptId: 'm', deploymentId: 'd' },
  { code: 'SHARMA-ABCDEFGHJK', name: 'Sharma Traders', status: 'live', version: 66, scriptId: 's', deploymentId: 'd2' },
  { code: 'RAVI-ABCDEFGHJK', name: 'Ravi Kirana', status: 'needs-auth', version: 67, editUrl: 'https://script.google.com/d/r/edit' }];
(async () => {
  const b = await launch(); const errs = [];
  async function page(w, dark) {
    const ctx = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: dark ? 'dark' : 'light' }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'log') errs.push('console.log: ' + m.text()); });
    await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    p.n = 0;
    await p.route(DIR, async r => { const bd = JSON.parse(r.request().postData()); const send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({ ok: true }, o)) });
      if (bd.action === 'list') return send({ shops });
      if (bd.action === 'latest') return send({ latest: { sv: 67 } });
      if (bd.action === 'recheck') { p.n++; await new Promise(res => setTimeout(res, 300)); return send({ health: { main: { ok: true, sv: 67, items: 412, bills: { today: 23, todayAmt: 18450, month: 410, monthAmt: 512000 }, tbills: {}, sessions: 4 }, 'SHARMA-ABCDEFGHJK': { ok: true, sv: 66, bills: {}, tbills: {}, sessions: 1, pending: 1 } } }); }
      return send({}); });
    await p.addInitScript(() => { localStorage.setItem('rbadm_tok', '"T"'); window.__intro = 0;
      new MutationObserver(m => m.forEach(x => { if (x.target.id === 'shops' && x.target.classList.contains('intro')) window.__intro = window.__intro || Date.now(); })).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
    await p.goto('https://rb.test/admin.html'); return p;
  }
  const p = await page(1280);
  const seen = await p.evaluate(() => new Promise(res => { const out = { vals: [], intro: false }; const t0 = Date.now();
    const tick = () => { const v = document.querySelector('#k-today').textContent; if (out.vals[out.vals.length - 1] !== v) out.vals.push(v);
      if (document.querySelector('#shops').classList.contains('intro')) { out.intro = true; out.on = (out.on || 0) + 1; } if (Date.now() - t0 < 2600) requestAnimationFrame(tick); else res(out); }; tick(); }));
  const mid = seen.vals.filter(v => /₹/.test(v) && v !== '₹18,450').length + ' steps';
  await p.waitForTimeout(2400);
  ok(/Namaste/.test(await p.textContent('#s-app')) && /Your shops today/.test(await p.textContent('#s-app')), 'A1 a greeting and "Your shops today" above the figures');
  ok(await p.textContent('#k-today') === '₹18,450' && parseInt(mid) >= 5, 'A2 the money counts up the first time (' + mid + ' before ₹18,450)');
  ok(await p.evaluate(() => window.__intro > 0) && !(await p.$eval('#shops', e => e.classList.contains('intro'))), 'A3 the shop cards faded up one after another, then the effect is gone');
  await p.evaluate(() => __T && __T.render ? __T.render() : null).catch(() => {});
  await p.click('#b-refresh'); await p.waitForTimeout(900);
  ok(!(await p.$eval('#shops', e => e.classList.contains('intro'))) && await p.textContent('#k-today') === '₹18,450', 'A4 a refresh changes things in place: no fading, no counting again');
  ok(await p.$eval('.card', e => getComputedStyle(e).borderRadius) === '20px' && await p.$eval('#k-errw', e => getComputedStyle(e).borderRadius) === '20px', 'A5 rounded cards (the errors card too)');
  const chips = await p.$$eval('#fchips button', a => a.map(x => x.textContent));
  ok(chips.join() === 'All 3,Needs you 2,Update ready 1', 'A6 filter chips with counts: ' + chips.join(' · '));
  await p.click('#fchips [data-f=need]'); await p.waitForTimeout(150);
  ok((await p.$$eval('#shops .card', a => a.map(x => x.dataset.open))).join() === 'SHARMA-ABCDEFGHJK,RAVI-ABCDEFGHJK' && await p.evaluate(() => localStorage.rbadm_flt) === '"need"', 'A7 "Needs you": a shop with a phone waiting and one not authorised yet; the choice is remembered');
  await p.click('#fchips [data-f=upd]'); await p.waitForTimeout(150);
  ok((await p.$$eval('#shops .card', a => a.map(x => x.dataset.open))).join() === 'SHARMA-ABCDEFGHJK', 'A8 "Update ready": only the shop on an older script');
  await p.click('#fchips [data-f=all]'); await p.waitForTimeout(150);
  ok(await p.$$eval('#shops .card', a => a.length) === 3, 'A9 All: every shop again');
  ok(await p.$eval('.card[data-open=main] .c-title b', e => e.scrollWidth <= e.clientWidth + 1 && getComputedStyle(e).whiteSpace === 'normal'), 'A10 a long shop name wraps, never cut with "…"');

  /* phone width, dark */
  const q = await page(360, true); await q.waitForTimeout(2800);
  ok(await q.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'B1 360 px, dark: nothing spills sideways');
  ok(await q.$eval('.card', e => getComputedStyle(e).backgroundColor) !== 'rgb(255, 255, 255)' && await q.$eval('body', e => getComputedStyle(e).backgroundColor) === 'rgb(13, 14, 16)', 'B2 dark cards on a dark page');

  /* reduced motion: nothing moves, numbers show at once */
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' }), r = await ctx.newPage();
  await r.route('https://rb.test/**', x => x.fulfill({ body: html, contentType: 'text/html' }));
  await r.route(DIR, async x => { const bd = JSON.parse(x.request().postData()); const send = o => x.fulfill({ contentType: 'application/json', body: JSON.stringify(Object.assign({ ok: true }, o)) });
    if (bd.action === 'list') return send({ shops }); if (bd.action === 'recheck') return send({ health: { main: { ok: true, sv: 67, bills: { today: 1, todayAmt: 18450, month: 2, monthAmt: 9000 }, tbills: {} } } }); return send({}); });
  await r.addInitScript(() => { localStorage.setItem('rbadm_tok', '"T"'); });
  await r.goto('https://rb.test/admin.html'); await r.waitForTimeout(700);
  ok(await r.textContent('#k-today') === '₹18,450' && await r.$eval('#shops .card', e => getComputedStyle(e).animationName) === 'none', 'C1 "reduce motion": figures show at once, nothing fades');
  ok(!errs.length, 'no page errors or console logs' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
