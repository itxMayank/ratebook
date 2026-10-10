/* Owner moves vendors made in test mode to real mode: vendor, all entries, bill photo rows + files, purchase rows; removed from
   test; new real-mode link token; other test vendors untouched. Run: node tests/vtolive.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const moved = [];
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;   // like Sheets: a leading ' only means "keep as text"
function mkSheet(name) { const rows = []; const sh = { name, rows,
  getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRows: (start, n) => rows.splice(start - 1, n), deleteRow: r => rows.splice(r - 1, 1), setFrozenRows() {} };
  return sh; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const folder = id => ({ getId: () => id, isTrashed: () => false });
const g = gas([path.join(__dirname, '..', 'Code.gs')], { props: { VD_FOLDER_live: 'FL', VD_FOLDER_test: 'FT' },
  DriveApp: { getFolderById: id => folder(id), getFileById: f => ({ moveTo: d => moved.push(f + '>' + d.getId()) }) } });
g.SS = SS; g.R('ss_ = () => SS');
const R = g.R;
// test-mode data: vendors A (to move) and B (stays)
R(`ENV_='test';
  const V=vtab_('Vendors',VEND_COLS); vwrite_(V.s,VEND_COLS,{id:'vA',name:'Mahaveer',mobile:'9876543210',token:'tAAAA',linkOn:'1',opening:500,openingDate:'2026-10-01',createdAt:1});
  vwrite_(V.s,VEND_COLS,{id:'vB',name:'Sharma',token:'tBBBB',createdAt:2});
  const L=vtab_('VendorLedger',VLED_COLS);
  vwrite_(L.s,VLED_COLS,{id:'e1',vendorId:'vA',type:'bill',date:'2026-10-02',amount:1180,gst:180,billNo:'M-77',photos:JSON.stringify([{f:'file1',m:'image/jpeg'}]),check:JSON.stringify({st:'ok'}),at:10});
  vwrite_(L.s,VLED_COLS,{id:'e2',vendorId:'vA',type:'pay',date:'2026-10-05',amount:700,alloc:JSON.stringify({e1:700}),mode:'UPI',noteP:'private',at:20});
  vwrite_(L.s,VLED_COLS,{id:'e3',vendorId:'vB',type:'bill',date:'2026-10-03',amount:99,at:30});
  vwrite_(vtab_('VendorDocs',VDOC_COLS).s,VDOC_COLS,{fileId:'file1',vendorId:'vA',preview:'data:x',mime:'image/jpeg',at:11});
  vwrite_(vtab_('Purchases',PUR_COLS).s,PUR_COLS,{entryId:'e1',vendorId:'vA',itemId:'i1',date:'2026-10-02',desc:'PP Bag',qty:10,unit:'kg',rate:100,f:1,buy:100,at:12,by:'M'});
  ENV_='live';`);
const before = { lv: g.props.vrev_live, tv: g.props.vrev_test };
const r = R(`vToLive_(['vA'],'Mayank')`);
ok(r.moved === 1 && r.entries === 2 && r.purchases === 1 && r.photos === 1 && r.files === 1, 'moves 1 vendor with 2 entries, 1 photo and 1 purchase row (' + JSON.stringify(r) + ')');
const live = R(`ENV_='live'; vOne_(vAll_(),'vA')`);
ok(live.vendor.name === 'Mahaveer' && live.vendor.mobile === '9876543210' && live.vendor.opening === 500 && live.entries.length === 2, 'real mode: the vendor and all its entries are there');
ok(live.calc.balance === 980 && live.entries.find(e => e.id === 'e2').noteP === 'private' && live.entries.find(e => e.id === 'e1').check.st === 'ok', 'balance, private notes and bill checks come along (opening 500 + 1180 − 700 = 980)');
ok(/^l/.test(live.vendor.token) && live.vendor.token !== 'tAAAA' && live.vendor.linkOn, 'link keeps on, with a new real-mode token');
ok(R(`ENV_='live'; vtab_('Purchases',PUR_COLS).rows.length`) === 1 && R(`ENV_='live'; vtab_('VendorDocs',VDOC_COLS).rows.length`) === 1, 'purchase history and photo rows are in real mode');
ok(moved.join() === 'file1>FL', 'the bill photo file moved to the real-mode Drive folder');
const test = R(`ENV_='test'; const A=vAll_(); ({v:A.vendors.map(x=>x.id), e:A.entries.map(x=>x.id), d:vtab_('VendorDocs',VDOC_COLS).rows.length, p:vtab_('Purchases',PUR_COLS).rows.length})`);
ok(JSON.stringify(test.v) === '["vB"]' && JSON.stringify(test.e) === '["e3"]' && test.d === 0 && test.p === 0, 'test mode: only Sharma and its bill are left (nothing exists twice)');
ok(g.props.vrev_live !== before.lv && g.props.vrev_test !== before.tv, 'both modes\' vendor versions bumped, so every phone refreshes');
const again = R(`vToLive_(['vA'],'Mayank')`);
ok(again.moved === 0, 'running it again moves nothing');
let err = ''; try { R(`vToLive_([],'M')`); } catch (e) { err = e.message; } ok(err === 'nothing_chosen', 'nothing chosen: refused');
ok(R(`NEEDS.vToLive`) === 'owner', 'owner only');
