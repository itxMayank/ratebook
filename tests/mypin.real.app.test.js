/* Change my PIN end to end against the real Code.gs (16 Oct 2026). Reported: "Cannot save new PIN. It says check your
   connection" after the v57 update. The phone signs in through the sign-in screen, then Settings → Just for you → Change my
   PIN, with the real script answering. Run: node tests/mypin.real.app.test.js */
const path = require('path'), { gas } = require('./gas-mock'), { appHtml, launch, ok, done } = require('./browser');
const g = gas([path.join(__dirname, '..', 'Code.gs')]), R = g.R;
R(`ensureEnv_=()=>{}; dedupeOnce_=()=>{}; stripFyPrefixOnce_=()=>{}; ensureTriggers_=()=>{}; shopPaused_=()=>false; bumpB_=()=>{}; editTrigger_=()=>{};
   listCached_=()=>({ok:true, rev:'1', sv:SCRIPT_VERSION, items:[{id:'i1',name:'PP Bag',unit:'pc',buy:10,sell:12}], config:{shopName:'Pushpadant Plastics', mode:'live', nextBill:5, units:[{code:'pc'}], defaultUnit:'pc'}});`);
R("saveUser_({name:'Mayank Binayake',pin:'749163',role:'owner'})");
{ const U = JSON.parse(g.props.USERS); U[0].h = R("hashPin_('1994')"); g.props.USERS = JSON.stringify(U); }   // a 4-digit owner PIN from before the 6–8 digit rule
const html = appHtml('S,openSettings');
(async () => {
  const b = await launch(); const errs = [], replies = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(); let txt;
    try { txt = q.method() === 'POST' ? R(`doPost({postData:{contents:${JSON.stringify(q.postData())}}}).text`) : R(`doGet({parameter:${JSON.stringify(Object.fromEntries(new URL(q.url()).searchParams))}}).text`); }
    catch (e) { txt = JSON.stringify({ ok: false, error: 'mock:' + e.message }); }
    if (q.method() === 'POST') { const a = JSON.parse(q.postData()).action; if (a === 'setMyPin') replies.push(txt); if (process.env.DBG) console.log('POST', a, txt.slice(0,160)); } else if (process.env.DBG) console.log('GET', q.url().slice(-40), txt.slice(0,120));
    r.fulfill({ contentType: 'application/json', body: txt }); });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500);
  await p.fill('#al-name', 'Mayank Binayake'); await p.fill('#al-pin', '1994'); await p.click('#al-go'); await p.waitForTimeout(1500);
  for (const k of ['#al-bn']) if (await p.$(k)) await p.click(k);
  await p.waitForTimeout(500);
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('locked'))), 'A1 signed in with the old 4-digit PIN (real script)');
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(400); await p.click('details[data-cg="me"] summary'); await p.waitForTimeout(300);
  ok(await p.isVisible('#cf-mpopen'), 'A2 Change my PIN is there (script v57)');
  await p.click('#cf-mpopen'); await p.fill('#cf-mp0', '1994'); await p.fill('#cf-mp1', '583917'); await p.fill('#cf-mp2', '583917'); await p.click('#cf-mpsave'); await p.waitForTimeout(1500);
  ok(replies.some(x => /"ok":true/.test(x)) && R("auth_({pin:'583917',by:'Mayank Binayake'}).name") === 'Mayank Binayake', 'A3 saved on the real script: the new PIN signs in');
  /* B. the same person changes their own PIN from Settings → People (before v58 that signed this device out too, and the app said
     "Couldn't save. Check your connection") */
  const lap = R("sessNew_(auth_({pin:'583917',by:'Mayank Binayake',dev:'lap'}),{dl:'Laptop'}).tok"); g.LAP = lap;
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(800); await p.click('details[data-cg="ppl"] summary'); await p.waitForTimeout(800);
  await p.click('#ppl-body [data-ppl]'); await p.waitForTimeout(500);
  await p.fill('#pp-pin', '640297'); await p.click('#pp-save'); await p.waitForTimeout(2000);
  const toastTxt = await p.textContent('#toast').catch(() => '');
  ok(R("auth_({pin:'640297',by:'Mayank Binayake'}).name") === 'Mayank Binayake', 'B1 the new PIN is saved');
  ok(!(await p.evaluate(() => document.documentElement.classList.contains('locked'))) && !/connection/i.test(toastTxt) && !/connection/i.test(await p.evaluate(() => document.body.innerText)), 'B2 this phone stays signed in, no "check your connection" (' + toastTxt + ')');
  ok(R("auth_({tok:LAP}).error") === 'bad_session', 'B3 the laptop is signed out (it asks for the new PIN)');
  await p.evaluate(() => { T.closeSheet && T.closeSheet(); }); await p.evaluate(() => { const L = window.T; }); 
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
