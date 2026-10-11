/* Credit (udhaar) and Customers screens end to end (added with the customers.js split, 11 Oct 2026; before, only their
   navigation was tested): Credit list, total and search, a customer's open bills, the WhatsApp reminder text and call link,
   Record payment (oldest bill first preview, note chip, the request sent, overpaying capped), and the Customers page (summary,
   sort, search by name / mobile / GSTIN, a customer's tiles and bills, Start a bill, Edit with checks and the request sent,
   Dues & payment). Any page error fails. Run: node tests/customers.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openDues,openCustomers,setTab');
const today = new Date(), iso = d => d.toISOString().slice(0, 10), ago = n => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d); };
let dues = { total: 748, bills: 3, customers: [
  { name: 'Sunil Traders', mobile: '9876543210', due: 548, oldest: ago(40), bills: [
    { n: 3, id: 'b3', row: 5, date: ago(40), total: 500, paid: 0, due: 500, items: 'PP Bag 2 kg = 240; Paper Cup 130 pc = 260', gst: false },
    { n: 7, id: 'b7', row: 9, date: ago(6), total: 148, paid: 100, due: 48, items: 'Tape 2 pc = 148', gst: true }] },
  { name: 'Ravi Stores', mobile: '9123456780', due: 200, oldest: ago(2), bills: [{ n: 9, id: 'b9', row: 11, date: ago(2), total: 200, paid: 0, due: 200, items: 'Foil 1 pc = 200', gst: false }] }] };
const custs = [['9876543210', 'Sunil Traders', '09ABCDE1234F1Z5', 4, 3250, ago(6), 548, 'Main Road, Kanpur', 'Pays on the 5th', 7],
  ['9123456780', 'Ravi Stores', '', 1, 200, ago(2), 200, '', '', 9], ['9000000001', 'Amit', '', 2, 900, ago(70), 0, '', '', 2]];
const bills = [{ n: 7, id: 'b7', row: 9, date: ago(6) + 'T10:00:00', customer: 'Sunil Traders', mobile: '9876543210', total: 148, gst: true, pay: 'Part paid', paid: 100, due: 48 },
  { n: 3, id: 'b3', row: 5, date: ago(40) + 'T10:00:00', customer: 'Sunil Traders', mobile: '9876543210', total: 500, gst: false, pay: 'Credit', paid: 0, due: 500 },
  { n: 9, id: 'b9', row: 11, date: ago(2) + 'T10:00:00', customer: 'Ravi Stores', mobile: '9123456780', total: 200, gst: false }];
let brev = '1';
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); const sent = [];
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Gupta Plastics', mode: 'live' };
    if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 43 });
    const bd = JSON.parse(req.postData()); sent.push(bd);
    if (bd.action === 'listDues') return send(dues);
    if (bd.action === 'listCustomers') return send(bd.brev === brev ? { brev, same: true } : { brev, customers: custs });
    if (bd.action === 'listBills') return send({ brev: '1', bills, full: true });
    if (bd.action === 'recordPayment') { const c = dues.customers[0]; c.bills[0].due = 0; c.bills[0].paid = 500; c.bills[1].due = 28; c.bills[1].paid = 120; c.bills = [c.bills[1]]; c.due = 28; dues.total = 228; custs[0][6] = 28; brev = '2';   // like the sheet: Customers due updated, bills version bumped
      return send({ used: Math.min(bd.amount, 548), cleared: 1 }); }
    if (bd.action === 'saveCustomer') return send({ moved: 0 });
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 43, me });
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const txt = s => p.textContent(s).catch(() => ''), title = () => txt('#sheet-title');
  const shot = async n => { if (process.env.SHOT) { await p.waitForTimeout(300); await p.screenshot({ path: require('path').join(process.env.SHOT, 'c-' + n + '.png') }); } };   // SHOT=<dir>: screenshots for comparing versions

  // ---- Credit
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(800);
  ok(/748/.test(await txt('.dues-sum')) && (await p.$$('[data-dc]')).length === 2, 'Credit: total pending ₹748 and one card per customer');
  ok(/40/.test(await txt('[data-dc="0"]')), 'Credit: the oldest bill\'s age shows (40 days)');
  await shot('credit');
  await p.fill('#du-q', 'ravi'); await p.dispatchEvent('#du-q', 'input'); await p.waitForTimeout(250);
  ok((await p.$$('[data-dc]')).length === 1 && /Ravi/.test(await txt('#du-body')), 'Credit search: "ravi" leaves one customer');
  await p.fill('#du-q', ''); await p.dispatchEvent('#du-q', 'input'); await p.waitForTimeout(250);
  await p.click('[data-dc="0"]'); await p.waitForTimeout(400);
  ok(await title() === 'Sunil Traders' && (await p.$$('[data-db]')).length === 2, 'customer view: name and both open bills');
  const wa = decodeURIComponent((await p.getAttribute('#dc-wa', 'href')) || '');
  ok(/^https:\/\/wa\.me\/919876543210\?text=/.test(wa) && /Bill No\. 3\*/.test(wa) && /GST Bill No\. 7\*/.test(wa) && /PP Bag/.test(wa) && /Paid ₹100 · \*Due ₹48\*/.test(wa) && /Total due: ₹548/.test(wa), 'Remind: WhatsApp to +91 98765 43210 listing each bill, its items, paid/due and the total due');
  ok(await p.$eval('a[href^="tel:"]', a => a.getAttribute('href')) === 'tel:+919876543210', 'Call link');
  await shot('duecust');

  await p.click('#dc-pay'); await p.waitForTimeout(300);
  ok((await p.inputValue('#rp-amt')) === '548', 'Record payment starts at the full ₹548');
  await p.fill('#rp-amt', '9999'); await p.dispatchEvent('#rp-amt', 'input'); await p.waitForTimeout(100);
  ok(/548/.test(await txt('#rp-save')) && /more than is owed/.test(await txt('#rp-prev')), 'paying more than owed: only ₹548 would be recorded, with a note');
  await p.fill('#rp-amt', '520'); await p.dispatchEvent('#rp-amt', 'input'); await p.waitForTimeout(100);
  const pv = await txt('#rp-prev');
  ok(/clear Bill 3/.test(pv) && /leave ₹28 due on Bill 7/.test(pv), 'preview: oldest bill first (clear Bill 3, leave ₹28 due on Bill 7)');
  await shot('recordpay');
  await p.click('#rp-note [data-n="UPI"]'); await p.click('#rp-save'); await p.waitForTimeout(1000);
  const rp = sent.find(x => x.action === 'recordPayment');
  ok(rp && rp.amount === 520 && rp.note === 'UPI' && rp.mobile === '9876543210' && !rp.billId, 'request: ₹520 · UPI · for the customer\'s mobile');
  ok(await title() === 'Sunil Traders' && (await p.$$('[data-db]')).length === 1 && /28/.test(await txt('.dues-sum')), 'after saving: the customer screen shows ₹28 due on one bill');
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);

  // ---- Customers
  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(1000);
  ok(/3 customers/.test(await txt('#cu-sum')) && /228/.test(await txt('#cu-sum')), 'Customers: "3 customers · ₹228 due" (the payment just recorded is already counted)');
  await shot('customers');
  const names = async () => p.$$eval('#cu-list [data-cm] b', x => x.map(e => e.textContent.trim()));
  ok((await names()).join('|') === 'Ravi Stores|Sunil Traders|Amit', 'Recent first: ' + (await names()).join(', '));
  await p.click('[data-cs="az"]'); await p.waitForTimeout(150); ok((await names()).join('|') === 'Amit|Ravi Stores|Sunil Traders', 'A–Z');
  await p.click('[data-cs="top"]'); await p.waitForTimeout(150); ok((await names())[0] === 'Sunil Traders', 'Most business: Sunil (₹3,250) first');
  await p.click('[data-cs="due"]'); await p.waitForTimeout(150); ok((await names()).join('|') === 'Ravi Stores|Sunil Traders', 'Has dues: only the two who owe, biggest first (₹200, ₹28)');
  await p.click('[data-cs="recent"]');
  for (const [q, want] of [['ami', 'Amit'], ['654', 'Sunil Traders'], ['09ab', 'Sunil Traders']]) { await p.fill('#cu-q', q); await p.dispatchEvent('#cu-q', 'input'); await p.waitForTimeout(150);
    ok((await names()).join('|') === want, `search "${q}" → ${want}`); }
  await p.fill('#cu-q', '98'); await p.dispatchEvent('#cu-q', 'input'); await p.waitForTimeout(150);
  ok((await names()).length === 0, 'two digits are not enough for a mobile search (3+)');
  await p.fill('#cu-q', ''); await p.dispatchEvent('#cu-q', 'input'); await p.waitForTimeout(150);

  await p.click('[data-cm="9876543210"]'); await p.waitForTimeout(900);
  const pg = await txt('#sheet-body');
  ok(await title() === 'Sunil Traders' && /\+91 98765 43210/.test(pg) && /09ABCDE1234F1Z5/.test(pg) && /Main Road, Kanpur/.test(pg) && /Pays on the 5th/.test(pg), 'customer screen: mobile, GSTIN, address, private note');
  const tiles = await p.$$eval('.cu-stat b', x => x.map(e => e.textContent.trim()));
  ok(tiles[0] === '4' && tiles[1] === '₹3,250' && tiles[2] === '₹28' && tiles[3] !== '—', 'tiles: 4 bills · ₹3,250 · ₹28 due (after the payment) · last bill date (' + tiles.join(' | ') + ')');
  ok((await p.$$('#cu-bills [data-ci]')).length === 2 && /Bill No\. 7/.test(await txt('#cu-bills')), 'their bills from Past bills (newest first, only theirs)');
  await shot('customer');

  await p.click('#cu-edit'); await p.waitForTimeout(300);
  await p.fill('#ce-gst', '09ABC'); await p.click('#ce-save'); await p.waitForTimeout(200);
  ok(/GSTIN/i.test(await txt('#ce-err')) && !sent.some(x => x.action === 'saveCustomer'), 'Edit: a bad GSTIN is caught on the phone, nothing sent');
  await p.fill('#ce-mob', '9876543211'); await p.dispatchEvent('#ce-mob', 'input'); await p.waitForTimeout(100);
  ok(await p.isVisible('#ce-mobnote'), 'a new mobile shows the "bills move to it" note');
  await p.fill('#ce-mob', '98765 43210'); await p.dispatchEvent('#ce-mob', 'input');
  await p.fill('#ce-gst', '09abcde1234f1z5'); await p.fill('#ce-name', 'Sunil Traders & Co'); await p.click('#ce-save'); await p.waitForTimeout(1000);
  const sv = sent.find(x => x.action === 'saveCustomer');
  ok(sv && sv.customer.mobile === '9876543210' && sv.customer.newMobile === '9876543210' && sv.customer.name === 'Sunil Traders & Co' && sv.customer.gstin === '09ABCDE1234F1Z5' && sv.customer.address === 'Main Road, Kanpur', 'Edit saved: name, GSTIN in capitals, mobile normalised, address kept');

  await p.click('#cu-bill'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.body.dataset.tab) === 'bill' && (await p.inputValue('#cust')) === 'Sunil Traders' && (await p.inputValue('#cust-mob')) === '9876543210' && (await p.inputValue('#cust-gstin')) === '09ABCDE1234F1Z5', 'Start a bill: the Bill tab opens with name, mobile and GSTIN filled');
  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(600); await p.click('[data-cm="9123456780"]'); await p.waitForTimeout(600);
  await p.click('#cu-credit'); await p.waitForTimeout(800);
  ok(await title() === 'Ravi Stores' && (await p.$$('[data-db]')).length === 1, 'Dues & payment opens their Credit screen');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
