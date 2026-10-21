/* A real shop for app tests (21 Oct 2026): the real Code.gs over an in-memory Google Sheet, with as little replaced as possible
   (only what needs Google itself: which spreadsheet, timed jobs, the Directory, Drive). Requests from the simulated phone go
   through doPost / doGet exactly as on Apps Script, so the app and the sheet script are tested together.
   Use: const shop = realShop(); await shop.route(ctx); … shop.rows('Bills') … */
const path = require('path'), { gas } = require('./gas-mock');
const cell = x => typeof x === 'string' && x.startsWith("'") ? x.slice(1) : x;
function realShop(o = {}) {
  const sheets = {};
  function mkSheet(name) { const rows = []; const sh = { name, rows, getName: () => name, getLastRow: () => rows.length, getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    getRange: (r, c, n = 1, m = 1) => ({ _s: sh, r, c, n, m,
      getValues: () => Array.from({ length: n }, (_, i) => Array.from({ length: m }, (_, j) => ((rows[r - 1 + i] || [])[c - 1 + j] ?? ''))),
      setValues: v => { v.forEach((row, i) => { rows[r - 1 + i] = rows[r - 1 + i] || []; row.forEach((x, j) => rows[r - 1 + i][c - 1 + j] = cell(x)); }); return { setFontWeight() { return this; } }; },
      copyTo: d => { for (let i = 0; i < n; i++) { const src = rows[r - 1 + i] || []; d._s.rows[d.r - 1 + i] = d._s.rows[d.r - 1 + i] || []; for (let j = 0; j < m; j++) d._s.rows[d.r - 1 + i][d.c - 1 + j] = src[c - 1 + j] ?? ''; } },
      setFontWeight() { return this; }, setValue: x => { rows[r - 1] = rows[r - 1] || []; rows[r - 1][c - 1] = cell(x); }, setNumberFormat() { return this; } }),
    appendRow: row => rows.push(row.map(cell)), deleteRow: i => rows.splice(i - 1, 1), deleteRows: (s, k) => rows.splice(s - 1, k), setFrozenRows() {}, insertRowsAfter() {} }; return sh; }
  const SS = { getId: () => 'sheet1', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mkSheet(n)), getSheets: () => Object.values(sheets) };
  const g = gas([path.join(__dirname, '..', 'Code.gs')], { props: o.props || {} }), R = g.R; g.SS = SS;
  R(`ss_ = () => SS; ensureTriggers_ = () => {}; editTrigger_ = () => {}; shopPaused_ = () => false;`);
  const shop = {
    g, R, sheets,
    rows: name => (sheets[name] ? sheets[name].rows.slice(1) : []),
    col: (name, k) => { const s = sheets[name]; if (!s) return () => ''; const i = s.rows[0].indexOf(k); return r => r[i]; },
    seen: [], hold: 0, lose: null,
    /** Send this context's script requests to the real script. QUIET actions aren't held back by `hold` (ms). */
    async route(ctx, QUIET = new Set(['rev', 'list', 'boot', 'verify'])) {
      await ctx.route('https://script.google.com/**', async r => { const q = r.request(); let txt, a = '';
        try { if (q.method() === 'POST') a = JSON.parse(q.postData()).action || ''; } catch {}
        if (shop.hold && a && !QUIET.has(a)) await new Promise(res => setTimeout(res, shop.hold));
        try { txt = q.method() === 'POST' ? R(`doPost({postData:{contents:${JSON.stringify(q.postData())}}}).text`)
          : R(`doGet({parameter:${JSON.stringify(Object.fromEntries(new URL(q.url()).searchParams))}}).text`); }
        catch (e) { txt = JSON.stringify({ ok: false, error: 'mock:' + e.message }); }
        if (a) shop.seen.push(a);
        if (a && a === shop.lose) { shop.lose = null; return r.abort(); }
        r.fulfill({ contentType: 'application/json', body: txt }); }); },
  };
  return shop;
}
module.exports = { realShop };
