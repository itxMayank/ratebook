/* Laptop billing from the keyboard (16 Oct 2026). Mayank: the cursor should be in the search; typing "k" showed recent items
   that didn't match; results should be a list like on phones; ↑ ↓ to choose, Enter to add and back to the search; Settings
   should say which choices are for phones only. Phones must not change. Any page error fails. Run: node tests/deskkeys.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,openSettings,closeSheet');
const names = ['Kirana 500 G Kunj', 'Kirana 250 G Kunj', '300 Ml Glass', '55 ML 100 piece', 'Kitchen Towel', 'PP Bag 12x18', 'Paper Cup 150ml', 'Aluminium Foil 9m', 'Kaju Box 1kg', 'Silver Container 450ml'];
const items = names.map((n, i) => ({ id: 'i' + i, name: n, unit: 'pc', buy: 10 + i, sell: 14 + i }));
let sent = [];
(async () => {
  const b = await launch(); const errs = [];
  async function dev(w, h, touch) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: !!touch, hasTouch: !!touch }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const bd = r.request().method() === 'POST' ? JSON.parse(r.request().postData()) : {}; sent.push(bd);
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'Pushpadant Plastics', mode: 'live', nextBill: 5 }, sv: 57, bl: '0', bt: '0', vl: '0', vt: '0', n: 5, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } }) }); });
    await p.addInitScript(() => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); localStorage.setItem('rb_recent', JSON.stringify(['i2', 'i3', 'i1', 'i0'])); });
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400); return p;
  }
  const act = p => p.evaluate(() => document.activeElement && document.activeElement.id);
  const bill = p => p.evaluate(() => T.S.bill.map(l => l.name + ':' + l.qty).join(', '));
  const enter3 = async p => { for (let i = 0; i < 3; i++) { await p.keyboard.press('Enter'); await p.waitForTimeout(150); } await p.waitForTimeout(250); };   // Enter opens quantity & rate, Enter → rate, Enter adds (20 Oct 2026)
  const nm = (p, s) => p.$$eval(s, els => els.map(e => e.querySelector('.name').textContent.trim()));
  const L = await dev(1280, 800);

  ok(await act(L) === 'q', 'A1 the cursor is in the search box after unlocking');
  await L.keyboard.type('k'); await L.waitForTimeout(350);
  const rec = await L.$$eval('#list .rchead', hs => hs.map(h => h.textContent.trim()));
  const firstGroup = await L.evaluate(() => { const out = []; let el = document.querySelector('#list .rchead'); for (el = el && el.nextElementSibling; el && el.classList.contains('card'); el = el.nextElementSibling) out.push(el.querySelector('.name').textContent.trim()); return out; });
  ok(rec[0] === 'Recent' && JSON.stringify(firstGroup) === '["Kirana 250 G Kunj","Kirana 500 G Kunj"]', 'A2 typing "k": "Recent" has only the recent items that start with k (not 300 Ml Glass or 55 ML) ' + JSON.stringify(firstGroup));
  ok(await L.$eval('#list', l => l.classList.contains('drows') && !l.classList.contains('gridv') && getComputedStyle(l).flexDirection === 'column'), 'A3 results are one list, not cards');
  ok(/Enter/.test(await L.textContent('#meta-r .kbhint')), 'A4 a keyboard hint by the count');
  ok(await L.$eval('#list .card.kbsel .name', e => e.textContent.trim()) === 'Kirana 250 G Kunj', 'A5 the first shown result is highlighted');
  await enter3(L);
  ok(await bill(L) === 'Kirana 250 G Kunj:1' && await act(L) === 'q' && await L.inputValue('#q') === '', 'A6 Enter adds the highlighted item (the one shown first), empties the box, cursor stays');
  await L.keyboard.type('k'); await L.waitForTimeout(300); await L.keyboard.press('ArrowDown'); await L.keyboard.press('ArrowDown'); await L.waitForTimeout(150);
  const sel = await L.$eval('#list .card.kbsel .name', e => e.textContent.trim()); await L.keyboard.press('ArrowUp'); await L.waitForTimeout(100);
  const sel2 = await L.$eval('#list .card.kbsel .name', e => e.textContent.trim());
  ok(sel !== sel2 && await act(L) === 'q', 'A7 ↓ ↓ ↑ move the highlight while the cursor stays in the box (' + sel + ' → ' + sel2 + ')');
  await enter3(L);
  ok((await bill(L)).includes(sel2 + ':1') && await act(L) === 'q', 'A8 Enter adds the highlighted one');
  await L.keyboard.type('kaju *3'); await L.waitForTimeout(300);
  ok((await nm(L, '#list .card'))[0] === 'Kaju Box 1kg', 'A9 "kaju *3" still finds Kaju Box');
  await enter3(L);
  ok((await bill(L)).includes('Kaju Box 1kg:3'), 'A10 …and Enter adds 3');
  await L.keyboard.press('+'); await L.keyboard.press('+'); await L.keyboard.press('-'); await L.waitForTimeout(300);
  ok((await bill(L)).includes('Kaju Box 1kg:4') && await L.inputValue('#q') === '', 'A11 with the box empty, + + − change the item just added (3 → 4)');
  await L.keyboard.press('Escape'); await L.evaluate(() => document.activeElement.blur()); await L.waitForTimeout(100);
  await L.keyboard.type('pp'); await L.waitForTimeout(300);
  ok(await act(L) === 'q' && await L.inputValue('#q') === 'pp', 'A12 typing anywhere on the page goes into the search');
  await L.keyboard.press('Escape'); await L.waitForTimeout(100);
  ok(await L.inputValue('#q') === '', 'A13 Esc empties it');

  /* customer and Done from the keyboard */
  await L.keyboard.press('Alt+c'); await L.waitForTimeout(150);
  ok(await act(L) === 'cust', 'B1 Alt+C goes to the customer name');
  await L.keyboard.type('Sunil'); await L.keyboard.press('Enter'); await L.waitForTimeout(150);
  ok(await act(L) === 'cust-mob', 'B2 Enter → mobile');
  await L.keyboard.type('9876543210'); await L.keyboard.press('Enter'); await L.waitForTimeout(300);
  ok(await act(L) === 'q', 'B3 Enter on the mobile → back to the search');
  const n0 = sent.filter(x => x.action === 'takeBill').length;
  await L.keyboard.press('Control+Enter'); await L.waitForTimeout(1200);
  ok(sent.filter(x => x.action === 'takeBill').length === n0 + 1 && !(await L.evaluate(() => T.S.bill.length)) && await act(L) === 'q', 'B4 Ctrl+Enter = Done: the bill is saved, a new one starts, the cursor is back in the search');
  await L.keyboard.press('Control+Enter'); await L.waitForTimeout(300);
  ok(sent.filter(x => x.action === 'takeBill').length === n0 + 1, 'B5 Ctrl+Enter on an empty bill does nothing');

  /* closing a screen and clicking + Bill bring the cursor back */
  await L.evaluate(() => T.openSettings()); await L.waitForTimeout(300); await L.keyboard.press('Escape'); await L.waitForTimeout(500);
  ok(await act(L) === 'q', 'C1 closing Settings: the cursor is back in the search');
  await L.click('#list .card[data-id="i5"] [data-add]'); await L.waitForTimeout(300);
  ok(await act(L) === 'q' && (await bill(L)).includes('PP Bag 12x18:1'), 'C2 clicking + Bill: added, the cursor back in the search');

  /* Settings say which choices are for phones */
  await L.evaluate(() => T.openSettings()); await L.waitForTimeout(300); await L.click('details[data-cg="look"] summary'); await L.waitForTimeout(200);
  const st = await L.textContent('details[data-cg="look"]');
  ok(/Text size \(this device only\)/.test(st) && /Search bar \(phones only\)/.test(st) && /Recent items \(phones only\)/.test(st) && /change only the phone app/.test(st) && /follow you/.test(st) && !/this phone\)/.test(st), 'D1 Settings: text size "this device only", search bar / best match / recent items "phones only", what follows you');
  ok(!/search at bottom/i.test(await L.textContent('details[data-cg="look"] summary')), 'D2 the card summary on the laptop doesn\'t mention the search bar');
  await L.context().close();

  /* phones unchanged */
  const P = await dev(390, 844, true);
  await P.focus('#q'); await P.keyboard.type('k'); await P.waitForTimeout(400);
  ok(!(await P.$eval('#list', l => l.classList.contains('drows'))) && !(await P.$('#meta-r .kbhint')) && !(await P.$('#list .kbsel')), 'E1 phone: no laptop list class, hint or highlight');
  ok(!/phone app; on a laptop/.test(await P.evaluate(() => { T.openSettings(); return document.querySelector('#sheet').textContent; })), 'E2 phone: no laptop note in Settings');
  await P.context().close();
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
