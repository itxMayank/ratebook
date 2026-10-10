/* iPhone behaviour (simulated in Chromium: iPhone identity + Safari-style keyboard, where the page keeps its height and only the
   visible area shrinks or slides). Real Safari isn't available here; this checks our iPhone-specific logic.
   Run: node tests/ios.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,addToBill,setTab');
const items = Array.from({ length: 12 }, (_, i) => ({ id: 'i' + i, name: 'PP Bag ' + (10 + i) + 'x' + (20 + i), unit: 'pc', buy: 10, sell: 14 + i }));
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
(async () => {
  const b = await launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'G', mode: 'live' }, sv: 41, me: { name: 'M', role: 'owner', personal: true, prefs: {} } }) }));
  await p.addInitScript(() => {
    localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'M', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' }));
    // Safari-style visual viewport we can move: innerHeight stays 844, the visible part shrinks/slides with the keyboard
    const fake = new EventTarget(); fake.height = 844; fake.offsetTop = 0; fake.width = 390; fake.offsetLeft = 0; fake.scale = 1;
    Object.defineProperty(window, 'visualViewport', { value: fake }); window.__vv = fake;
  });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
  ok(/maximum-scale=1/.test(await p.$eval('meta[name=viewport]', m => m.content)), 'iPhone: tapping a small box (e.g. the rate) does not zoom the page');
  const kb = (h, top) => p.evaluate(([h, top]) => { window.__vv.height = h; window.__vv.offsetTop = top; window.__vv.dispatchEvent(new Event('resize')); }, [h, top]);
  const rect = s => p.$eval(s, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vis: r.height > 0 && getComputedStyle(e).display !== 'none' }; });
  await p.focus('#q'); await kb(544, 0); await p.waitForTimeout(300);
  let d = await rect('#dock');
  ok(Math.abs(d.bottom - (544 - 8)) < 3 && await p.evaluate(() => document.documentElement.classList.contains('kbo')), 'keyboard up (page not slid): search sits right on the keyboard');
  await kb(544, 300); await p.waitForTimeout(300);   // Safari slides the page up instead
  d = await rect('#dock');
  ok(Math.abs(d.bottom - (844 - 8)) < 3, 'keyboard up and page slid: the search still ends just above the keyboard');
  await kb(844, 0); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.activeElement.id !== 'q') && (await rect('nav.tabs')).vis, 'keyboard down: search let go, tab bar back');
  // Bill: results panel stays inside the visible part when Safari slides the page
  await p.evaluate(() => { T.addToBill('i0', 1); T.setTab('bill'); }); await p.waitForTimeout(300);
  await p.focus('#q'); await kb(544, 250); await p.keyboard.type('bag'); await p.waitForTimeout(400);
  const r = await rect('#rise');
  ok(r.vis && r.top >= 250, 'Bill: results show (no :has() needed) and start inside the visible part of the slid page');
  await kb(844, 0); await p.waitForTimeout(300);
  ok(!(await p.$eval('.total .ts2', e => e.classList.contains('empty'))) && await p.$eval('.total .ts2', e => getComputedStyle(e).display !== 'none'), 'total card: second line (Cash given?) shown without :has()');
  await p.click('[data-pay=credit]'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => { const w = document.querySelector('.total .ts2'), d = document.querySelector('#bill-duechip'); return !w.classList.contains('empty') && !d.hidden && document.querySelector('#cash-open').hidden; }), 'credit bill: second line shows Due (Cash given? hides)');
  await b.close(); done();
})();
