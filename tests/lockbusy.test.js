/* "Lock timeout" (16 Oct 2026, script v58). Seen on the dashboard: setMyPin, verify, listUsers, listSessions, getAccess,
   backupInfo, notices and vSync all failing with "Lock timeout: another process was holding the lock for too long" right
   after a script update; phones showed "Couldn't save. Check your connection". Here another request holds the lock the whole
   time: pure reads still answer, writes reply "busy" (nothing done) instead of a raw error, and the price-history start no
   longer holds the lock while it reads bills. Run: node tests/lockbusy.test.js */
const path = require('path'), { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R;
R(`ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; bumpB_=()=>{};
   readConfig_=()=>({}); backupInfo_=()=>({backup:{auto:true}}); report_=()=>({T:{sales:1}}); var HELD=false, WAITS=[];
   LockService={getScriptLock:()=>({tryLock:ms=>{WAITS.push(['try',ms]); return !HELD;}, waitLock:ms=>{WAITS.push(['wait',ms]); if(HELD) throw new Error('Lock timeout: another process was holding the lock for too long.');}, releaseLock:()=>{}})};`);
const post = b => JSON.parse(R(`doPost({postData:{contents:${JSON.stringify(JSON.stringify(b))}}}).text`));
R("saveUser_({name:'Mayank',pin:'749163',role:'owner'})");
const tok = R("sessNew_(auth_({pin:'749163',by:'Mayank',dev:'p'}),{dev:'p'})").tok;
R('HELD=true');   // a long request holds the lock from here on
for (const a of ['verify', 'listUsers', 'listSessions', 'getAccess', 'backupInfo', 'report'])
  ok(post({ action: a, tok, shop: 'main' }).ok === true, `A ${a}: answers while the lock is held (a read doesn't wait for it)`);
const w = post({ action: 'setMyPin', tok, oldPin: '749163', newPin: '583917', shop: 'main' });
ok(w.ok === false && w.error === 'busy', 'B1 a write while the lock is held: "busy" (the app tries again), not a raw lock error');
ok(R("auth_({pin:'749163',by:'Mayank'}).name") === 'Mayank', 'B2 …and nothing was changed');
ok(R("WAITS.filter(x=>x[0]==='wait').every(x=>x[1]>=25000)"), 'B3 a write waits up to 25 s for the lock');
R('HELD=false');
ok(post({ action: 'setMyPin', tok, oldPin: '749163', newPin: '583917', shop: 'main' }).ok === true, 'B4 once the lock is free, the same request works');
/* C. price-history start: no script lock while reading bills */
R(`HELD=true; WAITS=[]; var READ=0; phBackfill_=()=>{ READ++; return 0; };`);
R('phEnsure_()');
ok(R('READ') === 1 && R("PropertiesService.getScriptProperties().getProperty('PH_BF')") !== null && R("WAITS.length") === 0, 'C1 the start from past bills runs without waiting for the lock');
R(`PropertiesService.getScriptProperties().deleteProperty('PH_BF'); phBackfill_=()=>{ READ++; throw new Error('too slow'); };`);
R('phEnsure_()'); R('phEnsure_()'); R('phEnsure_()');
ok(R('READ') === 2, 'C2 after a failure it isn\'t tried again on every request (once an hour at most)');
