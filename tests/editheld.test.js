/* Editing a past bill while other bills are open: never two copies of the same bill, no hidden bill coming back, stale copies replaced.
   Run: node tests/editheld.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,addToBill,setTab,startEdit,resumeHeld,heldGet');
const items = [{ id: 'a', name: 'PP Bag', unit: 'pc', buy: 90, sell: 120 }, { id: 'b', name: 'Cup', unit: 'pc', buy: 1, sell: 2 }];
(async () => {
  const b = await launch(); const saves = []; let serverEdits = 0;
  const ctx = await b.newContext({ viewport: { width: 390, height: 860 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => {
    const req = r.request(), send = o => r.fulfill({ body: JSON.stringify({ shop: 'main', ...o }), contentType: 'application/json' });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 20 };
    if (req.method() === 'GET') return send({ ok: true, rev: '1', items, config: cfg, sv: 41, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(req.postData());
    if (bd.action === 'updateBill') { if (bd.bill.baseEdits != null && bd.bill.baseEdits !== serverEdits) return send({ ok: false, error: 'bill_changed' });
      serverEdits++; saves.push(bd.bill); return send({ ok: true, bill: { edits: serverEdits } }); }
    if (bd.action === 'boot') return send({ ok: true, rev: '1', items, config: cfg, sv: 41, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
    return send({ ok: true, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }); });
  await p.addInitScript(() => { if (!sessionStorage.done) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); sessionStorage.done = 1; } });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400);
  const X = edits => ({ id: 'x1', row: 3, n: 5, date: '2026-10-09T10:00:00Z', edits, customer: 'Sunil', mobile: '9876543210', gst: false, lines: [{ id: 'a', name: 'PP Bag', unit: 'pc', rate: 120, qty: 2 }] });
  const state = () => p.evaluate(() => ({ screen: T.S.editing ? 'edit:' + T.S.editing.id : (T.S.cust || (T.S.bill.length ? 'bill' : '')), chips: T.heldGet().map(h => h.editing && !h.editing.fresh ? 'edit:' + h.editing.id : h.d.cust || 'bill'), stash: localStorage.rb_stash }));
  // bill A in progress, then edit past bill 5
  await p.evaluate(() => { T.setTab('bill'); T.addToBill('b', 3); T.S.cust = 'Asha'; document.querySelector('#cust').value = 'Asha'; });
  await p.evaluate(x => T.startEdit(x), X(0)); await p.waitForTimeout(200);
  let s = await state();
  ok(s.screen === 'edit:x1' && JSON.stringify(s.chips) === '["Asha"]' && (!s.stash || s.stash === 'null'), 'editing bill 5: the unfinished bill (Asha) shows as an open-bill chip, nothing hidden');
  // switch to Asha, then open bill 5 again from Past bills
  await p.evaluate(() => T.resumeHeld(T.heldGet()[0].hid)); await p.waitForTimeout(150);
  await p.evaluate(x => T.startEdit(x), X(0)); await p.waitForTimeout(200);
  s = await state();
  ok(s.screen === 'edit:x1' && JSON.stringify(s.chips) === '["Asha"]', 'opening bill 5 again brings back the same edit (no second copy)');
  await p.evaluate(() => { T.addToBill('b', 1); }); await p.click('#bill-done'); await p.waitForTimeout(1000);
  s = await state();
  ok(saves.length === 1 && s.screen === 'Asha' && s.chips.length === 0, 'Save: bill 5 is saved and closed everywhere; Asha\'s bill comes back on screen');
  // a stale copy left as a chip (opened before another save): opening the bill again replaces it with the latest
  await p.evaluate(x => T.startEdit(x), X(1)); await p.waitForTimeout(200);
  await p.evaluate(() => T.resumeHeld(T.heldGet()[0].hid)); await p.waitForTimeout(150);
  serverEdits = 2;   // someone saved bill 5 again on another phone
  const latest = X(2); latest.lines[0].qty = 9;
  await p.evaluate(x => T.startEdit(x), latest); await p.waitForTimeout(200);
  s = await state();
  ok(s.screen === 'edit:x1' && JSON.stringify(s.chips) === '["Asha"]' && await p.evaluate(() => T.S.bill[0].qty) === 9, 'an out-of-date copy is dropped and the latest version opens (one copy only)');
  await p.click('#bill-done'); await p.waitForTimeout(1000);
  ok(saves.length === 2 && (await state()).screen === 'Asha', 'saving it works (no "someone else changed it")');
  // cancel: back to the bill you came from, nothing duplicated
  await p.evaluate(x => T.startEdit(x), X(3)); await p.waitForTimeout(200); await p.click('#edit-cancel'); await p.waitForTimeout(300);
  s = await state();
  ok(s.screen === 'Asha' && s.chips.length === 0 && saves.length === 2, 'Cancel editing: back to Asha\'s bill, no extra copies, nothing saved');
  await b.close(); done();
})();
