/* A customer's own page lists the same bills its count says (16 Oct 2026). Reported: "Bills 1 · ₹19,205" on Balkrishna
   Industries, but "No bills found for this number" under it, on every customer. The sheet counts a bill without a mobile for
   the saved customer with that GSTIN (a company GST bill); the list only looked for the mobile. Run: node tests/custbills.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,openCustomers,openCustomer,appUnlock');
const G = '27AAACB3333J1ZW';
const custs = [
  ['9823737506', 'Balkrishna Industries Limited', G, 2, 20205, '2026-10-15T10:00:00.000Z', 0, 'Waluj MIDC', '', 12, '', '', ''],
  ['9876543210', 'Sunil Traders', '', 2, 700, '2026-10-14T10:00:00.000Z', 0, '', '', 9, '', '', ''],
  ['', 'Mahaveer Enterprises', '27ABCDE1234F1Z5', 1, 500, '2026-10-13T10:00:00.000Z', 0, '', '', 5, '', '', 'c-abcdefghij'],
  ['', 'Ramesh Kirana', '', 1, 300, '2026-10-12T10:00:00.000Z', 0, '', '', 4, '', '', 'c-bcdefghijk']];
const bill = (n, o) => ({ n, date: '2026-10-' + String(n + 5).padStart(2, '0') + 'T10:00:00.000Z', id: 'b' + n, row: n + 1, total: 100, items: 'x', gst: false, customer: '', mobile: '', custGstin: '', ...o });
const bills = [
  bill(12, { customer: 'Balkrishna Industries Limited', custGstin: G, gst: true, total: 19205 }),                 // GST bill, no mobile typed
  bill(11, { customer: 'Balkrishna Industries Ltd', mobile: '+91 98237 37506', total: 1000 }),                     // mobile typed with +91 and a space
  bill(9, { customer: 'Sunil Traders', mobile: '9876543210', total: 400 }),
  bill(8, { customer: 'Sunil', mobile: '09876543210', total: 300 }),                                              // leading 0
  bill(5, { customer: 'Mahaveer Enterprises', custGstin: '27abcde1234f1z5', gst: true, total: 500 }),               // GSTIN in small letters
  bill(4, { customer: 'Ramesh Kirana', total: 300 }),
  bill(3, { customer: 'Someone else', mobile: '9000000000', custGstin: G, total: 50 })];                            // another mobile: not Balkrishna's
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Shri Pushpdant Plastics', mode: 'live' };
    if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 56 });
    const bd = JSON.parse(req.postData());
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 56, me });
    if (bd.action === 'listCustomers') return send({ brev: '1', customers: custs });
    if (bd.action === 'listBills') return send(bd.brev === '1' ? { brev: '1', same: true, full: true } : { brev: '1', bills, full: true });
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(800);
  const listed = async key => { await p.evaluate(k => T.openCustomer(k), key); await p.waitForTimeout(900);
    return p.$$eval('#cu-bills .billcard b', els => els.map(e => +e.textContent.replace(/\D/g, ''))); };
  const bk = await listed('9823737506');
  ok(JSON.stringify(bk) === '[12,11]', 'A1 Balkrishna (mobile + GSTIN): the GST bill made without a mobile and the one with "+91 98237 37506" are both listed ' + JSON.stringify(bk));
  ok(!bk.includes(3), 'A2 a bill with another mobile is not theirs, even with the same GSTIN');
  const su = await listed('9876543210');
  ok(JSON.stringify(su) === '[9,8]', 'A3 a mobile typed with a leading 0 still matches ' + JSON.stringify(su));
  const mh = await listed('c-abcdefghij');
  ok(JSON.stringify(mh) === '[5]', 'A4 a company without a mobile: its bill by GSTIN (small letters too) ' + JSON.stringify(mh));
  const rk = await listed('c-bcdefghijk');
  ok(JSON.stringify(rk) === '[4]', 'A5 no mobile and no GSTIN: by exact name ' + JSON.stringify(rk));
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
