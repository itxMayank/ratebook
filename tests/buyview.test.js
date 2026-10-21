/* Who sees buy rates (Code.gs v65): owner only / owner and managers (default) / everyone, enforced by the sheet, plus the
   below-cost notice. The real Code.gs over an in-memory sheet, every request through doPost with a real sign-in.
   Run: node tests/buyview.test.js */
const path = require('path'), { gas } = require('./gas-mock');
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
// a price list with buy rates in the Items tab (the real list_ reads it)
const COLS = R('COLS'); sheets.Items = mkSheet('Items'); sheets.Items.rows.push(COLS.slice());
const item = o => sheets.Items.rows.push(COLS.map(k => o[k] === undefined ? '' : o[k]));
item({ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180 }); item({ id: 'i2', name: 'Paper Cup', unit: 'box', buy: 100, sell: 160, altUnit: 'packet', altQty: 4, altSell: 45 }); item({ id: 'i3', name: 'Loose', unit: 'kg', sell: 10 });
R("pop_=()=>({}); listCached_=()=>list_(); notice0=notice_;");
const setV = v => { CFG.buyView = v; R("cache.BUYV && delete cache.BUYV"); };
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
R("saveUser_({name:'Mayank',pin:'739164',role:'owner'})"); R("saveUser_({name:'Sanjay',pin:'582917',role:'manager'})"); R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const tokOf = (pin, name) => post({ action: 'verify', pin, by: name, dev: 'ph-' + name, wantTok: true }).tok;
const OWN = tokOf('739164', 'Mayank'), MAN = tokOf('582917', 'Sanjay'), STF = tokOf('5273', 'Raju');
const buys = tok => post({ action: 'list', tok }).items.map(i => i.buy);
const BC = R('BILL_COLS'), BI = k => BC.indexOf(k); const rowOf = id => sheets.Bills.rows.find(r => r[BI('billId')] === id);
// ---------- A. the price list ----------
setV(undefined);
const sl = post({ action: 'list', tok: STF });
ok(sl.items.every(i => i.buy === null) && sl.noBuy === true, 'A1 default (owner and managers): a staff phone gets no buy rates at all');
ok(sl.items[0].lo === 158 && sl.items[1].lo === 105 && sl.items[2].lo === null, 'A2 …only the rate below which "Low margin" shows (₹150 × 1.05 = 157.5 → ₹158; ₹100 → ₹105; none without a buy rate)');
ok(buys(MAN)[0] === 150 && buys(OWN)[1] === 100, 'A3 managers and the owner still get them (' + buys(MAN).join(', ') + ')');
ok(post({ action: 'boot', tok: STF }).items.every(i => i.buy === null) && post({ action: 'boot', tok: STF }).me.buyOk === false && post({ action: 'boot', tok: OWN }).me.buyOk === true, 'A4 the start-up request too, and it says whether this person may see them');
setV('owner'); ok(buys(MAN)[0] === null && buys(OWN)[0] === 150, 'A5 "Owner only": managers get none either');
setV('all'); ok(buys(STF)[0] === 150, 'A6 "Everyone": staff see them, as before');
setV('manager'); CFG.lowMargin = 0; ok(post({ action: 'list', tok: STF }).items.every(i => i.lo === null), 'A7 margin warning switched off (0%): no threshold sent'); CFG.lowMargin = 5;
// ---------- B. bills made and edited by staff ----------
const take = (tok, id, lines, total) => post({ action: 'takeBill', tok, env: 'live', n: CFG.nextBill, bill: { id, total, pay: 'paid', items: 'x', text: 't', lines } });
take(STF, 'bs1', [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 2, rate: 180 }, { id: 'i2', name: 'Paper Cup', unit: 'packet', qty: 1, rate: 45, alt: true }], 405);
let L = JSON.parse(rowOf('bs1')[BI('lines')]);
ok(L[0].buy === 150 && L[1].buy === 25 && rowOf('bs1')[BI('cost')] === 325 && rowOf('bs1')[BI('profit')] === 80, 'B1 a staff bill (no buy rates on the phone) gets them on the sheet: ₹150 /kg, ₹25 a packet (₹100 a box of 4); cost ₹325, profit ₹80');
const gb = post({ action: 'getBill', tok: STF, env: 'live', row: 2, id: 'bs1' });
ok(gb.bill.lines.every(l => !('buy' in l)) && post({ action: 'getBill', tok: MAN, env: 'live', row: 2, id: 'bs1' }).bill.lines[0].buy === 150, 'B2 opening it: staff get the lines without buy rates; a manager with them');
const lb = post({ action: 'listBills', tok: STF, env: 'live', full: true });
ok(lb.bills[0].cost === null && lb.bills[0].profit === null && post({ action: 'listBills', tok: MAN, env: 'live', full: true }).bills[0].profit === 80, 'B3 Past bills: no cost or profit for staff');
ok(post({ action: 'getBills', tok: STF, env: 'live', rows: [{ row: 2, id: 'bs1' }] }).bills[0].lines.every(l => !('buy' in l)), 'B4 …nor in the bills read ahead');
sheets.Items.rows[1][COLS.indexOf('buy')] = 999;   // the buy rate changes later
const ed = post({ action: 'updateBill', tok: STF, env: 'live', bill: { id: 'bs1', row: 2, n: rowOf('bs1')[BI('billNo')], total: 585, pay: 'paid', items: 'x', text: 't2', lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 3, rate: 180 }, { id: 'i2', name: 'Paper Cup', unit: 'packet', qty: 1, rate: 45, alt: true }], baseEdits: 0, fresh: true } });
L = JSON.parse(rowOf('bs1')[BI('lines')]);
ok(ed.ok && L[0].buy === 150 && rowOf('bs1')[BI('profit')] === 110, 'B5 staff edit the bill: each line keeps the buy rate it was billed at (₹150, not today\'s ₹999); profit ₹110');
const again = post({ action: 'updateBill', tok: STF, env: 'live', bill: { id: 'bs1', row: 2, n: rowOf('bs1')[BI('billNo')], total: 585, pay: 'paid', items: 'x', text: 't2', lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 3, rate: 180 }, { id: 'i2', name: 'Paper Cup', unit: 'packet', qty: 1, rate: 45, alt: true }], baseEdits: 0, oid: 'w1', fresh: true } });
ok(again.dup === true || again.ok, 'B6 the same edit sent again (lost reply): recognised, not refused');
sheets.Items.rows[1][COLS.indexOf('buy')] = 150;
// ---------- C. other places a buy rate could leak ----------
setV('owner');
ok(post({ action: 'itemBuys', tok: MAN, id: 'i1' }).error === 'not_allowed', 'C1 "Owner only": a manager can\'t read an item\'s purchase history (it shows what was paid)');
post({ action: 'upsert', tok: MAN, items: [{ id: 'i1', name: 'PP Bag', buy: 1, sell: 190 }] });
ok(sheets.Items.rows[1][COLS.indexOf('buy')] === 150 && sheets.Items.rows[1][COLS.indexOf('sell')] === 190, 'C2 …and saving an item from their phone never changes its buy rate (only the sell price)');
const rp = post({ action: 'report', tok: MAN, env: 'live', from: '2000-01-01', to: '2100-01-01' });
ok(rp.ok && rp.report.noBuy && !('profit' in rp.report.totals) && rp.report.items.every(i => !('cost' in i) && !('profit' in i)), 'C3 …Reports come without profit or cost');
ok(post({ action: 'report', tok: OWN, env: 'live', from: '2000-01-01', to: '2100-01-01' }).report.totals.profit > 0, 'C4 the owner\'s Reports still have profit');
setV('manager');
// ---------- D. the below-cost notice ----------
const notes = tok => (post({ action: 'notices', tok, env: 'live' }).list || []);
take(STF, 'bs2', [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 1, rate: 140 }, { id: 'i3', name: 'Loose', unit: 'kg', qty: 1, rate: 1 }], 141);
let n = notes(OWN).filter(x => x.kind === 'below');
ok(n.length === 1 && n[0].billNo.replace(/^'/, '') === String(rowOf('bs2')[BI('billNo')]) && n[0].by === 'Raju' && n[0].extra.l.length === 1 && n[0].extra.l[0].r === 140 && n[0].extra.l[0].n === 'PP Bag' && !n[0].read, 'D1 Raju sells PP Bag at ₹140 (buy ₹150): the owner gets "sold below cost" with the bill, item and rate (an item with no buy rate isn\'t counted)');
ok(!JSON.stringify(n[0]).includes('150'), 'D2 …the notice itself carries no buy rate');
take(OWN, 'bs3', [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 1, rate: 180 }], 180);
ok(notes(OWN).filter(x => x.kind === 'below').length === 1, 'D3 a bill at the list price: no notice');
const no2 = rowOf('bs2')[BI('billNo')];
post({ action: 'updateBill', tok: MAN, env: 'live', bill: { id: 'bs2', row: 3, n: no2, total: 142, pay: 'paid', items: 'x', text: 'e', lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 1, rate: 140, buy: 150 }, { id: 'i3', name: 'Loose', unit: 'kg', qty: 2, rate: 1 }], baseEdits: 0 } });
ok(notes(OWN).filter(x => x.kind === 'below').length === 1, 'D4 editing that bill without a new below-cost line: no second notice');
post({ action: 'updateBill', tok: MAN, env: 'live', bill: { id: 'bs2', row: 3, n: no2, total: 132, pay: 'paid', items: 'x', text: 'e2', lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 1, rate: 130, buy: 150 }, { id: 'i3', name: 'Loose', unit: 'kg', qty: 2, rate: 1 }], baseEdits: 1 } });
ok(notes(OWN).filter(x => x.kind === 'below').length === 2, 'D5 …lowering it further: a new notice');
ok(notes(MAN).some(x => x.kind === 'below'), 'D6 managers who may see buy rates get it too');
setV('owner'); ok(!notes(MAN).some(x => x.kind === 'below'), 'D7 "Owner only": managers don\'t (it would tell them the cost is above ₹140)'); setV('manager');
ok(post({ action: 'notices', tok: STF }).error === 'not_allowed', 'D8 staff can\'t read notices');
// ---------- E. the setting itself (the real config read/write, on its own sheet) ----------
const g2 = gas([path.join(__dirname, '..', 'Code.gs')]); const sh2 = {}; g2.SS2 = { getId: () => 's2', getSheetByName: n => sh2[n] || null, insertSheet: n => (sh2[n] = mkSheet(n)), getSheets: () => Object.values(sh2) };
g2.R("ss_ = () => SS2;");
ok(g2.R("readConfig_().buyView") === 'manager' && g2.R("readConfig_().lowMargin") === 5, 'E1 a shop that never chose: owner and managers, warn under 5%');
g2.R("setConfig_({buyView:'xyz', lowMargin:150})");
ok(g2.R("readConfig_().buyView") === 'manager' && g2.R("readConfig_().lowMargin") === 100, 'E2 junk values are cleaned (unknown choice → owner and managers; 150% → 100%)');
g2.R("setConfig_({buyView:'owner', lowMargin:'8'})");
