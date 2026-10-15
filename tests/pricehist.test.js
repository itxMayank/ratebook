/* Price history, server side (Code.gs v53): the PriceHistory tab is started once from past bills (buy price saved on each line;
   sell = the list price saved on the line, else the rate charged, a one-off discount ignored), then every save, vendor-bill
   buy update and one price typed in the sheet adds a row. Staff see sell prices only. Run: node tests/pricehist.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getRow: () => r, getColumn: () => c, getNumRows: () => n, getNumColumns: () => m, getSheet: () => sheets[name],
    getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false; readConfig_=()=>({roundTo:1}); bump_=()=>{}; bumpB_=()=>{}; ENV_='live';`);
const COLS = R('COLS'), BC = R('BILL_COLS');
const day = n => new Date(Date.now() - n * 864e5);
// price list: PVC now buy 200 / sell 195 (raised 2 days ago); Cup unchanged
sheets.Items = mkSheet('Items'); sheets.Items.rows.push(COLS.slice());
const item = o => { const r = COLS.map(() => ''); Object.keys(o).forEach(k => r[COLS.indexOf(k)] = o[k]); sheets.Items.rows.push(r); };
item({ id: 'pvc', name: 'PVC 500 ml', unit: 'pc', buy: 200, sell: 195, updatedAt: day(2).getTime(), updatedBy: 'Dad' });
item({ id: 'cup', name: 'Paper Cup', unit: 'pc', buy: 1, sell: 1.5, updatedAt: day(90).getTime() });
// past bills (some in test mode): PVC at 180 (buy 160), then 190 (buy 170, two bills that day), a one-off 175 discount, then 195 with
// the list price saved (buy 180); the cup always 1.5
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice()); sheets['Test Bills'] = mkSheet('Test Bills'); sheets['Test Bills'].rows.push(BC.slice());
let bn = 0; const bill = (tab, n, lines) => { const r = BC.map(() => ''); r[BC.indexOf('billNo')] = ++bn; r[BC.indexOf('billId')] = 'b' + bn; r[BC.indexOf('date')] = day(n); r[BC.indexOf('lines')] = JSON.stringify(lines); sheets[tab].rows.push(r); };
const P = (rate, buy, lp) => ({ id: 'pvc', name: 'PVC 500 ml', qty: 2, rate, buy, ...(lp ? { lp } : {}) }), CUP = { id: 'cup', name: 'Paper Cup', qty: 10, rate: 1.5, buy: 1 };
bill('Bills', 20, [P(180, 160), CUP]); bill('Bills', 18, [P(180, 160)]);
bill('Bills', 15, [P(190, 170)]); bill('Test Bills', 15, [P(190, 170)]);
bill('Bills', 12, [P(175, 170)]);                 // a discount for one customer
bill('Bills', 11, [P(190, 170), CUP]);
bill('Bills', 5, [P(195, 180, 195)]);

const H = (id, role) => R(`priceHist_('${id}','${role || 'owner'}')`);
let h = H('pvc');
const fmt = L => ['buy', 'sell'].map(f => L.filter(x => x.f === f).reverse().map(x => `${f}:${x.o}>${x.n}:${x.src}`).join(' ')).join(' | ');
ok(fmt(h.hist) === 'buy:160>170:bills buy:170>180:bills buy:180>200:bills | sell:180>190:bills sell:190>195:bills', 'A1 started from past bills: buy 160→170→180→200, sell 180→190→195; the one-off ₹175 discount is not a price change: ' + fmt(h.hist));
ok(h.hist[0].f === 'buy' && h.hist[0].n === 200 && h.hist[0].day === day(2).toISOString().slice(0, 10), 'A2 the buy price raised after the last bill is dated when the item was last edited, newest first');
ok(H('cup').hist.length === 0, 'A3 the cup never changed price: no rows');
ok(H('pvc', 'staff').hist.every(x => x.f !== 'buy') && H('pvc', 'staff').hist.length === 2, 'A4 staff see only the sell price changes');
const n0 = sheets.PriceHistory.rows.length; H('pvc'); R("phEnsure_()");
ok(sheets.PriceHistory.rows.length === n0 && g.props.PH_BF, 'A5 the start from bills runs only once');

// live: every save
R(`upsert_([{ id:'pvc', sell: 210 }], 'Mayank', 'edit')`);
h = H('pvc'); ok(h.hist[0].f === 'sell' && h.hist[0].o === 195 && h.hist[0].n === 210 && h.hist[0].by === 'Mayank' && h.hist[0].src === 'edit', 'B1 Edit item: sell 195 → 210, by Mayank, from the edit screen');
const n1 = sheets.PriceHistory.rows.length; R(`upsert_([{ id:'pvc', sell: 210, name:'PVC 500 ml' }], 'Mayank', 'edit')`);
ok(sheets.PriceHistory.rows.length === n1, 'B2 saving without a price change adds nothing');
R(`upsert_([{ id:'cup', buy: 1.2, sell: 1.75 }], 'Dad', 'bulk')`);
const c = H('cup').hist; ok(c.length === 2 && c.every(x => x.src === 'bulk' && x.by === 'Dad') && c.some(x => x.f === 'buy' && x.o === 1 && x.n === 1.2), 'B3 Bulk edit: both prices logged');
const nw = R(`upsert_([{ tmp:'t1', name:'Steel Glass', unit:'pc', buy: 0, sell: 40 }], 'Dad', 'edit')`).items[0];
const g0 = H(nw.id).hist; ok(g0.length === 1 && g0[0].f === 'sell' && g0[0].o === null && g0[0].n === 40, 'B4 a new item: its first sell price is the start of its history (no buy price, nothing for buy)');
// one price typed in the sheet
const row = sheets.Items.rows.findIndex(r => r[0] === 'cup') + 1, col = COLS.indexOf('sell') + 1;
sheets.Items.rows[row - 1][col - 1] = 2;
R(`onSheetEdit({ range: SS.getSheetByName('Items').getRange(${row}, ${col}), oldValue: '1.75', value: '2' })`);
const cs = H('cup').hist[0]; ok(cs.f === 'sell' && cs.o === 1.75 && cs.n === 2 && cs.src === 'sheet', 'C1 a price typed into the sheet by hand is logged too');
R(`onSheetEdit({ range: SS.getSheetByName('Items').getRange(${row}, 2), oldValue: 'a', value: 'b' })`);
ok(H('cup').hist.length === 3, 'C2 other cells typed in the sheet (the name) add nothing');

// a shop where live rows exist before the start from bills: bills from after the first live row are not read, and a price
// already logged live isn't added again at the last edit
const g2 = gas([path.join(__dirname, '..', 'Code.gs')]); g2.SS = SS; g2.R(`ss_ = () => SS; bump_=()=>{}; ENV_='live';`);
delete sheets.PriceHistory; g2.R(`phWrite_([[Date.now()-864e5, "'x", 'pvc', 'PVC 500 ml', 'pc', 'buy', 180, 200, 'Dad', 'edit']])`);
const h2 = g2.R(`priceHist_('pvc','owner')`).hist;
ok(h2.filter(x => x.f === 'buy' && x.n === 200).length === 1 && h2.some(x => x.src === 'bills' && x.f === 'sell'), 'D1 the change already logged live is not added again from bills');
