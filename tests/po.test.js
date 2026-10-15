/* The customer's purchase order (PO) on bills, server side (Code.gs v54): takeBill saves it in the new last Bills column
   ("number|yyyy-mm-dd", kept as text), listBills / getBill / listDues give it back, updateBill changes or clears it, and a
   bill without one leaves the cell empty. Run: node tests/po.test.js */
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
const COLS = R('BILL_COLS'), PO = COLS.indexOf('po');
ok(PO === COLS.length - 1 && R('SCRIPT_VERSION') === 54, 'A1 Bills gets a new last column "po"; script v54');
const take = (n, po, extra) => R(`takeBill_(${JSON.stringify({ n, by: 'Mayank', bill: { id: 'b' + n, gst: true, total: 100, text: 'Invoice No: ' + n, lines: [], pay: 'paid', ...(po === undefined ? {} : { po }), ...(extra || {}) } })})`);
take(1, { no: '1100-4500253480', date: '2026-10-15' });
const row = () => sheets.Bills.rows[sheets.Bills.rows.length - 1];
ok(row()[PO] === '1100-4500253480|2026-10-15', 'A2 saved as "1100-4500253480|2026-10-15" (written as text, so Sheets doesn\'t turn it into a number or date): ' + row()[PO]);
take(2, null); ok(row()[PO] === '', 'A3 a bill without a PO leaves the cell empty');
take(3); ok(row()[PO] === '', 'A4 an older app that sends no PO: empty');
take(4, { no: '=HYPERLINK("x")', date: '15/10/2026' });
ok(row()[PO] === '=HYPERLINK("x")|', 'A5 a PO starting with = is kept as plain text (never a formula) and a date not in yyyy-mm-dd is dropped');
take(5, { no: 'PO|7', date: '2026-10-01' }); ok(row()[PO] === 'PO/7|2026-10-01', 'A6 a "|" in the number can\'t break the date apart');

const gb = R(`getBill_(2, 'b1')`).bill;
ok(gb.po && gb.po.no === '1100-4500253480' && gb.po.date === '2026-10-15', 'B1 getBill gives it back as {no, date}');
ok(R(`getBill_(3, 'b2')`).bill.po === null, 'B2 none: null');
const lb = R(`listBills_('', 60, {full:true})`).bills.find(x => x.id === 'b1');
ok(lb && lb.po && lb.po.no === '1100-4500253480', 'B3 listBills (the phone\'s Past bills copy) has it');
take(6, { no: 'C-9', date: '2026-10-02' }, { pay: 'credit', mobile: '9876543210', customer: 'Sunil' });
const du = R(`listDues_()`).customers[0].bills[0];
ok(du.po && du.po.no === 'C-9', 'B4 the Credit list has it too (a bill edited from there keeps it)');

R(`updateBill_(${JSON.stringify({ id: 'b2', total: 100, text: 'x', lines: [], gst: true, po: { no: 'NEW-1', date: '2026-10-14' } })}, 'Mayank', {role:'owner'})`);
ok(sheets.Bills.rows[2][PO] === 'NEW-1|2026-10-14', 'C1 editing a bill can add a PO');
R(`updateBill_(${JSON.stringify({ id: 'b1', total: 100, text: 'x', lines: [], gst: true, po: null })}, 'Mayank', {role:'owner'})`);
ok(sheets.Bills.rows[1][PO] === '', 'C2 …or remove it');
R(`updateBill_(${JSON.stringify({ id: 'b2', total: 100, text: 'x', lines: [], gst: true })}, 'Mayank', {role:'owner'})`);
ok(sheets.Bills.rows[2][PO] === 'NEW-1|2026-10-14', 'C3 an older app that sends no PO when editing leaves it as it was');
