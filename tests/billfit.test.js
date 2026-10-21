/* Bill page fits small phones and large text without hiding things: nothing spills sideways, the total is never cut,
   GST lines line up under the name, the quick qty strip opens over its own line (so the next line stays tappable),
   and with the search at the Top the results show right under it. Run: node tests/billfit.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,addToBill,setTab,setFz,renderBill,updateBillTotals');
const items = ['PP Bag 12x18 heavy quality', 'Sugar loose', 'Paper Cup 150ml', 'Garbage Bag XL 30x40', 'Aluminium container 750ml'].map((n, i) => ({ id: 'i' + i, name: n, unit: i === 1 ? 'kg' : 'pc', buy: 1000 + i, sell: 12345 + i, hsn: '3923', gst: 18 }));
(async () => {
  const b = await launch();
  async function phone(w, h, spos, fz) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'Shree Ganesh Packaging & Disposables', mode: 'live', nextBill: 5 }, sv: 60, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }) }));
    await p.addInitScript(x => { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); localStorage.setItem('rb_spos', JSON.stringify(x.spos)); localStorage.setItem('rb_fz', JSON.stringify(x.fz)); }, { spos, fz });
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
    await p.evaluate(() => { for (let i = 0; i < 5; i++) T.addToBill('i' + i, i === 1 ? 0.25 : 30); T.setTab('bill'); }); await p.waitForTimeout(400); return p;
  }
  const spill = p => p.evaluate(() => { const W = document.documentElement.clientWidth, bad = [];
    document.querySelectorAll('#view-bill *, .total *, header.top *').forEach(e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (r.width && r.height && cs.visibility !== 'hidden' && (r.right > W + 1 || r.left < -1) && !e.closest('#heldrow,.bl-chips')) bad.push((e.id || e.className || e.tagName) + ''); });
    return { page: document.documentElement.scrollWidth > W + 1, bad: bad.slice(0, 5) }; });
  for (const [w, fz] of [[360, 1], [320, 1], [360, 1.38], [412, 1.25]]) {
    const p = await phone(w, 760, 'bottom', fz);
    await p.click('#gst-chip'); await p.waitForTimeout(300);
    const s = await spill(p);
    ok(!s.page && !s.bad.length, `${w}px, text ${fz}: nothing spills off the side ${s.bad.join(' ')}`);
    const sum = await p.$eval('#bill-sum', e => ({ cut: e.scrollWidth > e.clientWidth + 1, txt: e.textContent }));
    ok(!sum.cut && /\d/.test(sum.txt) && !/…/.test(sum.txt), `${w}px, text ${fz}: total shown in full (${sum.txt})`);
    const tl = await p.evaluate(() => { const n = document.querySelector('.bill-line .name'), x = n && n.querySelector('.taxline'), rg = document.createRange(); rg.selectNodeContents(n.firstChild); return x ? Math.abs(x.getBoundingClientRect().left - rg.getBoundingClientRect().left) : -1; });
    ok(tl >= 0 && tl < 4, `${w}px, text ${fz}: GST line sits under the item name (${Math.round(tl)})`);
    for (const id of ['#bill-done', '#bill-wa', '#tot-find']) ok(await p.$eval(id, e => { const r = e.getBoundingClientRect(); return r.width >= 36 && r.height >= 36 && r.right <= innerWidth; }), `${w}px, text ${fz}: ${id} fully on screen and big enough to tap`);
    await p.context().close();
  }
  // quick qty strip opens over its own line, leaving the next line's boxes free
  const q = await phone(390, 844, 'bottom', 1);
  await q.evaluate(() => document.querySelector('[data-fq]').scrollIntoView({ block: 'center' })); await q.waitForTimeout(200);
  await q.tap('[data-fq]'); await q.waitForTimeout(300);
  const qp = await q.evaluate(() => { const s = document.querySelector('#qpick').getBoundingClientRect(), box = document.querySelector('[data-fq]').getBoundingClientRect(), nxt = document.querySelector('#br-2').getBoundingClientRect();
    return { open: !document.querySelector('#qpick').hidden, above: s.bottom <= box.top + 2, freeNext: s.bottom <= nxt.top || s.top >= nxt.bottom, inside: s.left >= 0 && s.right <= innerWidth }; });
  ok(qp.open && qp.above && qp.freeNext && qp.inside, 'quick qty strip opens above its box, on screen, and never covers the next line');
  await q.context().close();
  // search at the Top: results visible right under the bar
  const t = await phone(390, 844, 'top', 1);
  await t.evaluate(() => scrollTo(0, 9999)); await t.tap('#tot-find'); await t.keyboard.type('bag'); await t.waitForTimeout(500);
  const r = await t.evaluate(() => { const m = document.querySelector('#bill-search-results .mini'); return m ? m.getBoundingClientRect().top : -1; });
  ok(r > 0 && r < 400, 'Top search: results show right under the bar, even when the bill was scrolled down (' + Math.round(r) + ')');
  await t.context().close();
  await b.close(); done();
})();
