/* Search at the bottom on phones: dock above the tab bar / total card, rides on the keyboard, results nearest the thumb,
   "Top" setting and laptops keep it in the header. Run: node tests/bottomsearch.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,addToBill,setTab,placeSearch');
const items = ['PP Bag 12x18', 'PP Bag 16x20', 'Paper Cup 150ml', 'Paper Cup 250ml', 'Aluminium Foil 9m', 'Cling Film', 'Tissue Roll', 'Wooden Spoon', 'Straw', 'Garbage Bag']
  .map((n, i) => ({ id: 'i' + i, name: n, unit: 'pc', buy: 10 + i, sell: 14 + i }));
(async () => {
  const b = await launch();
  async function phone(w, h, init, mob) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true } : {}) }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'Gupta Plastics', mode: 'live', nextBill: 5 }, sv: 41, bl: '0', bt: '0', vl: '0', vt: '0', me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }) }));
    await p.addInitScript(x => { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); if (x) localStorage.setItem('rb_spos', JSON.stringify(x)); }, init || '');
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(500); return p;
  }
  const rect = (p, s) => p.$eval(s, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, vis: r.height > 0 && getComputedStyle(e).display !== 'none' }; });
  const kb = (p, on) => p.evaluate(on => { document.documentElement.style.setProperty('--kb', on ? '300px' : '0px'); }, on);
  const p = await phone(390, 844);
  const H = 844;
  ok(await p.evaluate(() => document.querySelector('#searchbox').parentElement.id) === 'dock', 'phone: the search box lives in the bottom dock');
  let d = await rect(p, '#dock'), tb = await rect(p, 'nav.tabs'), fab = await rect(p, '#fab');
  ok(d.bottom <= tb.top && tb.top - d.bottom < 20 && fab.vis && fab.top >= d.top - 2, 'Prices: search + round Add sit just above the tab bar');
  ok((await rect(p, '#netbar')).vis === false && !!(await p.$('#meta-sync')), 'top is tidy: no "Prices up to date" bar when online; "updated 12:35 ↻" sits in the items line');
  await kb(p, true); await p.focus('#q'); await p.keyboard.type('cup'); await p.waitForTimeout(500);
  d = await rect(p, '#dock'); tb = await rect(p, 'nav.tabs');
  ok(Math.abs((H - d.bottom) - 308) < 3 && !tb.vis && !(await rect(p, '#fab')).vis, 'typing: the search rides on the keyboard; tab bar and Add step aside');
  const cards = await p.$$eval('#list .card, #list > *', els => els.map(e => { const r = e.getBoundingClientRect(); return { b: r.bottom, t: e.textContent }; }));
  const low = cards.reduce((a, c) => c.b > a.b ? c : a, { b: 0 });
  ok(cards.length === 2 && d.top - low.b < 40 && d.top - low.b >= 0 && /150ml|250ml/.test(low.t), 'results sit right above the search (nearest the thumb), not at the top of the screen');
  await p.evaluate(() => document.activeElement.blur()); await kb(p, false); await p.evaluate(() => { const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(400);
  await p.evaluate(() => { T.addToBill('i0', 2); T.addToBill('i2', 5); T.setTab('bill'); }); await p.waitForTimeout(500);
  d = await rect(p, '#dock'); const tot = await rect(p, '#bill-total');
  ok(d.bottom <= tot.top + 1 && tot.top - d.bottom < 20 && !(await rect(p, '#fab')).vis, 'Bill: the search sits just above the total card (no Add button there)');
  ok(!(await rect(p, '#cashrow')).vis && (await rect(p, '#cash-open')).vis, 'Bill: cash-given row folded away, "Cash given?" link instead');
  await kb(p, true); await p.focus('#q'); await p.keyboard.type('bag'); await p.waitForTimeout(500);
  const rise = await rect(p, '#rise'); d = await rect(p, '#dock');
  ok(rise.vis && !(await rect(p, '#bill-total')).vis && Math.abs(rise.bottom - d.top) < 8, 'Bill typing: results rise from the search; total card steps aside');
  await p.click('#rise [data-add="i1"] .name'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => T.S.bill.some(l => l.id === 'i1')), 'tapping a result adds it to the bill');
  await p.context().close();
  const q = await phone(390, 844, 'top');
  ok(await q.evaluate(() => document.querySelector('#searchbox').closest('header') !== null && document.querySelector('#dock').hidden), 'Settings "Top": search stays in the header like before');
  await q.context().close();
  // the dock lines up with the tab bar; Settings buttons share their row
  const m = await phone(390, 844, '', true);
  d = await rect(m, '#dock'); const t2 = await m.$eval('nav.tabs', e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
  const dl = await m.$eval('#dock', e => { const r = e.getBoundingClientRect(); return [r.left, r.right]; });
  ok(Math.abs(dl[0] - t2[0]) < 2 && Math.abs(dl[1] - t2[1]) < 2, 'the search row is exactly as wide as the tab bar');
  // keyboard opens (the app shrinks above it), then closes with the phone's Back: the search box is left, the tab bar comes back
  await m.focus('#q'); await m.setViewportSize({ width: 390, height: 520 }); await m.waitForTimeout(300);
  d = await rect(m, '#dock');
  ok(await m.evaluate(() => document.documentElement.classList.contains('kbo')) && Math.abs(520 - d.bottom - 8) < 3 && !(await rect(m, 'nav.tabs')).vis, 'keyboard open: the search sits on it (no page jump), tab bar steps aside');
  await m.keyboard.type('bag'); await m.waitForTimeout(400);
  const before = await rect(m, '#dock'); await m.mouse.wheel(0, -300); await m.waitForTimeout(200); await m.mouse.wheel(0, 200); await m.waitForTimeout(300);
  const after = await rect(m, '#dock');
  ok(Math.abs(before.bottom - after.bottom) < 1, 'scrolling the results: the search bar stays still');
  await m.setViewportSize({ width: 390, height: 844 }); await m.waitForTimeout(400);
  ok(await m.evaluate(() => document.activeElement.id !== 'q' && !document.body.classList.contains('qtyp')) && (await rect(m, 'nav.tabs')).vis, 'keyboard closed with Back: search box let go, tab bar is back');
  await m.context().close();
  const lap = await phone(1280, 800);
  ok(await lap.evaluate(() => document.querySelector('#searchbox').closest('header') !== null && !document.documentElement.classList.contains('sbot')), 'laptop: unchanged, search in the header');
  await b.close(); done();
})();
