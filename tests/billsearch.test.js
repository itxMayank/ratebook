/* Bill tab on phones: the search is a round floating button. Tap = the bar opens with the keyboard; ✕ empties it but keeps it
   open; leaving it (tap elsewhere, add an item) folds it back. Prices tab and laptops keep the bar. Paid-by tiles are short.
   Run: node tests/billsearch.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,addToBill,setTab');
const items = ['PP Bag 12x18', 'PP Bag 16x20', 'Paper Cup 150ml', 'Garbage Bag'].map((n, i) => ({ id: 'i' + i, name: n, unit: 'pc', buy: 10 + i, sell: 14 + i }));
(async () => {
  const b = await launch();
  async function phone(w, h, spos, mob) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(mob ? { isMobile: true, hasTouch: true } : {}) }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'G', mode: 'live', nextBill: 5 }, sv: 43, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }) }));
    await p.addInitScript(x => { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); localStorage.setItem('rb_spos', JSON.stringify(x)); }, spos);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
    await p.evaluate(() => { T.addToBill('i2', 2); T.setTab('bill'); }); await p.waitForTimeout(400); return p;
  }
  const vis = (p, s) => p.$eval(s, e => { const r = e.getBoundingClientRect(); return r.height > 0 && getComputedStyle(e).display !== 'none'; });
  for (const spos of ['bottom', 'top']) {
    const p = await phone(390, 844, spos, true);
    ok(await vis(p, '#bsfab') && !(await vis(p, '#searchbox')), `${spos}: Bill tab shows a round search button, not the bar`);
    const f = await p.$eval('#bsfab', e => e.getBoundingClientRect()), t = await p.$eval('#bill-total', e => e.getBoundingClientRect());
    ok(f.bottom <= t.top && t.top - f.bottom < 30 && f.right > 340, `${spos}: it floats at the right, just above the total card`);
    ok((await p.$eval('[data-pm="cash"]', e => e.getBoundingClientRect().height)) <= 34, `${spos}: Paid by tiles are short (≤ 34 px)`);
    await p.tap('#bsfab'); await p.waitForTimeout(300);
    ok(await vis(p, '#searchbox') && !(await vis(p, '#bsfab')) && await p.evaluate(() => document.activeElement.id === 'q'), `${spos}: tap → the bar opens and the cursor is in it`);
    await p.keyboard.type('bag'); await p.waitForTimeout(300); await p.tap('#q-clear'); await p.waitForTimeout(300);
    ok(await vis(p, '#searchbox') && await p.evaluate(() => document.querySelector('#q').value === '' && document.activeElement.id === 'q'), `${spos}: ✕ empties it and keeps it open, cursor still in it`);
    await p.keyboard.type('cup'); await p.waitForTimeout(300);
    await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
    ok(!(await vis(p, '#searchbox')) && await vis(p, '#bsfab') && await p.evaluate(() => document.querySelector('#q').value === ''), `${spos}: leaving the box folds it back to the button (word cleared)`);
    await p.tap('#bsfab'); await p.keyboard.type('garbage'); await p.waitForTimeout(400);
    await p.tap('#bill-search-results [data-add="i3"] .name'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => T.S.bill.some(l => l.id === 'i3')) && await vis(p, '#bsfab') && !(await vis(p, '#searchbox')), `${spos}: tapping a result adds it, then back to the button`);
    await p.evaluate(() => T.setTab('items')); await p.waitForTimeout(300);
    ok(await vis(p, '#searchbox') && !(await vis(p, '#bsfab')), `${spos}: Prices tab keeps the search bar`);
    await p.context().close();
  }
  const d = await phone(1280, 800, 'bottom');
  ok(!(await vis(d, '#bsfab')) && await vis(d, '#searchbox'), 'laptop: no floating button, the search bar stays');
  await d.context().close();
  await b.close(); done();
})();
