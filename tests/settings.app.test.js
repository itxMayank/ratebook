/* Settings end to end (added with the settings.js split, 11 Oct 2026; before, only Settings navigation was tested): which
   cards each role sees, the per-phone display choices (text size, theme, appearance) and their card summaries, per-person
   choices (hide buy rate, test mode with its confirm), the shop-wide Save with its checks (bad bill number / GSTIN opens the
   card holding the field) and the exact config sent, adding a unit, changing the PIN, People (add with checks, the request
   sent), signed-in phones (approve, sign out), the shop code, the Bill reading key, and Backups (status, back up now, email
   check, the list, restore with a confirm). Any page error fails. Run: node tests/settings.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openSettings');
(async () => {
  const b = await launch(); const errs = []; let sent = [];
  async function phone(role) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); sent = [];
    let users = [{ id: 'u1', name: 'Raju', role: 'staff', active: true, testOk: true }];
    let sess = { sessions: [{ id: 's1', name: 'Mayank', l: 'Android · Chrome', s: Date.now(), me: true }, { id: 's2', name: 'Raju', l: 'iPhone · Safari', s: Date.now() - 6e5, pending: true }], approveNew: true };
    const bk = { auto: true, last: new Date(Date.now() - 36e5).toISOString(), count: 2, email: '', current: 'https://docs.google.com/x', list: [{ id: 'f1', name: 'Rate Book backup 2026-10-11 09:00', date: new Date(Date.now() - 36e5).toISOString(), url: 'https://docs.google.com/f1' }, { id: 'f2', name: 'Rate Book backup 2026-10-10 09:00 (before restore)', date: new Date(Date.now() - 864e5).toISOString(), url: 'https://docs.google.com/f2' }] };
    await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      const me = { name: role === 'owner' ? 'Mayank' : 'Raju', role, personal: true, prefs: { mode: 'live' } };
      const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 21, nextGstBill: 7, units: [{ code: 'kg', hi: 'किलो' }, { code: 'pc', hi: 'पीस' }], defaultUnit: 'kg', roundTo: 1, defaultGst: 18, defaultHsn: '3923', shopGstin: '', aiOn: false };
      if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 43 });
      const bd = JSON.parse(req.postData()); sent.push(bd);
      if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 43, me });
      if (bd.action === 'listUsers') return send({ users });
      if (bd.action === 'getAccess') return send({ access: { on: false, code: '' } });
      if (bd.action === 'setAccess') return send({ access: { on: bd.on, code: bd.on ? '4821' : '' } });
      if (bd.action === 'listSessions') return send(sess);
      if (bd.action === 'approveSession') { sess = { ...sess, sessions: sess.sessions.map(x => x.id === bd.id ? { ...x, pending: false } : x) }; return send(sess); }
      if (bd.action === 'endSession') { sess = { ...sess, sessions: sess.sessions.filter(x => x.id !== bd.id) }; return send(sess); }
      if (bd.action === 'saveUser') { users = users.concat({ id: 'u2', name: bd.user.name, role: bd.user.role, active: true, testOk: bd.user.testOk }); return send({ users }); }
      if (bd.action === 'setConfig') return send({ config: { ...cfg, ...bd.config } });
      if (bd.action === 'setPin') return send({});
      if (bd.action === 'setMyPrefs') return send({ prefs: { mode: 'live', ...bd.prefs }, testOk: true });
      if (bd.action === 'aiSetKey') return bd.key === 'bad' ? send({ ok: false, error: 'ai_key' }) : send({ on: true });
      if (bd.action === 'backupInfo') return send({ backups: bk });
      if (bd.action === 'backupNow') return send({ info: { backups: { ...bk, count: 3 } } });
      if (bd.action === 'setBackupEmail') return send({ backups: { ...bk, email: bd.email } });
      if (bd.action === 'restoreBackup') return send({});
      return send({ me }); });
    await p.addInitScript(r => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: r === 'owner' ? 'Mayank' : 'Raju', role: r, personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })), role);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
    const err = await p.evaluate(() => { try { T.openSettings(); return ''; } catch (e) { return e.message; } }); await p.waitForTimeout(900);
    ok(!err, role + ': Settings opens without an error' + (err ? ' (' + err + ')' : ''));
    return { p, ctx };
  }
  const cards = p => p.$$eval('details.cg', x => x.map(e => e.dataset.cg).join(','));
  const open = (p, k) => p.click(`details[data-cg="${k}"] summary`).then(() => p.waitForTimeout(200));
  const txt = (p, s) => p.textContent(s).catch(() => '');

  { const { p, ctx } = await phone('staff');
    ok(await cards(p) === 'me,look,pr', 'staff see only their own cards (Just for you, Display, Printer): ' + await cards(p));
    ok(!(await p.$('#cf-save')), 'staff have no shop-wide Save');
    await open(p, 'look'); await p.click('#cf-tsize [data-fz="1.12"]'); await p.waitForTimeout(100);
    ok(await p.evaluate(() => localStorage.rb_fz) === '1.12', 'staff can change their own text size');
    await open(p, 'me'); await p.click('#cf-hide'); await p.waitForTimeout(400);
    ok(sent.some(x => x.action === 'setMyPrefs' && x.prefs.hideBuy === true), 'staff can turn on Hide buy rate (saved with them)');
    await ctx.close(); }
  { const { p, ctx } = await phone('manager');
    ok(await cards(p) === 'me,look,pr,shop,bills,items,ai', 'managers also see the shop cards, not the owner ones: ' + await cards(p)); await ctx.close(); }

  const { p } = await phone('owner');
  ok(await cards(p) === 'me,look,pr,shop,bills,items,ai,ppl,bk,speed', 'owner sees every card: ' + await cards(p));
  ok(await p.$$eval('details.cg', x => x.every(e => !e.open)), 'all cards start closed');
  ok(/Mayank/.test(await txt(p, 'details[data-cg="me"] .cg-s')) && /Real/i.test(await txt(p, 'details[data-cg="me"] .cg-s')), 'Just for you summary: name and real billing');

  await open(p, 'look');
  await p.click('#cf-tsize [data-fz="1.25"]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--fz').trim()) === '1.25' && await p.evaluate(() => localStorage.rb_fz) === '1.25' && /Larger/i.test(await txt(p, 'details[data-cg="look"] .cg-s')), 'text size Larger: applied, kept on this phone, summary updates');
  await p.click('#cf-tsize [data-fz="1"]');
  await p.click('#cf-pal [data-pal="forest"]'); await p.click('#cf-appear [data-ap="dark"]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => document.documentElement.dataset.palette === 'forest' && document.documentElement.dataset.theme === 'dark' && JSON.parse(localStorage.rb_palette) === 'forest' && JSON.parse(localStorage.rb_appear) === 'dark'), 'theme Forest and Dark: applied and kept');
  await p.click('#cf-pal [data-pal="ink"]'); await p.click('#cf-appear [data-ap="auto"]'); await p.waitForTimeout(100);
  ok(await p.evaluate(() => !document.documentElement.dataset.palette && !document.documentElement.dataset.theme), 'back to Ink / Auto removes both');

  await open(p, 'me');
  await p.click('#cf-hide'); await p.waitForTimeout(400);
  ok(sent.some(x => x.action === 'setMyPrefs' && x.prefs.hideBuy === true), 'Hide buy rate is saved with the person (setMyPrefs)');
  await p.click('#cf-env'); await p.waitForTimeout(150);
  ok(await p.isVisible('#cf-envc') && !sent.some(x => x.action === 'setMyPrefs' && x.prefs.mode), 'Test mode asks first; nothing sent yet');
  await p.click('#cf-envy'); await p.waitForTimeout(600);
  ok(sent.some(x => x.action === 'setMyPrefs' && x.prefs.mode === 'test'), 'confirmed: test mode saved for this person');
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(700);

  await open(p, 'bills'); await p.fill('#cf-bill', '0'); await p.click('#cf-save'); await p.waitForTimeout(200);
  ok(/number/i.test(await txt(p, '#cf-err')) && !sent.some(x => x.action === 'setConfig'), 'bill number 0 is refused, nothing sent');
  await p.fill('#cf-bill', '50'); await p.evaluate(() => document.querySelector('details[data-cg="shop"]').open = false);
  await p.evaluate(() => { document.querySelector('#cf-gstin').value = '09ABC'; }); await p.click('#cf-save'); await p.waitForTimeout(200);
  ok(/GSTIN/i.test(await txt(p, '#cf-err')) && await p.$eval('details[data-cg="shop"]', e => e.open), 'a bad GSTIN is refused and its card opens to show it');
  await p.fill('#cf-gstin', '09aaacg1234k1z2'); await p.fill('#cf-shop', 'Gupta Plastics & Co');
  await open(p, 'items'); await p.fill('#cf-ucode', 'roll'); await p.fill('#cf-uhi', 'रोल'); await p.click('#cf-uadd'); await p.waitForTimeout(100);
  await p.click('#cf-save'); await p.waitForTimeout(800);
  const sc = sent.find(x => x.action === 'setConfig');
  ok(sc && sc.config.shopName === 'Gupta Plastics & Co' && sc.config.shopGstin === '09AAACG1234K1Z2', 'Save sends the shop name and the GSTIN in capitals');
  ok(sc && (sc.config.testNextBill === 50 || sc.config.nextBill === 50) && sc.config.units.some(u => u.code === 'roll' && u.hi === 'रोल'), 'Save sends the bill number for the mode in use and the new unit');
  ok(await p.evaluate(() => document.querySelector('#sheet').hidden || !document.querySelector('#cf-save')), 'Settings closes after saving');

  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(900); await open(p, 'ppl'); await p.waitForTimeout(400);
  ok(/Raju/.test(await txt(p, '#ppl-body')), 'People: the list shows Raju');
  await p.fill('#cf-p1', '5678'); await p.fill('#cf-p2', '5679'); await p.click('#cf-pin'); await p.waitForTimeout(200);
  ok(!sent.some(x => x.action === 'setPin') && (await txt(p, '#cf-perr')).length > 0, 'PIN change: two different PINs are refused');
  await p.fill('#cf-p2', '5678'); await p.click('#cf-pin'); await p.waitForTimeout(600);
  ok(sent.some(x => x.action === 'setPin' && x.newPin === '5678'), 'PIN change sent when both match');
  await p.click('#ppl-add'); await p.waitForTimeout(300); await p.fill('#pp-name', 'Sanjay'); await p.fill('#pp-pin', '12'); await p.click('#pp-save'); await p.waitForTimeout(200);
  ok(!sent.some(x => x.action === 'saveUser'), 'a 2-digit PIN for a new person is refused');
  await p.fill('#pp-pin', '2468'); await p.click('#pp-roles [data-role="manager"]'); await p.click('#pp-test'); await p.click('#pp-save'); await p.waitForTimeout(900);
  const su = sent.find(x => x.action === 'saveUser');
  ok(su && su.user.name === 'Sanjay' && su.user.pin === '2468' && su.user.role === 'manager' && su.user.testOk === false && su.user.active === true, 'new person sent: Sanjay, manager, no test mode');
  ok(await p.$('details[data-cg="ppl"][open]') && /Sanjay/.test(await txt(p, '#ppl-body')), 'back in Settings with People still open, listing Sanjay');
  await p.waitForTimeout(300);
  ok(/Raju/.test(await txt(p, '#sess-body')) && !!(await p.$('[data-sessok="s2"]')), 'Signed-in phones: Raju\'s iPhone waits for approval');
  await p.click('[data-sessok="s2"]'); await p.waitForTimeout(400);
  ok(sent.some(x => x.action === 'approveSession' && x.id === 's2') && !(await p.$('[data-sessok="s2"]')), 'Approve');
  await p.click('[data-sess="s2"]'); await p.waitForTimeout(400);
  ok(sent.some(x => x.action === 'endSession' && x.id === 's2') && !/iPhone/.test(await txt(p, '#sess-body')), 'Sign out a phone');
  await p.click('#acc-on'); await p.waitForTimeout(400);
  ok(sent.some(x => x.action === 'setAccess' && x.on === true) && /4821/.test(await txt(p, '#acc-body')) && await p.evaluate(() => localStorage.rb_view) === '"4821"', 'Shop code on: shown and kept on this phone');

  await open(p, 'ai'); await p.fill('#cf-aikey', 'bad'); await p.click('#cf-aisave'); await p.waitForTimeout(500);
  ok((await txt(p, '#cf-aierr')).length > 0, 'Bill reading: a key Google refuses shows why');

  await open(p, 'bk'); await p.waitForTimeout(500);
  ok(/2/.test(await txt(p, '#bk-body')) && !!(await p.$('#bk-see')), 'Backups: status with 2 copies');
  await p.click('#bk-now'); await p.waitForTimeout(500); ok(sent.some(x => x.action === 'backupNow') && /3/.test(await txt(p, '#bk-body')), 'Back up now');
  await p.fill('#bk-mail', 'not-an-email'); await p.click('#bk-mail-save'); await p.waitForTimeout(200);
  ok(!sent.some(x => x.action === 'setBackupEmail'), 'a bad email is refused');
  await p.fill('#bk-mail', 'mayank@example.com'); await p.click('#bk-mail-save'); await p.waitForTimeout(400);
  ok(sent.some(x => x.action === 'setBackupEmail' && x.email === 'mayank@example.com'), 'weekly email saved');
  await p.click('#bk-see'); await p.waitForTimeout(400);
  ok((await p.$$('.bk-item')).length === 2 && /before restore/i.test(await txt(p, '.bk-item:nth-child(2)')), 'backup list with the "before restore" tag');
  await p.click('[data-bkr="0"]'); await p.waitForTimeout(150);
  ok(await p.isVisible('#bkc-0') && !sent.some(x => x.action === 'restoreBackup'), 'Restore asks first');
  await p.click('[data-bky="0"]'); await p.waitForTimeout(700);
  ok(sent.some(x => x.action === 'restoreBackup' && x.id === 'f1'), 'Restore sends the chosen copy');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
