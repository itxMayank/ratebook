/* Laptop: quantity and rate before adding, and more keys (20 Oct 2026). Mayank: Enter on a search result opens a small dialog
   with the item, Quantity (cursor here) and Rate (the item's price), and the amount worked out; Enter in Quantity → Rate,
   Enter in Rate adds it; the dialog closes and the cursor goes back to the search. Both boxes take numbers only and select
   their value when they get the cursor (also the bill's own qty / rate boxes, on phones too). Alt+B goes to Done (Enter = Done),
   Alt+T (tax; Alt+G opens Gemini in Edge / Chrome) turns GST on and goes to the GSTIN box. Any page error fails. Run: node tests/qadd.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock');
const items = [{ id: 'i1', name: 'PP Bag 12x18', nameHi: 'पीपी बैग', unit: 'kg', buy: 150, sell: 180 }, { id: 'i2', name: 'Paper Cup 150ml', unit: 'pc', buy: 0.5, sell: 0.8 },
  { id: 'i3', name: 'Kaju Box 1kg', unit: 'pc', buy: 20, sell: 25 }];
let sent = [];
(async () => {
  const b = await launch(); const errs = [];
  async function dev(w, h, touch, init) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: !!touch, hasTouch: !!touch }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'log') errs.push('console.log: ' + m.text()); });   // "no logs"
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const bd = r.request().method() === 'POST' ? JSON.parse(r.request().postData()) : {}; sent.push(bd);
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'Pushpadant Plastics', mode: 'live', nextBill: 5, nextGstBill: 1 }, sv: 57, n: 5, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } }) }); });
    await p.addInitScript(init || (() => {}));
    await p.addInitScript(() => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); });
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400); return p;
  }
  const act = p => p.evaluate(() => document.activeElement && document.activeElement.id);
  const sel = p => p.evaluate(() => { const a = document.activeElement; return a.selectionStart === 0 && a.selectionEnd === a.value.length && a.value.length > 0; });
  const bill = p => p.evaluate(() => T.S.bill.map(l => l.name + ':' + l.qty + '@' + l.rate).join(', '));
  const open = p => p.evaluate(() => { const d = document.querySelector('#qadd'); return !!d && !d.hidden; });
  const L = await dev(1280, 800);

  /* A. the dialog */
  await L.keyboard.type('pp bag'); await L.waitForTimeout(300); await L.keyboard.press('Enter'); await L.waitForTimeout(300);
  ok(await open(L) && /PP Bag 12x18/.test(await L.textContent('#qa-name')) && /₹180/.test(await L.textContent('#qa-sub')), 'A1 Enter on a result opens the dialog with the item and its price');
  ok(await act(L) === 'qa-qty' && await L.inputValue('#qa-qty') === '1' && await sel(L), 'A2 the cursor is in Quantity, its value selected');
  ok(await L.inputValue('#qa-rate') === '180' && /₹180/.test(await L.textContent('#qa-amt')), 'A3 Rate has the item\'s price; the amount is worked out');
  await L.keyboard.type('2a.5b'); await L.waitForTimeout(100);
  ok(await L.inputValue('#qa-qty') === '2.5' && /₹450/.test(await L.textContent('#qa-amt')), 'A4 numbers only (letters ignored); typing replaces the selected value; amount follows (₹450)');
  await L.keyboard.press('Enter'); await L.waitForTimeout(100);
  ok(await act(L) === 'qa-rate' && await sel(L), 'A5 Enter → Rate, its value selected');
  await L.keyboard.type('17x6'); await L.waitForTimeout(100);
  ok(await L.inputValue('#qa-rate') === '176' && /₹440/.test(await L.textContent('#qa-amt')), 'A6 the rate is changed (numbers only), the amount follows');
  await L.keyboard.press('Enter'); await L.waitForTimeout(400);
  ok(await bill(L) === 'PP Bag 12x18:2.5@176' && !(await open(L)) && await act(L) === 'q' && await L.inputValue('#q') === '', 'A7 Enter adds 2.5 kg at ₹176; the dialog closes, the search is empty and has the cursor');

  /* B. already on the bill; rate kept; Esc; a bad quantity; Tab stays inside */
  await L.keyboard.type('pp bag'); await L.waitForTimeout(300); await L.keyboard.press('Enter'); await L.waitForTimeout(300);
  ok(/Already on the bill: 2.5/.test(await L.textContent('#qa-in')) && await L.inputValue('#qa-rate') === '176' && /Add more/.test(await L.textContent('#qa-ok')), 'B1 an item already on the bill: says so, the bill\'s rate (₹176) is used');
  await L.keyboard.press('Enter'); await L.keyboard.press('Enter'); await L.waitForTimeout(400);
  ok(await bill(L) === 'PP Bag 12x18:3.5@176', 'B2 Enter, Enter with nothing changed: 1 more at the same rate');
  await L.keyboard.type('cup'); await L.waitForTimeout(300); await L.keyboard.press('Enter'); await L.waitForTimeout(300);
  await L.keyboard.type('0'); await L.keyboard.press('Enter'); await L.waitForTimeout(150);
  ok(await act(L) === 'qa-qty' && /more than 0/.test(await L.textContent('#qa-err')) && await L.$eval('#qa-qty', e => e.parentElement.classList.contains('need')), 'B3 quantity 0: stays in Quantity with a message and a red outline');
  for (let i = 0; i < 6; i++) await L.keyboard.press('Tab');
  ok(await L.evaluate(() => document.querySelector('#qadd').contains(document.activeElement)), 'B4 Tab stays inside the dialog');
  await L.keyboard.press('Escape'); await L.waitForTimeout(300);
  ok(!(await open(L)) && !/Cup/.test(await bill(L)) && await act(L) === 'q', 'B5 Esc closes it, nothing added, the cursor is back in the search');
  await L.keyboard.type('kaju *4'); await L.waitForTimeout(300); await L.keyboard.press('Enter'); await L.waitForTimeout(300);
  ok(await L.inputValue('#qa-qty') === '4', 'B6 "kaju *4" opens with Quantity 4');
  await L.mouse.click(20, 20); await L.waitForTimeout(300);
  ok(!(await open(L)) && !/Kaju/.test(await bill(L)), 'B7 a click outside closes it, nothing added');

  /* C. the bill's own boxes select their value */
  await L.click('#br-0'); await L.waitForTimeout(100);
  ok(await sel(L), 'C1 laptop: clicking the bill line\'s rate selects its value');

  /* D. Alt+T, Alt+B */
  await L.keyboard.press('Escape'); await L.evaluate(() => document.activeElement.blur()); await L.waitForTimeout(100);
  await L.keyboard.press('Alt+t'); await L.waitForTimeout(300);
  ok(await L.evaluate(() => T.S.gst) && await act(L) === 'cust-gstin', 'D1 Alt+T turns GST on and puts the cursor in the GSTIN box');
  await L.keyboard.press('Enter'); await L.waitForTimeout(150);
  ok(await act(L) === 'q', 'D2 Enter in the GSTIN box → back to the search');
  await L.keyboard.press('Alt+t'); await L.waitForTimeout(300);
  ok(!(await L.evaluate(() => T.S.gst)) && await act(L) === 'q', 'D3 Alt+T again turns it off, the cursor in the search');
  await L.keyboard.press('Alt+b'); await L.waitForTimeout(150);
  ok(await act(L) === 'bill-done' && await L.$eval('#bill-done', e => getComputedStyle(e).outlineStyle !== 'none'), 'D4 Alt+B goes to Done, with a clear focus ring');
  const n0 = sent.filter(x => x.action === 'takeBill').length;
  await L.keyboard.press('Enter'); await L.waitForTimeout(1200);
  ok(sent.filter(x => x.action === 'takeBill').length === n0 + 1 && !(await L.evaluate(() => T.S.bill.length)) && await act(L) === 'q', 'D5 Enter on Done: the bill is saved and the cursor is back in the search');
  ok(/Alt T/.test(await L.textContent('#side-foot')) && /Alt B/.test(await L.textContent('#side-foot')), 'D6 the menu lists Alt T and Alt B');

  /* E. look: dark, Hindi, larger text */
  const H = await dev(1280, 800, false, () => { localStorage.setItem('rb_lang', '"hi"'); localStorage.setItem('rb_appear', '"dark"'); localStorage.setItem('rb_fz', '1.38'); });
  await H.keyboard.type('pp'); await H.waitForTimeout(300); await H.keyboard.press('Enter'); await H.waitForTimeout(400);
  const fit = await H.evaluate(() => { const c = document.querySelector('.qa-card').getBoundingClientRect(), bad = [...document.querySelectorAll('.qa-card *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > c.right + 1 || r.left < c.left - 1); }); return { bad: bad.length, w: c.width, bg: getComputedStyle(document.querySelector('.qa-card')).backgroundColor }; });
  ok(fit.bad === 0 && /मात्रा/.test(await H.textContent('.qa-card')) && fit.bg !== 'rgb(255, 255, 255)', 'E1 Hindi, dark, largest text: in Hindi, dark card, nothing spills out (' + JSON.stringify(fit) + ')');
  if (process.env.SHOT) { await H.screenshot({ path: process.env.SHOT + '/qadd-hi-dark.png' }); }

  /* F. phones: no dialog; their bill boxes select their value too */
  const P = await dev(390, 844, true);
  await P.evaluate(() => { T.S.bill.push({ id: 'i2', name: 'Paper Cup 150ml', unit: 'pc', rate: 0.8, qty: 12 }); document.querySelector('#tab-bill').click(); });
  await P.waitForTimeout(500); await P.tap('#bq-0'); await P.waitForTimeout(150);
  ok(await sel(P), 'F1 phone: tapping the bill line\'s quantity selects its value');
  await P.tap('#br-0'); await P.waitForTimeout(150);
  ok(await sel(P), 'F2 …and the rate');
  ok(!(await P.$('#qadd')), 'F3 phone: no dialog');

  ok(errs.length === 0, 'Z no page errors or console logs ' + errs.join(' | '));
  await b.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
