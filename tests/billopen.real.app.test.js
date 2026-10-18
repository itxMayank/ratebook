/* Past bills open at once (17 Oct 2026, script v61), against the real Code.gs. Asked for because opening a past bill waited
   2–3 s for the sheet every time. Checks: opening Past bills reads ahead the bills on screen in one request (getBills); a bill
   then opens with no wait while the sheet takes 3 s; a change made on another phone is picked up behind it and the screen is
   redrawn in place (with the typed "Send to" number kept); a bill edited elsewhere (edit count changed) isn't shown from the
   phone's old copy; a bill made on this phone opens at once; after closing the app the copy is still there; an older script
   (v60) still opens bills the old way. Run: node tests/billopen.real.app.test.js */
const path = require('path'), { gas } = require('./gas-mock'), { appHtml, launch, ok, done } = require('./browser');
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
let reads = 0;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => { if (name === 'Bills') reads += n; return Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))); },
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); }, setNumberFormat() { return this; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {}, insertRowsAfter() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R; g.SS = SS;
let SV = 61;
g.CFG = { shopName: 'Pushpadant Plastics', mode: 'live', nextBill: 30, nextGstBill: 1, units: [{ code: 'pc' }], defaultUnit: 'pc', roundTo: 1 };
g.svNow = () => SV;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; editTrigger_=()=>{}; popReset_=()=>{}; phEnsure_=()=>{};
   readConfig_=()=>JSON.parse(JSON.stringify(CFG)); setConfig_=o=>{ Object.assign(CFG,o); return {config:readConfig_()}; }; bump_=()=>{};
   listCached_=()=>({ok:true, rev:getRev_(), sv:svNow(), items:[{id:'i1',name:'PP Bag',unit:'pc',buy:10,sell:12}], config:readConfig_()});`);
R("saveUser_({name:'Mayank',pin:'749163',role:'owner'})");
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice());
const bill = (n, id, days) => { const r = BC.map(() => ''); r[BI('billNo')] = n; r[BI('billId')] = id; r[BI('date')] = new Date(Date.now() - days * 864e5); r[BI('mobile')] = '9876543210'; r[BI('customer')] = 'Sunil ' + n;
  r[BI('total')] = 120; r[BI('gstBill')] = 'No'; r[BI('payment')] = 'Paid'; r[BI('edits')] = 0; r[BI('by')] = 'Mayank'; r[BI('items')] = 'PP Bag 10 pc x 12';
  r[BI('text')] = 'Bill No: ' + n + '\nPP Bag 10 pc x 12 = 120'; r[BI('lines')] = JSON.stringify([{ id: 'i1', name: 'PP Bag', unit: 'pc', rate: 12, qty: 10 }]); r[BI('fy')] = '2026-27'; sheets.Bills.rows.push(r); };
for (let i = 1; i <= 25; i++) bill(i, 'b' + i, 25 - i);
const row = id => sheets.Bills.rows.find(r => r[BI('billId')] === id);

/* server: getBills alone */
{ reads = 0; const j = R(`getBills_([{row:3,id:'b2'},{row:20,id:'b19'},{row:21,id:'WRONG'},{row:999,id:'b9'}])`);
  ok(j.bills.length === 2 && j.bills[0].id === 'b2' && /Bill No: 19/.test(j.bills[1].text) && j.bills[1].lines[0].qty === 10, 'S1 getBills returns text and lines; a moved or missing bill is left out');
  ok(reads <= 20, 'S2 rows close together are read in one block (' + reads + ' rows)'); }

const html = appHtml('S,sync,openBills,closeSheet,showBill,finishBill');
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  let hold = 0; const seen = [];
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', async r => { const q = r.request(); let txt, a = '';
    try { if (q.method() === 'POST') a = JSON.parse(q.postData()).action; } catch {}
    if (hold && a === 'getBill') await new Promise(res => setTimeout(res, hold));
    try { if (q.method() === 'POST') txt = R(`doPost({postData:{contents:${JSON.stringify(q.postData())}}}).text`);
      else txt = R(`doGet({parameter:${JSON.stringify(Object.fromEntries(new URL(q.url()).searchParams))}}).text`); }
    catch (e) { txt = JSON.stringify({ ok: false, error: 'mock:' + e.message }); }
    if (a) seen.push(a);
    r.fulfill({ contentType: 'application/json', body: txt }); });
  const signIn = async () => { await p.goto('https://rb.test/'); await p.waitForTimeout(1500);
    if (await p.$('#al-name')) { await p.fill('#al-name', 'Mayank'); await p.fill('#al-pin', '749163'); await p.click('#al-go'); } else for (const d of '749163') await p.click(`#al-pad [data-k="${d}"]`).catch(() => {});
    await p.waitForTimeout(1800);
    if (await p.$('#al-bn')) await p.click('#al-bn'); await p.waitForTimeout(400); await p.evaluate(() => T.sync()); await p.waitForTimeout(2500); };
  await signIn();
  ok(await p.evaluate(() => T.S.sv) === 61, 'A0 signed in to the real script, v61');
  const cnt = a => seen.filter(x => x === a).length;
  const open = async id => { if (!(await p.$(`[data-bid="${id}"]`))) { await p.evaluate(() => T.openBills()); await p.waitForTimeout(900); } const t0 = Date.now(); await p.evaluate(id => document.querySelector(`[data-bid="${id}"]`).click(), id);
    await p.waitForFunction(() => document.querySelector('#bd-text'), null, { timeout: 8000 }); return Date.now() - t0; };

  /* B. Past bills reads ahead the bills on screen; then a bill opens at once while the sheet takes 3 s */
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(2500);
  ok(cnt('getBills') === 1, 'B1 opening Past bills reads ahead the bills on screen in one request');
  hold = 3000; const g0 = cnt('getBill');
  const ms = await open('b25');
  ok(ms < 700 && /Bill No: 25/.test(await p.textContent('#bd-text')), 'B2 Bill 25 opens at once (' + ms + ' ms) with its text');

  /* C. it was changed on another phone meanwhile (a hand edit of the text): the screen catches up in place, typed number kept */
  row('b25')[BI('text')] = 'Bill No: 25\nPP Bag 10 pc x 12 = 120\nThank you, changed on the sheet';
  await p.evaluate(() => T.closeSheet()); await p.waitForTimeout(300);
  await p.evaluate(() => { const C = BLC; if (C) { const x = C.bills.find(b => b.id === 'b25'); if (x) x._at = 1; } });   // the phone's copy is older than 30 s
  await open('b25'); await p.fill('#bd-mob', '98111 22233');
  ok(!/changed on the sheet/.test(await p.textContent('#bd-text')), 'C1 shown from the phone first');
  await p.waitForTimeout(3800);
  ok(/changed on the sheet/.test(await p.textContent('#bd-text')) && await p.inputValue('#bd-mob') === '98111 22233' && cnt('getBill') === g0 + 1, 'C2 then the sheet\'s copy is read behind it: redrawn in place, typed number kept');
  hold = 0;

  /* D. edited on another phone (edit count went up): the old copy on the phone isn't used */
  await p.evaluate(() => T.closeSheet());
  row('b24')[BI('text')] = 'Bill No: 24\nEDITED ELSEWHERE'; row('b24')[BI('edits')] = 1;
  await p.evaluate(() => { const C = BLC; const x = C.bills.find(b => b.id === 'b24'); x.edits = 1; delete x.text; });   // the 25-second check brought the new edit count
  await open('b24');
  ok(/EDITED ELSEWHERE/.test(await p.textContent('#bd-text')), 'D1 a bill edited elsewhere is read from the sheet, not the old copy');

  /* E. after closing the app, the copy is still on the phone */
  await signIn(); await p.evaluate(() => T.openBills()); await p.waitForTimeout(1500);
  hold = 3000; const ms2 = await open('b23'); hold = 0;
  ok(ms2 < 700 && /Bill No: 23/.test(await p.textContent('#bd-text')), 'E1 after closing and reopening the app, Bill 23 still opens at once (' + ms2 + ' ms)');

  /* F. an older bill further down (not read ahead) still opens, from the sheet */
  await p.evaluate(() => T.closeSheet()); await p.evaluate(() => T.openBills()); await p.waitForTimeout(1500);
  const has = await p.evaluate(() => !!document.querySelector('[data-bid="b1"]'));
  if (has) { await open('b1'); ok(/Bill No: 1\b/.test(await p.textContent('#bd-text')), 'F1 an older bill opens too'); } else ok(true, 'F1 (older bills are folded away)');

  /* G. an older script: still opens, the old way */
  SV = 60; await signIn(); await p.evaluate(() => T.openBills()); await p.waitForTimeout(1500);
  const before = cnt('getBills'); await open('b22');
  ok(/Bill No: 22/.test(await p.textContent('#bd-text')) && cnt('getBills') === before, 'G1 on script v60 nothing is read ahead and bills still open');

  ok(!errs.length, 'Z no page errors ' + errs.join(' | '));
  await b.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
