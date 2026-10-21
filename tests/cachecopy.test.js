/* The cache is only a faster copy (Code.gs v67): next bill numbers, who sees buy rates, change counters and sign-ins always come
   back from script properties / the Config tab when Google empties the cache, a failed cache write never leaves an old value
   behind, and a hand edit of the Config tab is picked up at once. Run: node tests/cachecopy.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const sheets = {};
function mkSheet(name) { const rows = []; return { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
  getRange: (r, c, n = 1, m = 1) => ({ getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
    setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = x); }); return { setFontWeight() { return this; } }; },
    setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = x; } }),
  appendRow: row => rows.push(row), setFrozenRows() {} }; }
const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
const g = gas([path.join(__dirname, '..', 'Code.gs')]); const R = g.R; g.SS = SS;
R(`ss_ = () => SS; ensureEnv_=()=>{}; dedupeOnce_=()=>{}; shopPaused_=()=>false;`);
sheets.Config = mkSheet('Config'); sheets.Config.rows.push(['key', 'value'], ['nextBill', 41], ['nextGstBill', 7], ['buyView', 'owner']);
const rev = () => JSON.parse(R(`doGet({parameter:{action:'rev'}}).text`));
R('readConfig_()');
ok(rev().nb && rev().nb.nextBill === 41, 'A1 the 25-second check carries the next bill number (41)');
Object.keys(g.cache).forEach(k => delete g.cache[k]);   // Google empties the cache
ok(rev().nb && rev().nb.nextBill === 41 && rev().nb.nextGstBill === 7, 'A2 cache emptied: the next numbers still come back (read from the Config tab), not missing');
ok(R('buyView_()') === 'owner', 'A3 cache emptied: who sees buy rates is still "owner only"');
sheets.Config.rows[1][1] = 55;   // typed in the sheet by hand
R(`onSheetEdit({range:{getSheet:()=>({getName:()=>'Config'}), getRow:()=>2, getNumRows:()=>1, getNumColumns:()=>1}})`);
ok(rev().nb.nextBill === 55, 'B1 next bill number typed in the Config tab by hand: phones get 55 at once (before: the old cached 41 for up to 6 hours)');
/* a cache write that fails must not leave the old value there */
R(`bump_()`); const r1 = rev().rev;
R(`(function(){ const C = CacheService.getScriptCache(), put = C.put; C.put = (k, v, s) => { if (k === 'rev') throw new Error('cache full'); return put(k, v, s); }; })()`);
{ const t0 = Date.now(); while (Date.now() < t0 + 3); } R(`bump_()`); const p = g.props.rev;
ok(rev().rev === p && p !== r1, 'C1 a failed cache write: the 25-second check still gives the new change counter (phones reload), not the old one');
R(`(function(){ const C = CacheService.getScriptCache(), put = C.put; C.put = (k, v, s) => { if (/^brev_/.test(k)) throw new Error('cache full'); return put(k, v, s); }; })()`);
R(`ENV_='live'; bumpB_()`);
ok(rev().bl === g.props.brev_live, 'C2 the same for the bills version');
R(`sessEdit_(all => { all.k1 = {u:'x', n:'Raju', c:Date.now(), s:Date.now()}; })`); delete g.cache.SESS;
ok(R('Object.keys(sessAll_()).includes("k1")'), 'D1 sign-ins come back from script properties when the cache is emptied');
/* (v67) one change log: every version goes up, even two changes in the same millisecond, and each is logged once */
R(`Date.now0 = Date.now; Date.now = () => 1800000000000`);
R(`ENV_='live'; bumpB_(false, 'x1')`); const a1 = g.props.brev_live; R(`bumpB_(false, 'x2')`); const a2 = g.props.brev_live; const a3 = R(`bump_()`), a4 = R(`bump_()`);
R(`Date.now = Date.now0`);
ok(Number(a2) > Number(a1) && Number(a4) > Number(a3), 'E1 two changes in the same millisecond still get different, higher versions (before: the same, so a phone could miss the second)');
const L = R('chgLog_()');
ok(L.slice(-4).map(x => x.k).join('|') === 'brev_live|brev_live|rev|rev' && JSON.parse(R(`JSON.stringify(blog_('live').slice(-2).map(e => e.id))`)).join() === 'x1,x2', 'E2 each change is in the one change log, and the bills log still says which bill');
