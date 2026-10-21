/* One outbox (21 Oct 2026): a new bill, a payment, a vendor change and a display choice all waiting on the phone go to the sheet
   in that order, through one sender with one rule for trying again (4 s doubling, never lost), and none of them waits for
   Vendors or Settings to be opened. Run: node tests/outbox.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,obPending,obKick,OB');
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  let down = true; const sent = [], tries = [];
  const WATCH = new Set(['takeBill', 'recordPayment', 'vSaveVendor', 'setMyPrefs']);
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 6, nextGstBill: 1 };
    const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 90, sell: 100 }];
    if (req.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 67 });
    const bd = JSON.parse(req.postData());
    if (WATCH.has(bd.action)) { tries.push({ a: bd.action, t: Date.now() }); if (down) return r.abort(); sent.push(bd.action); }
    if (bd.action === 'takeBill') return send({ config: cfg });
    if (bd.action === 'recordPayment') return send({ used: 50, bills: [] });
    if (bd.action === 'vSaveVendor') return send({ vendor: { id: 'v1', name: 'Mahaveer' }, entries: [] });
    if (bd.action === 'vSync') return send({ same: true, vrev: '1' });
    if (bd.action === 'setMyPrefs') return send({ prefs: { mode: 'live', ui: bd.prefs.ui } });
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 67, me });
    return send({ me }); });
  await p.addInitScript(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } }));
    localStorage.setItem('rb_billq', JSON.stringify([{ id: 'b5', n: 5, env: 'live', total: 100, items: 'PP Bag 1 kg', lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 1, rate: 100 }], text: 'Bill No. 5\n= ₹100\nTotal: ₹100', customer: 'Sunil', mobile: '9876543210', pay: 'credit', due: 100, at: Date.now() }]));
    localStorage.setItem('rb_wq', JSON.stringify([{ k: 'pay', oid: 'w1', env: 'live', at: Date.now(), by: 'Mayank', body: { action: 'recordPayment', mobile: '9876543210', amount: 50, pid: 'p-1', env: 'live' } }]));
    localStorage.setItem('rb_vq_live', JSON.stringify([{ jid: 'j1', k: 'vendor', at: Date.now(), v: { id: 'v1', name: 'Mahaveer' } }]));
    localStorage.setItem('rb_upq', JSON.stringify({ palette: 'forest' })); });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(13000);
  const pend = () => p.evaluate(() => T.obPending());
  ok(await pend() >= 4 && await p.evaluate(() => JSON.parse(localStorage.getItem('rb_wq')).length === 1 && JSON.parse(localStorage.getItem('rb_vq_live')).length === 1 && JSON.parse(localStorage.getItem('rb_upq')).palette === 'forest'), 'A1 the sheet can\'t be reached: all 4 changes (bill, payment, vendor, display choice) are still kept on the phone');
  const tb = tries.filter(x => x.a === 'takeBill').map(x => x.t), gaps = tb.slice(1).map((t, i) => t - tb[i]);
  ok(tb.length >= 2 && tb.length <= 5 && gaps.every((g, i) => i === 0 || g >= gaps[i - 1] - 500), 'A2 tried again by itself, waiting longer each time (' + tb.length + ' tries in 13 s, gaps ' + gaps.map(g => Math.round(g / 100) / 10 + ' s').join(', ') + ')');
  ok(!tries.some(x => x.a === 'recordPayment'), 'A3 the payment isn\'t sent before the waiting bill (it may be for it); vendor changes and display choices don\'t wait for bills');
  down = false; await p.evaluate(() => T.obKick(0)); await p.waitForTimeout(2500);
  ok(sent.slice(0, 4).join(' → ') === 'takeBill → recordPayment → vSaveVendor → setMyPrefs' && sent.length === 4, 'B1 back online: sent in order, one each: ' + sent.join(' → '));
  ok(await pend() === 0 && await p.evaluate(() => !localStorage.getItem('rb_billq') || JSON.parse(localStorage.getItem('rb_billq')).length === 0), 'B2 nothing left waiting');
  ok(await p.evaluate(() => T.OB.tries) === 0, 'B3 the wait between tries starts again from 4 s');
  ok(!errs.length, 'C1 no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
