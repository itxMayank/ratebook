/* Customers, server side (Code.gs v55): add a customer (name needed; mobile, GSTIN, address, contact, email optional), a
   company without a mobile gets its own id ('c-…', letters only, never taken for a mobile), duplicates are refused with who
   it is, edits keep stats, a first mobile can be given later, bills without a mobile count for a saved company by its GSTIN,
   and older apps that edit by {mobile} still work. Run: node tests/customers.test.js */
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
  var BUMPS=[]; bumpB_=(full,id)=>{ BUMPS.push([full,id]); }; brev_=()=>'v1';`);
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice());
const bill = (n, mobile, gstin, total, name) => { const r = BC.map(() => ''); r[BI('billNo')] = n; r[BI('date')] = new Date(); r[BI('mobile')] = mobile; r[BI('customer')] = name || ''; r[BI('customerGstin')] = gstin; r[BI('total')] = total; r[BI('gstBill')] = gstin ? 'Yes' : 'No'; sheets.Bills.rows.push(r); };
bill(1, '9876543210', '', 500, 'Sunil');
bill(2, '', '27AAACB3333J1ZW', 19205, 'Balkrishna');   // a company billed before it was saved, no mobile
const save = x => { try { return R(`saveCustomer_(${JSON.stringify(x)}, 'Mayank')`); } catch (e) { return { thrown: String(e.message || e) }; } };
const list = () => R(`listCustomers_('')`).customers;
const COLS = R('CUST_COLS');
ok(COLS.slice(-2).join() === 'contact,email' && R('SCRIPT_VERSION') === 55, 'A0 Customers tab gains contact and email; script v55');

// A. new customers
ok(save({ name: '', mobile: '9000000001' }).thrown === 'bad_name', 'A1 a name is needed');
ok(save({ name: 'X', mobile: '12345' }).thrown === 'bad_mobile' && save({ name: 'X', gstin: '27ABC' }).thrown === 'bad_gstin' && save({ name: 'X', email: 'a@b' }).thrown === 'bad_email', 'A2 a wrong mobile, GSTIN or email is refused');
const co = save({ name: 'Balkrishna Industries Ltd', gstin: '27aaacb3333j1zw', address: 'Plot F-20, Waluj MIDC, Chhatrapati Sambhajinagar 431136', contact: 'Purchase dept', email: 'purchase@bkt.example' });
ok(/^c-[a-z]{10}$/.test(co.key) && co.mobile === '', 'A3 a company with no mobile is saved under its own id (' + co.key + '), letters only');
let row = list().find(r => r[12] === co.key);
ok(row && row[0] === '' && row[1] === 'Balkrishna Industries Ltd' && row[2] === '27AAACB3333J1ZW' && row[7].startsWith('Plot F-20') && row[10] === 'Purchase dept' && row[11] === 'purchase@bkt.example', 'A4 it\'s in the customer list: name, GSTIN in capitals, address, contact, email');
ok(row[3] === 1 && row[4] === 19205, 'A5 the bill made for it earlier without a mobile counts, matched by GSTIN (1 bill, ₹19,205)');
const dup = save({ name: 'BKT', gstin: '27AAACB3333J1ZW' });
ok(dup.ok === false && dup.error === 'cust_exists' && dup.existing.name === 'Balkrishna Industries Ltd' && dup.existing.key === co.key, 'A6 the same GSTIN again: refused, saying who it is');
const su = save({ name: 'Sunil Traders', mobile: '9876543210' });
ok(su.ok === false && su.error === 'cust_exists', 'A7 a mobile already saved (from a bill): refused too');
const nw = save({ name: 'Ravi Stores', mobile: '+91 91234 56780', address: 'Main road' });
ok(nw.key === '9123456780' && list().some(r => r[0] === '9123456780' && r[1] === 'Ravi Stores' && r[7] === 'Main road'), 'A8 a new customer with a mobile: saved under it (normalised)');
ok(R('BUMPS').length >= 2, 'A9 every save tells phones to refresh their customer list');

// B. edits
const e1 = save({ key: co.key, name: 'Balkrishna Industries Limited', gstin: '27AAACB3333J1ZW', address: 'Plot F-20', contact: 'Mr. Shah', email: '' });
row = list().find(r => r[12] === co.key);
ok(e1.key === co.key && row[1] === 'Balkrishna Industries Limited' && row[10] === 'Mr. Shah' && row[11] === '' && row[3] === 1, 'B1 editing the company keeps its id and its bill count');
const e2 = save({ key: co.key, newMobile: '7385327108', name: 'Balkrishna Industries Limited', gstin: '27AAACB3333J1ZW' });
ok(e2.key === '7385327108' && list().some(r => r[0] === '7385327108' && r[12] === '' && r[1] === 'Balkrishna Industries Limited' && r[10] === 'Mr. Shah' && r[3] === 1) && !list().some(r => r[12] === co.key), 'B2 giving it a mobile later: kept under that mobile, details and its earlier no-mobile bill (by GSTIN) kept');
ok(save({ key: '9123456780', mobile: '9123456780', newMobile: '', name: 'Ravi' }).thrown === 'bad_mobile', 'B3 a mobile can be changed but not removed');
const old = save({ mobile: '9876543210', newMobile: '9876543210', name: 'Sunil T', gstin: '', address: 'x', note: '' });
ok(old.key === '9876543210' && list().find(r => r[0] === '9876543210')[1] === 'Sunil T' && list().find(r => r[0] === '9876543210')[3] === 1, 'B4 an older app editing by {mobile} still works and keeps the stats');
ok(save({ key: 'c-nosuchcust', name: 'Z' }).thrown === 'cust_not_found', 'B5 editing a customer that\'s gone: says so');

// C. bills afterwards
bill(3, '', '27AAACB3333J1ZW', 100, 'BKT'); R(`touchCustomer_('', 'BKT', '27AAACB3333J1ZW', 100, 3, true)`);
ok(list().find(r => r[0] === '7385327108')[3] === 2, 'C1 a bill without a mobile but with its GSTIN still counts for it (now 2)');
R(`recountCustomers_()`); ok(list().find(r => r[0] === '7385327108')[3] === 2 && list().find(r => r[0] === '9876543210')[3] === 1, 'C1b a full recount agrees (no double counting)');
const c2 = save({ name: 'Mahaveer Enterprises', gstin: '27AABCM1234F1Z5' });
bill(4, '', '27AABCM1234F1Z5', 4000, 'Mahaveer'); R(`touchCustomer_('', 'Mahaveer', '27AABCM1234F1Z5', 4000, 4, true)`);
const mrow = list().find(r => r[12] === c2.key);
ok(mrow[3] === 1 && mrow[4] === 4000, 'C2 a new bill without a mobile for a saved company: counted by its GSTIN');
R(`recountCustomers_()`);
ok(list().find(r => r[12] === c2.key)[1] === 'Mahaveer Enterprises' && list().find(r => r[12] === c2.key)[10] === '', 'C3 a full recount keeps no-mobile companies and their details');
ok(!R(`custRow_(SS.getSheetByName('Customers'), '0000000000')`) || R(`custRow_(SS.getSheetByName('Customers'), '0000000000')`) === -1, 'C4 an id is never matched as a mobile');
