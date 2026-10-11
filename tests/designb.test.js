/* Design pass B (11 Oct 2026): Prices list is one grouped list on phones (rows, no letter tile without a photo),
   header compacts once scrolled and comes back at the top, lock screen has the app mark and an EN/हि switch that
   redraws in place (typed name kept), Hindi lines get 1.5 line height. Run: node tests/designb.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,addToBill,setTab');
const items = Array.from({ length: 30 }, (_, i) => ({ id: 'i' + i, name: 'Item ' + (i + 1), nameHi: i % 2 ? 'सामान ' + (i + 1) : '', unit: 'pc', buy: 10, sell: 14 + i }));
(async () => {
  const b = await launch();
  async function phone(auth, w = 390) {
    const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: w < 1024, hasTouch: w < 1024 }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'Shree Ganesh Packaging', mode: 'live', nextBill: 5 }, sv: 43, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }) }));
    if (auth) await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', pinLen: 4 })));
    await p.goto('https://rb.test/'); await p.waitForTimeout(1300); return p;
  }
  let p = await phone(true);
  ok(await p.$('#applock .al-mark') !== null && await p.$('#applock [data-al-lang="hi"]') !== null, 'lock screen shows the app mark and an EN / हि switch');
  await p.click('[data-al-lang="hi"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => document.documentElement.lang === 'hi' && /PIN/.test(document.querySelector('#al-lbl').textContent) && document.querySelector('[data-al-lang="hi"]').getAttribute('aria-pressed') === 'true'), 'tapping हि switches the lock screen to Hindi in place');
  await p.click('[data-al-lang="en"]'); await p.waitForTimeout(200);
  await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
  const rows = await p.evaluate(() => { const l = document.querySelector('#list'), c = [...l.querySelectorAll('.card')].slice(0, 6);
    return { cls: l.classList.contains('rows'), shadow: getComputedStyle(c[0]).boxShadow, thumb: getComputedStyle(c[0].querySelector('.thumb')).display, h: Math.max(...c.map(e => e.getBoundingClientRect().height)), gap: c[1].getBoundingClientRect().top - c[0].getBoundingClientRect().bottom }; });
  ok(rows.cls && rows.shadow === 'none' && rows.gap < 1, 'Prices: one grouped list, rows touch with a divider (no card shadow each)');
  ok(rows.thumb === 'none', 'Prices: no letter tile when the item has no photo');
  ok(rows.h <= 86, `Prices: rows are compact (${Math.round(rows.h)} px, was ~94)`);
  const lh = await p.$eval('#list .sub[lang="hi"]', e => parseFloat(getComputedStyle(e).lineHeight) / parseFloat(getComputedStyle(e).fontSize));
  ok(lh >= 1.4, `Hindi name lines get room for vowel marks (line height ${lh.toFixed(2)})`);
  const h0 = await p.$eval('header.top', e => e.offsetHeight);
  await p.evaluate(() => window.scrollTo(0, 600)); await p.waitForTimeout(250);
  const h1 = await p.$eval('header.top', e => e.offsetHeight), hello = await p.$eval('#hello', e => getComputedStyle(e).display);
  ok(h1 < h0 - 20 && hello === 'none' && await p.$eval('#nbell, #cmd-open', e => true), `header compacts once scrolled (${h0} → ${h1} px), actions stay`);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(250);
  ok(await p.$eval('header.top', e => e.offsetHeight) === h0, 'header is full again at the top');
  await p.context().close();
  p = await phone(false);
  await p.fill('#al-name', 'Sanjay'); await p.click('[data-al-lang="hi"]'); await p.waitForTimeout(300);
  ok(await p.$eval('#al-name', e => e.value) === 'Sanjay', 'sign-in: switching language keeps the typed name');
  await p.context().close();
  p = await phone(true, 1280); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
  ok(await p.$eval('#list .card', e => getComputedStyle(e).boxShadow !== 'none'), 'laptop keeps the card grid');
  await p.context().close();
  await b.close(); done();
})();
