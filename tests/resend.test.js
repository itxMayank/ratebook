/* Saving in the background (Code.gs v59): the phone keeps a change until the sheet confirms it, so after a lost reply it sends
   the same change again. That must never count twice: a payment carries its own id (pid), a bill edit already saved is
   recognised by its content, and a new customer by the id the phone gave it (cid). Run: node tests/resend.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); } }),
  appendRow: row => rows.push(row.map(cell)), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; readConfig_=()=>({roundTo:1, nextBill:1, nextGstBill:1}); setConfig_=()=>{}; bump_=()=>{}; popReset_=()=>{}; ENV_='live';
  bumpB_=()=>{}; brev_=()=>'v1';`);
ok(R('SCRIPT_VERSION') >= 59, 'R0 script v59');
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice());
const bill = (n, id, mobile, total, due) => { const r = BC.map(() => ''); r[BI('billNo')] = n; r[BI('billId')] = id; r[BI('date')] = new Date(Date.now() - n * 864e5); r[BI('mobile')] = mobile; r[BI('customer')] = 'Sunil'; r[BI('total')] = total;
  r[BI('gstBill')] = 'No'; r[BI('payment')] = 'Credit'; r[BI('paid')] = total - due; r[BI('due')] = due; r[BI('payments')] = '[]'; r[BI('edits')] = 0; r[BI('text')] = 'Bill ' + n; r[BI('lines')] = '[]'; r[BI('by')] = 'Mayank'; sheets.Bills.rows.push(r); };
bill(3, 'b3', '9876543210', 300, 300); bill(2, 'b2', '9876543210', 200, 200); bill(1, 'b1', '9811111111', 500, 500);
const row = id => sheets.Bills.rows.find(r => r[BI('billId')] === id);
const T = (f) => { try { return R(f); } catch (e) { return { thrown: String(e.message || e) }; } };
const pay = x => T(`recordPayment_(${JSON.stringify(x)}, 'Mayank')`);

// A. payments
let r1 = pay({ billId: 'b1', amount: 100, pid: 'p-aaaaaa1', note: 'UPI' });
ok(r1.used === 100 && row('b1')[BI('due')] === 400 && JSON.parse(row('b1')[BI('payments')])[0].id === 'p-aaaaaa1', 'A1 a payment is saved with its id');
let r2 = pay({ billId: 'b1', amount: 100, pid: 'p-aaaaaa1', note: 'UPI' });
ok(r2.dup === true && r2.used === 100 && row('b1')[BI('due')] === 400 && JSON.parse(row('b1')[BI('payments')]).length === 1, 'A2 sent again (reply lost): nothing added, the same result comes back');
pay({ billId: 'b1', amount: 100 }); pay({ billId: 'b1', amount: 100 });
ok(row('b1')[BI('due')] === 200, 'A3 without an id (older app) each request still counts, as before');
let r3 = pay({ mobile: '9876543210', amount: 350, pid: 'p-bbbbbb2' });
ok(r3.used === 350 && row('b3')[BI('due')] === 0 && row('b2')[BI('due')] === 150, 'A4 by customer: in the order the bills were made (first row first), then the next');
let r4 = pay({ mobile: '9876543210', amount: 350, pid: 'p-bbbbbb2' });
ok(r4.dup === true && r4.used === 350 && row('b3')[BI('due')] === 0 && row('b2')[BI('due')] === 150, 'A5 the same customer payment sent again: found on both bills, nothing changes');
ok(pay({ mobile: '9876543210', amount: 50, pid: 'p-cccccc3' }).used === 50 && row('b2')[BI('due')] === 100, 'A6 a new payment (new id) still goes through');

// B. bill edits
const upd = b => T(`updateBill_(${JSON.stringify(b)}, 'Mayank', null)`);
const e1 = { id: 'b2', n: 2, customer: 'Sunil', mobile: '9876543210', total: 200, items: 'x', text: 'Bill 2 edited', lines: [{ id: 'i1', qty: 2, rate: 100 }], baseEdits: 0, oid: 'w1', pay: 'paid' };
let u1 = upd(e1);
ok(u1.bill && u1.bill.edits === 1 && row('b2')[BI('text')] === 'Bill 2 edited', 'B1 an edit is saved (edits 1)');
const hist = () => (sheets.BillHistory ? sheets.BillHistory.rows.length : 0), h1 = hist();
let u2 = upd(e1);
ok(u2.dup === true && u2.bill.edits === 1 && hist() === h1, 'B2 the same edit sent again: recognised, not saved twice, no extra history');
ok(upd({ ...e1, text: 'Someone else' }).thrown === 'bill_changed', 'B3 a different change made on an older copy is still refused (someone else saved first)');
ok(upd({ ...e1, oid: undefined }).thrown === 'bill_changed', 'B4 without an id (older app) a resend is refused as before');

// C. new customers
const save = x => { try { return R(`saveCustomer_(${JSON.stringify(x)}, 'Mayank')`); } catch (e) { return { thrown: String(e.message || e) }; } };
const custRows = () => sheets.Customers.rows.length;
const c1 = save({ name: 'Balkrishna', gstin: '27AAACB3333J1ZW', cid: 'c-abcdefghjk' });
ok(c1.key === 'c-abcdefghjk', 'C1 a new company is saved under the id the phone gave it');
const n1 = custRows(), c2 = save({ name: 'Balkrishna', gstin: '27AAACB3333J1ZW', cid: 'c-abcdefghjk' });
ok(c2.dup === true && c2.key === 'c-abcdefghjk' && custRows() === n1, 'C2 sent again: found by its id, no second customer');
const c3 = save({ name: 'Ravi Stores', mobile: '9123456780', cid: 'c-mnpqrstuvw' }), n2 = custRows();
const c4 = save({ name: 'Ravi Stores', mobile: '9123456780', cid: 'c-mnpqrstuvw' });
ok(c3.key === '9123456780' && c4.dup === true && custRows() === n2, 'C3 a new customer with a mobile sent again: no second row');
const c5 = save({ name: 'Someone else', mobile: '9123456780', cid: 'c-xyzxyzxyzx' });
ok(c5.ok === false && c5.error === 'cust_exists', 'C4 a different customer on that mobile is still refused');
