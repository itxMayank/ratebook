const { chromium } = require('../browser').pw;
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8').replace('boot();\n})();\n</script>', 'boot();\nwindow.T={S,LOCK,appLock,apiPost0};\n})();\n</script>');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
let tokens = {}, n = 0, bodies = [], offline = false;
(async () => {
  const b = await chromium.launch({ executablePath: require('../browser').exe });
  const p = await (await b.newContext()).newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await p.route('https://script.google.com/**', r => { if (offline) return r.abort(); const q = r.request(); const send = o => r.fulfill({ body: JSON.stringify(o), contentType: 'application/json' });
    if (q.method() === 'GET') return send({ ok: true, rev: '1', bl: '0', bt: '0', items: [], config: { shopName: 'Gupta Plastics', mode: 'live' }, sv: 34 });
    const bd = JSON.parse(q.postData()); bodies.push(bd);
    let me = null; if (bd.tok) me = tokens[bd.tok]; else if (bd.pin === '9999') me = { name: bd.by, role: 'owner', personal: false }; else if (bd.pin === '123456') me = { name: 'Mayank', role: 'owner', personal: true };
    if (!me) return send({ ok: false, error: bd.tok ? 'bad_session' : 'bad_pin' });
    if (bd.action === 'signOut') { delete tokens[bd.tok]; return send({ ok: true }); }
    const res = { ok: true, me: { ...me, prefs: {}, testOk: true } }; if (bd.wantTok && !bd.tok) { const t = 't' + (++n); tokens[t] = me; res.tok = t; } return send(res); });
  // the phone was unlocked with the shop PIN before the update
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ pin: '9999', by: 'Mayank', role: 'owner' })); sessionStorage.x = 1; } });
  await p.goto('https://rb.test/index.html'); await p.waitForTimeout(1800);
  const a0 = await p.evaluate(() => JSON.parse(localStorage.rb_auth)); ok(a0.tok && a0.personal === false, 'start: phone switched over to a shop-PIN sign-in (what you saw)');
  const locked = () => p.evaluate(() => document.documentElement.classList.contains('locked'));
  const key = async s => { for (const d of s) await p.click(`#al-pad [data-k="${d}"]`); await p.waitForTimeout(500); };
  await key('123456'); ok(await locked(), 'own 6-digit PIN: not cut off at 4 digits, waits for OK');
  await key('k'.replace('k', '')); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(1200);
  const a1 = await p.evaluate(() => JSON.parse(localStorage.rb_auth));
  ok(!(await locked()) && a1.personal === true && a1.by === 'Mayank' && a1.tok !== a0.tok, 'own PIN + OK: opens, phone now signed in as Mayank personally');
  ok(bodies.some(x => x.action === 'signOut' && x.tok === a0.tok) && !tokens[a0.tok], 'old shop-PIN sign-in ended on the sheet');
  await p.evaluate(() => T.appLock()); await key('123456'); ok(!(await locked()), 'next time: own PIN opens by itself at 6 digits (offline check)');
  await p.evaluate(() => T.appLock()); await key('0000'); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(800);
  ok(await locked() && /Wrong PIN/.test(await p.textContent('#al-err')), 'a wrong PIN + OK is still refused and counted');
  offline = true; await p.evaluate(() => { T.LOCK.fails = { n: 0, until: 0 }; T.appLock(); }); await key('9999'); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(600);
  ok(await locked(), 'offline: another PIN can\'t switch people (needs the sheet)'); offline = false;
  await key('9999'); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(1000);
  const a2 = await p.evaluate(() => JSON.parse(localStorage.rb_auth)); ok(!(await locked()) && a2.personal === false && a2.by === 'Mayank', 'online: the shop PIN still works (as owner, name kept)');
  await b.close();
})();
