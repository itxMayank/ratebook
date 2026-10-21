/* Transfer a bill to another number, server side (Code.gs v63): takeBill with moveFrom saves the new bill, then cancels the old
   one as "Moved to No. X" (kept as a copy, not counted); manager or owner only; a moved bill cannot be restored.
   Run: node tests/transfer.test.js */
const path = require('path'), { gas } = require('./gas-mock');
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
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; readConfig_=()=>({roundTo:1, nextBill:1, nextGstBill:1}); setConfig_=()=>{}; bump_=()=>{}; bumpB_=()=>{}; popReset_=()=>{};
  customersSheet_=()=>{}; touchCustomer_=()=>{}; refreshDue_=()=>{}; ENV_='live';`);
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; var CFG={roundTo:1, nextBill:1, nextGstBill:1774, fyReset:true, gstFy:fy_(new Date())};
  readConfig_=()=>Object.assign({},CFG); setConfig_=o=>{ Object.assign(CFG,o); return {config:readConfig_()}; }; bump_=()=>{}; bumpB_=()=>{}; popReset_=()=>{};
  customersSheet_=()=>{}; touchCustomer_=()=>{}; refreshDue_=()=>{}; recountCustomers_=()=>{}; ENV_='live';`);
ok(R('SCRIPT_VERSION') >= 63, 'A0 script v63');
const B = R('BILL_COLS'), C = k => B.indexOf(k), rows = () => sheets.Bills.rows;
const take = (n, extra, role) => R(`takeBill_(${JSON.stringify({ n, by: 'Mayank', role: role || 'owner', bill: Object.assign({ id: 'b' + n + Math.random(), gst: true, total: 500, text: 'Invoice No: ' + n, lines: [], pay: 'paid' }, extra || {}) })})`);
take(1773, { id: 'old' }); take(1774, { id: 'b1774' }); take(1775, { id: 'b1775' });
const r1 = take(1776, { id: 'new', moveFrom: { id: 'old', row: 2, n: 1773 } });
ok(r1.moved && r1.moved.from === 1773 && r1.moved.to === 1776, 'B1 new bill 1776 saved, old 1773 moved');
const old = rows()[1];
ok(old[C('status')] === 'Cancelled' && old[C('cancelReason')] === 'Moved to No. 1776' && old[C('cancelledBy')] === 'Mayank', 'B2 the old bill is cancelled: "Moved to No. 1776", by Mayank');
ok(rows().length === 5 && rows()[4][C('billNo')] === 1776 && rows()[4][C('status')] !== 'Cancelled', 'B3 the new bill is a normal bill; the old row stays as a copy');
ok(sheets.BillHistory.rows.some(r => /CANCELLED: Moved to No\. 1776/.test(r[4])), 'B4 the history says why');
const r2 = take(1773, { id: 'again', moveFrom: { id: 'b1774', row: 3, n: 1774 } });
ok(r2.renumbered && r2.renumbered.to === 1777 && r2.moved.to === 1777 && rows()[2][C('cancelReason')] === 'Moved to No. 1777', 'B5 asking for the old (cancelled) number 1773 again: it stays used, the bill gets 1777 and the reason says 1777');
const r3 = take(1778, { id: 'x1', moveFrom: { id: 'old', row: 2, n: 1773 } });
ok(r3.moveErr === 'bill_cancelled' && !r3.moved, 'B6 moving a bill that is already cancelled: the new bill saves, the phone is told');
const r4 = take(1779, { id: 'x2', moveFrom: { id: 'b1775', row: 4, n: 1775 } }, 'staff');
ok(r4.moveErr === 'not_allowed' && rows()[3][C('status')] !== 'Cancelled', 'B7 staff: the old bill is left as it is');
const r5 = take(1780, { id: 'x3', moveFrom: { id: 'nope', n: 5 } }); ok(r5.moveErr === 'bill_not_found', 'B8 old bill not found: said so');
const rs = R(`(function(){ try { cancelBill_({id:'old', row:2, n:1773}, 'Mayank', false); return 'ok'; } catch (e) { return e.message; } })()`);
ok(rs === 'bill_moved' && rows()[1][C('status')] === 'Cancelled', 'C1 a moved bill can\'t be restored (its sale is on the new bill)');
const dup = take(1776, { id: 'new', moveFrom: { id: 'old', row: 2, n: 1773 } }); ok(dup.dup && !dup.moved, 'C2 the same bill sent again (lost reply): saved once, nothing moved twice');
