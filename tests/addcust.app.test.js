/* Add customer (15 Oct 2026, script v55): Tools → Customers → "+ Add customer" (manager and owner). Name is needed; mobile,
   address, private note and a company's GSTIN (state shown), contact person and email are optional. A company can be saved
   without a mobile; a duplicate says who it is, with "Open it"; the new customer can be found on the bill by name.
   The mock sheet keeps what's saved. Any page error fails. Run: node tests/addcust.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,openCustomers,setTab,appUnlock,custIndex,billText');
let custs = [['9876543210', 'Sunil Traders', '', 4, 3250, '2026-10-02T10:00:00.000Z', 0, 'Main Road, Kanpur', '', 7, '', '', '']], brev = '1', sent = [], sv = 55;
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Shri Pushpdant Plastics', mode: 'live', shopState: '27' };
    if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv });
    const bd = JSON.parse(req.postData()); sent.push(bd);
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv, me });
    if (bd.action === 'listCustomers') return send(bd.brev === brev ? { brev, same: true } : { brev, customers: custs });
    if (bd.action === 'listBills') return send({ brev: '1', bills: [], full: true });
    if (bd.action === 'saveCustomer') { const c = bd.customer;   // like the sheet
      const dupe = custs.find(x => (c.mobile && x[0] === c.mobile) || (!c.mobile && c.gstin && x[2] === c.gstin));
      if (!c.key && dupe) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, shop: 'main', error: 'cust_exists', existing: { name: dupe[1], key: dupe[0] || dupe[12] } }) });
      const key = c.mobile || 'c-abcdefghij'; custs.push([c.mobile || '', c.name, c.gstin, 0, 0, '', 0, c.address, c.note, '', c.contact, c.email, c.mobile ? '' : key]); brev = String(+brev + 1);
      return send({ key, mobile: c.mobile || '', moved: 0 }); }
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const txt = s => p.textContent(s).catch(() => ''), saves = () => sent.filter(x => x.action === 'saveCustomer');

  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(800);
  ok(await p.isVisible('#cu-add') && /Add customer/.test(await txt('#cu-add')), 'A1 Customers has "+ Add customer"');
  await p.click('#cu-add'); await p.waitForTimeout(300);
  ok(await txt('#sheet-title') === 'New customer' && await p.evaluate(() => document.activeElement.id) === 'ce-name', 'A2 the form opens, cursor in Name');
  ok(/Name \(needed\)/.test(await txt('label[for=ce-name]')) && /optional/i.test(await txt('label[for=ce-mob]')) && /Company \(GST registered\)/.test(await txt('.cu-co legend')), 'A3 Name is marked as needed, mobile as optional; a "Company (GST registered)" part');

  // B. checks on the phone
  await p.click('#ce-save'); await p.waitForTimeout(150);
  ok(/name/i.test(await txt('#ce-err')) && await p.evaluate(() => document.activeElement.id) === 'ce-name' && !saves().length, 'B1 no name: "Enter the customer\'s name", nothing sent');
  await p.fill('#ce-name', 'Balkrishna Industries Ltd'); await p.fill('#ce-email', 'purchase@'); await p.click('#ce-save'); await p.waitForTimeout(150);
  ok(/email/i.test(await txt('#ce-err')) && !saves().length, 'B2 a wrong email is caught');
  await p.fill('#ce-email', 'purchase@bkt.example'); await p.fill('#ce-gst', '27aaacb3333j1zw'); await p.dispatchEvent('#ce-gst', 'input'); await p.waitForTimeout(100);
  ok(/Maharashtra \(27\)/.test(await txt('#ce-gststate')), 'B3 a GSTIN shows its state: Maharashtra (27)');

  // C. a company without a mobile
  await p.fill('#ce-addr', 'Plot No. F-20, Waluj MIDC, Chhatrapati Sambhajinagar 431136'); await p.fill('#ce-contact', 'Purchase department');
  await p.click('#ce-save'); await p.waitForTimeout(1200);
  const s1 = saves()[0] || {};
  ok(s1.customer && s1.customer.name === 'Balkrishna Industries Ltd' && s1.customer.mobile === '' && s1.customer.gstin === '27AAACB3333J1ZW' && /Waluj MIDC/.test(s1.customer.address) && s1.customer.contact === 'Purchase department' && s1.customer.email === 'purchase@bkt.example' && !s1.customer.key, 'C1 sent as a new customer: name, no mobile, GSTIN in capitals, address, contact, email');
  ok(await txt('#sheet-title') === 'Balkrishna Industries Ltd' && /No mobile number/.test(await txt('.cu-mob')) && /27AAACB3333J1ZW/.test(await txt('.cu-info')) && /Purchase department/.test(await txt('.cu-info')) && /purchase@bkt\.example/.test(await txt('.cu-info')) && /Waluj MIDC/.test(await txt('.cu-info')), 'C2 its page opens: "No mobile number", GSTIN, contact, email, address');
  ok(!(await p.$('.cu-acts a[href^="tel:"]')) && !(await p.$('.cu-acts a[href*="wa.me"]')), 'C3 no Call or WhatsApp buttons without a number');
  await p.click('#sheet-back'); await p.waitForTimeout(500);
  ok(await p.isVisible('[data-cm="c-abcdefghij"]') && /Balkrishna/.test(await txt('#cu-list')), 'C4 it\'s in the list');

  // D. duplicate: says who, "Open it"
  await p.click('#cu-add'); await p.waitForTimeout(300); await p.fill('#ce-name', 'BKT'); await p.fill('#ce-gst', '27AAACB3333J1ZW'); await p.click('#ce-save'); await p.waitForTimeout(800);
  ok(/Already saved as Balkrishna Industries Ltd/.test(await txt('#ce-err')) && await p.isVisible('#ce-open'), 'D1 same GSTIN again: "Already saved as Balkrishna Industries Ltd" with "Open it"');
  await p.click('#ce-open'); await p.waitForTimeout(600);
  ok(await txt('#sheet-title') === 'Balkrishna Industries Ltd', 'D2 "Open it" opens that customer');

  // E. edit it: sent by its id
  sent = []; await p.click('#cu-edit'); await p.waitForTimeout(300);
  ok(await p.inputValue('#ce-contact') === 'Purchase department' && await p.inputValue('#ce-email') === 'purchase@bkt.example', 'E1 Edit shows contact and email');
  await p.fill('#ce-contact', 'Mr. Shah'); await p.click('#ce-save'); await p.waitForTimeout(800);
  const s2 = saves()[0] || {};
  ok(s2.customer && s2.customer.key === 'c-abcdefghij' && s2.customer.contact === 'Mr. Shah' && s2.customer.newMobile === '', 'E2 saved by its id, the new contact sent');

  // F. an older sheet script can't keep a customer without a mobile
  await p.evaluate(() => { T.S.sv = 54; T.openCustomers(); }); await p.waitForTimeout(500); sent = [];
  await p.click('#cu-add'); await p.waitForTimeout(300); await p.fill('#ce-name', 'Mahaveer Enterprises'); await p.click('#ce-save'); await p.waitForTimeout(300);
  ok(/older than this app/.test(await txt('#ce-err')) && !saves().length, 'F1 on script v54: "The Google Sheet script is older…", nothing sent');
  await p.evaluate(() => { T.S.sv = 55; });

  // G. found from the bill page by name, even without a mobile
  await p.evaluate(() => { document.querySelector('#sheet-close').click(); T.setTab('bill'); }); await p.waitForTimeout(300);
  await p.click('#cust'); await p.type('#cust', 'balk'); await p.waitForTimeout(400);
  ok(await p.isVisible('#sug-cust') && /Balkrishna Industries Ltd/.test(await txt('#sug-cust')), 'G1 typing "balk" on the bill suggests the company');
  await p.fill('#cust-mob', '');
  await p.click('#sug-cust [data-sug="0"]'); await p.waitForTimeout(300);
  ok(await p.inputValue('#cust') === 'Balkrishna Industries Ltd' && await p.inputValue('#cust-gstin') === '27AAACB3333J1ZW' && await p.inputValue('#cust-mob') === '', 'G2 picking it fills the name and GSTIN (no mobile to fill)');

  ok(await p.evaluate(() => T.S.custAddr) === 'Plot No. F-20, Waluj MIDC, Chhatrapati Sambhajinagar 431136' && !(await p.$('#cust-addr')), 'G3 …and its address goes with the bill (no address box on the bill page)');
  // H. the address on the bill text, sent with the bill; a typed address isn't replaced by a lookup; ✕ clears it
  await p.evaluate(() => { const S = T.S; S.bill = [{ id: 'x', name: 'Carry Bag', unit: 'pc', rate: 7.75, qty: 10, hsn: '3923', gst: 18 }]; });
  await p.click('#gst-chip'); await p.waitForTimeout(200);
  const tx = await p.evaluate(() => T.billText());
  ok(/Customer: Balkrishna Industries Ltd\nAddress: Plot No\. F-20, Waluj MIDC, Chhatrapati Sambhajinagar 431136\nGSTIN: 27AAACB3333J1ZW\n/.test(tx), 'H1 GST bill text: customer, address, GSTIN');
  ok(!/PO No/.test(tx), 'H2 no purchase order on it: no PO line');
  sent = []; await p.evaluate(() => document.querySelector('#bill-done').click()); await p.waitForTimeout(1200);
  const tb = (sent.find(x => x.action === 'takeBill') || {}).bill || {};
  ok(tb.custAddr === 'Plot No. F-20, Waluj MIDC, Chhatrapati Sambhajinagar 431136' && tb.custGstin === '27AAACB3333J1ZW', 'H3 Done sends the address with the bill');
  ok(await p.evaluate(() => T.S.custAddr) === '', 'H4 the next bill starts without an address');
  await p.fill('#cust', 'Sunil'); await p.waitForTimeout(300); await p.click('#sug-cust [data-sug="0"]').catch(() => {}); await p.waitForTimeout(300);
  ok(await p.evaluate(() => T.S.custAddr) === 'Main Road, Kanpur', 'H5 picking a saved customer puts their saved address on the bill');
  await p.click('#cust-x'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => T.S.custAddr) === '' && await p.inputValue('#cust') === '', 'H6 the customer ✕ clears the address too');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
