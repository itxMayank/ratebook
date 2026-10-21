/* A shop's whole day, end to end: the real app against the real Code.gs (21 Oct 2026, item 15 of the architecture review).
   Most phone tests answer with a pretend sheet, which can quietly differ from the real script; here every request goes through
   the real doPost / doGet over an in-memory sheet (tests/realshop.js). An owner signs in with their PIN, makes a normal bill, a
   GST bill and a credit bill, records a payment on Credit, edits a past bill, adds a company customer, adds a vendor with a
   bill and a payment, looks at today's report, changes a setting; a staff phone signs in and gets no buy rates. The sheet must
   accept everything the app sends (sums, bill text, numbers) and end up with exactly the right rows.
   Run: node tests/realday.real.app.test.js */
const { realShop } = require('./realshop'), { appHtml, launch, ok, done } = require('./browser');
const shop = realShop(), R = shop.R;
R(`setConfig_({ shopName: 'Pushpadant Plastics', mode: 'live', nextBill: 1, nextGstBill: 1, roundTo: 1, units: JSON.stringify([{ code: 'kg' }, { code: 'pc' }]), defaultUnit: 'kg', shopGstin: '09ABCDE1234F1Z5', shopState: '09', fyReset: true })`);
R("saveUser_({name:'Mayank',pin:'749163',role:'owner'})"); R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
R(`upsert_([{ tmp: 't1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180, gst: 18, hsn: '3923' }, { tmp: 't2', name: 'Paper Cup', unit: 'pc', buy: 0.5, sell: 0.8, gst: 5, hsn: '4823' }], 'Mayank')`);
const ids = shop.rows('Items').map(r => r[0]);
const B = k => shop.col('Bills', k), bills = () => shop.rows('Bills');
const html = appHtml('S,sync,addToBill,setTab,openDues,openBills,openCustomers,openVendors,openReports,openSettings,obPending,closeSheet,wqGet,BLC');
(async () => {
  const b = await launch(), errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await shop.route(ctx);
  const txt = s => p.textContent(s).catch(() => ''), settle = async (ms = 1500) => { await p.waitForTimeout(ms); for (let i = 0; i < 20 && await p.evaluate(() => T.obPending()); i++) await p.waitForTimeout(500); };
  /* A. sign in */
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500);
  await p.fill('#al-name', 'Mayank'); await p.fill('#al-pin', '749163'); await p.click('#al-go'); await p.waitForTimeout(2500);
  if (await p.$('#al-bn')) await p.click('#al-bn');
  await p.evaluate(() => T.sync()); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => T.S.auth && !!T.S.auth.tok && T.S.items.length === 2 && T.S.sv >= 67), 'A1 the owner signs in with their PIN (a real sign-in token) and gets the price list');

  /* B. three bills */
  const make = async (fn) => { await p.evaluate(([i1, i2]) => { T.addToBill(i1); T.addToBill(i1); T.addToBill(i2); T.setTab('bill'); }, ids); await p.waitForTimeout(300); if (fn) await fn(); await p.click('#bill-done'); await settle(); };
  await make();
  const b1 = bills()[0];
  ok(bills().length === 1 && B('billNo')(b1) === 1 && B('total')(b1) === 360.8 && B('cost')(b1) === 300.5 && B('profit')(b1) === 60.3, 'B1 a normal bill (2 kg PP Bag + 1 Paper Cup = ₹360.80) is on the sheet as No. 1, cost and profit worked out there');
  ok(/₹360\.8/.test(B('text')(b1)) && /= ₹360\b/.test(B('text')(b1)), 'B2 its text passed the sheet\'s check (number, line amounts, total)');
  await make(async () => { await p.click('#gst-chip'); await p.waitForTimeout(200); });
  const b2 = bills()[1];
  ok(B('gstBill')(b2) === 'Yes' && B('billNo')(b2) === 1 && B('taxable')(b2) === 360.8 && B('tax')(b2) === 64.84 && B('total')(b2) === 426, 'B3 a GST bill: its own series (No. 1), taxable ₹360.80, tax ₹64.84 (18% + 5%), total ₹426 rounded');
  await make(async () => { await p.click('[data-pay="credit"]'); await p.fill('#cust', 'Sunil Traders'); await p.fill('#cust-mob', '98765 43210'); await p.waitForTimeout(600); });
  const b3 = bills()[2];
  ok(B('payment')(b3) === 'Credit' && B('due')(b3) === 360.8 && B('billNo')(b3) === 2 && String(B('mobile')(b3)) === '9876543210', 'B4 a credit bill: No. 2, ₹360.80 due, mobile as 10 digits');
  const cu = shop.rows('Customers').find(r => String(r[0]) === '9876543210');
  ok(cu && cu[3] === 1 && cu[7] === 360.8, 'B5 Sunil is in Customers: 1 bill, ₹360.80 due');

  /* C. a payment on Credit */
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(1500);
  await p.click('[data-dc="0"]'); await p.waitForTimeout(500); await p.click('#dc-pay'); await p.waitForTimeout(300);
  await p.fill('#rp-amt', '200'); await p.click('#rp-save'); await settle(2500);
  ok(B('due')(bills()[2]) === 160.8 && JSON.parse(B('payments')(bills()[2])).filter(x => !x.at).length === 1, 'C1 ₹200 recorded on the sheet: ₹160.80 left, one payment');
  ok(shop.rows('Customers').find(r => String(r[0]) === '9876543210')[7] === 160.8, 'C2 the customer\'s due follows (₹160.80)');
  await p.evaluate(() => T.closeSheet());

  /* D. edit a past bill */
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1800);
  const id1 = B('billId')(bills()[0]);
  await p.evaluate(id => document.querySelector(`[data-bid="${id}"]`).click(), id1); await p.waitForTimeout(1200);
  await p.click('#bd-edit'); await p.waitForTimeout(700);
  await p.evaluate(() => { T.S.bill[0].qty = 3; }); await p.evaluate(() => document.querySelector('#bill-done').click()); await settle(2500);
  const e1 = bills()[0];
  ok(B('edits')(e1) === 1 && B('total')(e1) === 540.8 && /= ₹540\b/.test(B('text')(e1)) && shop.rows('BillHistory').length === 1, 'D1 Bill 1 edited to 3 kg: ₹540.80 on the sheet, its text matches, the old text kept in BillHistory');

  /* E. a company customer without a mobile */
  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(1200);
  await p.click('#cu-add'); await p.waitForTimeout(300);
  await p.fill('#ce-name', 'Balkrishna Industries'); if (await p.$('#ce-gst')) await p.fill('#ce-gst', '27AAACB1234F1Z5');
  await p.click('#ce-save'); await settle(2000);
  const co = shop.rows('Customers').find(r => r[1] === 'Balkrishna Industries');
  ok(co && /^c-/.test(String(co[0])) && co[2] === '27AAACB1234F1Z5', 'E1 the company is saved with its own id (no mobile) and GSTIN');
  await p.evaluate(() => T.closeSheet());

  /* F. a vendor, a bill and a payment */
  await p.evaluate(() => T.openVendors()); await p.waitForTimeout(1200);
  await p.click('#vl-new'); await p.waitForTimeout(300);
  await p.fill('#vf-name', 'Mahaveer Enterprises'); await p.fill('#vf-mob', '98765 01234'); await p.click('#vf-save'); await settle(2000);
  await p.click('#vd-bill'); await p.waitForTimeout(400);
  await p.fill('#vff-amt', '2,360'); await p.dispatchEvent('#vff-amt', 'input'); await p.fill('#vff-no', 'MH-81'); await p.click('#vff-save'); await settle(2000);
  await p.click('#vd-pay'); await p.waitForTimeout(400);
  await p.fill('#vff-amt', '1,000'); await p.dispatchEvent('#vff-amt', 'input'); await p.waitForTimeout(200); await p.click('#vff-save'); await settle(2500);
  const ven = shop.rows('Vendors'), led = shop.rows('VendorLedger');
  ok(ven.length === 1 && ven[0][1] === 'Mahaveer Enterprises' && String(ven[0][2]) === '9876501234', 'F1 the vendor is on the sheet');
  ok(led.length === 2 && led.some(r => r[2] === 'bill' && r[4] === 2360) && led.some(r => r[2] === 'pay' && r[4] === 1000), 'F2 their bill (₹2,360) and payment (₹1,000) are on the sheet, once each');
  ok(/1,360/.test(await txt('#sheet-body')), 'F3 the vendor page shows ₹1,360 still owed');
  await p.evaluate(() => T.closeSheet());

  /* G. today's report */
  await p.evaluate(() => T.openReports()); await p.waitForTimeout(2500);
  { const r = (await txt('#sheet-body')).replace(/\s+/g, ' '); ok(/₹1,328/.test(r) && /3 bills/.test(r) && /Credit received ?₹200/.test(r) && /Pending now ?₹161/.test(r), 'G1 today\'s report, worked out by the sheet: ₹1,328 from 3 bills (₹540.80 + ₹426 + ₹360.80), ₹200 credit received, ₹161 pending'); }
  await p.evaluate(() => T.closeSheet());

  /* H. a setting */
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(1200);
  await p.evaluate(() => { const d = document.querySelector('#cf-shop').closest('details'); if (d) d.open = true; });
  await p.fill('#cf-shop', 'Pushpadant Plastics & Co'); await p.click('#cf-save'); await settle(2000);
  ok(R('readConfig_().shopName') === 'Pushpadant Plastics & Co' && R('readConfig_().nextBill') === 3, 'H1 the shop name is saved; the bill number another save moved on (3) is left alone');

  /* I. a staff phone */
  const c2 = await b.newContext({ viewport: { width: 390, height: 844 } }), s = await c2.newPage(); s.on('pageerror', e => errs.push('staff: ' + e.message));
  await c2.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' })); await shop.route(c2);
  await s.goto('https://rb.test/'); await s.waitForTimeout(1500);
  await s.fill('#al-name', 'Raju'); await s.fill('#al-pin', '5273'); await s.click('#al-go'); await s.waitForTimeout(2500);
  if (await s.$('#al-bn')) await s.click('#al-bn');
  await s.evaluate(() => T.sync()); await s.waitForTimeout(1500);
  ok(await s.evaluate(() => T.S.auth && T.S.auth.role === 'staff' && T.S.items.length === 2 && T.S.items.every(i => !(+i.buy > 0))), 'I1 staff signs in and gets the price list without buy rates (the sheet leaves them out)');
  ok(!errs.length, 'J1 no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
