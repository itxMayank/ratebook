/* Bottom search with many results: they can be scrolled (Prices page and the Bill results panel), and a redraw (photos arriving,
   a sync) doesn't pull the list back to the best match. Run: node tests/searchscroll.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,addToBill,setTab,renderList');
const items = Array.from({ length: 30 }, (_, i) => ({ id: 'i' + i, name: 'PP Bag ' + (10 + i) + 'x' + (20 + i), unit: 'pc', buy: 10, sell: 14 + i }));
(async () => {
  const b = await launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'G', mode: 'live' }, sv: 41, me: { name: 'M', role: 'owner', personal: true, prefs: {} } }) }));
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'M', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
  await p.focus('#q'); await p.setViewportSize({ width: 390, height: 520 }); await p.keyboard.type('bag'); await p.waitForTimeout(600);
  const y0 = await p.evaluate(() => scrollY);
  await p.mouse.move(200, 200); await p.mouse.wheel(0, -1200); await p.waitForTimeout(400);
  const y1 = await p.evaluate(() => scrollY);
  await p.evaluate(() => T.renderList()); await p.waitForTimeout(300);   // e.g. photos arriving while you scroll
  const y2 = await p.evaluate(() => scrollY);
  ok(y0 > 1000 && y1 < y0 - 800 && Math.abs(y2 - y1) < 2, `Prices: 30 results scroll up from the best match (${y0} → ${y1}), and a redraw keeps the place (${y2})`);
  await p.keyboard.type(' 1'); await p.waitForTimeout(500);
  const gap = await p.evaluate(() => document.querySelector('#dock').getBoundingClientRect().top - document.querySelector('#list > *').getBoundingClientRect().bottom);
  ok(gap >= 0 && gap < 40, 'typing more jumps back to the best match, just above the search (' + Math.round(gap) + ' px)');
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await p.evaluate(() => { document.activeElement.blur(); const q = document.querySelector('#q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); T.addToBill('i0', 1); T.setTab('bill'); }); await p.waitForTimeout(400);
  await p.focus('#q'); await p.setViewportSize({ width: 390, height: 420 }); await p.keyboard.type('bag'); await p.waitForTimeout(600);
  const r0 = await p.evaluate(() => { const r = document.querySelector('#rise'); return { st: r.scrollTop, sh: r.scrollHeight, ch: r.clientHeight }; });
  await p.mouse.move(200, 150); await p.mouse.wheel(0, -2000); await p.waitForTimeout(400);
  const topMost = await p.evaluate(() => { const r = document.querySelector('#rise').getBoundingClientRect(); const m = [...document.querySelectorAll('#rise .mini')].map(e => e.getBoundingClientRect().top); return Math.min(...m) - r.top; });
  ok(r0.sh > r0.ch && r0.st > 0 && topMost >= 0, 'Bill: results that don\'t fit above the keyboard start at the best match and scroll up to the last one');
  await b.close(); done();
})();
