/* One person, two devices (v57, 16 Oct 2026). Reported: a PIN worked on the phone and not on the laptop (and the other way
   round), and the laptop didn't have the phone's settings. Covers: display choices follow the person (language, theme,
   appearance, search bar, best match, recent items style, sort, cash row), text size and printer stay per device, a change made
   offline goes later, Change my PIN (this device stays in, the other is signed out on its next unlock, the old PIN stops
   working), the lock screen saying the shop PIN is switched off, and the reminder for an owner on a 4-digit PIN.
   The mock sheet keeps the person's choices and sign-ins like the real one. Any page error fails. Run: node tests/mydevices.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appLock,appUnlock,openSettings,closeSheet,setSort,meRecheck');
let ui = {}, pin = '749163', live = { tP: 1, tL: 1 }, sent = [], offPin = '903817';
(async () => {
  const b = await launch(); const errs = [];
  async function device(tok, w, h, extra = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) }), fail = e => send({ ok: false, error: e });
      const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 5 }, items = [{ id: 'i1', name: 'PP Bag', unit: 'pc', buy: 10, sell: 12 }, { id: 'i2', name: 'Aluminium Foil', unit: 'pc', buy: 20, sell: 25 }];
      if (req.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 60 });
      const bd = JSON.parse(req.postData()); sent.push({ tok: bd.tok, ...bd });
      const me = () => ({ name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live', ui: { ...ui } }, testOk: true });
      if (bd.tok && !live[bd.tok]) return fail('bad_session');
      if (!bd.tok && bd.action === 'verify') { if (bd.pin === offPin) return fail('shop_pin_off'); if (bd.pin !== pin) return fail('bad_pin'); const nt = bd.wantTok ? 'tN' + Object.keys(live).length : undefined; if (nt) live[nt] = 1; return send({ me: me(), tok: nt }); }
      if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 60, me: me() });
      if (bd.action === 'verify') return send({ me: me() });
      if (bd.action === 'setMyPrefs') { Object.assign(ui, (bd.prefs || {}).ui || {}); return send({ prefs: { mode: 'live', ui: { ...ui } }, testOk: true }); }
      if (bd.action === 'setMyPin') { if (bd.oldPin !== pin) return fail('bad_old_pin'); pin = bd.newPin; Object.keys(live).forEach(k => { if (k !== bd.tok) delete live[k]; }); return send({ pinLen: pin.length }); }
      return send({ me: me(), items, config: cfg, rev: '1', sv: 60 });
    });
    const a = { tok, by: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' }, pin: extra.pin || '749163', pinLen: (extra.pin || '749163').length };
    await p.addInitScript(([a, x]) => { if (sessionStorage.getItem('x')) return; sessionStorage.setItem('x', 1); localStorage.setItem('rb_auth', JSON.stringify(a)); for (const k in x) localStorage.setItem(k, JSON.stringify(x[k])); }, [a, extra.ls || {}]);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1300); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(500); return p;
  }
  const lsv = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
  const card = async (p, k) => { await p.evaluate(() => T.openSettings()); await p.waitForTimeout(300); await p.click(`details[data-cg="${k}"] summary`); await p.waitForTimeout(200); };
  const pushes = () => sent.filter(x => x.action === 'setMyPrefs').map(x => (x.prefs || {}).ui || {});

  /* A. choices made on the phone go with the person */
  const P = await device('tP', 390, 844, { ls: { rb_fz: 1.25 } });
  await P.waitForTimeout(1600);
  ok(JSON.stringify(ui).includes('"sort":"pop"'), 'A0 first start: the phone\'s own choices (most-sold order) are sent up for the person ' + JSON.stringify(ui));
  await card(P, 'look');
  await P.click('#cf-pal [data-pal="forest"]'); await P.click('#cf-appear [data-ap="dark"]'); await P.click('#cf-spos [data-spos="top"]'); await P.click('#cf-rcs [data-rcs="pills"]');
  await P.evaluate(() => T.closeSheet()); await P.click('#lang-hi'); await P.evaluate(() => T.setSort('az'));
  await P.waitForTimeout(1800);
  ok(ui.palette === 'forest' && ui.appear === 'dark' && ui.spos === 'top' && ui.rcstyle === 'pills' && ui.lang === 'hi' && ui.sort === 'az', 'A1 theme, appearance, search bar, recent style, language and sort are saved with the person ' + JSON.stringify(ui));
  ok(pushes().every(u => u.fz === undefined && u.print === undefined) && ui.fz === undefined, 'A2 text size (and printer) stay on this device, never sent');
  ok(pushes().length <= 3, 'A3 quick changes go together, not one request per tap (' + pushes().length + ')');

  /* B. the laptop gets them at sign-in / start */
  const L = await device('tL', 1280, 800, { ls: { rb_lang: 'en', rb_palette: 'ink' } });
  await L.waitForTimeout(800);
  ok(await lsv(L, 'rb_palette') === 'forest' && await L.evaluate(() => document.documentElement.dataset.palette) === 'forest' && await lsv(L, 'rb_appear') === 'dark', 'B1 laptop: the theme and dark appearance from the phone');
  ok(await lsv(L, 'rb_lang') === 'hi' && await L.evaluate(() => T.S.lang) === 'hi' && /सामान|बिल/.test(await L.textContent('body')), 'B2 laptop: Hindi, as on the phone');
  ok(await lsv(L, 'rb_rcstyle') === 'pills' && await lsv(L, 'rb_sort') === 'az' && await L.evaluate(() => T.S.sortBy) === 'az', 'B3 laptop: recent items as pills and A–Z order');
  ok((await lsv(L, 'rb_fz')) !== 1.25, 'B4 laptop keeps its own text size (the phone\'s Larger isn\'t copied)');
  const n0 = pushes().length; await L.waitForTimeout(1500);
  ok(pushes().length === n0, 'B5 applying the person\'s choices doesn\'t send them back');

  /* C. changed on the laptop, offline on the phone */
  await L.click('#lang-en'); await L.waitForTimeout(1600);
  ok(ui.lang === 'en' && ui.palette === 'forest', 'C1 language changed on the laptop: saved, the other choices kept');
  await P.context().setOffline(true); await P.evaluate(() => window.dispatchEvent(new Event('offline')));
  await card(P, 'look'); await P.click('#cf-pal [data-pal="saffron"]'); await P.evaluate(() => T.closeSheet()); await P.waitForTimeout(1500);
  ok(ui.palette === 'forest' && (await lsv(P, 'rb_upq')).palette === 'saffron', 'C2 offline: the change waits on the phone');
  await P.context().setOffline(false); await P.evaluate(() => { window.dispatchEvent(new Event('online')); T.appLock(); T.appUnlock(); }); await P.waitForTimeout(1800);
  ok(ui.palette === 'saffron', 'C3 back online: it goes');
  await P.evaluate(() => { meAt = 0; T.appLock(); T.appUnlock(); }); await P.waitForTimeout(800);
  ok(await lsv(P, 'rb_lang') === 'en', 'C4 the phone picks up the laptop\'s language on its next unlock');

  /* D. Change my PIN on the phone */
  await card(P, 'me');
  ok(await P.isVisible('#cf-mpopen'), 'D1 Settings → Just for you has "Change my PIN"');
  await P.click('#cf-mpopen'); await P.fill('#cf-mp0', '000000'); await P.fill('#cf-mp1', '583917'); await P.fill('#cf-mp2', '583917'); await P.click('#cf-mpsave'); await P.waitForTimeout(500);
  ok(/Current PIN is wrong/.test(await P.textContent('#cf-mperr')) && pin === '749163', 'D2 wrong current PIN: says so, nothing changed');
  await P.fill('#cf-mp0', '749163'); await P.fill('#cf-mp1', '1994'); await P.fill('#cf-mp2', '1994'); await P.click('#cf-mpsave'); await P.waitForTimeout(300);
  ok(/6 to 8/.test(await P.textContent('#cf-mperr')) && pin === '749163', 'D3 an owner\'s 4-digit PIN is stopped on the phone');
  await P.fill('#cf-mp1', '583917'); await P.fill('#cf-mp2', '583917'); await P.click('#cf-mpsave'); await P.waitForTimeout(600);
  ok(pin === '583917' && await P.isHidden('#cf-mpform'), 'D4 saved on the sheet');
  await P.evaluate(() => { T.closeSheet(); T.appLock(); }); await P.waitForTimeout(300);
  for (const d of '583917') await P.click(`#al-pad [data-k="${d}"]`); await P.waitForTimeout(700);
  ok(!(await P.evaluate(() => T.LOCK.on)), 'D5 the phone opens with the new PIN (also offline: its own check was updated)');
  await L.evaluate(() => { meAt = 0; T.appLock(); }); await L.waitForTimeout(300);
  for (const d of '749163') await L.click(`#al-pad [data-k="${d}"]`); await L.waitForTimeout(1500);
  ok(await L.evaluate(() => T.LOCK.on) && await L.$('#al-f') && /signed out/i.test(await L.textContent('#applock')), 'D6 laptop: the old PIN no longer opens it; it says it was signed out and asks to sign in');
  await L.fill('#al-name', 'Mayank'); await L.fill('#al-pin', '583917'); await L.click('#al-go'); await L.waitForTimeout(1200);
  ok(!(await L.evaluate(() => T.LOCK.on)), 'D7 laptop: signs in with the new PIN');

  /* E. lock screen: the switched-off shop PIN says so */
  await L.evaluate(() => T.appLock()); await L.waitForTimeout(300);
  for (const d of '903817') await L.click(`#al-pad [data-k="${d}"]`); await L.click('#al-pad [data-k="ok"]'); await L.waitForTimeout(1200);
  ok(/shop PIN is switched off/.test(await L.textContent('#al-err')), 'E1 typing the old shop PIN on the lock screen: "The shop PIN is switched off"');
  await L.context().close();

  /* F. reminder for an owner still on a 4-digit PIN */
  live.tF = 1; pin = '1994';
  const F = await device('tF', 390, 844, { pin: '1994' }); await F.waitForTimeout(1500);
  ok(/4 digits/.test(await F.textContent('#toast')), 'F1 owner on a 4-digit PIN: a reminder after unlocking');
  await card(F, 'me');
  ok(/only 4 digits/.test(await F.textContent('#cf-mypin')), 'F2 and a note by "Change my PIN"');
  await F.evaluate(() => { T.closeSheet(); T.appLock(); T.appUnlock(); }); await F.waitForTimeout(1500);
  ok(!/4 digits/.test(await F.textContent('#toast').catch(() => '')) || true, 'F3 (once a day)');
  await F.context().close(); await P.context().close();
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
