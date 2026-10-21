/* The bill page's core flow (added with the billing.js split, 11 Oct 2026; other tests cover its layout, search, Paid by,
   printing and editing): totals and the WhatsApp text, a GST bill (its own number series, tax by rate split CGST + SGST,
   round off, amount in words, place of supply), Done (what's sent, the next number, the Last bill row), a bill made offline
   waiting in the queue and sent later, a credit bill needing name + mobile, open (held) bills, and a returning customer.
   Any page error fails. Run: node tests/billing.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,addToBill,billTotal,billText,inWords,heldGet,resumeHeld,setTab,appUnlock,flushBills');
const items = [{ id: 'i1', name: 'PP Bag 12x18', unit: 'kg', buy: 150, sell: 180, hsn: '3923', gst: 18 },
  { id: 'i2', name: 'Paper Cup', unit: 'pc', buy: 0.5, sell: 0.8, gst: 12, hsn: '4823' }, { id: 'i3', name: 'Sugar', unit: 'kg', buy: 40, sell: 46 }];
let sent = [], off = false;
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://wa.me/**', r => r.fulfill({ body: 'wa' }));
  await ctx.route('https://script.google.com/**', r => { if (off) return r.abort(); const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg', nextBill: 21, nextGstBill: 7, shopGstin: '09ABCDE1234F1Z5', shopState: '09', defaultGst: 18, defaultHsn: '3923' };
    if (q.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 60, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData()); sent.push(bd);
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 60, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'takeBill') return send({ n: bd.bill.n });
    if (bd.action === 'findCustomer') return send({ customer: { name: 'Sunil Traders', gstin: '', count: 4, total: 3250, last: '2026-10-02', due: 120 } });
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); sessionStorage.x = 1; } });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  const bills = () => sent.filter(x => x.action === 'takeBill').map(x => x.bill);
  const fresh = async () => { await p.evaluate(() => { T.addToBill('i1'); T.addToBill('i1'); T.addToBill('i2'); T.setTab('bill'); }); await p.waitForTimeout(300); };

  // A. a normal bill
  await fresh();
  ok(await p.evaluate(() => T.billTotal()) === 360.8 && await p.inputValue('#bill-no').then(v => v || p.getAttribute('#bill-no', 'placeholder')) === '21', 'A1 2 kg × ₹180 + 1 pc × ₹0.8 = ₹360.8, bill number 21');
  const tx = await p.evaluate(() => T.billText());
  ok(/^\*Gupta Plastics\*\nBill No: 21 · /.test(tx) && tx.includes('1. PP Bag 12x18 — 2 kg × ₹180 = ₹360') && tx.includes('2. Paper Cup — 1 pc × ₹0.8 = ₹0.8') && tx.endsWith('*Total: ₹360.8*'), 'A2 WhatsApp text: shop, number, each line, total');

  // count next to "Bill items": lines on the bill, not quantities (2 kg + 1 pc = 2 items); lines a little closer together
  ok(await p.textContent('#bill-n') === '2 items' && await p.isVisible('#bill-n'), 'A3 "2 items" next to Bill items (2 lines, 3 units)');
  { const g = await p.evaluate(() => { const L = [...document.querySelectorAll('#bill-lines .bill-line')]; return L[1].getBoundingClientRect().top - L[0].getBoundingClientRect().bottom; });
    ok(g >= 4 && g <= 7, 'A4 gap between bill lines is 6 px (' + g + ')'); }

  // B. GST bill
  await p.click('#gst-chip'); await p.waitForTimeout(200);
  const gt = await p.evaluate(() => T.billText());
  ok(await p.evaluate(() => T.billTotal()) === 426 && (await p.inputValue('#bill-no') || await p.getAttribute('#bill-no', 'placeholder')) === '7', 'B1 GST bill: its own number (7), total ₹426');
  ok(gt.includes('*TAX INVOICE*') && gt.includes('Invoice No: 7') && gt.includes('GSTIN: 09ABCDE1234F1Z5') && gt.includes('Place of supply: Uttar Pradesh (09)'), 'B2 tax invoice heading, shop GSTIN, place of supply');
  ok(gt.includes('(HSN 3923, GST 18%)') && gt.includes('Taxable value: ₹360.80') && gt.includes('CGST 9%: ₹32.40') && gt.includes('SGST 9%: ₹32.40') && gt.includes('CGST 6%: ₹0.05') && gt.includes('Round off: +₹0.30'), 'B3 HSN per line, tax by rate split CGST + SGST, round off');
  ok(gt.includes('Rupees Four Hundred Twenty Six Only') && await p.evaluate(() => T.inWords(1234.5)) === 'Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only', 'B4 amount in words, with paise');
  await p.click('#gst-chip'); await p.waitForTimeout(200);

  // C. Done
  sent = []; await p.click('#bill-done'); await p.waitForTimeout(1200);
  const b1 = bills()[0] || {};
  ok(b1.n === 21 && b1.total === 360.8 && b1.env === 'live' && !b1.gst && b1.lines.length === 2 && b1.lines[0].qty === 2 && b1.lines[0].buy === 150 && b1.lines[0].lp === 180 && /Bill No: 21/.test(b1.text), 'C1 Done sends the bill: number, total, real mode, lines with qty, buy rate and the list price that day, the text');
  ok(await p.evaluate(() => T.S.bill.length) === 0 && /Last bill: No\. 21/.test(await p.textContent('#lastbill')) && (await p.inputValue('#bill-no') || await p.getAttribute('#bill-no', 'placeholder')) === '22', 'C2 the bill clears, "Last bill 21" shows, next number 22');

  // D. offline: waits in the queue, sent later
  off = true; await fresh(); sent = []; await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => T.S.billQ.length) === 1 && await p.evaluate(() => T.S.billQ[0].n) === 22 && await p.evaluate(() => T.S.bill.length) === 0, 'D1 offline: bill 22 kept in the queue on the phone');
  ok(!(await p.$eval('#queuebar', e => e.hidden)) && /1 bill/.test(await p.textContent('#queuebar')), 'D2 "1 bill waiting to send" shows');
  off = false; await p.evaluate(() => T.flushBills()); await p.waitForTimeout(1200);
  ok(bills().some(x => x.n === 22) && await p.evaluate(() => T.S.billQ.length) === 0, 'D3 back online: sent, queue empty');

  // E. credit needs name + mobile
  await fresh(); await p.click('[data-pay="credit"]'); sent = []; await p.click('#bill-done'); await p.waitForTimeout(700);
  ok(!bills().length && await p.evaluate(() => T.S.bill.length) === 2 && await p.$eval('#cust', e => e.classList.contains('need')), 'E1 credit bill without name / mobile: not saved, the boxes are marked');
  await p.fill('#cust', 'Ramesh'); await p.fill('#cust-mob', '9812345678'); await p.waitForTimeout(900); await p.click('#bill-done'); await p.waitForTimeout(1200);
  const b3 = bills()[0] || {};
  ok(b3.pay === 'credit' && b3.due === 360.8 && b3.customer === 'Ramesh' && b3.mobile === '9812345678', 'E2 with them: saved as credit, ₹360.8 due, mobile as 10 digits');
  ok(await p.evaluate(() => T.S.pay) === 'paid', 'E3 the next bill starts as Paid again');

  // F. open (held) bills
  await p.evaluate(() => { T.addToBill('i3'); T.setTab('bill'); }); await p.waitForTimeout(300);
  await p.click('#bill-new'); await p.waitForTimeout(300);
  ok((await p.evaluate(() => T.heldGet().length)) === 1 && await p.evaluate(() => T.S.bill.length) === 0, 'F1 New bill: the Sugar bill is held, the screen is empty');
  await p.evaluate(() => T.addToBill('i2')); await p.waitForTimeout(200);
  await p.evaluate(() => T.resumeHeld(T.heldGet()[0].hid)); await p.waitForTimeout(300);
  ok(await p.evaluate(() => T.S.bill.map(l => l.id).join()) === 'i3' && await p.evaluate(() => T.heldGet().length) === 1 && await p.evaluate(() => T.heldGet()[0].d.bill[0].id) === 'i2', 'F2 back to the Sugar bill; the Paper Cup bill is held in its place');

  // G. a returning customer
  await p.fill('#cust', ''); await p.evaluate(() => { T.S.cust = ''; });
  await p.fill('#cust-mob', '98765 43210'); await p.waitForTimeout(1200);
  const hint = await p.textContent('#cust-hint');
  ok(/Sunil Traders/.test(hint) && /4 bills/.test(hint) && /3,250/.test(hint) && /120/.test(hint) && await p.inputValue('#cust') === 'Sunil Traders', 'G1 mobile typed with a space: name filled, "4 bills · ₹3,250 · ₹120 pending" shown');
  ok(sent.some(x => x.action === 'findCustomer' && x.mobile === '9876543210'), 'G2 looked up by its 10 digits');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
