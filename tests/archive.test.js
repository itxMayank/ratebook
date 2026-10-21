/* Yearly archive of bills (Code.gs v67): once a new financial year starts, bills from two years back move from the Bills tab to
   their own tab ("Bills 2024-25"), a backup first. Bills with money owed stay; nothing is lost or copied twice; reports, most-sold
   order, customer totals, bill-number checks and Past bills search still see the old years; archived bills can't be changed.
   Run: node tests/archive.test.js */
const path = require('path'), { gas, fitBill } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
let failCopy = false;
function mkSheet(name) { const rows = []; const sh = { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ _s: sh, r, c, n, m,
    getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    copyTo: d => { if (failCopy) return; for (let i = 0; i < n; i++) { const src = rows[r - 1 + i] || []; d._s.rows[d.r - 1 + i] = d._s.rows[d.r - 1 + i] || []; for (let j = 0; j < m; j++) d._s.rows[d.r - 1 + i][d.c - 1 + j] = src[c - 1 + j] ?? ''; } },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); }, setNumberFormat() { return this; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; return sh; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS; g.BK = 0; g.BKFAIL = false;
g.CFG = { roundTo: 1, nextBill: 500, nextGstBill: 1, testNextBill: 1, testNextGstBill: 1, fyReset: true, gstFy: '2026-27' };
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; ENV_='live'; curBuyMap_=()=>({});
   readConfig_=()=>JSON.parse(JSON.stringify(CFG)); setConfig_=o=>{ Object.assign(CFG,o); return {config:readConfig_()}; };
   backupNow_=w=>{ if (BKFAIL) throw new Error('no drive'); BK++; return {}; };
   Utilities.formatDate=(d,tz,f)=>{ const x=new Date(new Date(d).getTime()+330*60000).toISOString(); return f==='H'?String(Number(x.slice(11,13))):f==='yyyy-MM'?x.slice(0,7):f==='yyyy-MM-dd'?x.slice(0,10):f==='yyyy-MM-dd HH:mm'?x.slice(0,16).replace('T',' '):x.slice(0,f.length); };`);
ok(R('SCRIPT_VERSION') >= 67, 'A0 script v67');
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k);
const mk = (env, o) => { const r = BC.map(() => ''); Object.assign(r, {}); const set = (k, v) => r[BI(k)] = v;
  set('billNo', o.n); set('date', new Date(o.d + 'T06:00:00Z')); set('customer', o.cust || 'Walk-in'); set('mobile', o.mob || ''); set('total', o.total || 100);
  set('gstBill', o.gst ? 'Yes' : 'No'); set('billId', o.id); set('lines', JSON.stringify([{ id: o.item || 'i1', name: 'Bag', qty: 1, rate: o.total || 100, buy: 80 }])); set('text', 'Bill No: ' + o.n);
  set('cost', 80); set('profit', (o.total || 100) - 80); set('tax', o.tax || 0);
  if (o.pay) set('payment', o.pay); if (o.due !== undefined) set('due', o.due); if (o.pays) set('payments', JSON.stringify(o.pays)); if (o.cleared) set('clearedAt', new Date(o.cleared + 'T06:00:00Z'));
  if (o.cancel) set('status', 'Cancelled'); const t = env === 'test' ? 'Test Bills' : 'Bills'; sheets[t].rows.push(r); };
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice()); sheets['Test Bills'] = mkSheet('Test Bills'); sheets['Test Bills'].rows.push(BC.slice());
let no = 0; const days = ['2023-05-10', '2023-11-02', '2024-02-20', '2024-06-15', '2024-12-01', '2025-03-30', '2025-04-02', '2025-10-10', '2026-02-02', '2026-04-05', '2026-04-20'];
days.forEach((d, i) => { for (let k = 0; k < 3; k++) { no++; mk('live', { n: no, d, id: 'b' + no, mob: k === 0 ? '9811111111' : '', cust: k === 0 ? 'Ravi' : 'Walk-in', item: k === 1 ? 'i2' : 'i1', total: 100 + i }); } });
mk('live', { n: ++no, d: '2023-08-08', id: 'owed', mob: '9822222222', cust: 'Sunil', pay: 'Credit', due: 300, total: 300 });                        // still owed: stays
mk('live', { n: ++no, d: '2024-07-07', id: 'paidlate', mob: '9822222222', cust: 'Sunil', pay: 'Cleared', due: 0, total: 200, pays: [{ d: '2026-01-10T06:00:00Z', a: 200 }], cleared: '2026-01-10' });   // paid off this year: stays
mk('live', { n: ++no, d: '2024-07-08', id: 'paidold', mob: '9822222222', cust: 'Sunil', pay: 'Cleared', due: 0, total: 150, pays: [{ d: '2024-09-10T06:00:00Z', a: 150 }], cleared: '2024-09-10' });   // paid off long ago: moves
mk('live', { n: ++no, d: '2024-01-05', id: 'cx', cancel: true, total: 999 });
mk('test', { n: 1, d: '2023-06-01', id: 't1' }); mk('test', { n: 2, d: '2026-05-01', id: 't2' });
R("customersSheet_()");
const allIds = () => [].concat(...Object.keys(sheets).filter(k => /^(Test )?Bills( \d{4}-\d{2})?$/.test(k)).map(k => sheets[k].rows.slice(1).map(r => r[BI('billId')])));
const ids0 = allIds().sort(), main0 = sheets.Bills.rows.length - 1;
const pop0 = R('JSON.stringify(pop_())');
const rep = (from, to) => R(`report_({from:'${from}', to:'${to}', tz:-330}).report.totals`);
const r24 = rep('2024-01-01', '2024-12-31'), rAll = rep('2023-04-01', '2027-03-31');
const cust0 = JSON.stringify(sheets.Customers.rows.slice(1).map(r => [r[0], r[3], r[4]]).sort());

/* not yet: wrong time, or no backup */
const NOW = '2026-05-02T20:30:00Z';   // 2 am India, 3 May 2026: FY 2026-27 has started, so FY 2024-25 and older move
ok(R(`arcMaybe_(new Date('2026-05-02T08:00:00Z'))`) === null && sheets.Bills.rows.length - 1 === main0, 'B1 not during the day (1:30 pm India): nothing moves');
g.BKFAIL = true; let err = ''; try { R(`arcMaybe_(new Date('${NOW}'))`); } catch (e) { err = e.message; }
ok(err === 'archive_no_backup' && sheets.Bills.rows.length - 1 === main0 && !sheets['Bills 2024-25'], 'B2 no backup could be made: nothing moves');
g.BKFAIL = false;
/* a run that stops half-way: copied, not removed, then run again */
failCopy = true; err = ''; try { R(`arcMaybe_(new Date('${NOW}'))`); } catch (e) { err = e.message; }
ok(err === 'archive_copy_failed' && sheets.Bills.rows.length - 1 === main0, 'B3 a copy that didn\'t land: nothing is removed from Bills');
failCopy = false;
const res = R(`arcMaybe_(new Date('${NOW}'))`);
ok(res && res.live > 0 && g.BK >= 1, 'C1 at night after the new year starts: a backup first, then ' + (res && res.live) + ' real bills moved');
const mainIds = sheets.Bills.rows.slice(1).map(r => r[BI('billId')]);
ok(!!sheets['Bills 2023-24'] && !!sheets['Bills 2024-25'] && !sheets['Bills 2025-26'], 'C2 one tab per year: Bills 2023-24, Bills 2024-25 (2025-26 stays)');
ok(JSON.stringify(allIds().sort()) === JSON.stringify(ids0), 'C3 no bill lost, none copied twice (' + ids0.length + ' bills in all)');
ok(mainIds.includes('owed') && mainIds.includes('paidlate') && !mainIds.includes('paidold') && !mainIds.includes('cx'), 'C4 money still owed and credit paid off this year stay; older paid and cancelled bills move');
ok(mainIds.every(id => { const r = sheets.Bills.rows.find(x => x[BI('billId')] === id); return ['owed', 'paidlate'].includes(id) || r[BI('date')] >= new Date('2025-04-01'); }), 'C5 everything else left in Bills is from FY 2025-26 or later');
ok(sheets['Test Bills 2023-24'] && sheets['Test Bills'].rows.length === 2 && res.test === 1, 'C6 test bills move to their own tab (Test Bills 2023-24)');
const y = R('JSON.stringify(arcSums_())'), Y = JSON.parse(y);
ok(Y['2024-25'] && Y['2024-25'].bills === 10 && Y['2024-25'].items.i2 === 3 && Y['2023-24'].bills === 9, 'C7 BillYears summary: FY 2024-25 has 10 bills, item i2 on 3 of them; FY 2023-24 9 (the cancelled one left out)');
ok(R('JSON.stringify(pop_())') === pop0, 'D1 most-sold order counts the same as before');
ok(JSON.stringify(rep('2024-01-01', '2024-12-31')) === JSON.stringify(r24), 'D2 a report for 2024 gives the same figures as before');
ok(JSON.stringify(rep('2023-04-01', '2027-03-31')) === JSON.stringify(rAll), 'D3 a report for all years gives the same figures');
R('recountCustomers_()');
ok(JSON.stringify(sheets.Customers.rows.slice(1).map(r => [r[0], r[3], r[4]]).sort()) === cust0, 'D4 customer bill counts and totals stay the same after a recount');
const full = R(`listBills_('', 3000, {full:true, tz:-330})`);
ok(full.years.includes('2023') && full.arcY.includes('2024') && full.bills.every(b => !b.arc), 'E1 the phone\'s copy: only Bills, but the years list still has 2023, and says which years are archived');
const srch = R(`listBills_('ravi', 2, {tz:-330, arc:true, skip:0})`), srch2 = R(`listBills_('ravi', 2, {tz:-330, arc:true, skip:${srch.next}})`);
const ravi = [...srch.bills, ...srch2.bills];
ok(srch.all.count === 11 && srch.more && new Set(ravi.map(b => b.id)).size === 4, 'E2 a search on the sheet finds Ravi\'s 11 bills across the archive, page by page with no repeats');
const old = R(`listBills_('', 200, {tz:-330, arc:true, from:'2023-05-01', to:'2023-05-31'})`).bills;
ok(old.length === 3 && old.every(b => b.arc === '2023-24'), 'E3 a date in an archived year: its bills come back marked archived (2023-24)');
const gb = R(`getBill_(${old[0].row}, '${old[0].id}', ${old[0].n}, '2023-24')`).bill;
ok(gb.text === 'Bill No: ' + old[0].n, 'E4 an archived bill opens (text read from its year\'s tab)');
const kept = R(`listBills_('', 3000, {full:true, tz:-330})`).bills.find(b => b.id === 'b25');
const moved = R(`getBill_(2, 'b25', 25)`).bill;
ok(kept && kept.row !== 2 && moved.text === 'Bill No: 25', 'E5 a phone with an old row number still opens the bill (found by its id)');
const tryE = c => { try { R(c); return 'ok'; } catch (e) { return e.message; } };
ok(tryE(`updateBill_(${JSON.stringify(fitBill({ id: 'b1', n: 1, total: 100, text: 'x' }))}, 'Mayank', {role:'owner'})`) === 'bill_archived', 'F1 editing an archived bill: refused, "archived"');
ok(tryE(`cancelBill_({id:'b2', n:2, reason:'x'}, 'Mayank', true)`) === 'bill_archived', 'F2 cancelling an archived bill: refused');
const t = R(`takeBill_(${JSON.stringify({ n: 5, by: 'Mayank', bill: fitBill({ id: 'new5', gst: false, total: 120, text: 'Bill No: 5', noLine: 'Bill No: 5', noToken: '5', lines: [], pay: 'paid' }) })})`);
ok(t.ok && t.renumbered && t.renumbered.to === 500, 'F3 typing an old bill number that\'s in the archive (5): the bill gets the next free number');
const before2 = allIds().length; R(`archiveNow_(new Date('${NOW}'))`);
ok(allIds().length === before2 && R(`arcMaybe_(new Date('${NOW}'))`) === null, 'G1 running again moves nothing and copies nothing twice; once a year only');
