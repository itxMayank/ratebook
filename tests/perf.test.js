/* Speed history for the admin dashboard (Code.gs v47, 13 Oct 2026): every timed request is queued in the short-term cache and moved
   in batches into one script property per day (PERFD_yyyy-MM-dd, 14 days kept): count, failures, served from the saved reply,
   "cold" (first request after 10+ quiet minutes), time buckets. Phones send their own timings (whole wait and the script's part)
   with perfIn about once an hour. health with full=1 returns the 14 days and the size of the main tabs. Run: node tests/perf.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R;
R(`ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; readConfig_=()=>({mode:'live'});`);
const today = new Date().toISOString().slice(0, 10), day = () => JSON.parse(g.props['PERFD_' + today] || '{}');
const req = (a, ms, extra) => R(`ACT_=${JSON.stringify(a)}; T0_=Date.now()-${ms}; RC_HIT_=${extra && extra.hit ? 'true' : 'false'}; out_(${JSON.stringify(extra && extra.fail ? { ok: false, error: 'boom' } : { ok: true })})`);

// A. script timings
for (let i = 0; i < 20; i++) req('listBills', 1200);
ok(!g.props['PERFD_' + today] && JSON.parse(g.cache.PERFQ).length === 20, 'A1 timings wait in the short-term cache (no property write per request)');
for (let i = 0; i < 19; i++) req('list', 200, { hit: true });
req('list', 9000, { fail: true });
const d1 = day(), lb = d1.a && d1.a.listBills, li = d1.a && d1.a.list;
ok(lb && lb[0] === 20 && lb[6 + 3] === 20 && !g.cache.PERFQ, 'A2 at 40 queued they move into the day summary: 20 Past bills reads in the 1–1.5 s bucket');
ok(li && li[0] === 20 && li[1] === 1 && li[2] === 19 && li[6 + 0] === 19 && li[6 + 7] === 1, 'A3 price list: 19 served from the saved reply, 1 failed and took over 7 s');
// cold start: first request after 10+ quiet minutes
g.cache.lastReq = String(Date.now() - 20 * 60000); req('takeBill', 5000); g.cache.lastReq = String(Date.now()); req('takeBill', 1000);
R('perfRoll_()'); const tb = day().a.takeBill;
ok(tb && tb[0] === 2 && tb[3] === 1 && tb[4] >= 5000 && tb[5] >= 1000 && tb[5] < 2000, 'A4 first request after a quiet spell is marked cold, with its time kept apart');
req('rev', 50); ok(!(day().a.rev) && !(JSON.parse(g.cache.PERFQ || '[]').some(r => r[0] === 'rev')), 'A5 the 25-second check is not timed (but keeps the script "warm")');

// B. phones' timings (perfIn, signed in)
R("saveUser_({name:'Raju',pin:'5273',role:'staff'})");
const tok = R("sessNew_(auth_({pin:'5273',dev:'phoneR'}),{dev:'phoneR'})").tok;
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
const now = Date.now(), rows = [['listBills', 3000, 1200, now - 1000], ['listBills', 2600, 1000, now - 900], ['takeBill', 800, null, now - 800], ['bad', -5, 1, now], ['x', 100, 1, now - 40 * 864e5]];
const pi = post({ action: 'perfIn', tok, rows, dl: 'Android · Chrome · app' });
const p = day().p, l = day().l;
ok(pi.ok && p.listBills && p.listBills[0] === 2 && p.listBills[1] === 2200 && p.listBills[2] === 5600 && p.listBills[3 + 5] === 2 && p.listBills[11 + 4] === 2, 'B1 phone timings: whole wait (2.5–4 s) and the part outside the script (1.5–2.5 s) per action');
ok(p.takeBill && p.takeBill[0] === 1 && !p.bad && !p.x, 'B2 bad rows and rows older than 15 days are left out');
ok(l['Android · Chrome · app'] && l['Android · Chrome · app'][0] === 3, 'B3 counted per phone type');
ok(post({ action: 'perfIn', rows }).ok === false, 'B4 not signed in: refused');
ok(!day().a.perfIn, 'B5 sending timings is not itself timed');
ok(pi.rev === undefined || String(pi.rev) === String(R('getRev_()')), 'B6 doesn\'t change the price-list version');

// C. 14 days kept, health full
g.props['PERFD_2020-01-01'] = '{"a":{"list":[1,0,0,0,0,0,1,0,0,0,0,0,0,0]}}'; g.props.PERFD_LAST = '2020-01-01';
req('list', 100); R('perfRoll_()');
ok(!g.props['PERFD_2020-01-01'], 'C1 days older than 14 are removed');
g.props.HEALTH_KEY = 'hk';
R(`ss_=()=>({getSheets:()=>[], getSheetByName:n=>{ const sh=r=>({getLastRow:()=>r, getLastColumn:()=>3, getRange:()=>({getValues:()=>[]})}); return ({Bills:sh(8001), Items:sh(121)})[n]||null; }})`);
const h = R("health_('hk', true)"), hs = R("health_('hk')");
ok(h.ok && Array.isArray(h.perfDays) && h.perfDays.length === 1 && h.perfDays[0].d === today && h.perfDays[0].a.listBills[0] === 20, 'C2 health (full): the days of speed history');
ok(h.rows && h.rows.Bills === 8000 && h.rows.Items === 120, 'C3 …and how big the main tabs are');
ok(hs.ok && hs.perfDays === undefined && hs.rows === undefined, 'C4 the dashboard\'s every-minute check stays small');
// a big day is trimmed to stay under the 9 KB property limit
const big = { a: {}, p: {}, l: {} }; for (let i = 0; i < 300; i++) big.a['act' + i] = [i + 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1];
const yd = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
R(`perfPut_(PropertiesService.getScriptProperties(), '${yd}', ${JSON.stringify(big)})`);
ok(g.props['PERFD_' + yd].length < 9000 && JSON.parse(g.props['PERFD_' + yd]).a.act299 && !JSON.parse(g.props['PERFD_' + yd]).a.act0, 'C5 a very busy day is trimmed to the busiest actions, under Google\'s 9 KB limit');
