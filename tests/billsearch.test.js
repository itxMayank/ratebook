/* Bill tab on phones: the search is a button — a round floating one on an empty bill, a search icon inside the total bar once
   the bill has items. Tap = the bar opens with the keyboard; ✕ empties it but keeps it open; leaving it (tap elsewhere, add an
   item) folds it back. Prices tab and laptops keep the bar. Paid-by tiles are short.
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
    ok(await vis(p, '#tot-find') && !(await vis(p, '#bsfab')) && !(await vis(p, '#searchbox')), `${spos}: bill with items — search is an icon in the total bar (nothing floats over the bill)`);
    const f = await p.$eval('#tot-find', e => e.getBoundingClientRect()), t = await p.$eval('#bill-total', e => e.getBoundingClientRect());
    ok(f.top >= t.top && f.bottom <= t.bottom && f.height >= 40, `${spos}: it sits inside the total card, a full-size tap target`);
    ok(await p.evaluate(() => { const f = document.querySelector('#tot-find').getBoundingClientRect(); return ['#bill-wa', '#bill-done', '#tot-more'].every(s => document.querySelector(s).getBoundingClientRect().right <= f.left + 1); }), `${spos}: the search icon is at the far right of the total card`);
    ok((await p.$eval('[data-pm="cash"]', e => e.getBoundingClientRect().height)) <= 34, `${spos}: Paid by tiles are short (≤ 34 px)`);
    await p.tap('#tot-find'); await p.waitForTimeout(300);
    ok(await vis(p, '#searchbox') && await p.evaluate(() => document.activeElement.id === 'q'), `${spos}: tap → the bar opens and the cursor is in it`);
    await p.keyboard.type('bag'); await p.waitForTimeout(300); await p.tap('#q-clear'); await p.waitForTimeout(300);
    ok(await vis(p, '#searchbox') && await p.evaluate(() => document.querySelector('#q').value === '' && document.activeElement.id === 'q'), `${spos}: ✕ empties it and keeps it open, cursor still in it`);
    await p.keyboard.type('cup'); await p.waitForTimeout(300);
    await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(300);
    ok(!(await vis(p, '#searchbox')) && await vis(p, '#tot-find') && await p.evaluate(() => document.querySelector('#q').value === ''), `${spos}: leaving the box folds it back to the button (word cleared)`);
    await p.tap('#tot-find'); await p.keyboard.type('garbage'); await p.waitForTimeout(400);
    { for (let k = 0; k < 7; k++) await p.keyboard.press('Backspace'); await p.keyboard.type('bag'); await p.waitForTimeout(400);
      const g = await p.evaluate(() => { const ms = [...document.querySelectorAll('#bill-search-results .mini')]; const r = ms.map(e => e.getBoundingClientRect()), box = document.querySelector('#bill-search-results');
        const rise = document.querySelector('#rise'), dock = document.querySelector('#dock');
        return { n: ms.length, touch: r.slice(1).every((x, i) => Math.abs(Math.min(x.top, r[i].top) + (x.top < r[i].top ? x.height : r[i].height) - Math.max(x.top, r[i].top)) < 1.5),
          tile: ms.some(e => e.querySelector('.thumb')), bg: getComputedStyle(box).backgroundColor, price: !!ms[0].querySelector('.mprice'),
          covered: !rise.classList.contains('on') || getComputedStyle(rise).position !== 'fixed' || rise.getBoundingClientRect().bottom >= innerHeight - 1 }; });
      ok(g.n > 1 && g.touch && !g.tile && g.bg !== 'rgba(0, 0, 0, 0)' && g.price, `${spos}: Bill results look like the Prices search (one grouped list, no gaps, no letter tiles, price on the right)`);
      ok(g.covered, `${spos}: nothing of the bill shows between the results and the search bar`);
      for (let k = 0; k < 3; k++) await p.keyboard.press('Backspace'); await p.keyboard.type('garbage'); await p.waitForTimeout(400); }
    await p.tap('#bill-search-results [data-add="i3"] .name'); await p.waitForTimeout(500);
    ok(await p.evaluate(() => T.S.bill.some(l => l.id === 'i3')) && await vis(p, '#tot-find') && !(await vis(p, '#searchbox')), `${spos}: tapping a result adds it, then back to the button`);
    await p.evaluate(() => { T.S.bill.length = 0; T.setTab('items'); T.setTab('bill'); }); await p.waitForTimeout(400);
    ok(await vis(p, '#bsfab') && await vis(p, '#empty-find'), `${spos}: empty bill — floating search button plus a "Find an item" button in the empty message`);
    await p.tap('#empty-find'); await p.waitForTimeout(300);
    ok(await p.evaluate(() => document.activeElement.id === 'q'), `${spos}: "Find an item" opens the search with the cursor in it`);
    await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(200);
    await p.evaluate(() => T.setTab('items')); await p.waitForTimeout(300);
    ok(await vis(p, '#searchbox') && !(await vis(p, '#bsfab')), `${spos}: Prices tab keeps the search bar`);
    await p.context().close();
  }
  // typing in a bill box: header scrolls away, total card steps aside (but stays for Cash given)
  for (const spos of ['bottom', 'top']) {
    const p = await phone(390, 844, spos, true);
    await p.evaluate(() => { for (let i = 0; i < 4; i++) T.addToBill('i' + i, 1); }); await p.waitForTimeout(300);
    await p.focus('#br-1'); await p.setViewportSize({ width: 390, height: 450 }); await p.waitForTimeout(500);
    const tt = await p.$eval('#bill-total', e => e.getBoundingClientRect());
    ok(await p.$eval('header.top', e => getComputedStyle(e).position) === 'static' && tt.height < 70 && 450 - tt.bottom < 20 && await vis(p, '#bill-done'), `${spos}: typing a rate — header scrolls away; total card is one slim line at the bottom with Done still there (${Math.round(tt.height)} px)`);
    await p.evaluate(() => document.activeElement.blur()); await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
    ok(await p.$eval('header.top', e => getComputedStyle(e).position) === 'sticky' && await p.$eval('#bill-total', e => e.getBoundingClientRect().height) > 90, `${spos}: done typing — header and the full total card are back`);
    await p.tap('#cash-open'); await p.waitForTimeout(200); await p.focus('#cash-in'); await p.waitForTimeout(300);
    ok(await vis(p, '#cashrow'), `${spos}: typing Cash given (inside the total card) keeps the full card`);
    await p.context().close();
  }
  const d = await phone(1280, 800, 'bottom');
  ok(!(await vis(d, '#bsfab')) && await vis(d, '#searchbox'), 'laptop: no floating button, the search bar stays');
  await d.context().close();
  await b.close(); done();
})();
