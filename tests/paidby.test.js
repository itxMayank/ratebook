/* Bill page "Paid by" tiles (Cash / UPI / Cheque): optional, tap again to un-pick, sent with the bill, reset after.
   Run: node tests/paidby.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,addToBill,setTab,billText');
const items = [{ id: 'a', name: 'PP Bag', unit: 'pc', buy: 90, sell: 120 }];
(async () => {
  const b = await launch(); const sent = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 860 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => {
    const req = r.request(), send = o => r.fulfill({ body: JSON.stringify({ shop: 'main', ...o }), contentType: 'application/json' });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 7 };
    if (req.method() === 'GET') return send({ ok: true, rev: '1', items, config: cfg, sv: 39, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(req.postData());
    if (bd.action === 'takeBill') { sent.push(bd.bill); return send({ ok: true, n: bd.bill.n }); }
    if (bd.action === 'boot') return send({ ok: true, rev: '1', items, config: cfg, sv: 39, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
    return send({ ok: true, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }); });
  await p.addInitScript(() => { if (!sessionStorage.done) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); sessionStorage.done = 1; } });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(500);
  await p.evaluate(() => { T.addToBill('a', 2); T.setTab('bill'); }); await p.waitForTimeout(400);
  const pressed = () => p.$$eval('#pm-row [aria-pressed=true]', els => els.map(e => e.dataset.pm).join(','));
  const vis = sel => p.$eval(sel, e => !e.hidden && e.offsetParent !== null);
  ok(await vis('#pm-row') && await pressed() === '' && await vis('#cashrow') && !/Paid by/.test(await p.evaluate(() => T.billText())), 'tiles show under Paid, nothing picked: bill works as before (cash given row, no "Paid by" line)');
  await p.click('[data-pm=upi]'); await p.waitForTimeout(150);
  ok(await pressed() === 'upi' && !(await vis('#cashrow')) && /Paid by: UPI/.test(await p.evaluate(() => T.billText())), 'UPI picked: highlighted, cash-change row hides, WhatsApp text says "Paid by: UPI"');
  await p.screenshot({ path: (process.env.SHOT_DIR || '/tmp') + '/pm-upi.png' });
  await p.click('[data-pm=upi]'); await p.waitForTimeout(150);
  ok(await pressed() === '' && await vis('#cashrow'), 'tapping the picked tile again un-picks it');
  await p.click('[data-pay=credit]'); await p.waitForTimeout(150);
  ok(!(await vis('#pm-row')), 'Credit: tiles hidden (no money taken now)');
  await p.click('[data-pay=part]'); await p.fill('#pay-recv', '100'); await p.click('[data-pm=cheque]'); await p.waitForTimeout(150);
  ok(await vis('#pm-row') && /Paid: ₹100 \(Cheque\)/.test(await p.evaluate(() => T.billText())), 'Part paid + Cheque: "Paid: ₹100 (Cheque)"');
  await p.click('[data-pay=paid]'); await p.click('[data-pm=cash]'); await p.waitForTimeout(150);
  ok(await pressed() === 'cash' && await vis('#cashrow'), 'Cash picked: only one tile at a time, cash-change row stays');
  await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok(sent.length === 1 && sent[0].paidBy === 'cash' && sent[0].pay === 'paid', 'Done: the bill is saved with paidBy = cash');
  ok(await p.evaluate(() => T.S.pm) === '' && await pressed() === '', 'after the bill: back to nothing picked');
  await p.evaluate(() => { T.addToBill('a', 1); }); await p.waitForTimeout(200); await p.click('[data-pay=credit]'); await p.click('#cust'); await p.fill('#cust', 'Sunil'); await p.fill('#cust-mob', '9876543210'); await p.waitForTimeout(100);
  await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok(sent.length === 2 && sent[1].paidBy === '' && sent[1].pay === 'credit', 'credit bill: nothing sent for Paid by');
  await b.close(); done();
})();
