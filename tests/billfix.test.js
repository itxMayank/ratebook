/* Bill fixes on the sheet's side (Code.gs v68), from the architect review of 22 Oct 2026:
   A. a bill made offline and sent later is dated when it was made (up to 7 days back, never in the future);
   B. a GST bill from last financial year arriving after the new year's series started keeps last year's numbers and doesn't move
      the new year's counter;
   C. the bill-text check matches whole amounts only ("₹5" isn't found inside "₹50");
   D. an edit the sheet refuses leaves no BillHistory row.
   Run: node tests/billfix.test.js */
const path = require('path'), { gas, fitBill, billTxt } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); }, setNumberFormat() { return this; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; var CFG={roundTo:1, nextBill:10, nextGstBill:1, fyReset:true, gstFy:fy_(new Date())};
  readConfig_=()=>Object.assign({},CFG); setConfig_=o=>{ Object.assign(CFG,o); return {config:readConfig_()}; }; bump_=()=>{}; bumpB_=()=>{}; popReset_=()=>{};
  customersSheet_=()=>{}; touchCustomer_=()=>{}; refreshDue_=()=>{}; recountCustomers_=()=>{}; belowNote_=()=>{}; ENV_='live';`);
ok(R('SCRIPT_VERSION') >= 68, 'A0 script v68');
const B = R('BILL_COLS'), C = k => B.indexOf(k), rows = () => sheets.Bills.rows, last = () => rows()[rows().length - 1];
const take = (n, extra) => R(`takeBill_(${JSON.stringify({ n, by: 'Mayank', role: 'owner', bill: fitBill(Object.assign({ id: 'b' + n + Math.random(), gst: false, total: 100, text: 'Bill No: ' + n, lines: [], pay: 'paid' }, extra || {})) })})`);
const day = 864e5, dOf = r => new Date(r[C('date')]).getTime();

// A. dates
const yest = Date.now() - day;
take(10, { madeAt: yest });
ok(Math.abs(dOf(last()) - yest) < 1000, 'A1 made offline yesterday, sent today: dated yesterday');
take(11, { madeAt: Date.now() - 10 * day });
ok(Math.abs(dOf(last()) - Date.now()) < 5000, 'A2 made 10 days ago (too long, or a wrong clock): dated now');
take(12, { madeAt: Date.now() + 3 * day });
ok(Math.abs(dOf(last()) - Date.now()) < 5000, 'A3 a date in the future: dated now');
take(13, {});
ok(Math.abs(dOf(last()) - Date.now()) < 5000, 'A4 no date sent (older app): dated now');

// B. last year's GST bill after the new year's series started (the year turns 36 h ago in this test)
const turn = Date.now() - 1.5 * day;
R(`fy_ = d => ((d || new Date()).getTime() < ${turn} ? '2025-26' : '2026-27'); CFG.gstFy='2026-27'; CFG.nextGstBill=3;`);
const T = R('BILL_COLS.length');
sheets.Bills.rows.push(Object.assign(Array(T).fill(''), { [C('billNo')]: 1776, [C('date')]: new Date(Date.now() - 3 * day), [C('gstBill')]: 'Yes', [C('fy')]: '2025-26', [C('billId')]: 'old1776' }));
const late = take(1777, { gst: true, madeAt: Date.now() - 2 * day, text: 'Invoice No: 1777' });
ok(late.ok !== false && last()[C('billNo')] === 1777 && last()[C('fy')] === '2025-26', 'B1 GST bill made 31 March, sent 1 April: saved as No. 1777 in 2025-26 (' + JSON.stringify(late.error || '') + ')');
ok(R('CFG.nextGstBill') === 3 && R('CFG.gstFy') === '2026-27', 'B2 the new year\'s counter is left at 3');
const late2 = take(1776, { gst: true, madeAt: Date.now() - 2 * day, text: 'Invoice No: 1776' });
ok(late2.renumbered && late2.renumbered.to === 1778 && last()[C('fy')] === '2025-26' && R('CFG.nextGstBill') === 3, 'B3 a clash with last year\'s numbers: renumbered within last year (1778), counter still 3');
const now1 = take(3, { gst: true, text: 'Invoice No: 3' });
ok(now1.ok !== false && last()[C('billNo')] === 3 && last()[C('fy')] === '2026-27' && R('CFG.nextGstBill') === 4, 'B4 a GST bill made today goes on in the new series (No. 3, then 4)');
R(`fy_ = d => { const s = Utilities.formatDate(d || new Date(), BK_TZ, 'yyyy-MM'); const y = +s.slice(0, 4), m = +s.slice(5, 7), st = m >= 4 ? y : y - 1; return st + '-' + String(st + 1).slice(2); }; CFG.gstFy=fy_(new Date());`);

// C. whole amounts in the text check
const bad = R(`takeBill_(${JSON.stringify({ n: 20, by: 'Mayank', role: 'owner', bill: { id: 'c1', total: 5, lines: [{ id: 'i1', name: 'X', unit: 'pc', qty: 1, rate: 5, gst: 0 }], text: 'Bill No: 20\n1. X = ₹50\nTotal: ₹50', pay: 'paid' } })})`);
ok(bad.ok === false && bad.error === 'text_mismatch', 'C1 a ₹5 bill whose text says ₹50: refused');
const good = R(`takeBill_(${JSON.stringify({ n: 21, by: 'Mayank', role: 'owner', bill: { id: 'c2', total: 1250.5, lines: [{ id: 'i1', name: 'X', unit: 'pc', qty: 1, rate: 1250.5, gst: 0 }], text: 'Bill No: 21\n1. X = ₹1,250.5\n*Total: ₹1,250.5*', pay: 'paid' } })})`);
ok(good.ok !== false && !good.error, 'C2 a right text with commas and paise is still taken');

// D. a refused edit writes no history
take(30, { id: 'd1', pay: 'paid' });
const hist = () => (sheets.BillHistory || { rows: [] }).rows.filter(r => r[0] === 'd1').length, hist0 = hist();
const eb = { id: 'd1', n: 30, total: 100, pay: 'credit', mobile: '', lines: [{ id: 'i1', name: 'Item', unit: 'pc', qty: 1, rate: 100, gst: 0 }] }; eb.text = billTxt(eb, 30, 'Bill No: 30');
const er = R(`(function(){ try { updateBill_(${JSON.stringify(eb)}, 'Mayank', {role:'owner'}); return 'saved'; } catch (e) { return e.message; } })()`);
ok(er === 'credit_needs_mobile' && hist() === hist0, 'D1 an edit refused (credit without a mobile) leaves no history row (' + er + ')');
const eb2 = { ...eb, pay: 'paid', total: 120, lines: [{ id: 'i1', name: 'Item', unit: 'pc', qty: 1, rate: 120, gst: 0 }] }; eb2.text = billTxt(eb2, 30, 'Bill No: 30');
const er2 = R(`(function(){ try { updateBill_(${JSON.stringify(eb2)}, 'Mayank', {role:'owner'}); return 'saved'; } catch (e) { return e.message; } })()`);
ok(er2 === 'saved' && hist() === hist0 + 1, 'D2 an edit that saves writes one history row (' + er2 + ')');
