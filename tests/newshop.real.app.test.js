/* A new shop's first sign-in, end to end against the real Code.gs (21 Oct 2026). Reported: opening a new shop's link in a fresh
   browser showed "Rate Book" for 8–10 s before the shop's name, and after signing in with the starting PIN the prices showed,
   then the phone signed itself out with "This shop now needs each phone to be signed in". Run: node tests/newshop.real.app.test.js */
const path = require('path'), { gas } = require('./gas-mock'), { appHtml, launch, ok, done } = require('./browser');
const CODE = 'MAHAVIRPRO-K7Q3XM9TWZ', API = 'https://script.google.com/macros/s/MAHAVIR/exec';
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R;
R(`var SHOP_BOOT={code:'${CODE}', sheetId:'s1', healthKey:'hk', initPin:'482913'};
   ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; bumpB_=()=>{}; editTrigger_=()=>{}; phEnsure_=()=>{};
   var CFG={shopName:'Mahavir Provision', mode:'test', nextBill:1, nextGstBill:1, units:[{code:'pc'}], defaultUnit:'pc', approveNew:true};
   readConfig_=()=>Object.assign({},CFG);
   listCached_=()=>({ok:true, rev:'1', sv:SCRIPT_VERSION, items:[{id:'i1',name:'Sugar',unit:'kg',buy:40,sell:44}], config:readConfig_()});`);
g.props.PIN = '482913';
const html = appHtml('S');
(async () => {
  const b = await launch(); const errs = [], log = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  const t0 = Date.now();
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://dir.test/**', async r => { const c = new URL(r.request().url()).searchParams.get('code'); log.push((Date.now() - t0) + 'ms DIR ' + c);
    await new Promise(s => setTimeout(s, +process.env.DIRMS || 1500));   // the Directory is an Apps Script too: a cold start takes seconds
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(c === CODE ? { ok: true, code: CODE, api: API, name: 'Mahavir Provision', status: 'live' } : { ok: false, error: 'bad_code' }) }); });
  await ctx.route('https://script.google.com/**', r => { const q = r.request(); let txt;
    try { txt = q.method() === 'POST' ? R(`doPost({postData:{contents:${JSON.stringify(q.postData())}}}).text`) : R(`doGet({parameter:${JSON.stringify(Object.fromEntries(new URL(q.url()).searchParams))}}).text`); }
    catch (e) { txt = JSON.stringify({ ok: false, error: 'mock:' + e.message }); }
    const bd = q.method() === 'POST' ? JSON.parse(q.postData()) : {}; const j = JSON.parse(txt);
    log.push((Date.now() - t0) + 'ms ' + q.method() + ' ' + (bd.action || new URL(q.url()).searchParams.get('action')) + (bd.tok ? ' tok' : bd.pin ? ' pin' : '') + ' → ' + (j.ok ? 'ok' + (j.tok ? ' +tok' : '') : j.error));
    r.fulfill({ contentType: 'application/json', body: txt }); });
  await p.goto('https://rb.test/?shop=' + CODE + '&n=' + encodeURIComponent('Mahavir Provision')); await p.waitForTimeout(400);
  const early = await p.evaluate(() => ({ txt: document.querySelector('#applock').innerText, form: !!document.querySelector('#al-f') }));
  ok(/Mahavir Provision/.test(early.txt) && /Opening the shop/.test(early.txt) && !early.form && !/Rate Book/.test(early.txt), 'A0 while the shop is looked up: its name from the link and "Opening the shop…", no sign-in form to the wrong shop');
  await p.waitForTimeout(+process.env.WAIT || 3500);
  const shown = await p.evaluate(() => document.querySelector('#applock') && document.querySelector('#applock').innerText);
  ok(/Mahavir Provision/.test(shown || '') && await p.$('#al-f'), 'A1 then the shop\'s sign-in, with its name');
  await p.fill('#al-name', 'Suresh Binayake'); await p.fill('#al-pin', '482913'); const tS = Date.now(); await p.click('#al-go');
  await p.waitForFunction(() => !document.documentElement.classList.contains('locked') || document.querySelector('#al-bn'), null, { timeout: 15000 });
  const atOpen = await p.evaluate(() => ({ items: T.S.items.length, took: 0 }));
  ok(atOpen.items === 1, 'A1b the prices are loaded before the app opens (' + (Date.now() - tS) + ' ms), not 25 s later');
  await p.waitForTimeout(4000); for (const k of ['#al-bn']) if (await p.$(k)) await p.click(k); await p.waitForTimeout(+process.env.AFTER || 3000);
  const st = await p.evaluate(() => ({ locked: document.documentElement.classList.contains('locked'), auth: T.S.auth && { tok: !!T.S.auth.tok, pin: !!T.S.auth.pin, by: T.S.auth.by }, msg: (document.querySelector('#al-err') || {}).textContent }));
  if (process.env.DBG) { console.log(log.join('\n')); console.log(st); }
  ok(!st.locked && st.auth && st.auth.tok && !st.auth.pin, 'A2 signed in with the starting PIN, kept as a sign-in token (no PIN stored): ' + JSON.stringify(st));
  ok(!log.some(l => / tok → need_signin/.test(l)), 'A3 no signed-in request is refused with need_signin');
  /* B. a phone left on a bare PIN (no sign-in token) by an older app: a refusal swaps it for a sign-in quietly, no sign-out */
  await p.evaluate(() => { T.S.auth = { ...T.S.auth, pin: '482913' }; delete T.S.auth.tok; localStorage.setItem(Object.keys(localStorage).find(k => /rb_auth$/.test(k)), JSON.stringify(T.S.auth)); });
  await p.evaluate(() => fetch && window.T && null); await p.evaluate(() => apiPost0({ action: 'listUsers' }).catch(() => {}));
  await p.waitForTimeout(3000);
  const st2 = await p.evaluate(() => ({ locked: document.documentElement.classList.contains('locked'), tok: !!(T.S.auth && T.S.auth.tok), pin: !!(T.S.auth && T.S.auth.pin) }));
  ok(!st2.locked && st2.tok && !st2.pin, 'B1 a bare-PIN phone refused with "needs sign-in" gets a sign-in quietly and stays open: ' + JSON.stringify(st2));
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
