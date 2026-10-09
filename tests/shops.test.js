/* Several shops from one app: the original shop is untouched, shops are kept apart on a phone, staff phones stay in their
   shop, queued bills only go to their own shop, new phones wait for approval. Run: node tests/shops.test.js */
const { appHtml, launch, ok, done, MAIN_API, DIR } = require('./browser');
const SH = 'SHARMA-AB12CD34EF', SH_API = 'https://script.google.com/macros/s/SHARMA/exec', OT = 'OTHER-ZZ99YY88XX';
const html = appHtml();
const people = { main: { '9999': { name: 'Mayank', role: 'owner', personal: true } }, [SH]: { '5555': { name: 'Sharma ji', role: 'owner', personal: true }, '1111': { name: 'Raju', role: 'staff', personal: true } } };
const state = { approve: false, pend: {}, toks: {}, log: [], n: 0, wrongShop: false };
const items = shop => [{ id: 'i1', name: shop === 'main' ? 'PP Bag (main)' : 'Steel Glass (sharma)', unit: 'pc', buy: 1, sell: 2 }];
(async () => {
  const b = await launch();
  async function phone(init) {
    const ctx = await b.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://dir.test/**', r => { const u = new URL(r.request().url()), c = u.searchParams.get('code'); state.log.push('DIR ' + c);
      const send = o => r.fulfill({ body: JSON.stringify(o), contentType: 'application/json' });
      if (c === SH) return send({ ok: true, code: SH, api: SH_API, name: 'Sharma Traders', status: 'live' });
      if (c === OT) return send({ ok: true, code: OT, api: 'https://script.google.com/macros/s/OTHER/exec', name: 'Other', status: 'live' });
      if (c === 'NEWSHOP-ABC') return send({ ok: false, error: 'not_ready' });
      return send({ ok: false, error: 'bad_code' }); });
    await ctx.route('https://script.google.com/**', r => {
      const req = r.request(), u = new URL(req.url()), shop = u.pathname.includes('/SHARMA/') ? SH : u.pathname.includes('/OTHER/') ? OT : 'main';
      const send = o => r.fulfill({ body: JSON.stringify({ shop: state.wrongShop && shop === SH ? 'X' : shop, ...o }), contentType: 'application/json' });
      if (req.method() === 'GET') { const a = u.searchParams.get('action'); state.log.push(shop + ' GET ' + a);
        if (a === 'rev') return send({ ok: true, rev: '1', bl: '0', bt: '0', vl: '0', vt: '0' });
        return send({ ok: true, rev: '1', items: items(shop), config: { shopName: shop === 'main' ? 'Gupta Plastics' : 'Sharma Traders', mode: 'live' }, sv: 35 }); }
      const bd = JSON.parse(req.postData()); state.log.push(shop + ' POST ' + bd.action + ' shop=' + bd.shop + (bd.bill ? ' bill=' + bd.bill.id : ''));
      if (bd.shop && bd.shop !== shop) return send({ ok: false, error: 'wrong_shop' });
      let me = bd.tok ? state.toks[bd.tok] : (people[shop] || {})[bd.pin];
      if (!me) return send({ ok: false, error: bd.tok ? 'bad_session' : 'bad_pin' });
      if (bd.tok && state.pend[bd.tok]) return send({ ok: false, error: 'pending' });
      if (bd.action === 'takeBill') return state.blockSH && shop === SH ? r.fulfill({ status: 500, body: 'down' }) : send({ ok: true, n: bd.n });
      if (bd.action === 'boot') return send({ ok: true, rev: '1', items: items(shop), config: { shopName: shop === 'main' ? 'Gupta Plastics' : 'Sharma Traders', mode: 'live' }, sv: 35, me: { ...me, prefs: {} } });
      if (bd.action === 'verify') { const res = { ok: true, me: { ...me, prefs: {} } };
        if (bd.wantTok && !bd.tok) { const t = shop + '-tok' + (++state.n); state.toks[t] = { ...me, shop }; res.tok = t; if (state.approve && me.role !== 'owner') { state.pend[t] = 1; res.pending = true; } }
        return send(res); }
      return send({ ok: true }); });
    if (init) await p.addInitScript(i => { if (!sessionStorage.done) { for (const k in i) localStorage.setItem(k, i[k]); sessionStorage.done = 1; } }, init);
    return p;
  }
  const keys = p => p.evaluate(() => Object.keys(localStorage).sort());
  const locked = p => p.evaluate(() => document.documentElement.classList.contains('locked'));
  const signIn = async (p, pin, name) => { if (name) await p.fill('#al-name', name); await p.fill('#al-pin', pin); await p.click('#al-go'); await p.waitForTimeout(900);
    if (await p.$('#al-bn')) { await p.click('#al-bn'); await p.waitForTimeout(300); } };

  // 1. The original shop's phone: nothing changes
  state.toks['main-old'] = { ...people.main['9999'], shop: 'main' };
  const mine = await phone({ rb_auth: JSON.stringify({ tok: 'main-old', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' }) });
  state.log = []; await mine.goto('https://rb.test/'); await mine.waitForTimeout(1500); await mine.evaluate(() => T.appUnlock());
  ok(state.log.some(l => l === 'main POST boot shop=main') && !state.log.some(l => l.includes('GET list')), '1a main shop starts with one request (boot) to its usual link');
  ok((await keys(mine)).every(k => !k.includes(':')) && (await keys(mine)).includes('rb_auth'), '1b main shop storage keys unchanged (no prefix)');
  ok(await mine.evaluate(() => T.S.items[0].name) === 'PP Bag (main)', '1c main price list shown');
  ok(await mine.evaluate(() => indexedDB.databases().then(d => d.map(x => x.name).join(','))).then(n => n.includes('ratebook') && !n.includes('ratebook_')), '1d main shop phone database name unchanged');

  // 1e. A link to a shop that isn't set up yet: clear message, the code asked for (not this shop's name), ready to retry
  const fresh = await phone(null);
  await fresh.goto('https://rb.test/?shop=NEWSHOP-ABC'); await fresh.waitForTimeout(2000);
  const fe = await fresh.textContent('#al-err'), fh = await fresh.textContent('.al-shop');
  ok(/isn't ready yet/.test(fe) && fh.includes('NEWSHOP-ABC') && !fh.includes('Gupta') && await fresh.inputValue('#al-scode') === 'NEWSHOP-ABC', '1e shop not set up yet: says so, shows its code (not the original shop), code ready to retry');

  // 2. A new phone opens the Sharma shop link, staff signs in, waits for approval
  state.approve = true;
  const raju = await phone(null); state.log = [];
  await raju.goto('https://rb.test/?shop=' + SH); await raju.waitForTimeout(2200);
  ok(await raju.evaluate(() => !location.search && JSON.parse(localStorage.rb_shop || 'null')?.code) === SH, '2a shop link resolved by the Directory, saved, address bar cleaned');
  ok(await raju.textContent('.al-shop') === 'Sharma Traders' || (await raju.textContent('.al-shop')) === 'Rate Book', '2b sign-in screen for that shop');
  await signIn(raju, '1111');
  ok(await raju.evaluate(() => !!document.querySelector('#al-pchk')) && await locked(raju), '2c staff on a new phone waits for the owner\'s approval (nothing opens)');
  Object.keys(state.pend).forEach(k => delete state.pend[k]);
  await raju.click('#al-pchk'); await raju.waitForTimeout(1200);
  ok(!(await locked(raju)), '2d after approval: the app opens');
  ok(await raju.evaluate(() => T.S.items[0] && T.S.items[0].name) === 'Steel Glass (sharma)', '2e Sharma price list, not the main one');
  const rk = await keys(raju); ok(rk.includes(SH + ':rb_auth') && !rk.includes('rb_auth'), '2f this shop\'s data is stored under its own prefix');
  ok(state.log.filter(l => l.includes('shop=' + SH)).every(l => l.startsWith(SH)) && state.log.filter(l => l.startsWith(SH)).every(l => !l.includes(' POST ') || l.includes('shop=' + SH)), '2g every request went to the Sharma script, tagged with its code');

  // 3. Staff phone opened with another shop's link: stays
  await raju.goto('https://rb.test/?shop=' + OT); await raju.waitForTimeout(1800);
  ok(await raju.evaluate(() => JSON.parse(localStorage.rb_shop).code) === SH && /belongs to/.test(await raju.textContent('#al-err')), '3a staff phone ignores another shop\'s link, with a message');
  ok(!state.log.includes('DIR ' + OT), '3b …without even asking the Directory');

  // 4. Owner (main) supports Sharma: opens it from the lock screen, signs in, both shops kept apart
  await mine.evaluate(() => T.appLock()); await mine.waitForTimeout(200);
  await mine.click('#al-shopq'); await mine.fill('#al-scode', SH); await mine.click('#al-sgo'); await mine.waitForTimeout(1800);
  ok(await mine.evaluate(() => JSON.parse(localStorage.rb_shop || 'null')?.code) === SH && !!(await mine.$('#al-f')), '4a owner can open another shop\'s sign-in from the lock screen');
  ok(await mine.evaluate(() => !!localStorage.rb_auth), '4b …and stays signed in to their own shop');
  await signIn(mine, '5555');
  ok(!(await locked(mine)) && await mine.evaluate(() => T.S.items[0].name) === 'Steel Glass (sharma)', '4c owner signed in to Sharma (owners never wait)');
  // queue a bill in Sharma while offline
  state.blockSH = true;   // Sharma's sheet unreachable for bills: the bill stays queued on the phone
  await mine.evaluate(() => { T.S.billQ.push({ id: 'bill-sharma-1', n: 1, env: 'live', total: 10, lines: [] }); localStorage.setItem(JSON.parse(localStorage.rb_shop).code + ':rb_billq', JSON.stringify(T.S.billQ)); });
  await mine.evaluate(() => T.flushBills()); await mine.waitForTimeout(400);
  ok(await mine.evaluate(() => T.S.billQ.length) === 1, '4c2 Sharma bill waiting in the queue (its sheet unreachable)');
  // switch back to main
  await mine.evaluate(() => T.appLock()); await mine.waitForTimeout(200);
  ok(!!(await mine.$('[data-shopgo="main"]')), '4d "Switch shop" appears (signed in to both)');
  state.log = []; await mine.click('[data-shopgo="main"]'); await mine.waitForTimeout(2000); await mine.evaluate(() => T.appUnlock());
  ok(await mine.evaluate(() => T.S.items[0].name) === 'PP Bag (main)' && await mine.evaluate(() => T.S.billQ.length) === 0, '4e back in main: main data, and Sharma\'s queued bill is not here');
  await mine.evaluate(() => T.flushBills()); await mine.waitForTimeout(500);
  ok(!state.log.some(l => l.includes('bill-sharma-1')), '4f main never sends Sharma\'s bill');
  state.blockSH = false;
  await mine.evaluate(() => T.appLock()); await mine.click('[data-shopgo="' + SH + '"]'); await mine.waitForTimeout(2200); await mine.evaluate(() => T.appUnlock()); await mine.evaluate(() => T.flushBills()); await mine.waitForTimeout(800);
  ok(state.log.some(l => l.startsWith(SH + ' POST takeBill') && l.includes('bill-sharma-1') && l.includes('shop=' + SH)) && !state.log.some(l => l.startsWith('main') && l.includes('bill-sharma-1')), '4g back in Sharma: its queued bill is sent to Sharma only');

  // 5. A reply from the wrong shop is never applied
  state.wrongShop = true; await mine.evaluate(() => { T.S.items = []; }); await mine.evaluate(() => T.sync().catch(() => {})); await mine.waitForTimeout(800);
  ok(await mine.evaluate(() => T.S.items.length) === 0, '5a a reply claiming to be another shop is ignored'); state.wrongShop = false;
  await b.close(); done();
})();
