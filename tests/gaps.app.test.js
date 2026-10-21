/* Gap fixes from the architecture review (21 Oct 2026), the phone's side: Settings → Save sends only the fields changed on this
   phone (two people saving at once no longer undo each other's changes, and bill numbers another phone moved on aren't put
   back), and staff are told at once that a saved bill's total can only be changed by a manager or the owner (the sheet refuses
   it too, script v66). Run: node tests/gaps.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,openSettings,startEdit,saveEdit,billTotal');
(async () => {
  const b = await launch(); const errs = []; let sent = [];
  async function phone(role, sv) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept()); sent = [];
    const me = { name: role === 'owner' ? 'Mayank' : 'Raju', role, personal: true, prefs: { mode: 'live' } };
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 21, nextGstBill: 7, units: [{ code: 'kg', hi: 'किलो' }, { code: 'pc', hi: 'पीस' }], defaultUnit: 'kg', roundTo: 1, defaultGst: 18, defaultHsn: '3923', shopGstin: '', shopAddress: 'Main Road', billFooter: 'Thank you', fyReset: true };
    await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      if (req.method() === 'GET') return send({ rev: '1', sv });
      const bd = JSON.parse(req.postData()); sent.push(bd);
      if (bd.action === 'boot') return send({ rev: '1', items: [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180 }], config: cfg, sv, me });
      if (bd.action === 'setConfig') return send({ config: { ...cfg, ...bd.config } });
      if (bd.action === 'updateBill') return send({ bill: { id: bd.bill.id, n: bd.bill.n, edits: 1 } });
      if (bd.action === 'listUsers') return send({ users: [] }); if (bd.action === 'listSessions') return send({ sessions: [] });
      return send({ me }); });
    await p.addInitScript(r => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: r === 'owner' ? 'Mayank' : 'Raju', role: r, personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })), role);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
    return { p, ctx };
  }
  // A. Settings sends only what changed (an older script, so the save goes straight to the sheet)
  let { p, ctx } = await phone('owner', 58);
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(500);
  await p.click('details[data-cg="shop"] summary'); await p.fill('#cf-shop', 'Gupta Plastics & Co'); await p.click('#cf-save'); await p.waitForTimeout(600);
  const sc = sent.filter(x => x.action === 'setConfig');
  ok(sc.length === 1 && JSON.stringify(Object.keys(sc[0].config)) === '["shopName"]' && sc[0].config.shopName === 'Gupta Plastics & Co', 'A1 only the shop name is changed: only the shop name is sent (before, every shop-wide field was sent, so a second phone saving at once undid the first): ' + JSON.stringify(sc[0] && sc[0].config));
  sent = []; await p.evaluate(() => T.openSettings()); await p.waitForTimeout(500); await p.click('#cf-save'); await p.waitForTimeout(500);
  ok(!sent.some(x => x.action === 'setConfig') && !(await p.isVisible('#sheet-body #cf-save').catch(() => false)), 'A2 Save with nothing changed: nothing is sent, Settings closes');
  sent = []; await p.evaluate(() => T.openSettings()); await p.waitForTimeout(500);
  await p.click('details[data-cg="bills"] summary'); await p.fill('#cf-bill', '30'); await p.click('#cf-save'); await p.waitForTimeout(500);
  const s3 = sent.find(x => x.action === 'setConfig');
  ok(s3 && JSON.stringify(Object.keys(s3.config)) === '["nextBill"]' && s3.config.nextBill === 30, 'A3 only the next bill number changed: only that is sent (the GST number, which another phone may have moved on, is left alone)');
  await ctx.close();
  // B. staff and a saved bill's total
  ({ p, ctx } = await phone('staff', 66));
  const bill = { id: 'b1', row: 2, n: 5, total: 360, edits: 0, customer: 'Sunil', mobile: '9876543210', lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 2, rate: 180, gst: 18, buy: 150 }], pay: 'paid' };
  await p.evaluate(bl => T.startEdit(bl), bill); await p.waitForTimeout(300);
  await p.evaluate(() => { T.S.bill[0].qty = 1; }); sent = []; await p.evaluate(() => T.saveEdit()); await p.waitForTimeout(500);
  ok(!sent.some(x => x.action === 'updateBill') && /manager or the owner/.test(await p.textContent('#toast')) && !!(await p.evaluate(() => T.S.editing)), 'B1 staff change a saved bill\'s total (₹360 → ₹180): told at once that a manager or the owner must do it, nothing sent, the bill stays open to change back');
  await p.evaluate(() => { T.S.bill[0].qty = 2; T.S.cust = 'Sunil T.'; }); await p.evaluate(() => T.saveEdit()); await p.waitForTimeout(800);
  ok(sent.some(x => x.action === 'updateBill' && x.bill.customer === 'Sunil T.'), 'B2 staff fixing only the name (total unchanged): saved as before');
  await ctx.close();
  ({ p, ctx } = await phone('manager', 66));
  await p.evaluate(bl => T.startEdit(bl), bill); await p.waitForTimeout(300);
  await p.evaluate(() => { T.S.bill[0].qty = 1; }); sent = []; await p.evaluate(() => T.saveEdit()); await p.waitForTimeout(800);
  ok(sent.some(x => x.action === 'updateBill' && x.bill.total === 180), 'B3 a manager changing the total: saved');
  await ctx.close();
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); done();
})();
