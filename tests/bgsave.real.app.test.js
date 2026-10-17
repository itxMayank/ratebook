/* Saving in the background, end to end against the real Code.gs (17 Oct 2026, script v59). Asked for because every save made
   people wait 3–5 s on 4G, with the rule "data is never lost, and is saved as the person edited it". Checks, on a phone signed in
   to the real script (an in-memory sheet behind it): Record payment, Edit bill, Add customer and Settings move on at once while
   the sheet is still answering; the change is then on the sheet exactly once; a reply lost on the way back is sent again and
   doesn't count twice; with no signal the change waits on the phone, even through closing the app, and goes when back online;
   a change the sheet refuses (someone else saved the bill first) is kept and can be saved anyway; an older script still waits.
   Run: node tests/bgsave.real.app.test.js */
const path = require('path'), { gas } = require('./gas-mock'), { appHtml, launch, ok, done } = require('./browser');
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); }, setNumberFormat() { return this; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {}, insertRowsAfter() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R; g.SS = SS;
let SV = 59;
g.CFG = { shopName: 'Pushpadant Plastics', mode: 'live', nextBill: 5, nextGstBill: 1, units: [{ code: 'pc' }], defaultUnit: 'pc', roundTo: 1 };
g.svNow = () => SV;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; editTrigger_=()=>{}; popReset_=()=>{}; phEnsure_=()=>{};
   readConfig_=()=>JSON.parse(JSON.stringify(CFG)); setConfig_=o=>{ Object.assign(CFG,o); return {config:readConfig_()}; }; bump_=()=>{};
   listCached_=()=>({ok:true, rev:getRev_(), sv:svNow(), items:[{id:'i1',name:'PP Bag',unit:'pc',buy:10,sell:12}], config:readConfig_()});`);
R("saveUser_({name:'Mayank',pin:'749163',role:'owner'})");
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice());
const bill = (n, id, total, due, days) => { const r = BC.map(() => ''); r[BI('billNo')] = n; r[BI('billId')] = id; r[BI('date')] = new Date(Date.now() - days * 864e5); r[BI('mobile')] = '9876543210'; r[BI('customer')] = 'Sunil';
  r[BI('total')] = total; r[BI('gstBill')] = 'No'; r[BI('payment')] = 'Credit'; r[BI('paid')] = total - due; r[BI('due')] = due; r[BI('payments')] = '[]'; r[BI('edits')] = 0; r[BI('by')] = 'Mayank'; r[BI('items')] = 'PP Bag 10 pc x 12';
  r[BI('text')] = 'Bill No: ' + n + '\nPP Bag 10 pc x 12 = 120'; r[BI('lines')] = JSON.stringify([{ id: 'i1', name: 'PP Bag', unit: 'pc', rate: 12, qty: 10 }]); r[BI('fy')] = '2026-27'; sheets.Bills.rows.push(r); };
bill(1, 'b1', 300, 300, 20); bill(2, 'b2', 120, 120, 5);
const row = id => sheets.Bills.rows.find(r => r[BI('billId')] === id);
const pays = id => JSON.parse(row(id)[BI('payments')] || '[]');

const html = appHtml('S,sync,checkRev,payCheck,finishBill,openSettings,openDues,openBills,openCustomers,wqGet,wqFails,closeSheet,showBill,BLC');
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  let hold = 0, lose = null; const seen = [];
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  const QUIET = new Set(['rev', 'listDues', 'listBills', 'listCustomers', 'notices', 'vSync', 'perfIn', 'list', 'boot', 'getBill', 'verify']);
  await ctx.route('https://script.google.com/**', async r => { const q = r.request(); let txt, a = '';
    try { if (q.method() === 'POST') a = JSON.parse(q.postData()).action; } catch {}
    if (hold && a && !QUIET.has(a)) await new Promise(res => setTimeout(res, hold));   // the sheet takes its time before it saves
    try { if (q.method() === 'POST') { const body = JSON.parse(q.postData()); a = body.action; txt = R(`doPost({postData:{contents:${JSON.stringify(q.postData())}}}).text`); }
      else txt = R(`doGet({parameter:${JSON.stringify(Object.fromEntries(new URL(q.url()).searchParams))}}).text`); }
    catch (e) { txt = JSON.stringify({ ok: false, error: 'mock:' + e.message }); }
    if (a) seen.push(a);
    if (a && a === lose) { lose = null; return r.abort(); }   // the sheet did it, but the reply never reached the phone
    r.fulfill({ contentType: 'application/json', body: txt }); });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500);
  await p.fill('#al-name', 'Mayank'); await p.fill('#al-pin', '749163'); await p.click('#al-go'); await p.waitForTimeout(1800);
  for (const k of ['#al-bn']) if (await p.$(k)) await p.click(k);
  await p.waitForTimeout(400); await p.evaluate(() => T.sync()); await p.waitForTimeout(3000);
  ok(await p.evaluate(() => T.S.sv) >= 59, 'A0 signed in to the real script, v59+');
  const wq = () => p.evaluate(() => T.wqGet().length);

  /* B. Record payment: moves on at once while the sheet takes 3 s, then the payment is there once */
  hold = 3000;
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(1200);
  await p.click('[data-dc="0"]'); await p.waitForTimeout(400); await p.click('#dc-pay'); await p.waitForTimeout(300);
  await p.fill('#rp-amt', '350'); const t0 = Date.now(); await p.click('#rp-save'); await p.waitForTimeout(250);
  const fast = Date.now() - t0;
  ok(!(await p.$('#rp-amt')) && /70/.test(await p.textContent('#sheet-body')), 'B1 Record payment moves on at once (' + fast + ' ms) and shows ₹70 still due');
  ok(await wq() === 1 && pays('b1').length === 0, 'B2 the payment waits in the outbox while the sheet answers');
  await p.waitForTimeout(4500);
  ok(await wq() === 0 && row('b1')[BI('due')] === 0 && row('b2')[BI('due')] === 70 && pays('b1').length === 1 && pays('b2').length === 1, 'B3 then it\'s on the sheet: Bill 1 cleared, ₹70 left on Bill 2, one payment each');
  hold = 0;

  /* C. the reply is lost on the way back: sent again, counted once */
  lose = 'recordPayment';
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(900);
  await p.click('[data-dc="0"]'); await p.waitForTimeout(400); await p.click('#dc-pay'); await p.waitForTimeout(300);
  await p.fill('#rp-amt', '20'); await p.click('#rp-save'); await p.waitForTimeout(800);
  ok(pays('b2').length === 2 && await wq() === 1, 'C1 the sheet saved it but the reply was lost: still in the outbox');
  await p.waitForTimeout(5000);
  ok(await wq() === 0 && pays('b2').length === 2 && row('b2')[BI('due')] === 50, 'C2 sent again by itself: recognised, still one payment of ₹20 (₹50 due)');

  /* D. no signal, and the app is closed before it comes back */
  await ctx.setOffline(true);
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(600);
  await p.click('[data-dc="0"]'); await p.waitForTimeout(400); await p.click('#dc-pay'); await p.waitForTimeout(300);
  await p.fill('#rp-amt', '10'); await p.click('#rp-save'); await p.waitForTimeout(500);
  ok(await wq() === 1 && /waiting to save/i.test(await p.evaluate(() => document.querySelector('#queuebar').innerText)), 'D1 offline: kept on the phone, "1 change waiting to save"');
  await p.reload(); await p.waitForTimeout(1200);
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('rb_wq') || '[]').length) === 1, 'D2 the app was closed and opened again: still kept');
  await ctx.setOffline(false); await p.evaluate(() => window.dispatchEvent(new Event('online')));
  if (await p.evaluate(() => document.documentElement.classList.contains('locked'))) { for (const d of '749163') await p.click(`#al-pad [data-k="${d}"]`).catch(() => {}); }
  await p.waitForTimeout(800); if (await p.$('#al-bn')) await p.click('#al-bn');
  await p.waitForTimeout(5000);
  ok(await wq() === 0 && row('b2')[BI('due')] === 40 && pays('b2').length === 3, 'D3 back online: sent, ₹40 now due');

  /* E. edit a bill: moves on at once; the sheet has the new lines once */
  hold = 3000;
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('[data-bid="b2"]').click()); await p.waitForTimeout(900); await p.click('#bd-edit'); await p.waitForTimeout(700);
  await p.evaluate(() => { T.S.bill[0].qty = 12; }); await p.evaluate(() => document.querySelector('#bill-done').click()); await p.waitForTimeout(300);
  ok(!(await p.evaluate(() => !!T.S.editing)) && await wq() === 1, 'E1 Save changes: the bill page is free at once, the edit waits in the outbox');
  await p.waitForTimeout(4500); hold = 0;
  ok(await wq() === 0 && JSON.parse(row('b2')[BI('lines')])[0].qty === 12 && row('b2')[BI('edits')] === 1, 'E2 then it\'s on the sheet: 12 pc, edited once');

  /* F. someone else saved the bill first: the change is kept and can be saved anyway */
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('[data-bid="b2"]').click()); await p.waitForTimeout(900); await p.click('#bd-edit'); await p.waitForTimeout(700);
  row('b2')[BI('edits')] = 5; row('b2')[BI('text')] = 'Changed on another phone';     // another phone saved it meanwhile
  await p.evaluate(() => { T.S.bill[0].qty = 15; }); await p.evaluate(() => document.querySelector('#bill-done').click()); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => T.wqFails().length) === 1 && /couldn.t be saved/i.test(await p.evaluate(() => document.querySelector('#queuebar').innerText)), 'F1 refused (someone else saved first): kept, red bar "1 change couldn\'t be saved"');
  await p.click('#queue-see'); await p.waitForTimeout(500);
  ok(/Someone else saved/i.test(await p.textContent('#sheet-body')) && /15 pc/.test(await p.textContent('#sheet-body')), 'F2 the screen says why and shows the bill as edited');
  await p.click('[data-wqo="0"]'); await p.waitForTimeout(2500);
  ok(await p.evaluate(() => T.wqFails().length) === 0 && JSON.parse(row('b2')[BI('lines')])[0].qty === 15, 'F3 "Save mine anyway": saved over the other change');

  /* G. add a customer (a company, no mobile): shows at once, saved once */
  hold = 3000;
  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(1200); await p.click('#cu-add'); await p.waitForTimeout(400);
  await p.fill('#ce-name', 'Balkrishna Industries'); await p.fill('#ce-gst', '27aaacb3333j1zw'); await p.click('#ce-save'); await p.waitForTimeout(300);
  ok(/Balkrishna Industries/.test(await p.textContent('#sheet-body')) && !(await p.$('#ce-save')) && await wq() === 1, 'G1 Add customer: their page opens at once');
  await p.waitForTimeout(4500); hold = 0;
  const cr = sheets.Customers.rows.filter(r => r[1] === 'Balkrishna Industries');
  ok(await wq() === 0 && cr.length === 1 && /^c-[a-z]{10}$/.test(cr[0][0]), 'G2 then on the sheet, once, under the id the phone gave it');

  /* H. settings */
  hold = 3000;
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(500); await p.click('details[data-cg="shop"] summary'); await p.waitForTimeout(300);
  await p.fill('#cf-shop', 'Pushpadant Packaging'); await p.click('#cf-save'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => T.S.cfg.shopName) === 'Pushpadant Packaging' && !(await p.isVisible('#cf-save')), 'H1 Settings → Save closes at once with the new name');
  await p.waitForTimeout(4500); hold = 0;
  ok(await wq() === 0 && R('CFG.shopName') === 'Pushpadant Packaging', 'H2 then on the sheet');

  /* I. an older script: saves still wait for the sheet, nothing goes in the outbox */
  SV = 58; await p.evaluate(() => { T.S.sv = 58; });
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(900);
  await p.click('[data-dc="0"]'); await p.waitForTimeout(400); await p.click('#dc-pay'); await p.waitForTimeout(300);
  await p.fill('#rp-amt', '5'); await p.click('#rp-save'); await p.waitForTimeout(1500);
  // 15 pc × ₹12 = ₹180 after the edits above, ₹85 paid in all
  ok(await wq() === 0 && pays('b2').length === 4 && row('b2')[BI('due')] === 95, 'I1 script v58: Record payment waits for the sheet as before');
  /* J. (v60) a bill made on another phone: the next number arrives with the 25-second check, no price-list reload */
  SV = 60; await p.evaluate(() => { T.S.sv = 60; });
  const nb0 = await p.evaluate(() => T.S.cfg.nextBill), rev0 = R('getRev_()');
  R(`takeBill_(${JSON.stringify({ n: 5, by: 'Dad', bill: { id: 'other1', gst: false, total: 50, items: 'x', text: 'Bill No: 5', lines: [], pay: 'paid' } })})`);
  const lists = seen.filter(a => a === 'list' || a === 'boot').length;
  await p.evaluate(() => T.checkRev()); await p.waitForTimeout(600);
  ok(R('getRev_()') === rev0 && await p.evaluate(() => T.S.cfg.nextBill) === 6 && nb0 === 5, 'J1 another phone used No. 5: this phone shows 6 next, from the 25-second check');
  ok(seen.filter(a => a === 'list' || a === 'boot').length === lists && await p.evaluate(() => document.querySelector('#bill-no').value) === '6', 'J2 without reloading the price list; the bill page shows 6');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
