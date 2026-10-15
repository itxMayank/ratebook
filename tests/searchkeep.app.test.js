/* Typing in a list's search keeps the keyboard (15 Oct 2026): "each keystroke hides the keyboard" on Vendors. The search box must stay
   the same element while typing (replacing it closes the phone's keyboard), also when a background refresh lands mid-typing.
   Vendors and Credit. Run: node tests/searchkeep.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,openVendors,vRenderList,openDues,duesShow');
const V = (id, name, mobile) => ({ id, name, mobile, gstin: '', address: '', opening: 100, openingDate: '2026-10-01', linkOn: false, token: 't' + id, createdAt: 1, updatedAt: 1, creditDays: 0 });
const vendors = [V('v1', 'Mahaveer Enterprises', '9876543210'), V('v2', 'Sharma Traders', ''), V('v3', 'Gupta Plastics', ''), V('v4', 'Mehta Packaging', ''), V('v5', 'Ravi Foils', ''), V('v6', 'Shree Ganesh Bags', '')];
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const C = (name, mobile, due, days) => ({ name, mobile, due, oldest: ago(days), bills: [{ n: days, id: 'b' + days, row: days + 1, date: ago(days), total: due, paid: 0, due, items: 'Bag 1 pc = ' + due, gst: false }] });
const dues = { total: 1648, bills: 3, customers: [C('Mohan Traders', '9000000003', 900, 10), C('Sunil Traders', '9876543210', 548, 40), C('Ravi Stores', '9123456780', 200, 2)] };
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'G', mode: 'live' };
    if (q.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 56 }); const bd = JSON.parse(q.postData());
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 56, me });
    if (bd.action === 'vSync') return send({ vrev: '1', vendors, entries: [] });
    if (bd.action === 'listDues') return send(dues);
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock());
  const keep = async (sel, word, bg) => {   // type letter by letter; true if the box was never replaced and stayed focused
    await p.click(sel); await p.evaluate(s => { window.__box = document.querySelector(s); }, sel); let same = true;
    for (const ch of word) { await p.keyboard.type(ch); await p.waitForTimeout(60); if (bg) { await p.evaluate(bg); await p.waitForTimeout(30); }
      same = same && await p.evaluate(s => document.querySelector(s) === window.__box && document.activeElement === window.__box, sel); }
    return same; };
  // Vendors
  await p.evaluate(() => T.openVendors()); await p.waitForTimeout(1200);
  ok(await keep('#vl-q', 'sha'), 'V1 Vendors: typing "sha" letter by letter keeps the same search box focused (the keyboard stays)');
  const names = () => p.$$eval('.vl-cards .vcard .vc-mid b', els => els.map(e => e.textContent));
  ok(JSON.stringify(await names()) === JSON.stringify(['Sharma Traders']) && await p.inputValue('#vl-q') === 'sha', 'V2 the results follow the typing: only Sharma Traders');
  await p.fill('#vl-q', ''); await p.waitForTimeout(100);
  ok(await keep('#vl-q', 'ma', () => T.vRenderList()), 'V3 a background refresh landing while typing doesn\'t replace the box either');
  ok((await names()).join() === 'Mahaveer Enterprises,Sharma Traders', 'V4 …and the results still follow: Mahaveer, Sharma');
  await p.click('.vl-cards .vcard'); await p.waitForTimeout(600);
  ok(/Mahaveer/.test(await p.textContent('#sheet-title')), 'V5 tapping a result opens that vendor');
  await p.evaluate(() => document.querySelector('#sheet-close').click()); await p.waitForTimeout(300);
  // Credit
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(900);
  ok(await keep('#du-q', 'trad', () => T.duesShow()), 'C1 Credit: typing with background refreshes landing keeps the same search box focused');
  ok((await p.$$eval('#du-list .duecard b', els => els.map(e => e.textContent))).join() === 'Sunil Traders,Mohan Traders', 'C2 the results follow: Sunil, Mohan (oldest due first)');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
