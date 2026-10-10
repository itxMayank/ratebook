/* Vendor notifications (server): written when a vendor / bill / payment is added, a bill is cleared, an entry removed, the bill
   check flags issues, or vendors move from test; read state per person; resends don't notify twice. Run: node tests/notices.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function mkSheet(name) { const rows = []; const sh = { name, rows,
  getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; } }),
  appendRow: row => rows.push(row.map(cell)), deleteRows: (start, n) => rows.splice(start - 1, n), deleteRow: r => rows.splice(r - 1, 1), setFrozenRows() {} };
  return sh; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')], { props: { VD_FOLDER_live: 'FL', VD_FOLDER_test: 'FT' },
  DriveApp: { getFolderById: id => ({ getId: () => id, isTrashed: () => false }), getFileById: f => ({ moveTo() {} }) } });
g.SS = SS; g.R('ss_ = () => SS');
const R = g.R;
const list = (name, env) => R(`ENV_='${env || 'live'}'; notices_({name:'${name}'})`);
R(`ENV_='live'`);
const nv0 = R(`nrevC_('live')`);
R(`ENV_='live'; vSaveVendor_({id:'vA', name:'Mahaveer', mobile:'9876543210', creditDays:15, opening:0}, 'Mayank')`);
let L = list('Sanjay');
ok(L.list.length === 1 && L.list[0].kind === 'vendor' && L.list[0].vname === 'Mahaveer' && L.list[0].by === 'Mayank' && !L.list[0].read, 'new vendor: one notice, unread for Sanjay');
ok(list('Mayank').list[0].read === true, 'the person who did it has it as read');
ok(R(`nrevC_('live')`) !== nv0 && L.nrev === R(`nrevC_('live')`), 'notices version bumped (phones learn of it from the rev check)');
R(`ENV_='live'; vSaveVendor_({id:'vA', name:'Mahaveer Ent', mobile:'9876543210', creditDays:15}, 'Mayank')`);
ok(list('Sanjay').list.length === 1, 'editing the vendor: no new notice');
R(`ENV_='live'; vSave_({id:'e1', vendorId:'vA', type:'bill', date:'2026-10-02', amount:1180, billNo:'M-77'}, 'Sanjay')`);
L = list('Mayank');
ok(L.list[0].kind === 'bill' && L.list[0].amount === 1180 && L.list[0].billNo === 'M-77' && L.list[0].extra.due === '2026-10-17', 'bill added: amount, bill no., due date (+15 days)');
R(`ENV_='live'; vSave_({id:'e1', vendorId:'vA', type:'bill', date:'2026-10-02', amount:1180, billNo:'M-77'}, 'Sanjay')`);
ok(list('Mayank').list.length === 2, 'the same bill sent again (offline resend): no second notice');
R(`ENV_='live'; vSave_({id:'p1', vendorId:'vA', type:'pay', date:'2026-10-05', amount:500, mode:'UPI', alloc:{e1:500}}, 'Sanjay')`);
L = list('Mayank');
ok(L.list.length === 3 && L.list[0].kind === 'pay' && L.list[0].extra.mode === 'UPI' && L.list[0].extra.bills.join() === 'M-77', 'part payment: pay notice with mode and the bill it covers, no "paid" yet');
R(`ENV_='live'; vSave_({id:'p2', vendorId:'vA', type:'pay', date:'2026-10-06', amount:680, mode:'Cash', alloc:{e1:680}}, 'Sanjay')`);
L = list('Mayank');
const kinds = L.list.map(n => n.kind);
ok(kinds.slice(0, 2).sort().join() === 'paid,pay' && L.list.find(n => n.kind === 'paid').billNo === 'M-77' && L.list.find(n => n.kind === 'paid').amount === 1180, 'payment that clears the bill: pay + "bill M-77 fully paid"');
R(`ENV_='live'; vRemove_('p2', true, 'Sanjay')`);
L = list('Mayank');
ok(L.list[0].kind === 'rm' && L.list[0].extra.type === 'pay' && L.list[0].amount === 680, 'removing an entry: rm notice');
const n1 = L.list.length; R(`ENV_='live'; vRemove_('p2', true, 'Sanjay')`); ok(list('Mayank').list.length === n1, 'removing it again: nothing new');
R(`ENV_='live'; const A=vAll_(); const r=A.L.rows.find(o=>o.id==='e1'); vCheckNote_({vendorId:'vA', id:'e1', amount:1180, billNo:'M-77', check:JSON.stringify({st:'issues', issues:[{t:'total'},{t:'line'}]})}, 'ok', {name:'Mahaveer Ent'}, 'Mayank')`);
L = list('Sanjay');
ok(L.list[0].kind === 'check' && L.list[0].extra.n === 2, 'bill check finds issues: check notice with the count');
R(`ENV_='live'; vCheckNote_({vendorId:'vA', id:'e1', check:JSON.stringify({st:'issues', issues:[{t:'total'}]})}, 'issues', {name:'x'}, 'Mayank')`);
ok(list('Sanjay').list.length === L.list.length, 'still the same issues on a re-check: no repeat');
// read state
const ids = list('Sanjay').list.filter(n => !n.read).map(n => n.id);
R(`ENV_='live'; noticeRead_({name:'Sanjay'}, ${JSON.stringify(ids.slice(0, 1))})`);
ok(list('Sanjay').list.filter(n => !n.read).length === ids.length - 1, 'marking one as read');
R(`ENV_='live'; noticeRead_({name:'sanjay'}, null)`);
ok(list('Sanjay').list.every(n => n.read) && list('Ravi').list.some(n => !n.read), 'mark all read: only for that person (names match regardless of case)');
// test mode is separate; the move notifies in real mode
R(`ENV_='test'; vSaveVendor_({id:'vT', name:'Test vendor'}, 'Mayank')`);
ok(list('Ravi', 'test').list.length === 1 && !list('Ravi').list.some(n => n.vname === 'Test vendor'), 'test-mode notices stay in test mode');
R(`vToLive_(['vT'], 'Mayank')`);
L = list('Ravi');
ok(L.list[0].kind === 'move' && L.list[0].extra.n === 1 && L.list[0].extra.names[0] === 'Test vendor', 'moving vendors from test: one real-mode notice');
// kinds off in prefs, permissions, trimming
ok(JSON.stringify(R(`prefsClean_({noff:['pay','bogus','rm']})`).noff) === '["pay","rm"]', 'per-person "off" kinds are kept, unknown ones dropped');
ok(R(`NEEDS.notices`) === 'manager' && R(`NEEDS.noticeRead`) === 'manager', 'owner and managers only');
R(`ENV_='live'; for (let i=0;i<620;i++) notice_('vendor', {vname:'v'+i, by:'x'})`);
const cnt = R(`ENV_='live'; sheet_(tab_('Notices'), NOTE_COLS).getLastRow()-1`);
ok(cnt <= 600 && cnt >= 500, 'old notices trimmed (' + cnt + ' kept)');
ok(list('Ravi').list.length === 100 && list('Ravi').list[0].vname === 'v619', 'the list returns the newest 100, newest first');
let threw = false; try { R(`ss_ = () => { throw new Error('x') }; notice_('vendor', {})`); } catch (e) { threw = true; } ok(!threw, 'a failing notice never breaks the save');
