/* Bill sums worked out in one place (money.js, 21 Oct 2026, SCRIPT_VERSION 66). The app adds bills up with money.js and the sheet
   checks every bill it saves with a copy of the same code (put into Code.gs by tools/stamp.js). Checks: the copy is exact; the
   sums match what the app worked out before; the sheet refuses a bill whose total, taxable value or tax doesn't add up from its
   lines, or a line with an impossible quantity or rate; cost and profit are worked out on the sheet, never taken from the phone.
   Run: node tests/money.test.js */
const fs = require('fs'), path = require('path'), vm = require('vm'), { gas, billTxt } = require('./gas-mock'), stamp = require('../tools/stamp');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const ROOT = path.join(__dirname, '..'), GS = fs.readFileSync(path.join(ROOT, 'Code.gs'), 'utf8');

// ---------- A. one source ----------
ok(stamp.withMoney(GS) === GS, 'A1 Code.gs holds an exact copy of money.js (run node tools/stamp.js after editing money.js)');
ok(/^\/\*[\s\S]*?\*\/\n"use strict";/.test(fs.readFileSync(path.join(ROOT, 'money.js'), 'utf8')), 'A2 money.js is a strict code file like the others');
const M = {}; vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'money.js'), 'utf8'), M);

// ---------- B. the same sums as before (the app's old formulas, kept here as the reference) ----------
const r2 = n => Math.round((+n || 0) * 100) / 100;
const oldSum = L => Math.round(L.reduce((a, l) => a + (+l.qty || 0) * (+l.rate || 0), 0) * 100) / 100;
function oldGst(lines, igst) { const groups = {}; let taxable = 0;
  lines.forEach(l => { const amt = r2((+l.qty || 0) * (+l.rate || 0)), g = +l.gst || 0; taxable += amt; groups[g] = (groups[g] || 0) + amt; }); taxable = r2(taxable);
  let tax = 0; Object.keys(groups).map(Number).sort((a, b) => a - b).forEach(rate => { if (!rate) return; if (igst) tax += r2(groups[rate] * rate / 100); else tax += 2 * r2(groups[rate] * rate / 2 / 100); });
  tax = r2(tax); const exact = r2(taxable + tax), total = Math.round(exact); return { taxable, tax, roundOff: r2(total - exact), total }; }
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const QTY = [1, 2, 0.25, 0.5, 0.75, 1.5, 3, 10, 12, 100, 0.333], RATE = [180, 0.8, 0.125, 23, 1999.99, 55.5, 7, 0, 260, 12.75], GSTR = [0, 5, 12, 18, 28, 3, 0.25];
let same = true, sameG = true;
for (let k = 0; k < 3000; k++) { const L = Array.from({ length: 1 + Math.floor(rnd() * 8) }, () => ({ qty: QTY[Math.floor(rnd() * QTY.length)], rate: RATE[Math.floor(rnd() * RATE.length)], gst: GSTR[Math.floor(rnd() * GSTR.length)] }));
  if (M.billMath_(L, false).total !== oldSum(L)) same = false;
  for (const ig of [false, true]) { const a = M.billMath_(L, true, ig), b = oldGst(L, ig); if (a.total !== b.total || a.tax !== b.tax || a.taxable !== b.taxable || a.roundOff !== b.roundOff) sameG = false; } }
ok(same, 'B1 3,000 made-up normal bills: same total as before');
ok(sameG, 'B2 …and as GST bills (CGST + SGST and IGST): same taxable value, tax, round-off and total as before');
const g1 = M.billMath_([{ qty: 2, rate: 180, gst: 18 }, { qty: 100, rate: 0.8, gst: 5 }], true, false);
ok(g1.taxable === 440 && g1.tax === 68.8 && g1.total === 509 && g1.roundOff === 0.2 && g1.groups.length === 2, 'B3 2 kg × ₹180 at 18% + 100 × ₹0.80 at 5%: ₹440 + ₹68.80 tax = ₹508.80 → ₹509');
const c1 = M.billCost_([{ qty: 2, rate: 180, buy: 150 }, { qty: 1, rate: 50 }]);
ok(c1.cost === 300 && c1.profit === 60 && c1.pct === 20 && c1.known === false && c1.any === true, 'B4 cost and profit only from lines with a buy rate (₹300 cost, ₹60 profit, 20%)');

// ---------- C. the sheet checks every bill ----------
const sheets = {};
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getMaxRows: () => rows.length, getMaxColumns: () => 40,
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    getValue: () => ((rows[r - 1] || [])[c - 1] ?? ''),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; }, setNumberFormat() { return this; } }),
  appendRow: row => rows.push(row.slice()), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(ROOT, 'Code.gs')]); const R = g.R; g.SS = SS;
const CFG = { roundTo: 1, nextBill: 1, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, fyReset: false }; g.CFG = CFG;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{};
  readConfig_=()=>Object.assign({}, CFG); setConfig_=o=>{ Object.assign(CFG,o); return {}; }; popReset_=()=>{};`);
ok(R('SCRIPT_VERSION') >= 66, 'C0 script version 66 or later');
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
R("saveUser_({name:'Mayank',pin:'739164',role:'owner'})"); R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const tokOf = (pin, name) => post({ action: 'verify', pin, by: name, dev: 'ph-' + name, wantTok: true }).tok;
const OWN = tokOf('739164', 'Mayank'), STF = tokOf('5273', 'Raju');
const L2 = () => [{ id: 'i1', name: 'PP Bag', qty: 2, rate: 180, gst: 18, buy: 150 }, { id: 'i2', name: 'Paper Cup', qty: 100, rate: 0.8, gst: 5, buy: 0.5 }];
let seq = 0;
const take = (o = {}, tok = STF) => { const id = 'b' + (++seq), n = CFG.nextBill;
  const bill = { id, customer: 'Sunil', mobile: '9876543210', total: 440, items: 'x', text: `Bill No. ${n}`, lines: L2(), pay: 'paid', ...o };
  if (!('text' in o)) bill.text = billTxt(bill, n);
  const r = post({ action: 'takeBill', tok, env: 'live', n, bill }); r.id = id; return r; };
const rowOf = id => (sheets.Bills ? sheets.Bills.rows : []).find(r => r[BI('billId')] === id);
const a = take();
ok(a.ok && rowOf(a.id) && rowOf(a.id)[BI('total')] === 440, 'C1 a bill that adds up (2 × ₹180 + 100 × ₹0.80 = ₹440) is saved');
const b = take({ total: 44 });
ok(b.ok === false && b.error === 'total_mismatch' && b.expect.total === 440 && !rowOf(b.id), 'C2 the same lines with ₹44 as the total (a changed copy of the app): refused, nothing saved, and the reply says what the lines add up to');
const gb = { gst: true, taxable: 440, tax: 68.8, total: 509 };
ok(take(gb).ok, 'C3 the GST bill that adds up (₹440 + ₹68.80 → ₹509) is saved');
ok(take({ ...gb, tax: 0 }).error === 'total_mismatch' && take({ ...gb, taxable: 400 }).error === 'total_mismatch' && take({ ...gb, total: 500 }).error === 'total_mismatch', 'C4 a GST bill with the wrong tax, taxable value or total: refused');
ok(take({ ...gb, igst: true }).ok && take({ ...gb, igst: true, tax: 34.4, total: 474 }).error === 'total_mismatch', 'C5 IGST checked the same way (18% of ₹360 + 5% of ₹80 = ₹68.80; half of it is refused)');
ok(take({ total: 440.004 }).ok && take({ total: '440' }).ok, 'C6 a total sent as text or with a rounding speck still matches');
ok(take({ lines: [] }).error === 'no_lines' && take({ lines: undefined }).error === 'no_lines', 'C7 a bill without lines: refused (nothing to check the total against)');
const badLines = [{ qty: -2, rate: 180 }, { qty: 0, rate: 180 }, { qty: 'abc', rate: 1 }, { qty: 1, rate: -5 }, { qty: 1, rate: 'Infinity' }, { qty: 1e8, rate: 1 }, { qty: 1, rate: '' }, null];
ok(badLines.every(l => take({ lines: [l], total: 0 }).error === 'bad_line'), `C8 ${badLines.length} impossible lines (minus or zero quantity, minus rate, Infinity, text, blank): refused`);
ok(take({ gst: true, taxable: 180, tax: 0, total: 180, lines: [{ qty: 1, rate: 180, gst: 150 }] }).error === 'bad_line', 'C9 a GST rate over 100%: refused');
const c = take({ cost: 9, profit: 99999 }, OWN);
ok(rowOf(c.id)[BI('cost')] === 350 && rowOf(c.id)[BI('profit')] === 90, 'C10 cost and profit sent by the phone (₹9 / ₹99,999) are ignored: the sheet works them out from the lines (₹350 / ₹90)');
const cs = take({ cost: 9, profit: 99999 });
ok(rowOf(cs.id)[BI('cost')] === '' && rowOf(cs.id)[BI('profit')] === '', 'C10b from a staff phone (no buy rates on it, none in the price list here): the buy rates it sent are dropped and cost / profit left empty');
const d = take({ total: 360, lines: [{ id: 'i9', name: 'Loose', qty: 2, rate: 180 }], cost: 100, profit: 260 }, OWN);
ok(d.ok && rowOf(d.id)[BI('cost')] === '' && rowOf(d.id)[BI('profit')] === '', 'C11 no line has a buy rate: cost and profit are left empty (unknown), not what the phone sent');
ok(take({ total: 0, lines: [{ qty: 1, rate: 0 }] }).ok, 'C12 a free item (rate ₹0, total ₹0) is still fine');

// ---------- D. editing a saved bill ----------
const ed = o => { const bill = { id: a.id, n: rowOf(a.id)[BI('billNo')], customer: 'Sunil', mobile: '9876543210', items: 'x', lines: L2(), total: 440, pay: 'paid', baseEdits: rowOf(a.id)[BI('edits')], ...o }; if (!('text' in o)) bill.text = billTxt(bill, bill.n, 'edited ' + bill.n); return post({ action: 'updateBill', tok: OWN, env: 'live', bill }); };
const e1 = ed({ total: 1 });
ok(e1.ok === false && e1.error === 'total_mismatch' && rowOf(a.id)[BI('total')] === 440 && !/^edited/.test(rowOf(a.id)[BI('text')]), 'D1 an edit whose total doesn\'t add up: refused, the saved bill is unchanged');
ok(ed({ lines: [{ qty: -1, rate: 440 }], total: -440 }).ok === false, 'D2 an edit with a minus quantity: refused');
const L3 = L2(); L3[0].qty = 3;
const e3 = ed({ lines: L3, total: 620, cost: 0, profit: 0 });
ok(e3.ok && rowOf(a.id)[BI('total')] === 620 && rowOf(a.id)[BI('cost')] === 500 && rowOf(a.id)[BI('profit')] === 120, 'D3 an edit that adds up (3 kg now, ₹620) is saved, with cost and profit worked out on the sheet (₹500 / ₹120)');

// ---------- E. (v66) a side step that fails doesn't stop the save, but is written to the error log ----------
R("var touch0 = touchCustomer_; touchCustomer_ = () => { throw new Error('Customers tab is full'); }");
const sf = take();
const errs = JSON.parse(g.cache.ERRS || '[]');
ok(sf.ok && rowOf(sf.id) && errs.some(e => e[0] === 'soft:takeBill:customer' && /Customers tab is full/.test(e[1])), 'E1 updating the customer\'s totals fails: the bill is still saved, and the failure is in the error log the dashboard shows (before, it vanished)');
R("touchCustomer_ = touch0");

// ---------- F. (v67) the bill's text must match the bill ----------
const nF = () => CFG.nextBill;
const f1 = take({ text: `Bill No. ${nF()}\n= ₹360\n= ₹80\nTotal: ₹44` });
ok(f1.ok === false && f1.error === 'text_mismatch' && !rowOf(f1.id), 'F1 lines and total add up, but the text tells the customer ₹44: refused, nothing saved');
const f2 = take({ text: `Bill No. ${nF()}\n= ₹360\nTotal: ₹440` });
ok(f2.error === 'text_mismatch', 'F2 the text leaves out an item (₹80 line missing): refused');
const f3 = take({ text: `Bill No. 9999\n= ₹360\n= ₹80\nTotal: ₹440` });
ok(f3.error === 'text_mismatch', 'F3 the text carries a different bill number: refused');
ok(take({ text: '' }).ok, 'F4 no text at all is fine (Past bills builds it from the lines)');
const f5 = take({ text: `Bill No. ${nF()}\n1. PP Bag — 2 kg × ₹180/kg = ₹360\n2. Paper Cup — 100 pc × ₹0.8/pc = ₹80\n\n*Total: ₹440*` });
ok(f5.ok, 'F5 a text written the way the app writes it is saved');
const f6 = ed({ text: 'edited' }); 
ok(f6.ok === false && f6.error === 'text_mismatch', 'F6 an edit whose text doesn\'t show the bill: refused');
ok(R(`[inrN_(1234567.5), inrN_(0.25), inrN_(55), inrN_(100000)].join(' ')`) === '12,34,567.5 0.25 55 1,00,000', 'F7 amounts written with Indian commas, like the app');
