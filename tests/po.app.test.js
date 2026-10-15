/* The customer's purchase order (PO) on a bill (15 Oct 2026): optional "+ Customer's purchase order (PO)" under the bill's
   extra details; PO number + date go into the WhatsApp text (GST and normal bills), the bill sent to the sheet, the PDF and
   every printout; kept with drafts and open bills, brought back when a past bill is edited, not carried over by Repeat, and
   cleared after each bill. Any page error fails. Run: node tests/po.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,addToBill,billText,setTab,appUnlock,heldGet,resumeHeld,receiptLines,invFromCurrent,prHtmlInvoice,prHtmlReceipt,openBills,startEdit');
const items = [{ id: 'i1', name: 'Sima Plastic Carry Bag 27x30 120 micron', unit: 'pc', buy: 6.5, sell: 7.75, hsn: '39231090', gst: 18 }];
let sent = [];
const PAST = { n: 41, date: '2026-10-15T06:00:00.000Z', day: '2026-10-15', customer: 'Balkrishna Industries', mobile: '7385327108', total: 19205, items: 'Sima Plastic Carry Bag 2100 pc x 7.75', gst: true,
  custGstin: '27AAACB3333J1ZW', igst: false, id: 'bkt1', row: 2, edits: 0, pay: 'Paid', paid: 19205, due: 0, payments: [], fy: '2026-27', cancelled: false, pos: 'Maharashtra (27)', po: { no: '1100-4500253480', date: '2026-10-15' }, custAddr: 'Plot F-20, Waluj MIDC' };
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://wa.me/**', r => r.fulfill({ body: 'wa' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Shri Pushpdant Plastics', mode: 'live', roundTo: 1, defaultUnit: 'pc', nextBill: 21, nextGstBill: 42, shopGstin: '27ABTPB1142J1ZP', shopState: '27', defaultGst: 18, defaultHsn: '3923' };
    if (q.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 54, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData()); sent.push(bd);
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 54, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'takeBill') return send({});
    if (bd.action === 'listBills') return send({ bills: [PAST], full: true, brev: '1', days: {}, months: {}, all: { count: 1, total: 19205 }, years: ['2026'] });
    if (bd.action === 'getBill') return send({ bill: { ...PAST, text: 'TAX INVOICE…', lines: [{ id: 'i1', name: items[0].name, unit: 'pc', rate: 7.75, qty: 2100, hsn: '39231090', gst: 18 }] } });
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); localStorage.setItem('rb_bh_open', 'true'); sessionStorage.x = 1; } });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  const vis = sel => p.$eval(sel, e => !e.hidden && e.offsetParent !== null).catch(() => false);
  const fresh = async () => { await p.evaluate(() => { T.addToBill('i1', 2100); T.setTab('bill'); }); await p.waitForTimeout(300); };
  const takes = () => sent.filter(x => x.action === 'takeBill').map(x => x.bill);

  // A. hidden until asked for
  await fresh();
  ok(await vis('#po-add') && !(await vis('#po-f')), 'A1 bill details show "+ Customer\'s purchase order (PO)", the boxes stay folded until tapped');
  ok(!/PO/.test(await p.evaluate(() => T.billText())), 'A2 no PO: nothing about it in the WhatsApp text');
  await p.click('#po-add'); await p.waitForTimeout(150);
  ok(await vis('#po-no') && await vis('#po-date') && await p.evaluate(() => document.activeElement.id) === 'po-no' && !(await vis('#po-add')), 'A3 tap: PO number and PO date boxes open, cursor in PO number');

  // B. typed in: on the GST tax invoice, under the customer's GSTIN
  await p.click('#gst-chip'); await p.fill('#cust', 'Balkrishna Industries'); await p.fill('#cust-gstin', '27AAACB3333J1ZW');
  await p.fill('#po-no', '1100-4500253480'); await p.fill('#po-date', '2026-10-15'); await p.waitForTimeout(200);
  let tx = await p.evaluate(() => T.billText());
  ok(/GSTIN: 27AAACB3333J1ZW\nPO No: 1100-4500253480 · PO date: 15\/10\/2026\n/.test(tx), 'B1 GST bill text: "PO No: 1100-4500253480 · PO date: 15/10/2026" right under the customer\'s GSTIN');
  ok(decodeURIComponent(await p.getAttribute('#bill-wa', 'href')).includes('PO No: 1100-4500253480'), 'B2 the Share link carries it');
  await p.click('#gst-chip'); await p.waitForTimeout(150);
  ok(/Customer: Balkrishna Industries\nPO No: 1100-4500253480 · PO date: 15\/10\/2026\n/.test(await p.evaluate(() => T.billText())), 'B3 a normal (non-GST) bill shows it too');
  await p.click('#gst-chip'); await p.waitForTimeout(150);

  // C. printouts and PDF data
  const inv = await p.evaluate(() => T.invFromCurrent());
  ok(inv.po && inv.po.no === '1100-4500253480' && inv.po.date === '2026-10-15', 'C1 invoice data (PDF, print) carries the PO');
  ok(/PO No: 1100-4500253480/.test(await p.evaluate(i => T.prHtmlInvoice(i), inv)) && /PO date: 15\/10\/2026/.test(await p.evaluate(i => T.prHtmlInvoice(i), inv)), 'C2 A4/A5 invoice: PO No and PO date next to the invoice number');
  ok(/PO No: 1100-4500253480/.test(await p.evaluate(i => T.prHtmlReceipt(i), inv)), 'C3 80 mm receipt: PO No');
  const rl = await p.evaluate(i => T.receiptLines(i, 32).map(x => x.t !== undefined ? x.t : x), inv).catch(() => null);
  ok(Array.isArray(rl) && rl.some(x => String(x).includes('PO No: 1100-4500253480')) && rl.every(x => String(x).length <= 32), '58 mm roll (RawBT / picture): PO lines fit 32 columns ' + JSON.stringify((rl || []).filter(x => /PO/.test(x))));

  // D. kept as a draft (app closed and opened again)
  await p.reload(); await p.waitForTimeout(1500); await p.evaluate(() => { T.appUnlock(); T.setTab('bill'); }); await p.waitForTimeout(300);
  ok(await p.inputValue('#po-no') === '1100-4500253480' && await p.inputValue('#po-date') === '2026-10-15' && await vis('#po-f'), 'D1 after reopening the app the PO is still on the bill');

  // E. open bills: New bill holds it, switching back brings it back; the new bill starts without one
  await p.click('#bill-new'); await p.waitForTimeout(300);
  ok(await p.inputValue('#po-no') === '' && !(await vis('#po-f')) && await vis('#po-add'), 'E1 New bill: no PO on the new one');
  await p.evaluate(() => { const h = T.heldGet()[0]; T.resumeHeld(h.hid); }); await p.waitForTimeout(300);
  ok(await p.inputValue('#po-no') === '1100-4500253480', 'E2 back to the held bill: its PO is there');

  // F. Done: sent with the bill, then cleared
  sent = []; await p.click('#bill-done'); await p.waitForTimeout(1200);
  const b1 = takes()[0] || {};
  ok(b1.po && b1.po.no === '1100-4500253480' && b1.po.date === '2026-10-15' && /PO No: 1100-4500253480/.test(b1.text), 'F1 Done sends the PO with the bill (and in its text)');
  ok(await p.inputValue('#po-no') === '' && !(await vis('#po-f')), 'F2 next bill starts without a PO');
  await fresh(); sent = []; await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok((takes()[0] || {}).po === null, 'F3 a bill without a PO sends none');

  // G. Remove PO
  await fresh(); await p.click('#po-add'); await p.fill('#po-no', 'X-1'); await p.click('#po-x'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => !T.S.po.no && !T.S.po.date) && !(await vis('#po-f')) && !/PO/.test(await p.evaluate(() => T.billText())), 'G1 "Remove PO" clears it and folds the boxes');

  // H. past bill: Edit brings the PO back; Repeat as new bill doesn't carry it
  await p.evaluate(() => document.querySelector('#bill-clear-yes').click()); await p.waitForTimeout(200);
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1200);
  await p.click('[data-bid="bkt1"]').catch(() => {}); await p.waitForTimeout(1200);
  const edit = await p.$('#bd-edit');
  if (edit) { await edit.click(); await p.waitForTimeout(600); }
  ok(await p.inputValue('#po-no') === '1100-4500253480' && await p.inputValue('#po-date') === '2026-10-15', 'H1 Edit bill (No. 41): its PO comes back on the bill');
  ok(await p.inputValue('#cust-addr') === 'Plot F-20, Waluj MIDC', 'H1b …and the customer\'s address');
  ok(/PO No: 1100-4500253480/.test(await p.evaluate(() => T.billText())), 'H2 the edited bill\'s text keeps the PO');
  await p.click('#edit-cancel'); await p.waitForTimeout(400);
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1200); await p.click('[data-bid="bkt1"]').catch(() => {}); await p.waitForTimeout(1200);
  const rep = await p.$('#bd-repeat'); if (rep) { await rep.click(); await p.waitForTimeout(300); const y = await p.$('#bd-ry'); if (y && await y.isVisible()) await y.click(); await p.waitForTimeout(500); }
  ok(await p.evaluate(() => T.S.bill.length) === 1 && await p.inputValue('#po-no') === '', 'H3 Repeat as new bill: same items, but no PO (a new order has its own)');

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
