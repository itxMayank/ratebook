/* Sign-in and lock screen end to end (added with the lock.js split, 11 Oct 2026). Covers what tests/suites/lock.app, bio and
   switch don't: the sign-in screen (EN | हि keeps what was typed, a shop PIN needs a name, the request sent), Tools → Lock now,
   the wrong-PIN wait from the 5th try (even the right PIN waits), typing the PIN on a keyboard, "Not X? Switch person", a new
   phone waiting for the owner's approval (Check again, then it opens), and who-am-I at start (a role changed by the owner, the
   shop code picked up, a phone signed out elsewhere). Any page error fails. Run: node tests/signin.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appLock,appUnlock,lockAway');
const people = { '2222': { name: 'Dad', role: 'manager', personal: true }, '1234': { name: '', role: 'owner', personal: false }, '3333': { name: 'Raju', role: 'staff', personal: true } };
let tokens = {}, sent = [], n = 0, pend = {}, roleNow = {}, gone = {};
(async () => {
  const b = await launch(); const errs = [];
  async function phone(auth) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    p.on('dialog', d => d.accept());
    await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 5, units: [{ code: 'kg', hi: 'किलो' }], defaultUnit: 'kg' };
      if (req.method() === 'GET') return send({ rev: '1', items: [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 100, sell: 120 }], config: cfg, sv: 60 });
      const bd = JSON.parse(req.postData()); sent.push(bd);
      const who = bd.tok ? tokens[bd.tok] : people[bd.pin];
      if (bd.tok && gone[bd.tok]) return send({ ok: false, error: 'bad_session' });
      if (!who) return send({ ok: false, error: bd.tok ? 'bad_session' : 'bad_pin' });
      if (bd.tok && pend[bd.tok]) return send({ ok: false, error: 'pending' });
      const me = { name: who.name, role: roleNow[who.name] || who.role, personal: who.personal, prefs: { mode: 'live' }, testOk: true };
      if (bd.action === 'boot') return send({ rev: '1', items: [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 100, sell: 120 }], config: cfg, sv: 60, me, view: who.name === 'Dad' ? '4821' : '' });
      if (bd.action === 'verify') { const res = { me, view: who.name === 'Dad' ? '4821' : '' }; if (bd.wantTok && !bd.tok) { const t = 'tok' + (++n); tokens[t] = who; res.tok = t; if (who.name === 'Raju') { pend[t] = 1; res.pending = true; } } return send(res); }
      return send({});
    });
    if (auth) await p.addInitScript(a => { if (!sessionStorage.getItem('x')) { localStorage.setItem('rb_auth', JSON.stringify(a)); sessionStorage.setItem('x', 1); } }, auth);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1500); return p;
  }
  const locked = p => p.evaluate(() => document.documentElement.classList.contains('locked') && !document.querySelector('#applock').hidden);
  const auth = p => p.evaluate(() => JSON.parse(localStorage.getItem('rb_auth')));
  const keys = async (p, s) => { for (const d of s) await p.click(`#al-pad [data-k="${d}"]`); await p.waitForTimeout(700); };
  const err = p => p.evaluate(() => (document.querySelector('#al-err') || {}).textContent || '');

  // A. sign-in screen on a new phone
  const p = await phone(null);
  ok(await locked(p) && await p.$('#al-f'), 'A1 new phone: locked, sign-in form shown');
  ok(/Gupta Plastics/.test(await p.textContent('.al-shop')), 'A2 shop name on the sign-in screen');
  await p.fill('#al-name', 'Dadi'); await p.fill('#al-pin', '22');
  await p.click('[data-al-lang="hi"]'); await p.waitForTimeout(200);
  ok(/साइन इन/.test(await p.textContent('#applock')) && await p.inputValue('#al-name') === 'Dadi' && await p.inputValue('#al-pin') === '22', 'A3 हि: screen redrawn in Hindi, typed name and PIN kept');
  await p.click('[data-al-lang="en"]'); await p.waitForTimeout(200);
  ok(/Sign in/.test(await p.textContent('#applock')) && (await p.evaluate(() => localStorage.rb_lang)) === '"en"', 'A4 back to English, choice kept on the phone');
  sent = []; await p.click('#al-go'); await p.waitForTimeout(300);
  ok(!sent.length && await locked(p), 'A5 a PIN under 4 digits is not sent');
  await p.fill('#al-name', ''); await p.fill('#al-pin', '1234'); await p.click('#al-go'); await p.waitForTimeout(700);
  ok(await locked(p) && /Enter your name/.test(await err(p)) && !(await auth(p)), 'A6 shop PIN without a name: asks for the name, not signed in');
  /* Seen 14 Oct 2026: a laptop showing "Mayank" signed in as Dad when an old PIN (now Dad's own) was typed. This mock, like a
     script before v51, ignores the name, so the phone itself must refuse and end the token it was given. */
  sent = []; await p.fill('#al-name', 'Mayank'); await p.fill('#al-pin', '2222'); await p.click('#al-go'); await p.waitForTimeout(1500);
  const tk0 = (sent.find(x => x.action === 'verify') || {}).pin && 'tok' + n;
  ok(await locked(p) && !(await auth(p)) && /Wrong PIN/.test(await err(p)) && sent.some(x => x.action === 'signOut' && x.tok === tk0), 'A7a Dad\'s PIN typed with the name Mayank: wrong PIN, not signed in as Dad, the token given is ended');
  sent = []; await p.fill('#al-name', 'dad'); await p.fill('#al-pin', '2222'); await p.click('#al-go'); await p.waitForTimeout(1500);
  const v = sent.find(x => x.action === 'verify'), a1 = await auth(p);
  ok(v && v.wantTok && v.pin === '2222' && /Chrome/.test(v.dl || ''), 'A7 sign-in asks for a token with a phone label');
  ok(!(await locked(p)) && a1.by === 'Dad' && a1.role === 'manager' && a1.tok && !a1.pin && a1.pinLen === 4 && a1.pinH, 'A8 signed in as Dad (his name, any case): token + check value, no PIN kept');
  ok((await p.evaluate(() => localStorage.rb_name)) === '"Dad"' && (await p.evaluate(() => localStorage.rb_view)) === '"4821"', 'A9 name remembered; shop code from the sign-in reply kept');

  // B. Lock now, wrong PINs and the wait
  await p.evaluate(() => { document.querySelector('#tab-tools').click(); }); await p.waitForTimeout(200);
  await p.click('#t-unlock'); await p.waitForTimeout(300);
  ok(await locked(p) && /Namaste, Dad/.test(await p.textContent('#applock')) && await p.$('#al-pad'), 'B1 Tools → Lock now: lock screen for Dad with the keypad');
  ok(await p.evaluate(() => [...document.body.children].filter(c => c.id !== 'applock' && c.id !== 'toast' && c.id !== 'updpill').every(c => c.hasAttribute('inert'))), 'B2 everything behind the lock is inert');
  ok(await p.evaluate(() => document.querySelectorAll('#al-dots i').length) === 4, 'B3 four dots for a 4-digit PIN');
  for (let i = 0; i < 4; i++) { await keys(p, '9999'); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(500); }
  ok(/Wrong PIN\. 6 more/.test(await err(p)), 'B4 four wrong PINs: "6 more tries"');
  await keys(p, '9999'); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(500);
  ok(/Try again in 3\d s/.test(await err(p)), 'B5 fifth wrong PIN: a 30 s wait');
  await keys(p, '2222'); await p.click('#al-pad [data-k="ok"]'); await p.waitForTimeout(500);
  ok(await locked(p) && /Try again in/.test(await err(p)), 'B6 during the wait even the right PIN waits');
  ok((await p.evaluate(() => JSON.parse(localStorage.rb_lockfail))).n === 5, 'B7 wrong tries kept on the phone (survive a reopen)');
  await p.evaluate(() => { T.LOCK.fails.until = 0; }); await p.click('#al-pad [data-k="del"]'); await p.click('#al-pad [data-k="del"]'); await p.click('#al-pad [data-k="del"]'); await p.click('#al-pad [data-k="del"]');
  await p.focus('#applock'); await p.keyboard.type('2222'); await p.waitForTimeout(1200);
  ok(!(await locked(p)), 'B8 after the wait: the right PIN typed on a keyboard opens');
  ok((await p.evaluate(() => JSON.parse(localStorage.rb_lockfail))).n === 0, 'B9 wrong-try count cleared on unlock');

  // C. Switch person
  await p.evaluate(() => T.appLock()); await p.waitForTimeout(200); sent = [];
  ok(/Not Dad\? Switch person/.test(await p.textContent('#al-other')), 'C1 "Not Dad? Switch person" on the lock screen');
  await p.click('#al-other'); await p.waitForTimeout(500);
  ok(await p.$('#al-f') && !(await auth(p)) && sent.some(x => x.action === 'signOut' && x.tok === a1.tok), 'C2 switch person: signed out here and on the sheet, sign-in shown');

  // D. new phone that needs the owner's approval
  const r = await phone(null);
  await r.fill('#al-name', 'Raju'); await r.fill('#al-pin', '3333'); await r.click('#al-go'); await r.waitForTimeout(1200);
  ok(await locked(r) && await r.$('#al-pchk') && /Waiting for approval/.test(await r.textContent('#applock')), 'D1 Raju: "Waiting for approval", nothing opens');
  ok((await auth(r)).pending === true, 'D2 the wait is remembered on the phone');
  await r.click('#al-pchk'); await r.waitForTimeout(600);
  ok(await locked(r) && (await err(r)).length > 0, 'D3 Check again while still waiting: stays locked with a message');
  pend = {}; await r.click('#al-pchk'); await r.waitForTimeout(1200);
  ok(!(await locked(r)) && !(await auth(r)).pending, 'D4 approved by the owner: Check again opens the app');

  // E. who-am-I at start
  roleNow.Raju = 'manager'; await r.reload(); await r.waitForTimeout(1800);
  ok((await auth(r)).role === 'manager', 'E1 role changed by the owner: picked up at the next start');
  await keys(r, '3333');
  ok(!(await locked(r)) && await r.evaluate(() => T.S.auth.role) === 'manager', 'E2 opens with the new role');
  const tk = (await auth(r)).tok; gone[tk] = 1; await r.reload(); await r.waitForTimeout(1800);
  ok(await locked(r) && await r.$('#al-f') && /signed out/i.test(await err(r)) && !(await auth(r)), 'E3 signed out on another phone: next start shows sign-in with the reason');

  // F. phones from before sign-in tokens kept the PIN: it must still be this person's own
  const o = await phone({ by: 'Mayank', role: 'owner', pin: '2222', personal: false });
  await o.waitForTimeout(800);
  ok(await locked(o) && await o.$('#al-f') && !(await auth(o)), 'F1 an old phone for Mayank whose PIN is now Dad\'s: signed out at start (before any PIN is typed), never Dad');
  ok(!(await o.evaluate(() => T.S.auth)), 'F2 …nothing of Dad\'s kept on the phone');

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
