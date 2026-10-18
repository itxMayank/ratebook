/* Faster bill saving (Code.gs v60). The dashboard showed saving a bill took the script 3.9 s: it read three columns of every bill
   ever made to check the number, read every bill again for the customer's dues even on a paid bill, and made every phone reload the
   whole price list just to learn the next bill number. Checks that numbers are still never used twice, dues stay right, and the
   next number reaches other phones through the 25-second check. Run: node tests/billfast.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
let reads = 0;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => { if (name === 'Bills') reads += n * m; return Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))); },
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); } }),
  appendRow: row => rows.push(row.map(cell)), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS;
g.CFG = { nextBill: 2001, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, fyReset: true, gstFy: '2026-27' };
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; popReset_=()=>{}; ENV_='live'; bumpB_=()=>{};
   readConfig_=()=>JSON.parse(JSON.stringify(CFG)); setConfig_=o=>{ Object.assign(CFG,o); nbPut_(CFG); return {config:readConfig_()}; };`);
ok(R('SCRIPT_VERSION') >= 60, 'A0 script v60');
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice());
for (let n = 1; n <= 2000; n++) { const r = BC.map(() => ''); r[BI('billNo')] = n; r[BI('billId')] = 'o' + n; r[BI('date')] = new Date(Date.now() - (2001 - n) * 36e5); r[BI('gstBill')] = 'No'; r[BI('total')] = 100; r[BI('mobile')] = n === 5 ? '9876543210' : ''; r[BI('payment')] = n === 5 ? 'Credit' : ''; r[BI('due')] = n === 5 ? 100 : ''; sheets.Bills.rows.push(r); }
R("customersSheet_()");
const take = (n, b) => R(`takeBill_(${JSON.stringify({ n, by: 'Mayank', bill: { gst: false, total: 120, items: 'x', text: 'Bill No: ' + n, lines: [], noLine: 'Bill No: ' + n, noToken: String(n), ...b } })})`);
const rev0 = R('getRev_()');
reads = 0; const t1 = take(2001, { id: 'n1', mobile: '9811111111', customer: 'Ravi', pay: 'paid' });
ok(t1.ok && !t1.renumbered && R('CFG.nextBill') === 2002, 'B1 the next number is saved as it is, next becomes 2002');
ok(reads < 4000, 'B2 it reads only recent bills, not the whole tab (' + reads + ' cells read for 2,000 bills; about 8,500 before)');
ok(R('getRev_()') === rev0, 'B3 the price list is not reloaded on every phone (version unchanged)');
const nb = JSON.parse(R(`doGet({parameter:{action:'rev'}}).text`)).nb;
ok(nb && nb.nextBill === 2002, 'B4 the 25-second check carries the next number (2002) to other phones');
const t2 = take(2001, { id: 'n2', customer: 'Second phone', pay: 'paid' });
ok(t2.renumbered && t2.renumbered.to === 2002 && R('CFG.nextBill') === 2003, 'B5 another phone using 2001 too is still renumbered (2002)');
const t3 = take(5, { id: 'n3', customer: 'Typed old number', pay: 'paid' });
ok(t3.renumbered && t3.renumbered.from === 5 && t3.renumbered.to >= 2003, 'B6 a typed older number (5, used long ago) is still caught: the whole tab is checked then');
take(2004, { id: 'n4', mobile: '9876543210', customer: 'Sunil', pay: 'credit', total: 300 });
const cu = sheets.Customers.rows.find(r => String(r[0]) === '9876543210');
ok(cu && cu[7] === 400, 'B7 a credit bill still updates the customer\'s dues (₹100 + ₹300 = ₹400)');
take(2005, { id: 'n5', mobile: '9876543210', customer: 'Sunil', pay: 'paid' });
ok(sheets.Customers.rows.find(r => String(r[0]) === '9876543210')[7] === 400, 'B8 a paid bill leaves the dues as they were (₹400)');
ok(R(`takeBill_(${JSON.stringify({ n: 2006, by: 'Mayank', bill: { id: 'n5', total: 1 } })})`).dup === true, 'B9 the same bill sent twice is still saved once');
