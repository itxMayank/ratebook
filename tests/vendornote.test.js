/* A vendor's private note (15 Oct 2026, script v56): saved with the vendor, kept when an older app copy edits without it, and
   never on the vendor's own link. Run: node tests/vendornote.test.js */
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
const g = gas([path.join(__dirname, '..', 'Code.gs')]); g.SS = SS; const R = g.R;
R(`ss_ = () => SS; ENV_='live'; vbump_=()=>{}; notice_=()=>{};`);
const one = x => R(`vSaveVendor_(${JSON.stringify(x)}, 'Mayank')`).vendor;
const v = one({ id: 'vA', name: 'Mahaveer', mobile: '9876543210', note: 'Call before 11 am' });
ok(v.note === 'Call before 11 am' && v.mobile === '9876543210', 'N1 the note is saved with the vendor and comes back to the phones');
const v2 = one({ id: 'vA', name: 'Mahaveer Enterprises', mobile: '9876543210' });
ok(v2.name === 'Mahaveer Enterprises' && v2.note === 'Call before 11 am', 'N2 an edit from an older app copy (no note sent) keeps the note');
ok(one({ id: 'vA', name: 'Mahaveer Enterprises', note: '' }).note === '', 'N3 clearing it in the form clears it');
one({ id: 'vA', name: 'Mahaveer Enterprises', mobile: '9876543210', note: 'Pays late' });
const tok = R(`vLink_('vA', true, false)`).token, pub = R(`vPub_(${JSON.stringify(tok)})`);
ok(pub.ok && !JSON.stringify(pub).includes('Pays late'), 'N4 the vendor\'s link never carries the note');
