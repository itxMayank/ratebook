/* Which shop a phone uses (added with the shops.js split, 11 Oct 2026), for what tests/shops.test.js doesn't cover: which
   phone-storage keys are per shop and which per phone, a broken saved shop falls back to the original, ?shop=main, the
   Directory lookup (what it sends, wrong and locked codes, the shop code typed on the sign-in screen), a shop whose link moved
   (shopMismatch), the daily re-check that learns a shop is paused, and the switch-shop list. Any page error fails.
   Run: node tests/shopsmore.app.test.js */
const { appHtml, launch, ok, done, MAIN_API } = require('./browser');
const SH = 'SHARMA-AB12CD34EF', SH_API = 'https://script.google.com/macros/s/SHARMA/exec', SH_API2 = 'https://script.google.com/macros/s/SHARMA2/exec';
const html = appHtml('S,SHOP,SHOP_MAIN,lsKey,ls,apiUrl,shopsKnown,shopRemember,shopMismatch,dirLookup,appUnlock');
const dir = { api: SH_API, status: 'live', locked: false, asked: [] };
(async () => {
  const b = await launch(); const errs = [];
  async function phone(init, url) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://dir.test/**', r => { const u = new URL(r.request().url()), c = u.searchParams.get('code'); dir.asked.push({ code: c, dev: u.searchParams.get('dev') });
      const send = o => r.fulfill({ body: JSON.stringify(o), contentType: 'application/json' });
      if (dir.locked) return send({ ok: false, error: 'dir_locked' });
      if (c === SH) return send({ ok: true, code: SH, api: dir.api, name: 'Sharma Traders', status: dir.status });
      return send({ ok: false, error: 'bad_code' }); });
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), u = new URL(req.url()), shop = /SHARMA/.test(u.pathname) ? SH : 'main';
      const send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop, ...o }) });
      const cfg = { shopName: shop === 'main' ? 'Gupta Plastics' : 'Sharma Traders', mode: 'live' };
      if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 43, bl: '0', bt: '0', vl: '0', vt: '0' });
      const bd = JSON.parse(req.postData()); if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 43, me: { name: 'Sharma ji', role: 'owner', personal: true, prefs: {} } });
      return send({ me: { name: 'Sharma ji', role: 'owner', personal: true, prefs: {} } }); });
    if (init) await p.addInitScript(i => { if (!sessionStorage.done) { for (const k in i) localStorage.setItem(k, i[k]); sessionStorage.done = 1; } }, init);
    await p.goto(url || 'https://rb.test/'); await p.waitForTimeout(1500); return p;
  }
  const sharmaAuth = JSON.stringify({ tok: 't', by: 'Sharma ji', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' });

  // A. a Sharma phone: which keys are per shop, which per phone
  const a = await phone({ rb_shop: JSON.stringify({ code: SH, api: SH_API, name: 'Sharma Traders', at: Date.now() }), [SH + ':rb_auth']: sharmaAuth, rb_lang: '"hi"', rb_auth: 'null' });
  ok(await a.evaluate(() => T.SHOP.code) === SH && await a.evaluate(() => T.apiUrl()) === SH_API, 'A1 saved shop used: its own backend link');
  ok(await a.evaluate(() => [T.lsKey('rb_bill'), T.lsKey('rb_auth'), T.lsKey('rb_lang'), T.lsKey('rb_fz'), T.lsKey('rb_dev'), T.lsKey('rb_shops')].join()) === `${SH}:rb_bill,${SH}:rb_auth,rb_lang,rb_fz,rb_dev,rb_shops`, 'A2 shop data keys get the shop prefix; language, text size, phone id and shop list stay per phone');
  ok(await a.evaluate(() => T.S.lang) === 'hi' && await a.evaluate(() => T.S.canWrite && T.S.auth.by) === 'Sharma ji', 'A3 per-phone language read without prefix; the sign-in read from the shop\'s own key');
  await a.evaluate(() => T.ls.set('rb_cust', 'Sunil'));
  ok(await a.evaluate(() => localStorage.getItem('SHARMA-AB12CD34EF:rb_cust') === '"Sunil"' && localStorage.getItem('rb_cust') === null), 'A4 writes land under the shop prefix only');

  // B. a broken saved shop (no link) and ?shop=main fall back to the original shop
  const bb = await phone({ rb_shop: JSON.stringify({ code: SH }) });
  ok(await bb.evaluate(() => T.SHOP_MAIN) && await bb.evaluate(() => T.apiUrl()) === MAIN_API, 'B1 a saved shop without a link: the original shop, its usual link');
  const bm = await phone({ rb_shop: JSON.stringify({ code: SH, api: SH_API, name: 'Sharma Traders', at: Date.now() }) }, 'https://rb.test/?shop=main');
  ok(await bm.evaluate(() => localStorage.getItem('rb_shop')) === 'null' && await bm.evaluate(() => T.SHOP_MAIN && !location.search), 'B2 ?shop=main on a phone not signed in: back to the original shop, address bar cleaned');

  // C. Directory lookup
  dir.asked = [];
  const c = await phone(null);
  const r1 = await c.evaluate(sh => T.dirLookup(sh).then(x => x, e => ({ err: e.code })), SH);
  ok(r1.api === SH_API && r1.name === 'Sharma Traders' && r1.status === 'live', 'C1 a code gives that shop\'s link, name and status');
  ok(dir.asked[0].code === SH && dir.asked[0].dev === await c.evaluate(() => JSON.parse(localStorage.rb_dev)), 'C2 the lookup sends the code and this phone\'s id (wrong codes are counted per phone)');
  ok((await c.evaluate(() => T.dirLookup('NOPE-1').then(() => '', e => e.code))) === 'bad_code', 'C3 a wrong code is refused');
  await c.click('#al-shopq'); await c.fill('#al-scode', 'nope-123'); await c.click('#al-sgo'); await c.waitForTimeout(600);
  ok(/didn't work/.test(await c.textContent('#al-err')) && await c.evaluate(() => T.SHOP_MAIN), 'C4 sign-in screen: a wrong shop code says so and stays');
  dir.locked = true; await c.fill('#al-scode', 'nope-456'); await c.click('#al-sgo'); await c.waitForTimeout(600); dir.locked = false;
  ok(/15 minutes/.test(await c.textContent('#al-err')), 'C5 too many wrong codes: asked to wait 15 minutes');
  await c.fill('#al-scode', ' ' + SH.toLowerCase() + ' '); await c.click('#al-sgo'); await c.waitForTimeout(1500);
  ok(await c.evaluate(() => JSON.parse(localStorage.rb_shop).code) === SH && await c.evaluate(() => T.SHOP.code) === SH && dir.asked.some(x => x.code === SH), 'C6 code typed in small letters with spaces: tidied, looked up, the app reopens in that shop');

  // D. the shop's link moved; the daily re-check learns it's paused
  dir.api = SH_API2; await a.evaluate(() => T.shopMismatch()); await a.waitForTimeout(500);
  ok(await a.evaluate(() => T.SHOP.api) === SH_API2 && await a.evaluate(() => JSON.parse(localStorage.rb_shop).api) === SH_API2, 'D1 a reply from the wrong shop: the Directory is asked again and the new link saved');
  dir.status = 'paused';
  const d = await phone({ rb_shop: JSON.stringify({ code: SH, api: SH_API2, name: 'Sharma Traders', at: Date.now() - 2 * 864e5 }), [SH + ':rb_auth']: sharmaAuth });
  await d.evaluate(() => T.appUnlock()); await d.waitForTimeout(900);
  ok(await d.evaluate(() => T.S.paused) === true && Date.now() - await d.evaluate(() => JSON.parse(localStorage.rb_shop).at) < 60000, 'D2 a day later the shop is re-checked: learns it\'s paused, re-check time saved');
  ok(/paused/.test(await d.evaluate(() => document.querySelector('#toast').textContent)), 'D3 …and says so once');
  dir.status = 'live';

  // E. the list of shops on this phone
  const e = await phone(null);
  const lst = await e.evaluate(() => { for (let i = 1; i <= 12; i++) T.shopRemember({ code: 'S' + i, name: 'Shop ' + i, api: 'x' + i }); T.shopRemember({ code: 'S5', name: 'Shop 5b', api: 'y' }); return T.shopsKnown(); });
  ok(lst.length === 10 && lst[0].code === 'S5' && lst[0].name === 'Shop 5b' && lst.filter(x => x.code === 'S5').length === 1 && lst[1].code === 'S12', 'E1 newest first, no repeats, at most 10 shops kept');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
