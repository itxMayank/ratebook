/* Break pass (21 Oct 2026): the bill page used the way a busy shop uses it. Double taps, odd numbers typed in, no signal,
   the app closed with bills not sent, a reply that never arrives, and a bill the sheet refuses. The mock sheet records each
   bill once by its id, like the real one. Run: node tests/breakapp.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,addToBill,billTotal,setTab,appUnlock,flushBills');
const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180 }, { id: 'i2', name: 'Paper Cup', unit: 'pc', buy: 0.5, sell: 0.8 }];
let off = false, lose = 0, refuse = null, saved = {}, takes = 0, next = 21;
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); let p = await ctx.newPage();
  const dialogs = []; const hook = pg => { pg.on('pageerror', e => errs.push(e.message)); pg.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); }); };
  hook(p);
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://wa.me/**', r => r.fulfill({ body: 'wa' }));
  await ctx.route('https://script.google.com/**', async r => { if (off) return r.abort(); const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg', nextBill: next, nextGstBill: 7 };
    if (q.method() === 'GET') return send({ rev: '1', sv: 64, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData());
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 64, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'takeBill') { takes++;
      if (refuse && refuse(bd.bill)) return send({ ok: false, error: 'credit_needs_mobile' });
      const dup = !!saved[bd.bill.id]; if (!dup) { saved[bd.bill.id] = bd.bill; next = Math.max(next, bd.bill.n + 1); }
      if (lose > 0) { lose--; return r.abort(); }   // the sheet saved it, but the reply never reached the phone
      return send({ dup, config: { ...cfg, nextBill: next } }); }
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); sessionStorage.x = 1; } });
  const start = async () => { await p.goto('https://rb.test/'); await p.waitForTimeout(1400); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300); };
  await start();
  const fresh = async () => { await p.evaluate(() => { T.addToBill('i1'); T.addToBill('i2'); T.setTab('bill'); }); await p.waitForTimeout(300); };
  const nSaved = () => Object.keys(saved).length;

  // A. double taps
  await fresh(); await p.dblclick('#bill-done'); await p.click('#bill-done').catch(() => {}); await p.waitForTimeout(1500);
  ok(nSaved() === 1 && await p.evaluate(() => T.S.billQ.length) === 0, 'A1 Done tapped three times fast: one bill saved');
  await fresh(); await p.dblclick('#bill-wa'); await p.waitForTimeout(2500);
  ok(nSaved() === 2, 'A2 Share tapped twice fast: one bill saved');
  await p.evaluate(() => { document.querySelector('#bill-new') && document.querySelector('#bill-new').click(); T.S.bill = []; }); await p.waitForTimeout(300);

  // B. odd numbers typed in
  await fresh();
  const qty = async (v) => { await p.fill('#bq-0', v); await p.waitForTimeout(150); return p.evaluate(() => T.S.bill[0].qty); };
  await p.evaluate(() => { const i = document.querySelector('#bq-0'); i.readOnly = false; });
  ok(await qty('-5') > 0, 'B1 quantity −5: not taken');
  ok(isFinite(await qty('1e999')), 'B2 quantity "1e999" (Infinity): not taken');
  ok(await qty('abc') > 0 && await qty('2') === 2, 'B3 quantity "abc": not taken; 2 works');
  await p.fill('#br-0', '-100'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => T.S.bill[0].rate) >= 0, 'B4 rate −100: not taken');
  await p.fill('#br-0', '1e999'); await p.waitForTimeout(150);
  ok(isFinite(await p.evaluate(() => T.S.bill[0].rate)) && isFinite(await p.evaluate(() => T.billTotal())), 'B5 rate "1e999": not taken, the total stays a real number');
  await p.fill('#br-0', '180'); await p.waitForTimeout(150);
  ok(await p.evaluate(() => T.billTotal()) === 360.8, 'B6 back to 2 kg × ₹180 + ₹0.8 = ₹360.8');
  // a jump in the bill number
  const autoNo = await p.inputValue('#bill-no');
  await p.evaluate(() => { document.querySelector('.bill-head details, #bh-more') && 0; const i = document.querySelector('#bill-no'); i.value = '99999'; i.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(200);
  const s0 = nSaved(); dialogs.length = 0; await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok(dialogs.some(d => /99999/.test(d)) && nSaved() === s0 && await p.evaluate(() => T.S.bill.length) === 2, 'B7 bill number 99999 typed when the next is ' + next + ': the phone asks first; "No" saves nothing and keeps the bill');
  await p.evaluate(n => { const i = document.querySelector('#bill-no'); i.value = n; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); }, autoNo); await p.waitForTimeout(200);
  await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok(nSaved() === s0 + 1, 'B8 with the right number typed back, the bill saves');

  // C. no signal, then the app closed
  off = true;
  for (let i = 0; i < 3; i++) { await fresh(); await p.click('#bill-done'); await p.waitForTimeout(500); }
  const q3 = await p.evaluate(() => T.S.billQ.map(x => x.n));
  ok(q3.length === 3 && new Set(q3).size === 3, 'C1 three bills made with no signal: all three kept on the phone, each with its own number (' + q3.join(', ') + ')');
  await p.close(); p = await ctx.newPage(); hook(p); off = false; await start(); await p.waitForTimeout(2500);
  ok(nSaved() === s0 + 4 && await p.evaluate(() => T.S.billQ.length) === 0, 'C2 the app closed and opened again with signal back: all three reach the sheet, none lost or doubled');

  // D. the reply is lost
  lose = 1; await fresh(); const before = nSaved(); await p.click('#bill-done'); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => T.S.billQ.length) === 1, 'D1 the sheet saved a bill but the reply never came: the phone keeps it to send again');
  await p.evaluate(() => T.flushBills()); await p.waitForTimeout(1200);
  ok(nSaved() === before + 1 && await p.evaluate(() => T.S.billQ.length) === 0, 'D2 sent again: the sheet recognises it, so it\'s saved once');

  // E. a bill the sheet refuses doesn't hold up the others
  off = true; await fresh(); await p.evaluate(() => { T.S.bill[0].qty = 3; }); await p.click('#bill-done'); await p.waitForTimeout(400);
  const badId = await p.evaluate(() => T.S.billQ[0].id);
  await fresh(); await p.click('#bill-done'); await p.waitForTimeout(400);
  refuse = bb => bb.id === badId; off = false; const n0 = nSaved(); await p.evaluate(() => T.flushBills()); await p.waitForTimeout(1800);
  ok(nSaved() === n0 + 1 && await p.evaluate(() => T.S.billQ.length) === 0, 'E1 the first waiting bill is refused by the sheet: the next one still goes (before: both waited for ever)');
  ok(await p.evaluate(() => { const f = JSON.parse(localStorage.getItem('rb_wqfail') || '[]'); return f.length === 1 && f[0].k === 'newb' && !!f[0].body.bill.text; }), 'E2 the refused bill is kept, with its text, in "couldn\'t be saved"');
  ok(/couldn/i.test(await p.textContent('#queuebar')) && await p.isVisible('#queuebar'), 'E3 the red bar says a change couldn\'t be saved');
  await p.click('#queuebar [data-act], #queuebar button').catch(async () => p.click('#queuebar')); await p.waitForTimeout(600);
  const why = await p.textContent('#sheet-body').catch(() => '');
  ok(/New bill/.test(why) && /mobile/i.test(why.split('New bill')[1] || ''), 'E4 tapping it shows the bill and why (needs a mobile number): ' + why.replace(/\s+/g, ' ').slice(0, 120));
  refuse = null; await p.click('[data-wqr="0"]'); await p.waitForTimeout(1800);
  ok(saved[badId] && await p.evaluate(() => JSON.parse(localStorage.getItem('rb_wqfail') || '[]').length) === 0, 'E5 Try again (once fixed on the sheet\'s side): it goes, and leaves the list');
  ok(takes > 0 && !errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); done();
})();
