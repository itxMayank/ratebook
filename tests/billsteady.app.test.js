/* Bill tab on phones (22 Oct 2026): no wand or EN | हि on the Bill tab (they stay on Prices and on a laptop), and the bill
   holds still while the search opens and closes; after an item is added it moves once, down to the new line, never up first.
   Run: node tests/billsteady.app.test.js */
const { appHtml, launch } = require('./browser');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const html = appHtml('S,addToBill,setTab,appUnlock');
const items = Array.from({ length: 12 }, (_, k) => ({ id: 'i' + k, name: 'Bag item ' + k, unit: 'pc', buy: 5, sell: 7 }));
const cfg = { shopName: 'Shree Pushpadant Plastics and Packaging', mode: 'live', roundTo: 1, defaultUnit: 'pc', nextBill: 1774, nextGstBill: 312 };
(async () => {
  const b = await launch();
  async function phone(spos, desk) {
    const ctx = await b.newContext(desk ? { viewport: { width: 1280, height: 800 } } : { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://fonts.**', r => r.abort());
    await ctx.route('https://script.google.com/**', r => { const q = r.request(); const send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      if (q.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 68 });
      const bd = JSON.parse(q.postData());
      if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 68, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
      return send({ rev: '1' }); });
    await p.addInitScript(x => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); localStorage.setItem('rb_spos', JSON.stringify(x)); }, spos);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
    return { p, ctx, errs };
  }
  const shown = (p, s) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, s);

  // A. the header on the Bill tab
  let { p, ctx, errs } = await phone('bottom');
  ok(await shown(p, '#cmd-open') && await shown(p, 'header.top .lang'), 'A1 Prices tab: wand and EN | हि are there');
  await p.evaluate(() => T.setTab('bill')); await p.waitForTimeout(300);
  ok(!await shown(p, '#cmd-open') && !await shown(p, 'header.top .lang'), 'A2 Bill tab: no wand, no EN | हि');
  const nm = await p.evaluate(() => { const n = document.querySelector('#shopname'), h = document.querySelector('header.top .bar'); return [n.getBoundingClientRect().right, h.getBoundingClientRect().right, document.querySelector('#nbell').hidden]; });
  ok(nm[0] > 300, 'A3 Bill tab: the shop name uses the room the buttons left (ends at ' + Math.round(nm[0]) + ' px)');
  await p.evaluate(() => T.setTab('items')); await p.waitForTimeout(300);
  ok(await shown(p, '#cmd-open') && await shown(p, 'header.top .lang'), 'A4 back on Prices: they come back');
  await ctx.close();
  ({ p, ctx } = await phone('bottom', true));
  ok(await shown(p, '#cmd-open') && await shown(p, 'header.top .lang'), 'A5 laptop (bill panel open): unchanged');
  await ctx.close();

  // B. the bill holds still while searching (both search positions)
  for (const spos of ['bottom', 'top']) {
    ({ p, ctx, errs } = await phone(spos));
    await p.evaluate(() => { for (let k = 0; k < 5; k++) T.addToBill('i' + k); T.setTab('bill'); }); await p.waitForTimeout(500);
    await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(300);
    const y0 = await p.evaluate(() => scrollY);
    await p.evaluate(() => { window.__ys = []; addEventListener('scroll', () => window.__ys.push(scrollY)); });
    await p.click('#tot-find'); await p.waitForTimeout(600);
    const y1 = await p.evaluate(() => scrollY);
    ok(Math.abs(y1 - y0) <= 1, `B1 ${spos}: opening the search leaves the bill where it was (${y0} → ${y1})`);
    await p.keyboard.type('item 7'); await p.waitForTimeout(400);
    await p.evaluate(() => { window.__ys = []; });
    await p.click('#bill-search-results .mini'); await p.waitForTimeout(1200);
    const r = await p.evaluate(() => { const l = [...document.querySelectorAll('#bill-lines .bill-line')].pop(), t = document.querySelector('#bill-total'); return { ys: window.__ys, y: scrollY, lb: l.getBoundingClientRect().bottom, tt: t.getBoundingClientRect().top, n: l.textContent.includes('Bag item 7'), nm: [...document.querySelectorAll('#bill-lines .bill-line .name')].map(e=>e.textContent.slice(0,12)).join(',') }; });
    ok(r.n, `B2 ${spos}: the item is added at the end (${r.nm})`);
    ok(r.ys.every(v => v >= y1 - 1), `B3 ${spos}: after adding, the bill never moves up first (${[y1, ...r.ys].join(', ')})`);
    ok(r.lb <= r.tt + 1, `B4 ${spos}: the new line ends up above the total card (${Math.round(r.lb)} / ${Math.round(r.tt)})`);
    const y2 = await p.evaluate(() => scrollY);
    await p.click('#tot-find'); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(800);
    const y3 = await p.evaluate(() => scrollY);
    ok(Math.abs(y3 - y2) <= 1, `B5 ${spos}: opening and closing the search without adding: still where it was (${y2} → ${y3})`);
    ok(!errs.length, `B6 ${spos}: no page errors ${errs.join('; ')}`);
    await ctx.close();
  }
  await b.close();
})();
