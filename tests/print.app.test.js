/* PDF invoices and printing (added with the print.js split, 11 Oct 2026; there was no test for them before): bill PDF (normal
   and GST), A4 and 80 mm printing through the print screen, the 58 mm ESC/POS bytes for RawBT, the receipt picture, Settings →
   Printer with its test print, "Last bill" print after Done, and a past bill's PDF and print. On a laptop width, where files
   download straight away. Any page error fails. Run: node tests/print.app.test.js */
const fs = require('fs'), path = require('path');
const { appHtml, launch, ok, done, ROOT } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,addToBill,openSettings,showBill,escpos,receiptLines,prCols');
const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 90, sell: 120, hsn: '3923', gst: 18 }, { id: 'i2', name: 'Paper Cup', unit: 'pc', buy: 1, sell: 2, hsn: '4823', gst: 18 }];
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); let took = 0;
  await ctx.route('https://rb.test/pdf.js', r => r.fulfill({ body: fs.readFileSync(path.join(ROOT, 'pdf.js')), contentType: 'text/javascript' }));
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 21, nextGstBill: 7, shopGstin: '09AAACG1234K1Z2', shopAddress: 'Main Bazaar, Kanpur', defaultGst: 18, defaultHsn: '3923' };
    if (req.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 60 });
    const bd = JSON.parse(req.postData());
    if (bd.action === 'takeBill') { took++; return send({}); }
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 60, me });
    return send({ me }); });
  await p.addInitScript(() => { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } }));
    window.__prints = 0; window.print = () => { window.__prints++; }; });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const click = sel => p.evaluate(s => document.querySelector(s).click(), sel);
  const file = async (sel, how = click) => { const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null); await how(sel); const d = await dl; return d ? { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) } : null; };
  const setPr = o => p.evaluate(o => localStorage.setItem('rb_print', JSON.stringify(o)), o);
  const printed = async () => { await p.waitForTimeout(250); return p.evaluate(() => ({ n: window.__prints, cls: (document.querySelector('#printroot') || {}).className, txt: (document.querySelector('#printroot') || {}).textContent || '', page: (document.querySelector('#printpage') || {}).textContent || '', title: document.title, on: document.body.classList.contains('printing') })); };

  await p.evaluate(() => { T.addToBill('i1', 2); T.addToBill('i2', 50); }); await p.fill('#cust', 'Sunil Traders'); await p.dispatchEvent('#cust', 'input'); await p.waitForTimeout(200);
  let f = await file('#bill-pdf');
  ok(f && f.name === 'Bill-21.pdf' && f.buf.slice(0, 5).toString() === '%PDF-', 'bill PDF: "Bill-21.pdf", a real PDF (' + (f && f.name) + ')');
  ok(f && /Sunil Traders/.test(f.buf.toString('latin1')) && /340/.test(f.buf.toString('latin1')) && /Gupta Plastics/.test(f.buf.toString('latin1')), 'bill PDF has the shop, the customer and the total ₹340');

  await click('#gst-chip'); await p.waitForTimeout(200);
  f = await file('#bill-pdf'); const g = f && f.buf.toString('latin1');
  ok(f && f.name === 'Invoice-7.pdf' && /TAX INVOICE/i.test(g) && /3923/.test(g) && /4823/.test(g) && /CGST/.test(g) && /09AAACG1234K1Z2/.test(g), 'GST invoice PDF: "Invoice-7.pdf", tax invoice with HSN, CGST and the shop GSTIN');
  ok(f && /401/.test(g), 'GST invoice PDF total ₹401 (340 + 18% = 401.20, rounded)');
  // the customer's purchase order (PO), added 15 Oct 2026
  await p.evaluate(() => { T.S.po = { no: '1100-4500253480', date: '2026-10-15' }; }); f = await file('#bill-pdf'); const gp = f && f.buf.toString('latin1');
  ok(f && /PO No: 1100-4500253480/.test(gp) && /PO date: 15\/10\/2026/.test(gp), 'GST invoice PDF with a purchase order: "PO No: 1100-4500253480" and "PO date: 15/10/2026" beside the invoice number');
  await p.evaluate(() => { T.S.po = { no: '', date: '' }; });
  // GST invoice format (GST rules 46/48, 15 Oct 2026): buyer address and state, reverse charge, original for recipient, signatory
  await p.evaluate(() => { T.S.custGstin = '09ABCDE1234F1Z5'; T.S.custAddr = 'Shop 4, Station Road\nKanpur 208001'; }); f = await file('#bill-pdf'); const gs = f && f.buf.toString('latin1');
  ok(f && /ORIGINAL FOR RECIPIENT/.test(gs) && /Reverse charge: No/.test(gs) && /Authorised Signatory/.test(gs) && /For Gupta Plastics/.test(gs), 'GST invoice PDF: "Original for recipient", "Reverse charge: No", "For Gupta Plastics … Authorised Signatory"');
  ok(f && /Shop 4, Station Road/.test(gs) && /Kanpur 208001/.test(gs) && /State: Uttar Pradesh \\?\(09\\?\)/.test(gs) && /Rate \\?\(Rs\.\\?\)/.test(gs), 'GST invoice PDF: the buyer\'s address (each line), their state from the GSTIN, money columns headed (Rs.)');
  await p.evaluate(() => { T.S.custGstin = ''; T.S.custAddr = ''; });

  await setPr({ paper: 'a4', via: 'system', auto: false }); await click('#bill-print'); let r = await printed();
  ok(r.n === 1 && r.on && r.cls === 'pp-a4' && /PP Bag/.test(r.txt) && /Paper Cup/.test(r.txt) && /3923/.test(r.txt) && /401/.test(r.txt), 'A4: the print screen opens with the full invoice (items, HSN, total)');
  ok(/size:A4/.test(r.page) && r.title === 'Invoice 7 - Sunil Traders', 'A4 page size, and the saved file would be named "Invoice 7 - Sunil Traders"');
  await setPr({ paper: '80', via: 'system', auto: false }); await click('#bill-print'); r = await printed();
  ok(r.n === 2 && r.cls === 'pp-80' && /CGST/.test(r.txt) && /SGST/.test(r.txt) && /401/.test(r.txt) && /size:80mm \d+mm/.test(r.page), '80 mm: a narrow receipt with the CGST/SGST split, page 80 mm wide');

  const lines = await p.evaluate(() => { const inv = invFromCurrent(), w = T.prCols('58'), inv2 = { ...inv, cust: { ...inv.cust, name: 'Shree Ganesh Packaging and Disposables' } };
    return { l: T.receiptLines(inv, w).concat(T.receiptLines(inv2, w)), bytes: Array.from(T.escpos(T.receiptLines(inv, w))) }; });   // + a long customer name
  const asText = String.fromCharCode(...lines.bytes), wide = lines.l.map(x => x.t).filter(x => x.length > 32);
  ok(lines.l.length > 8 && !wide.length && /PP Bag/.test(asText) && /401/.test(asText) && lines.bytes[0] === 27 && /^[\x00-\x7f]*$/.test(asText), '58 mm RawBT: ESC/POS bytes, plain ASCII, no line over 32 columns (place of supply, a long customer name), with items and total' + (wide.length ? ' (too wide: ' + wide.join(' | ') + ')' : ''));

  await setPr({ paper: '58', via: 'image', auto: false }); f = await file('#bill-print');
  ok(f && f.name === 'Bill-7.png' && f.buf.readUInt32BE(16) === 384, 'receipt picture for 58 mm: "Bill-7.png", 384 px wide (' + (f && f.buf.readUInt32BE(16)) + ')');

  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(400); await p.click('details[data-cg="pr"] summary'); await p.waitForTimeout(200);
  await p.click('[data-pp="80"]'); await p.waitForTimeout(150);
  ok(JSON.parse(await p.evaluate(() => localStorage.rb_print)).paper === '80' && (await p.$$('input[name="prvia"]')).length === 3, 'Settings → Printer: picking 80 mm is saved, and the three ways to reach a roll printer show');
  await p.click('input[name="prvia"][value="system"]'); await p.click('#cf-prtest'); r = await printed();
  ok(r.n === 3 && /Sample item/.test(r.txt) && /250 ?g/.test(r.txt), 'Print a test bill: the sample receipt (with "250 g")');
  await p.evaluate(() => closeSheet()); await p.waitForTimeout(300);

  await click('#gst-chip'); await p.waitForTimeout(150); await setPr({ paper: 'a4', via: 'system', auto: false });
  await click('#bill-done'); await p.waitForTimeout(1500);
  ok(took === 1 && (await p.evaluate(() => T.S.bill.length)) === 0, 'Done: the bill is sent and the screen cleared');
  await click('.lb-print'); r = await printed();
  ok(r.n === 4 && /PP Bag/.test(r.txt) && /340/.test(r.txt) && /Sunil Traders/.test(r.txt), '"Last bill" print button prints the bill just finished');

  await p.evaluate(() => T.showBill({ n: 12, gst: true, fy: '2026-27', date: '2026-10-05T10:00:00', customer: 'Ravi Stores', mobile: '9876543210', custGstin: '09ABCDE1234F1Z5', pos: '09-Uttar Pradesh', total: 283, text: 'x', items: 'PP Bag 2 kg',
    lines: [{ name: 'PP Bag', hsn: '3923', qty: 2, unit: 'kg', rate: 120, gst: 18 }], pay: 'Credit', paid: 0, due: 283 })); await p.waitForTimeout(400);
  f = await file('#bd-pdf'); const pb = f && f.buf.toString('latin1');
  ok(f && f.name === 'Invoice-12.pdf' && /Ravi Stores/.test(pb) && /09ABCDE1234F1Z5/.test(pb) && /283/.test(pb), 'past bill PDF: "Invoice-12.pdf" with the customer, their GSTIN and the total');
  await click('#bd-print'); r = await printed();
  ok(r.n === 5 && /Ravi Stores/.test(r.txt) && /283/.test(r.txt), 'past bill print');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
