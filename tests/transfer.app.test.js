/* Transfer a bill to another number on the phone (21 Oct 2026, script v63): Past bills → a bill → Transfer to new number → the
   bill page opens with the same items and customer, the number is set there, and Done saves it with the old bill to cancel.
   Run: node tests/transfer.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,showBill,setTab,appUnlock');
const items = [{ id: 'i1', name: 'PP Bag 12x18', unit: 'kg', buy: 150, sell: 180, gst: 18, hsn: '3923' }];
const cfg = { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg', nextBill: 21, nextGstBill: 1776, fyReset: true };
const sent = [];
const old = { id: 'old', row: 2, n: 1773, gst: true, date: new Date(Date.now() - 5 * 864e5).toISOString(), customer: 'Sunil Traders', mobile: '9876543210', custGstin: '09AAACS1234F1Z5', total: 708, pay: 'Part paid', paid: 300, due: 408, payments: [{ a: 200, at: 1 }, { a: 100 }], edits: 0, fy: '',
  text: 'TAX INVOICE\nInvoice No: 1773', lines: [{ id: 'i1', name: 'PP Bag 12x18', unit: 'kg', rate: 200, qty: 3, hsn: '3923', gst: 18 }] };
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  let role = 'owner';
  await ctx.route('https://script.google.com/**', async r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    if (q.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 63, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData()); sent.push(bd);
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 63, me: { name: 'Mayank', role, personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'getBill') return send({ bill: old });
    if (bd.action === 'takeBill') { cfg.nextGstBill = bd.n + 1; return send({ config: cfg, moved: bd.bill.moveFrom ? { id: 'old', row: 2, from: 1773, to: bd.n } : null }); }
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); sessionStorage.x = 1; } });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  const open = async () => { await p.evaluate(o => T.showBill(JSON.parse(o)), JSON.stringify(old)); await p.waitForTimeout(500); };

  await open();
  ok(await p.isVisible('#bd-move') && /Transfer to new number/.test(await p.textContent('#bd-move')), 'A1 a past bill has "Transfer to new number" (owner)');
  await p.click('#bd-move'); await p.waitForTimeout(200);
  ok(await p.isVisible('#bd-mq') && /Move Bill 1773 to a new number\?/.test(await p.textContent('#bd-mq')) && /dated today/.test(await p.textContent('#bd-mq')), 'A2 it says what will happen first');
  ok(!sent.some(x => x.action === 'cancelBill'), 'A3 nothing is cancelled yet');
  await p.click('#bd-my'); await p.waitForTimeout(500);
  const st = await p.evaluate(() => ({ tab: T.S.tab, lines: T.S.bill.length, qty: T.S.bill[0] && T.S.bill[0].qty, rate: T.S.bill[0] && T.S.bill[0].rate, cust: T.S.cust, gst: T.S.gst, gstin: T.S.custGstin, pay: T.S.pay, recv: T.S.recv, ed: T.S.editing, mv: T.S.move }));
  ok(st.tab === 'bill' && st.lines === 1 && st.qty === 3 && st.rate === 200 && st.cust === 'Sunil Traders' && st.gst && st.gstin === '09AAACS1234F1Z5', 'A4 the bill page opens with the same item, quantity, rate, customer and GST');
  ok(st.pay === 'part' && st.recv === '300' && !st.ed, 'A5 what was already paid (₹200 at billing + ₹100 later) comes as received ₹300; it\'s a new bill, not an edit');
  ok(await p.isVisible('#movebar') && /Moving Bill 1773 to No\. 1776/.test(await p.textContent('#movebar')), 'A6 a bar says "Moving Bill 1773 to No. 1776"');
  ok(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'bill-no' && await p.inputValue('#bill-no') === '1776', 'A7 the number box is open with the cursor in it (next number 1776)');
  await p.fill('#bill-no', '1780'); await p.press('#bill-no', 'Enter'); await p.waitForTimeout(200);
  ok(/to No\. 1780/.test(await p.textContent('#movebar')), 'A8 typing 1780 updates the bar');
  await p.click('#bill-done'); await p.waitForTimeout(1200);
  const tb = sent.filter(x => x.action === 'takeBill').pop();
  ok(tb && tb.n === 1780 && tb.bill.moveFrom && tb.bill.moveFrom.id === 'old' && tb.bill.moveFrom.n === 1773 && /1780/.test(tb.bill.text), 'A9 Done saves bill 1780 with the old bill to cancel (1773)');
  ok(/Bill 1773 moved to No\. 1780/.test(await p.textContent('#toast')), 'A10 "Bill 1773 moved to No. 1780"');
  ok(!(await p.isVisible('#movebar')) && !(await p.evaluate(() => T.S.move)), 'A11 the bar is gone; the next bill is a normal one');

  // B. stop halfway: nothing happens to the old bill
  await open(); await p.click('#bd-move'); await p.click('#bd-my'); await p.waitForTimeout(400);
  const nTake = sent.filter(x => x.action === 'takeBill').length;
  await p.click('#move-stop'); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => T.S.move)) && await p.evaluate(() => T.S.bill.length) === 0 && sent.filter(x => x.action === 'takeBill').length === nTake, 'B1 Stop: the moved bill is cleared, nothing is sent, the old bill is unchanged');

  // C. a moved bill: its pill says where it went, no Restore
  await p.evaluate(o => T.showBill(Object.assign(JSON.parse(o), { cancelled: true, cancelReason: 'Moved to No. 1780', cancelledBy: 'Mayank' })), JSON.stringify(old)); await p.waitForTimeout(400);
  ok(!(await p.$('#bd-restore')) && !(await p.$('#bd-move')) && /Moved to No\. 1780/.test(await p.textContent('#sheet')), 'C1 the old bill shows "Moved to No. 1780", with no Restore or Transfer');

  // D. staff: no button
  await p.evaluate(() => { T.S.auth.role = 'staff'; }); await open();
  ok(!(await p.$('#bd-move')), 'D1 staff don\'t see Transfer');
  await p.evaluate(() => { T.S.auth.role = 'owner'; });

  // E. small phone, Hindi: the bar and the question fit
  await p.setViewportSize({ width: 320, height: 640 }); await p.evaluate(() => { localStorage.setItem('rb_lang', '"hi"'); });
  await open(); await p.click('#bd-move'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'E1 320 px: the question fits');
  await p.click('#bd-my'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#movebar button')].every(e => e.scrollWidth <= e.clientWidth + 1)), 'E2 320 px: the bar fits, Stop isn\'t cut');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
