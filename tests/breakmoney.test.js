/* Break pass (21 Oct 2026): credit payments and bills, attacked the way a real shop (or someone with a staff phone) would.
   The real Code.gs over an in-memory sheet; every request goes through doPost with a real sign-in, as from a phone.
   Run: node tests/breakmoney.test.js */
const path = require('path'), { gas, fitBill } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getMaxRows: () => rows.length, getMaxColumns: () => 40,
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    getValue: () => ((rows[r - 1] || [])[c - 1] ?? ''),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; }, setNumberFormat() { return this; } }),
  appendRow: row => rows.push(row.slice()), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS;
const CFG = { roundTo: 1, nextBill: 1, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, fyReset: false };
g.CFG = CFG;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{};
  readConfig_=()=>Object.assign({}, CFG); setConfig_=o=>{ Object.assign(CFG,o); return {}; }; popReset_=()=>{};`);
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
// people: an owner, a manager and a staff member, each signed in on their own phone
R("saveUser_({name:'Mayank',pin:'739164',role:'owner'})"); R("saveUser_({name:'Sanjay',pin:'582917',role:'manager'})"); R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const tokOf = (pin, name) => post({ action: 'verify', pin, by: name, dev: 'ph-' + name, wantTok: true }).tok;
const OWN = tokOf('739164', 'Mayank'), MAN = tokOf('582917', 'Sanjay'), STF = tokOf('5273', 'Raju');
ok(OWN && MAN && STF, 'S0 three people signed in (owner, manager, staff)');
let seq = 0;
const take = (tok, o = {}) => { const id = o.id || ('b' + (++seq)); const n = o.n === undefined ? CFG.nextBill : o.n;
  const bill = { id, customer: 'Sunil', mobile: '9876543210', total: 500, items: 'PP Bag 1 kg x 500', text: `Bill No. ${n}\nTotal 500`, noLine: `Bill No. ${n}`, noToken: String(n), pay: 'credit', ...o.bill };
  if (!o.bill || !o.bill.lines) bill.lines = [{ id: 'i1', name: 'PP Bag', qty: 1, rate: isFinite(Number(bill.total)) ? Number(bill.total) : 500, gst: 0 }];   // (v66) the sheet checks the total against the lines
  if (bill.gst && bill.taxable === undefined && !(o.bill && o.bill.lines)) { bill.taxable = bill.total; bill.tax = 0; }
  else if (o.bill && o.bill.lines && o.bill.total === undefined) bill.total = Math.round(bill.lines.reduce((a, l) => a + l.qty * l.rate, 0) * 100) / 100;
  const r = post({ action: 'takeBill', tok, env: 'live', n, bill }); r.id = id; return r; };
const rowOf = id => sheets.Bills.rows.find(r => r[BI('billId')] === id);
const rowNo = id => sheets.Bills.rows.findIndex(r => r[BI('billId')] === id) + 1;
const due = id => rowOf(id)[BI('due')];
const pay = (tok, o) => post({ action: 'recordPayment', tok, env: 'live', ...o });

// ---------- A. credit payments ----------
const a = take(STF);
ok(a.ok && due(a.id) === 500 && rowOf(a.id)[BI('payment')] === 'Credit', 'A0 a ₹500 credit bill');
const badAmts = [-500, '-1', 0, '0.004', 'abc', 'Infinity', '1e400', null, '', '₹', [], {}];
ok(badAmts.every(x => pay(STF, { billId: a.id, amount: x }).error === 'bad_amount') && due(a.id) === 500, 'A1 nonsense amounts (−500, 0, 0.004, "abc", Infinity, 1e400, empty, ₹, [] {}): refused, due unchanged');
let r = pay(STF, { billId: a.id, amount: '₹1,00,000', pid: 'p-big00001' });
ok(r.ok && r.used === 500 && r.left === 99500 && due(a.id) === 0 && rowOf(a.id)[BI('payment')] === 'Cleared', 'A2 paying ₹1,00,000 on a ₹500 bill records only ₹500 and says ₹99,500 is left over');
ok(pay(STF, { billId: a.id, amount: 10 }).error === 'nothing_due', 'A3 paying a cleared bill again: "nothing due", nothing recorded');
ok(pay(STF, { billId: a.id, amount: 10, pid: 'p-big00001' }).dup === true && due(a.id) === 0, 'A4 the same payment resent (reply lost): recognised, not counted twice');
ok(post({ action: 'undoPayment', tok: STF, env: 'live', billId: a.id }).error === 'not_allowed', 'A5 staff can\'t undo a payment (manager and owner only)');
r = post({ action: 'undoPayment', tok: MAN, env: 'live', billId: a.id });
ok(r.ok && due(a.id) === 500 && rowOf(a.id)[BI('payment')] === 'Credit' && !rowOf(a.id)[BI('clearedAt')], 'A6 manager undoes it: back to ₹500 credit, no "cleared" date');
ok(post({ action: 'undoPayment', tok: MAN, env: 'live', billId: a.id }).error === 'nothing_to_undo', 'A7 undo again: nothing left to undo');
// pennies
[33.33, 33.33, 33.33].forEach(x => pay(STF, { billId: a.id, amount: x }));
ok(due(a.id) === 400.01 && rowOf(a.id)[BI('paid')] === 99.99, 'A8 three payments of ₹33.33: paid ₹99.99, due ₹400.01 exactly (no 400.0100000001)');
// a row number that doesn't match the bill number
ok(pay(STF, { row: rowNo(a.id) + 1, n: 1, amount: 5 }).error === 'bill_not_found', 'A9 a bill picked by a row whose bill number doesn\'t match: refused');
// two phones collect the full amount at the same moment (the script handles one request at a time)
const r1 = pay(STF, { billId: a.id, amount: 400.01, pid: 'p-phone0001' }), r2 = pay(MAN, { billId: a.id, amount: 400.01, pid: 'p-phone0002' });
ok(r1.ok && r2.error === 'nothing_due' && due(a.id) === 0, 'A10 two phones record the full ₹400.01 at once: the second is refused ("nothing due"), so nobody is credited twice');
// a payment on a cancelled bill (e.g. queued on an offline phone while the bill was cancelled or moved to another number)
const c = take(STF);
post({ action: 'cancelBill', tok: MAN, env: 'live', id: c.id, reason: 'Wrong customer' });
r = pay(STF, { billId: c.id, amount: 100, pid: 'p-cancel001' });
ok(r.error === 'bill_cancelled' && due(c.id) === 500 && rowOf(c.id)[BI('payments')] === '', 'A11 a payment on a cancelled bill is refused (the money would land on a bill counted nowhere)');
// a customer-wide payment, mobile typed any way
const d1 = take(STF, { bill: { mobile: '9811122233', total: 300 } }), d2 = take(STF, { bill: { mobile: '9811122233', total: 200 } });
r = pay(STF, { mobile: '+91 98111-22233', amount: 350, pid: 'p-cust0001' });
ok(r.used === 350 && due(d1.id) === 0 && due(d2.id) === 150, 'A12 customer payment with "+91 98111-22233": oldest bill cleared first, ₹150 left on the next');
ok(pay(STF, { mobile: '12345', amount: 10 }).error === 'bad_mobile', 'A13 customer payment for a number that isn\'t a mobile: refused');
// a bill with a very long payment history keeps it readable
const h = take(STF, { bill: { total: 1000 } });
for (let i = 0; i < 260; i++) pay(STF, { billId: h.id, amount: 1, note: 'Cash', pid: 'p-many' + String(i).padStart(4, '0') });
let hist = null; try { hist = JSON.parse(rowOf(h.id)[BI('payments')]); } catch (e) {}
ok(Array.isArray(hist) && hist.length === 260 && due(h.id) === 740 && rowOf(h.id)[BI('paid')] === 260, 'A14 260 small payments on one bill: the payment history is still readable (was cut mid-way and lost) and the due is right');
ok(pay(STF, { billId: h.id, amount: 1, pid: 'p-many0000' }).dup === true && due(h.id) === 740, 'A15 …and an old payment resent is still recognised');
const u = post({ action: 'undoPayment', tok: MAN, env: 'live', billId: h.id });
ok(u.ok && due(h.id) === 741, 'A16 …and undo takes back exactly ₹1 (before: the cut history made undo add back ₹241)');
for (let i = 0; i < 1500; i++) pay(STF, { billId: h.id, amount: 0.25, pid: 'p-tiny' + String(i).padStart(5, '0') });
let h2 = null; try { h2 = JSON.parse(rowOf(h.id)[BI('payments')]); } catch (e) {}
const sum2 = (h2 || []).reduce((x, p) => x + p.a, 0);
ok(Array.isArray(h2) && String(rowOf(h.id)[BI('payments')]).length < 48000 && Math.abs(sum2 - 634) < 0.001 && due(h.id) === 366, 'A17 1,760 payments on one bill: the history fits the cell (oldest ones merged into one line) and still adds up to ₹634 paid');
const u2 = post({ action: 'undoPayment', tok: MAN, env: 'live', billId: h.id });
ok(u2.ok && due(h.id) === 366.25, 'A18 …and undo still takes back only the last ₹0.25');

// ---------- B. bills ----------
const nb0 = CFG.nextBill;
r = take(STF, { n: 0, bill: { pay: 'paid' } });
ok(r.ok && rowOf(r.id) && rowOf(r.id)[BI('billNo')] === nb0 && CFG.nextBill === nb0 + 1, 'B1 a bill sent with number 0 (blank box): saved under the next number, not silently dropped');
r = take(STF, { n: 'abc', bill: { pay: 'paid' } });
ok(r.ok && rowOf(r.id) && rowOf(r.id)[BI('billNo')] === nb0 + 1, 'B2 …same for a number that isn\'t a number');
const t0 = sheets.Bills.rows.length; r = take(STF, { n: CFG.nextBill, bill: { total: -5000, pay: 'paid' } });
ok(r.error === 'bad_total' && sheets.Bills.rows.length === t0, 'B3 a bill with a minus total (−₹5,000, would take money off the day\'s sales): refused');
r = take(STF, { n: CFG.nextBill, bill: { total: 'NaN', pay: 'paid' } });
ok(r.error === 'bad_total', 'B4 a total that isn\'t a number: refused');
const same = take(STF, { bill: { pay: 'paid' } }), again = post({ action: 'takeBill', tok: STF, env: 'live', n: 99, bill: { id: same.id, total: 500, pay: 'paid' } });
ok(again.dup === true && sheets.Bills.rows.filter(x => x[BI('billId')] === same.id).length === 1, 'B5 the same bill sent twice (double tap, lost reply): saved once');
r = take(STF, { bill: { customer: '=HYPERLINK("http://evil","Click")', mobile: '+cmd|calc', items: '@SUM(A1)', text: '=1+1', pay: 'paid' } });
const rawCell = name => rowOf(r.id)[BI(name)];
ok(['customer', 'mobile', 'items', 'text'].every(k => /^'/.test(String(rawCell(k)))), 'B6 sheet formulas typed as a name, mobile, items or text (=HYPERLINK, +cmd, @SUM, =1+1) are stored as plain text');
// a huge bill keeps its lines readable
const big = Array.from({ length: 200 }, (_, i) => ({ id: 'i' + i, name: 'Aluminium container 750 ml with lid extra long description number ' + i, nameHi: 'एल्युमिनियम कंटेनर 750 एमएल ढक्कन के साथ ' + i, unit: 'pc', rate: 12.5, qty: 100, hsn: '7615', gst: 18, buy: 10, lp: 12.5, alt: false }));
r = take(STF, { bill: { lines: big, pay: 'paid' } });
let lines = null; try { lines = JSON.parse(rowOf(r.id)[BI('lines')]); } catch (e) {}
ok(Array.isArray(lines) && lines.length > 0, 'B7 a 200-line bill: its lines are stored as readable data (were cut mid-way, so the bill couldn\'t be edited or repeated)');
// cancelling twice, and a moved bill
const m = take(STF); post({ action: 'cancelBill', tok: MAN, env: 'live', id: m.id, reason: 'x' });
ok(post({ action: 'cancelBill', tok: MAN, env: 'live', id: m.id, reason: 'again' }).error === 'bill_cancelled', 'B8 cancelling a bill that\'s already cancelled: refused (keeps who cancelled it and why)');
const mv = take(STF, { bill: { pay: 'paid' } }), nw = take(MAN, { bill: { pay: 'paid', moveFrom: { id: mv.id } } });
ok(nw.moved && rowOf(mv.id)[BI('status')] === 'Cancelled', 'B9 a bill moved to a new number: the old one is cancelled');
ok(post({ action: 'cancelBill', tok: MAN, env: 'live', id: mv.id, reason: 'oops' }).error === 'bill_cancelled' && /^Moved to No/.test(rowOf(mv.id)[BI('cancelReason')]), 'B10 …cancelling it again can\'t overwrite "Moved to No. X"');
ok(post({ action: 'restoreBill', tok: MAN, env: 'live', id: mv.id }).error === 'bill_moved' && rowOf(mv.id)[BI('status')] === 'Cancelled', 'B11 …so it can never be restored (its sale would count twice)');
ok(post({ action: 'cancelBill', tok: STF, env: 'live', id: nw.id, reason: 'x' }).error === 'not_allowed', 'B12 staff can\'t cancel bills');
// staff moving a customer's dues to someone else
const cr = take(STF, { bill: { mobile: '9800000001', customer: 'Ramesh', total: 900 } });
const ed = b => post({ action: 'updateBill', tok: STF, env: 'live', bill: fitBill({ id: cr.id, n: rowOf(cr.id)[BI('billNo')], customer: 'Ramesh', mobile: '9800000001', total: 900, items: 'x', text: 't', lines: [], pay: 'credit', baseEdits: rowOf(cr.id)[BI('edits')], ...b, ...(b && b.lines ? {} : { lines: [] }) }) });
ok(ed({ mobile: '9800000002', customer: 'Someone else' }).error === 'needs_manager' && rowOf(cr.id)[BI('mobile')] === '9800000001', 'B13 staff editing a credit bill can\'t move its ₹900 due to another customer\'s number (manager or owner can)');
ok(ed({ total: 100 }).error === 'needs_manager' && due(cr.id) === 900, 'B14 staff can\'t cut the total of a credit bill');
ok(ed({ pay: 'paid' }).error === 'needs_manager' && due(cr.id) === 900, 'B15 staff can\'t mark a credit bill paid without a payment');
ok(ed({ customer: 'Ramesh Kumar' }).ok && rowOf(cr.id)[BI('customer')] === 'Ramesh Kumar' && due(cr.id) === 900, 'B16 staff can still fix the name spelling (same mobile, same amount)');
const mg = post({ action: 'updateBill', tok: MAN, env: 'live', bill: fitBill({ id: cr.id, n: rowOf(cr.id)[BI('billNo')], customer: 'Ramesh', mobile: '9800000002', total: 900, items: 'x', text: 't', lines: [], pay: 'credit', baseEdits: rowOf(cr.id)[BI('edits')] }) });
ok(mg.ok && rowOf(cr.id)[BI('mobile')] === '9800000002' && rowOf(cr.id)[BI('editedBy')] === 'Sanjay', 'B17 a manager can move it, and it shows as edited by them');
ok(post({ action: 'updateBill', tok: MAN, env: 'live', bill: { id: cr.id, n: 1, total: 900, pay: 'credit', mobile: '9800000002', baseEdits: 0 } }).error === 'bill_changed', 'B18 an edit made on an old copy of the bill: refused ("someone else changed it")');
ok(post({ action: 'updateBill', tok: MAN, env: 'live', bill: { id: c.id, total: 1, pay: 'paid', baseEdits: rowOf(c.id)[BI('edits')] } }).error === 'bill_cancelled', 'B19 editing a cancelled bill: refused');
ok(post({ action: 'updateBill', tok: MAN, env: 'live', bill: { id: cr.id, n: 1, total: -10, pay: 'paid', mobile: '9800000002', baseEdits: rowOf(cr.id)[BI('edits')] } }).error === 'bad_total' && due(cr.id) === 900, 'B20 editing a bill to a minus total: refused');
// a credit bill with no mobile can't be collected
r = take(STF, { bill: { mobile: '', customer: '', pay: 'credit' } });
ok(r.error === 'credit_needs_mobile', 'B21 a credit bill without a mobile (an old or tampered phone): refused, as the phone already does');
// number jumps
const before = CFG.nextBill; r = take(STF, { n: 999999999, bill: { pay: 'paid' } });
ok(r.error === 'bill_no_jump' && CFG.nextBill === before, 'B22 a bill number typed with extra digits (999999999 when the next is ' + before + '): refused, so the series doesn\'t jump for good');
r = take(STF, { n: before + 40, bill: { pay: 'paid' } });
ok(r.ok && CFG.nextBill === before + 41, 'B23 a deliberate jump of 40 (a new bill book): still allowed');
// a test-mode bill from someone not allowed test mode
R("saveUser_(Object.assign(users_().find(u=>u.name==='Raju'), {testOk:false}))");
ok(post({ action: 'takeBill', tok: STF, env: 'test', n: 1, bill: { id: 'tz1', total: 10, pay: 'paid' } }).error === 'no_test', 'B24 someone switched off test mode can\'t send a test bill');
ok(post({ action: 'takeBill', tok: 'f'.repeat(64), env: 'live', n: 1, bill: { id: 'tz2', total: 10, pay: 'paid' } }).error === 'bad_session' && !rowOf('tz2'), 'B25 a made-up sign-in can\'t save a bill');
// the GST series restarts on 1 April while a phone still shows last year's next number: not taken for a jump
Object.assign(CFG, { fyReset: true, gstFy: '2025-26', nextGstBill: 1777 });
r = take(STF, { n: 1777, bill: { gst: true, pay: 'paid' } });
ok(r.ok && rowOf(r.id), 'B26 a GST bill on the first day of a new financial year, numbered from last year: saved (not refused as a jump)');
CFG.fyReset = false;
