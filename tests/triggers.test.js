/* Timed jobs of a shop's script (21 Oct 2026, v66): once the sheet's own edit trigger is there (it catches every hand edit),
   the fallback check watchSheet runs hourly instead of every 5 / 15 minutes, since every shop's timed jobs count against one
   Google account's daily limit. Without the edit trigger it stays as it was. Run: node tests/triggers.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
function mk(editFails) {
  const T = []; let n = 0;
  const ScriptApp = { getProjectTriggers: () => T.slice(), deleteTrigger: t => { const i = T.indexOf(t); if (i >= 0) T.splice(i, 1); },
    newTrigger: fn => { const t = { id: ++n, fn, getHandlerFunction: () => fn }; const b = { timeBased: () => b, everyMinutes: m => (t.min = m, b), everyHours: h => (t.min = h * 60, b),
      forSpreadsheet: () => b, onEdit: () => { if (editFails) throw new Error('needs permission'); t.edit = true; return b; }, create: () => (T.push(t), t) }; return b; } };
  const g = gas([path.join(__dirname, '..', 'Code.gs')], { ScriptApp }); g.R("ss_ = () => ({ getId: () => 'sheet1' })"); g.T = T; return g; }
// an old shop: watchSheet every 5 minutes, no edit trigger yet
let g = mk(false); g.R("ScriptApp.newTrigger('watchSheet').timeBased().everyMinutes(5).create()");
g.R('ensureTriggers_()');
const ws = g.T.filter(t => t.fn === 'watchSheet');
ok(g.T.some(t => t.fn === 'onSheetEdit') && ws.length === 1 && ws[0].min === 60, 'A1 the edit trigger is added and watchSheet moves from every 5 minutes to hourly (288 runs a day → 24)');
g.R("CacheService.getScriptCache().remove('TRIG_OK')"); g.R('ensureTriggers_()');
ok(g.T.filter(t => t.fn === 'watchSheet').length === 1 && g.T.filter(t => t.fn === 'onSheetEdit').length === 1, 'A2 run again: nothing doubled');
// the edit trigger can't be added (permission not given yet): watchSheet keeps its quick check
g = mk(true); g.R('ensureTriggers_()');
const w2 = g.T.filter(t => t.fn === 'watchSheet');
ok(w2.length === 1 && w2[0].min === 5 && JSON.parse(g.cache.ERRS || '[]').some(e => e[0] === 'soft:editTrigger'), 'A3 without the edit trigger: watchSheet still every 5 minutes (hand edits still noticed), and the reason is in the error log');
