/* The owner's business page, server side (Code.gs v48 insights_): one pass over 180 days of bills + price list + purchases +
   vendors + dues. Checks every figure on a small made-up shop, the "Do this today" picks, caching, owner-only, and that
   reading never adds tabs to the sheet. Run: node tests/insights.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; return { name, rows, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); g.SS = SS; const R = g.R;
const IST = 330 * 60000, today = new Date(Date.now() + IST).toISOString().slice(0, 10);
const dayAgo = n => new Date(Date.parse(today + 'T00:00:00Z') - n * 864e5).toISOString().slice(0, 10);
const at = n => new Date(Date.parse(dayAgo(n) + 'T12:00:00+05:30'));
const items = [
  { id: 'i1', name: 'PP Bag', unit: 'kg', buy: 100, sell: 120, cat: 'Bags' }, { id: 'i2', name: 'Paper Cup', unit: 'pc', buy: 1, sell: 1.5, cat: 'Cups' },
  { id: 'i3', name: 'Foil Roll', unit: 'roll', buy: 50, sell: 48, cat: 'Foil' }, { id: 'i4', name: 'Sugar', unit: 'kg', buy: 0, sell: 46, cat: '' },
  { id: 'i5', name: 'Old Tray', unit: 'pc', buy: 10, sell: 15, cat: 'Trays', updatedAt: Date.now() - 200 * 864e5 }, { id: 'i6', name: 'Tape', unit: 'pc', buy: 100, sell: 103, cat: 'Tape' },
  { id: 'i7', name: 'PVC 500 ml', unit: 'pc', buy: 200, sell: 195, cat: 'Bottles' }];
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; readConfig_=()=>({roundTo:1, mode:'live'});
   listCached_ = () => ({ ok:true, items: ${JSON.stringify(items)} }); ENV_='live';`);
const BC = R('BILL_COLS'); let bid = 0;
const bill = (n, lines, o = {}) => { const r = {}; BC.forEach(k => r[k] = ''); bid++;
  Object.assign(r, { billNo: bid, date: at(n), customer: o.cust || '', mobile: o.mob || '', total: lines.reduce((t, l) => t + l.qty * l.rate, 0), by: o.by || 'Mayank', lines: JSON.stringify(lines), billId: 'b' + bid,
    payment: o.pay || 'Paid', due: o.due || '', paid: o.paid || '', payments: o.payments ? JSON.stringify(o.payments) : '', status: o.cancel ? 'Cancelled' : '', edits: o.edits || '', paidBy: o.paidBy || '', clearedAt: o.cleared || '' });
  sheets.Bills.rows.push(BC.map(k => r[k])); };
const L = (id, name, qty, rate, buy) => ({ id, name, qty, rate, buy });
sheets.Bills = mkSheet('Bills'); sheets.Bills.rows.push(BC.slice());
// an old credit bill, before the 180-day window: ₹300, ₹100 paid 150 days ago, the last ₹200 paid 10 days ago (cleared). Only the day-by-day credit chart reads it.
bill(200, [L('i2', 'Paper Cup', 200, 1.5, 1)], { cust: 'Old Co', mob: '9000000009', pay: 'Cleared', payments: [{ d: at(150).toISOString(), a: 100 }, { d: at(10).toISOString(), a: 200 }], cleared: at(10).getTime() });
// today: 2 bills
bill(0, [L('i1', 'PP Bag', 2, 120, 100), L('i2', 'Paper Cup', 100, 1.5, 1)], { paidBy: 'upi' });
bill(0, [L('i4', 'Sugar', 5, 46)], { paidBy: 'cash' });
// last 30 days: PP Bag sells a lot, at three different rates (discounts); Foil sold below buy; a cancelled bill
for (let d = 1; d <= 20; d++) bill(d, [L('i1', 'PP Bag', 1, d % 3 === 0 ? 100 : d % 3 === 1 ? 110 : 120, 100)], { by: d % 2 ? 'Raju' : 'Mayank', edits: d === 4 ? 1 : '' });
bill(3, [L('i3', 'Foil Roll', 4, 48, 50)]);
// from v52 each line saves the list price on the day (lp): 7 days ago PP Bag was listed at ₹100 and sold at ₹100 (no discount, though
// today's list price is ₹120); 8 days ago listed at ₹115, sold at ₹110 (₹5 below)
// PVC: sold 6 and 4 days ago when its buy price was ₹180 (saved on the line); the buy price was raised to ₹200 since, sell still ₹195
bill(6, [L('i7', 'PVC 500 ml', 6, 195, 180)]); bill(4, [L('i7', 'PVC 500 ml', 3, 195, 180)]);
bill(7, [{ ...L('i1', 'PP Bag', 2, 100, 100), lp: 100 }]); bill(8, [{ ...L('i1', 'PP Bag', 1, 110, 100), lp: 115 }]);
bill(2, [L('i1', 'PP Bag', 50, 120, 100)], { cancel: 1, by: 'Raju' });
// 31-59 days ago: PP Bag sold less (so it's rising); Tape too
for (let d = 31; d <= 40; d++) bill(d, [L('i1', 'PP Bag', 1, 120, 100)]);
bill(10, [L('i6', 'Tape', 3, 103, 100)]);
// credit: Sunil owes 500 from 45 days ago, no payment since; Asha owes 200 from 5 days ago
bill(45, [L('i2', 'Paper Cup', 400, 1.25, 1)], { cust: 'Sunil Traders', mob: '9876543210', pay: 'Credit', due: 500 });
bill(5, [L('i2', 'Paper Cup', 200, 1.5, 1)], { cust: 'Asha', mob: '9123456780', pay: 'Part paid', paid: 100, due: 200, payments: [{ d: at(5).toISOString(), a: 100, at: 1 }] });
// a regular who stopped coming: 3 bills 100-150 days ago
[100, 120, 150].forEach(d => bill(d, [L('i2', 'Paper Cup', 100, 1.5, 1)], { cust: 'Ravi Stores', mob: '9000000001' }));
// purchases: PP Bag bought from Sharma at 95 (25 days ago), then from Mahaveer at 105 (5 days ago, 10 kg)
R(`const P=vtab_('Purchases',PUR_COLS);
  vwrite_(P.s,PUR_COLS,{entryId:'e0',vendorId:'vB',itemId:'i1',date:'${dayAgo(25)}',desc:'PP Bag',qty:20,unit:'kg',rate:95,f:1,buy:95,at:1,by:'M'});
  vwrite_(P.s,PUR_COLS,{entryId:'e1',vendorId:'vA',itemId:'i1',date:'${dayAgo(5)}',desc:'PP Bag',qty:10,unit:'kg',rate:105,f:1,buy:105,at:2,by:'M'});
  const V=vtab_('Vendors',VEND_COLS); vwrite_(V.s,VEND_COLS,{id:'vA',name:'Mahaveer',creditDays:15,createdAt:1}); vwrite_(V.s,VEND_COLS,{id:'vB',name:'Sharma',createdAt:2});
  const LL=vtab_('VendorLedger',VLED_COLS); vwrite_(LL.s,VLED_COLS,{id:'e1',vendorId:'vA',type:'bill',date:'${dayAgo(40)}',amount:1000,billNo:'M-1',at:3,check:JSON.stringify({st:'issues'})});`);

const t0 = Date.now(); const I = R('insights_({tz:-330})'); const ms = Date.now() - t0;
if (process.env.DUMP) require('fs').writeFileSync(process.env.DUMP, JSON.stringify(Object.assign({}, I, { shopName: 'Sharma Traders' }), null, 1));   // tests/fixtures/insights.json for the dashboard test
ok(I.ok && I.today === today && I.env === 'live', 'A1 builds for today, in the mode asked (' + ms + ' ms)');
ok(I.pulse.today.bills === 2 && I.pulse.today.sales === 620 && I.pulse.today.profit === 90 && I.pulse.today.pct === 30, 'A2 today: 2 bills, ₹620, profit ₹90 (Sugar has no buy price, so it is left out of profit)');
ok(I.pulse.d30.bills > 20 && I.pulse.d30.noBuy === 230, 'A3 last 30 days: the cancelled bill is left out; ₹230 sold without a buy price');
ok(I.pulse.mtd.sales >= 620 && typeof I.pulse.lm.sales === 'number' && I.pulse.lmTo <= today, 'A4 this month so far, and the same days last month');
// margins
ok(I.margins.groups[0].cat === 'Bags' && I.margins.groups.some(x => x.cat === 'Foil' && x.pct < 0), 'B1 margin by group: Bags biggest, Foil losing money');
ok(I.margins.below.some(x => x.id === 'i3' && x.sell === 48 && x.buy === 50) && I.margins.soldBelow.some(x => x.id === 'i3' && x.lost === 8), 'B2 Foil priced below its buy price, and ₹8 lost on what was sold');
ok(I.margins.thin.some(x => x.id === 'i6' && x.pct === 3), 'B3 Tape: margin only 3%');
const sp = I.margins.spread.find(x => x.id === 'i1');
ok(sp && sp.rates === 3 && sp.min === 100 && sp.max === 120 && sp.leak > 0, 'B4 PP Bag sold at 3 different rates (₹100–120): ₹' + (sp && sp.leak) + ' below the list price');
ok(!I.margins.soldBelow.some(x => x.id === 'i7'), 'B7 PVC sold at ₹195 when it cost ₹180: not "sold below cost" (judged by the buy price saved on the bill, not today\'s ₹200)');
const cs = I.margins.checkSell.find(x => x.id === 'i7');
ok(cs && cs.buy === 200 && cs.sell === 195 && cs.was === 180 && cs.pctWas === 8.3 && cs.suggest === 217, 'B8 PVC: buy ₹200 now above sell ₹195; earlier buy ₹180, margin 8.3% → suggest ₹217: ' + JSON.stringify(cs));
ok(I.todo.some(x => x.k === 'checkSell' && x.id === 'i7') && !I.todo.some(x => x.k === 'below' && x.id === 'i3') && I.margins.checkSell.some(x => x.id === 'i3'), 'B9 "Do this today": check PVC\'s sell price; Foil (priced below cost) appears once, as "check the sell price", not twice');
ok(sp && sp.leak === 195 && sp.est === 190, 'B5 below list: compared with the list price saved on the line (₹0 on the ₹100 day, ₹5 on the ₹115 day); older lines with today\'s, counted as an estimate (₹190): ' + JSON.stringify(sp && [sp.leak, sp.est]));
ok(sp && JSON.stringify(sp.brk) === JSON.stringify([{ r: 120, q: 9, n: 8, lk: 0 }, { r: 110, q: 8, n: 8, lk: 75 }, { r: 100, q: 8, n: 7, lk: 120 }]), 'B6 each rate: qty, bills and ₹ below list, most sold first: ' + JSON.stringify(sp && sp.brk));
ok(I.margins.noBuy.amt === 230 && I.margins.noBuy.items[0].id === 'i4', 'B5 sales with no buy price: Sugar');
const bu = I.margins.buyUp.find(x => x.id === 'i1');
ok(bu && bu.was === 95 && bu.now === 105 && bu.up === 10.5 && bu.suggest === 133 && bu.pctWas === 26.3, 'B6 PP Bag cost went up 95 → 105 on a vendor bill: suggest ₹133 to keep the earlier 26% margin');
// items
ok(I.items.abc[0] === 'i1' && I.items.abc.indexOf('i3') < 0, 'C1 the few items that make most of the sales (PP Bag first)');
ok(I.items.rising.some(x => x.id === 'i1'), 'C2 PP Bag is rising (last 30 days vs the 30 before)');
ok(I.items.unsold.items.some(x => x.id === 'i5') && !I.items.unsold.items.some(x => x.id === 'i1'), 'C3 Old Tray: not sold in 180 days');
ok(I.items.noBuy === 1 && I.items.noCat === 1 && I.items.total === 7, 'C4 counts: items without a buy price or a group');
// restock
const rs = I.restock.items.find(x => x.id === 'i1');
ok(rs && rs.bought === 10 && rs.sold > 0 && rs.on === dayAgo(5) && rs.vendor === 'Mahaveer' && rs.abc, 'C5 restock: 10 kg came in 5 days ago from Mahaveer; ' + (rs && rs.sold) + ' kg sold since (estimate)');
ok(rs && ['out', 'soon'].includes(rs.st) && I.restock.byVendor.some(v => v.vendor === 'Mahaveer' && v.items.some(x => x.id === 'i1')), 'C6 …running low, listed under its vendor (an order list)');
ok(I.vendors.cheaper.some(x => x.id === 'i1' && x.best === 'Sharma' && x.usual === 'Mahaveer' && x.diff === 9.5), 'C7 PP Bag was 9.5% cheaper from Sharma');
// credit
ok(I.credit.total === 700 && I.credit.buckets[0] === 200 && I.credit.buckets[1] === 500, 'D1 credit ₹700: ₹200 under 30 days, ₹500 31–60 days old');
ok(I.credit.remind.some(c => c.name === 'Sunil Traders' && c.oldest === 45) && !I.credit.remind.some(c => c.name === 'Asha'), 'D2 remind Sunil (45 days), not Asha (5 days)');
ok(I.credit.lost.some(c => c.name === 'Ravi Stores' && c.bills === 3), 'D3 Ravi Stores: a regular who stopped coming');
ok(I.credit.given30 === 200 && I.money.modes30.UPI === 390 && I.money.modes30.Cash === 230, 'D4 credit given in 30 days ₹200; money in by UPI / cash');
// vendors, staff
ok(I.vendors.owed === 1000 && I.vendors.overdue === 1000 && I.vendors.flagged === 1 && I.vendors.list[0].name === 'Mahaveer', 'E1 vendors: ₹1,000 owed to Mahaveer, overdue; 1 bill flagged by the check');
const raju = I.staff.find(x => x.name === 'Raju'); ok(raju && raju.cancelled === 1 && raju.bills === 10, 'E2 staff: Raju 10 bills, 1 cancelled');
// day by day for the charts (v49)
const S = I.series, last = S.sales.length - 1, sum = (A, k) => A.slice(A.length - k).reduce((t, x) => t + x, 0);
ok(S.from === dayAgo(89) && S.sales.length === 90 && S.sales[last] === 620 && S.bills[last] === 2, 'H1 90 days, one value a day; today ₹620 in 2 bills');
ok(Math.abs(sum(S.sales, 30) - I.pulse.d30.sales) < 0.01 && sum(S.bills, 30) === I.pulse.d30.bills, 'H2 the last 30 days add up to the 30-day figure (cancelled bill left out)');
ok(Math.abs(sum(S.pSale, 30) - sum(S.pCost, 30) - I.pulse.d30.profit) < 0.01, 'H3 profit per day adds up too');
ok(S.due[0] === 200 && S.due[last] === 700 && S.due[last] === I.credit.total && S.got[last - 10] === 200 && S.given[last - 45] === 500, 'H4 owed by customers: ₹200 from an old bill at the start, ₹500 given 45 days ago, ₹200 paid 10 days ago, ₹700 today (= the Credit total)');
ok(I.vendors.sched.length === 5 && I.vendors.sched[0] === 1000 && I.vendors.sched.reduce((t, x) => t + x, 0) === I.vendors.owed, 'H5 vendor payments by when they fall due (₹1,000 overdue)');
ok(I.money.modesToday.UPI === 390 && I.money.modesToday.Cash === 230 && Object.keys(I.money.modesToday).length === 2, 'H6 money in today by method (for the daily summary): UPI ₹390, cash ₹230');
// do this today
const kinds = I.todo.map(x => x.k);
ok(I.todo.length <= 5 && kinds.includes('raise') && kinds.includes('remind') && kinds.includes('payVendor'), 'F1 do this today: ' + kinds.join(', '));
ok(I.todo.every((x, i) => !i || x.score <= I.todo[i - 1].score) && Object.values(kinds.reduce((m, k) => (m[k] = (m[k] || 0) + 1, m), {})).every(v => v <= 2), 'F2 biggest money first, at most 2 of a kind');
// caching, access, no new tabs
R('RC_HIT_=false'); R('insights_({tz:-330})'); ok(R('RC_HIT_') === true, 'G1 asked again with nothing changed: from the saved reply');
R('bumpB_(false, "x"); RC_HIT_=false'); R('insights_({tz:-330})'); ok(R('RC_HIT_') === false, 'G2 after a bill changes: worked out fresh');
R("saveUser_({name:'Owner',pin:'826413',role:'owner'}); saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
ok(post({ action: 'insights', pin: '5273' }).error === 'not_allowed' && post({ action: 'insights', pin: '826413', tz: -330 }).ok === true, 'G3 owner only (staff: not allowed)');
delete sheets.Purchases; delete sheets.Vendors; delete sheets.VendorLedger; R("CacheService.getScriptCache().remove('rc:ins:live:-330')");
R('bumpB_(false, "y")'); const I2 = R('insights_({tz:-330})');
ok(I2.ok && !sheets.Purchases && !sheets.Vendors && !sheets.VendorLedger && I2.restock.items.length === 0, 'G4 a shop without vendors or purchases: works, and no tabs are added to its sheet');
