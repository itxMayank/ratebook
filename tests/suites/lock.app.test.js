const { chromium } = require('../browser').pw;
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8').replace('boot();\n})();\n</script>', 'boot();\nwindow.T={S,LOCK,lockAway,appLock,apiPost0,flushBills:typeof flushBills!=="undefined"?flushBills:null};\n})();\n</script>');
const people = { '1111': { name: 'Sanjay', role: 'staff' }, '2222': { name: 'Dad', role: 'manager' } };
let tokens = {}, bodies = [], offline = false, n = 0;
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
(async () => {
  const b = await chromium.launch({ executablePath: require('../browser').exe });
  async function phone(auth) {
    const ctx = await b.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await p.route('https://rb.test/**', r => r.request().url().endsWith('index.html') ? r.fulfill({ body: html, contentType: 'text/html' }) : r.fulfill({ status: 404, body: '' }));
    await p.route('https://script.google.com/**', async r => {
      if (offline) return r.abort();
      const req = r.request(), u = new URL(req.url()); const send = o => r.fulfill({ body: JSON.stringify(o), contentType: 'application/json' });
      if (req.method() === 'GET') { const a = u.searchParams.get('action');
        if (a === 'rev') return send({ ok: true, rev: '1', bl: '0', bt: '0', vl: '0', vt: '0' });
        if (a === 'list') return send({ ok: true, items: [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 100, sell: 120 }], config: { shopName: 'Gupta Plastics', mode: 'live' }, rev: '1', sv: 34 }); return send({ ok: true }); }
      const body = JSON.parse(req.postData()); bodies.push(body);
      const me = body.tok ? tokens[body.tok] : people[body.pin];
      if (!me) return send({ ok: false, error: body.tok ? 'bad_session' : 'bad_pin' });
      if (body.action === 'verify') { const res = { ok: true, me: { name: me.name, role: me.role, personal: true, prefs: {}, testOk: true } };
        if (body.wantTok && !body.tok) { const t = 'tok' + (++n); tokens[t] = me; res.tok = t; } return send(res); }
      return send({ ok: true });
    });
    if (auth) await p.addInitScript(a => { if (!sessionStorage.getItem('x')) { localStorage.setItem('rb_auth', JSON.stringify(a)); sessionStorage.setItem('x', 1); } }, auth);
    await p.goto('https://rb.test/index.html'); await p.waitForTimeout(1800); return p;
  }
  const locked = p => p.evaluate(() => document.documentElement.classList.contains('locked') && !document.querySelector('#applock').hidden);
  const contentHidden = p => p.evaluate(() => getComputedStyle(document.querySelector('header,#app,main') || document.body.children[0]).visibility === 'hidden');
  const type = async (p, pin) => { for (const d of pin) await p.click(`#al-pad [data-k="${d}"]`); await p.waitForTimeout(600); };
  const typeOK = async (p, pin) => { for (const d of pin) await p.click(`#al-pad [data-k="${d}"]`); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(700); };
  const auth = p => p.evaluate(() => JSON.parse(localStorage.getItem('rb_auth')));

  // A. a phone signed in the old way (PIN kept) opens: locked, then switched to a token in the background
  const sanjay = await phone({ pin: '1111', by: 'Sanjay', role: 'staff' });
  ok(await locked(sanjay), 'A1 fresh open is locked');
  ok(await contentHidden(sanjay), 'A2 nothing of the app is visible behind the lock');
  ok(await sanjay.evaluate(() => document.querySelector('.al-shop').textContent) === 'Gupta Plastics', 'A3 lock screen shows the shop name');
  const a1 = await auth(sanjay); ok(a1.tok && !a1.pin && a1.pinH && a1.pinS && a1.pinLen === 4, 'A4 old phone moved to a token; PIN no longer stored (only a PBKDF2 check)');
  // B. wrong PIN, then right PIN
  await typeOK(sanjay, '9999'); ok(await locked(sanjay) && /Wrong PIN/.test(await sanjay.textContent('#al-err')), 'B1 wrong PIN refused with a message');
  await type(sanjay, '1111'); ok(!(await locked(sanjay)), 'B2 right PIN opens the app');
  bodies = []; await sanjay.evaluate(() => T.apiPost0({ action: 'listDues' })); ok(bodies[0].tok === a1.tok && !('pin' in bodies[0]) , 'B3 requests carry the token, not the PIN');
  // C. away from the app
  const away = async (p, ms) => p.evaluate(ms => { localStorage.setItem('rb_bgAt', Date.now() - ms); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); T.lockAway(); }, ms);
  await away(sanjay, 2 * 60000); ok(!(await locked(sanjay)), 'C1 back within 5 min (e.g. from WhatsApp): still open');
  await sanjay.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); T.lockAway(); });
  ok(await sanjay.evaluate(() => document.documentElement.classList.contains('cover')), 'C2 screen covered while in the background (app switcher)');
  await away(sanjay, 6 * 60000); ok(await locked(sanjay), 'C3 back after 6 min: locked');
  // G. offline unlock
  offline = true; await type(sanjay, '1111'); ok(!(await locked(sanjay)), 'G1 PIN unlock works offline'); offline = false;
  // D. a new phone signs in
  const dad = await phone(null);
  ok(await dad.evaluate(() => !!document.querySelector('#al-f')), 'D1 new phone: sign-in form, nothing else');
  await dad.fill('#al-name', 'x'); await dad.fill('#al-pin', '2222'); await dad.click('#al-go'); await dad.waitForTimeout(900);
  const a2 = await auth(dad); ok(!(await locked(dad)) && a2.tok && !a2.pin && a2.by === 'Dad', 'D2 signed in: token kept, PIN not stored, name from personal PIN');
  // E. owner signs Dad's phone out remotely
  delete tokens[a2.tok]; await dad.evaluate(() => T.apiPost0({ action: 'listDues' }).catch(() => {})); await dad.waitForTimeout(300);
  ok(await locked(dad) && /signed out/i.test(await dad.textContent('#al-err')) && !(await auth(dad)), 'E1 signed out remotely: back to sign-in, token forgotten');
  // F. too many wrong PINs on the lock screen signs the phone out
  await sanjay.evaluate(() => T.appLock());
  for (let i = 0; i < 10; i++) { await sanjay.evaluate(() => { T.LOCK.fails.until = 0; }); await typeOK(sanjay, '0000'); }
  ok(await sanjay.evaluate(() => !!document.querySelector('#al-f')) && !(await auth(sanjay)), 'F1 ten wrong PINs: phone signed out');
  ok(bodies.some(x => x.action === 'signOut'), 'F2 …and the token ended on the sheet');
  // H. reload = fresh open = locked again
  await dad.fill('#al-pin', '2222'); await dad.click('#al-go'); await dad.waitForTimeout(900); await dad.reload(); await dad.waitForTimeout(1500);
  ok(await locked(dad) && await dad.evaluate(() => !!document.querySelector('#al-pad')), 'H1 reopening the app asks for the PIN again');
  await b.close();
})();
