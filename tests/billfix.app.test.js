/* Bill page fixes from the architect review (22 Oct 2026). Each check failed on the code before the fix:
   A. a change made while a shared bill is still being sent reaches the sheet (as an update), also after a renumber;
   B. switching test / real mode puts the bill on screen aside in its own mode, so it's never saved in the other one;
   C. correcting the mobile drops the previous customer's auto-filled name, GSTIN and address;
   D. an out-of-state GSTIN filled from a saved customer switches IGST on (lookup, suggestion, Customers → Start a bill);
   E. an item's pack size removed on another phone turns the pack line into main units with the same amount;
   F. Share of a bill the sheet refuses doesn't open WhatsApp or say "saved"; the bill stays on screen to fix;
   G. a quantity of 0 stops Done and Share before anything is sent.
   Run: node tests/billfix.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,addToBill,billTotal,billText,heldGet,setTab,appUnlock,flushBills,finishBill,saveEdit,switchEnv,applyItems,updateBillTotals,renderBill,custFill,wqGet,wqFails,custIndex,custdGet,sugShow,SUG,sugPick,curBillNo,closeSheet');
const ITEMS = () => [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180, hsn: '3923', gst: 18 },
  { id: 'i2', name: 'Max', unit: 'kg', buy: 200, sell: 250, altUnit: 'packet', altQty: 5, altSell: 50, gst: 18 }];
const cfg = { shopName: 'Gupta', mode: 'live', roundTo: 1, defaultUnit: 'kg', nextBill: 21, nextGstBill: 7, defaultGst: 18, defaultHsn: '3923', shopGstin: '27ABCDE1234F1Z5', shopState: '27' };
let sent = [], delay = 0, renum = null, refuse = '';
const edits = {};   // the mock sheet's edit count per bill (updateBill with a stale baseEdits is refused, like the real one)
const CUST = { '9876543210': { name: 'Sunil Traders', gstin: '09AAAAA1111A1Z5', address: 'Sunil addr', count: 4, total: 3250, last: '2026-10-02', due: 0 },
  '9812345678': { name: 'Ramesh Stores', gstin: '27BBBBB2222B1Z5', address: 'Ramesh addr', count: 2, total: 900, last: '2026-10-01', due: 0 } };
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://wa.me/**', r => r.fulfill({ body: 'wa' }));
  await ctx.route('https://fonts.**', r => r.abort());
  await ctx.route('https://script.google.com/**', async r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    if (q.method() === 'GET') return send({ rev: '1', items: ITEMS(), config: cfg, sv: 67 });
    const bd = JSON.parse(q.postData()); sent.push(JSON.parse(JSON.stringify(bd)));
    if (bd.action === 'boot') return send({ rev: '1', items: ITEMS(), config: cfg, sv: 67, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'takeBill') { if (delay) await new Promise(z => setTimeout(z, delay));
      if (refuse) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, shop: 'main', error: refuse }) });
      edits[bd.bill.id] = 0;
      return send(renum ? { n: renum.to, renumbered: renum } : { n: bd.bill.n }); }
    if (bd.action === 'updateBill') { const id = bd.bill.id;
      if (bd.bill.baseEdits !== undefined && (edits[id] || 0) !== bd.bill.baseEdits) return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, shop: 'main', error: 'bill_changed' }) });
      edits[id] = (edits[id] || 0) + 1; return send({ bill: { id, n: bd.bill.n, edits: edits[id] } }); }
    if (bd.action === 'findCustomer') return send(CUST[bd.mobile] ? { customer: CUST[bd.mobile] } : {});
    if (bd.action === 'listCustomers') return send({ brev: '1', list: Object.entries(CUST).map(([m, c]) => [m, c.name, c.gstin, c.count, c.total, c.last, 0, c.due, c.address, '', '', '', '']) });
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); sessionStorage.x = 1; }
    window.__opened = []; window.open = u => { window.__opened.push(String(u)); return { opener: 1 }; }; });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  const ups = () => sent.filter(x => x.action === 'updateBill').map(x => x.bill), takes = () => sent.filter(x => x.action === 'takeBill').map(x => x.bill);
  const clean = async () => { await p.evaluate(() => { T.closeSheet(); if (T.S.editing && T.S.editing.fresh) { T.S.editing = null; localStorage.rb_editing = 'null'; }
    T.S.bill.length = 0; T.S.cust = ''; T.S.mob = ''; T.S.custGstin = ''; T.S.gst = false; T.S.igst = false; T.S.custAuto = ''; T.S.custQ = '';
    ['#cust', '#cust-mob', '#cust-gstin'].forEach(k => { document.querySelector(k).value = ''; }); T.renderBill(); }); await p.waitForTimeout(150); };
  await p.evaluate(() => T.setTab('bill'));

  // A. a change made while the shared bill is still being sent
  delay = 1500; sent = [];
  await p.evaluate(() => { T.addToBill('i1'); T.finishBill({ keep: true }); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { T.S.bill[0].qty = 3; T.saveEdit({ keep: true }); });
  await p.waitForTimeout(6500);
  { const u = ups(); const t = takes();
    ok(t.length === 1 && u.some(x => x.lines[0].qty === 3 && x.fresh === true && x.id === t[0].id), 'A1 qty changed to 3 while bill 21 was sending: the sheet gets it as an update of the same bill (' + JSON.stringify(u.map(x => x.lines[0].qty)) + ')');
    ok(await p.evaluate(() => T.S.billQ.length === 0 && T.wqGet().length === 0 && T.wqFails().length === 0), 'A2 nothing left waiting or failed'); }
  // a third change on the same open bill goes through (the phone's edit count follows the update)
  sent = []; delay = 0;
  await p.evaluate(() => { T.S.bill[0].qty = 4; T.saveEdit({ keep: true }); }); await p.waitForTimeout(3000);
  ok(ups().some(x => x.lines[0].qty === 4) && await p.evaluate(() => T.wqFails().length === 0), 'A3 a later change to the same bill saves too (no "someone else changed it")');
  await clean();
  // renumbered by the sheet while a change was waiting: the update carries the new number and its text says so
  delay = 1500; renum = { from: 22, to: 23 }; sent = [];
  await p.evaluate(() => { T.addToBill('i1'); T.finishBill({ keep: true }); });
  await p.waitForTimeout(300);
  await p.evaluate(() => { T.S.bill[0].qty = 2; T.saveEdit({ keep: true }); });
  await p.waitForTimeout(6500);
  { const u = ups().find(x => x.lines[0].qty === 2);
    ok(!!u && +u.n === 23 && /Bill No: 23\b/.test(u.text) && !/Bill No: 22\b/.test(u.text), 'A4 renumbered 22 → 23 while sending: the update is for No. 23 and its text says 23'); }
  renum = null; delay = 0; await clean();

  // B. switching test / real mode with a bill on screen
  sent = [];
  await p.evaluate(() => { T.addToBill('i1'); T.S.cust = 'Real cust'; });
  await p.evaluate(() => { T.S.auth.prefs.mode = 'test'; T.switchEnv(T.S.cfg); });
  ok(await p.evaluate(() => T.S.cfg.mode === 'test' && T.S.bill.length === 0 && !T.S.cust), 'B1 switched to test mode: the real bill is no longer on screen');
  await p.evaluate(() => { T.addToBill('i1'); T.S.cust = 'Practice'; T.finishBill({ keep: true }); }); await p.waitForTimeout(800);
  await p.evaluate(() => { T.S.auth.prefs.mode = 'live'; T.switchEnv(T.S.cfg); });
  ok(await p.evaluate(() => T.S.cfg.mode === 'live' && T.S.bill.length === 0 && !T.S.editing), 'B2 back to real mode: the shared practice bill is not on screen');
  ok(await p.evaluate(() => T.heldGet().some(h => h.d && h.d.cust === 'Real cust')), 'B3 the real bill is kept as an open bill in real mode');
  sent = []; await p.evaluate(() => document.querySelector('#bill-done').click()); await p.waitForTimeout(600);
  ok(!takes().length, 'B4 Done on the empty screen saves nothing (the practice bill was never saved as real)');
  await p.evaluate(() => { localStorage.removeItem('rb_held'); localStorage.removeItem('rb_held_test'); });
  await clean();

  // C. correcting the mobile number
  await p.evaluate(() => T.addToBill('i1'));
  await p.fill('#cust-mob', '9876543210'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => T.S.cust === 'Sunil Traders' && T.S.custGstin === '09AAAAA1111A1Z5' && T.S.custAddr === 'Sunil addr'), 'C1 mobile A: Sunil Traders, his GSTIN and address filled');
  await p.fill('#cust-mob', '9876543211'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => !T.S.cust && !T.S.custGstin && !T.S.custAddr), 'C2 corrected to a new number: Sunil\'s name, GSTIN and address are gone');
  await p.fill('#cust-mob', '9812345678'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => T.S.cust === 'Ramesh Stores' && T.S.custGstin === '27BBBBB2222B1Z5' && T.S.custAddr === 'Ramesh addr'), 'C3 another saved customer\'s number: his name, GSTIN and address');
  await p.fill('#cust-mob', ''); await p.evaluate(() => { T.S.gst = true; T.renderBill(); if (document.querySelector('#bh-extra').hidden) document.querySelector('#bh-more').click(); });
  await p.fill('#cust', 'Typed by me'); await p.fill('#cust-gstin', '27CCCCC3333C1Z5');
  await p.fill('#cust-mob', '9876543210'); await p.waitForTimeout(900); await p.fill('#cust-mob', '9876543212'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => T.S.cust === 'Typed by me' && T.S.custGstin === '27CCCCC3333C1Z5'), 'C4 a name and GSTIN typed by hand are never cleared');
  await clean();

  // D. out-of-state GSTIN from a saved customer → IGST
  await p.evaluate(() => { T.addToBill('i1'); T.S.gst = true; T.renderBill(); });
  await p.fill('#cust-mob', '9876543210'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => T.S.igst === true && /IGST/.test(T.billText()) && !/CGST/.test(T.billText())), 'D1 Sunil (UP, 09) looked up by mobile in a Maharashtra shop: IGST, not CGST + SGST');
  await p.fill('#cust-mob', '9812345678'); await p.waitForTimeout(900);
  ok(await p.evaluate(() => T.S.igst === false && /CGST/.test(T.billText())), 'D2 then Ramesh (same state): back to CGST + SGST');
  await clean();
  await p.evaluate(() => { T.addToBill('i1'); T.S.gst = true; T.renderBill(); T.custFill({ name: 'Sunil Traders', mob: '9876543210', gstin: '09AAAAA1111A1Z5', addr: 'Sunil addr' }); });
  await p.waitForTimeout(500);
  ok(await p.evaluate(() => T.S.igst === true), 'D3 Customers → Start a bill with an out-of-state customer: IGST');
  await clean();

  // E. pack size removed on another phone
  await p.evaluate(() => { T.addToBill('i2'); const l = T.S.bill[0]; l.alt = true; l.unit = 'packet'; l.rate = 50; l.qty = 5; l.buy = 40; T.renderBill(); });
  await p.evaluate(() => T.applyItems([{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180, hsn: '3923', gst: 18 }, { id: 'i2', name: 'Max', unit: 'kg', buy: 200, sell: 250, gst: 18 }]));
  { const l = await p.evaluate(() => T.S.bill[0]);
    ok(l.unit === 'kg' && Math.abs(l.qty - 1) < 1e-9 && l.rate === 250 && l.buy === 200 && !l.alt && await p.evaluate(() => T.billTotal()) === 250, 'E1 5 packets × ₹50 became 1 kg × ₹250 (₹250, buy ₹200), not 5 kg × ₹250 (' + JSON.stringify(l) + ')'); }
  await p.evaluate(() => { T.S.bill.length = 0; T.addToBill('i2'); const l = T.S.bill[0]; l.alt = true; l.unit = 'packet'; l.rate = 45; l.qty = 10; l.buy = 40; T.renderBill(); });
  await p.evaluate(() => T.applyItems([{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180, hsn: '3923', gst: 18 }, { id: 'i2', name: 'Max', unit: 'kg', buy: 200, sell: 250, altUnit: 'packet', altQty: 5, altSell: 50, gst: 18 }]));
  await p.evaluate(() => T.applyItems([{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180, hsn: '3923', gst: 18 }, { id: 'i2', name: 'Max', unit: 'kg', buy: 200, sell: 250, gst: 18 }]));
  ok(await p.evaluate(() => { const l = T.S.bill[0]; return l.unit === 'kg' && Math.abs(l.qty - 2) < 1e-9 && l.rate === 225 && T.billTotal() === 450; }), 'E2 a typed pack rate is kept: 10 packets × ₹45 = 2 kg × ₹225 (same ₹450)');
  await clean();

  // F. Share of a bill the sheet refuses
  refuse = 'text_mismatch'; sent = [];
  await p.evaluate(() => { window.__opened = []; T.addToBill('i1'); T.renderBill(); });
  const noF = await p.evaluate(() => T.curBillNo());
  await p.click('#bill-wa'); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__opened.length === 0), 'F1 refused by the sheet: WhatsApp doesn\'t open');
  ok(await p.evaluate(() => !T.S.editing && T.S.bill.length === 1), 'F2 the bill stays on screen, not marked as saved');
    ok(await p.evaluate(() => !/Bill \d+ saved/.test(document.querySelector('#toast').textContent) && /Not saved/.test(document.querySelector('#toast').textContent) && T.wqFails().length === 0), 'F3 says "Not saved" and why (not "Bill N saved"), and it isn\'t also in the couldn\'t-be-saved list');
  ok(await p.evaluate(() => T.curBillNo()) === noF, 'F4 the number it would have used (' + noF + ') is offered again');
  refuse = ''; await clean();

  // G. a quantity of 0
  sent = [];
  await p.evaluate(() => { T.S.byId.get('i1').unit = 'pc'; T.addToBill('i1'); T.renderBill(); });
  await p.evaluate(() => { const e = document.querySelector('#bq-0'); e.removeAttribute('readonly'); e.value = '0'; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.click('#bill-done'); await p.waitForTimeout(600);
  ok(!takes().length && await p.evaluate(() => T.S.bill.length === 1 && document.querySelector('#bq-0').classList.contains('need')), 'G1 Done with a quantity of 0: nothing sent, the box is marked');
  await p.evaluate(() => { window.__opened = []; document.querySelector('#bill-wa').click(); }); await p.waitForTimeout(800);
  ok(!takes().length && await p.evaluate(() => window.__opened.length === 0), 'G2 Share with a quantity of 0: nothing sent, WhatsApp doesn\'t open');

  ok(!errs.length, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
