/* Bill numbers between phones (15 Oct 2026): two phones can show the same next number. Share of a new bill waits for the
   sheet to confirm its number before WhatsApp opens, so the customer gets the number the bill is saved under; offline or a
   slow sheet falls back to the phone's number (and the "send it again" note if it's renumbered later); a phone that blocks
   opening WhatsApp after the wait gets a one-tap button; auto-print after Done prints the confirmed number; "Share again"
   on the Last bill row follows a renumber. Run: node tests/billno.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,addToBill,setTab,appUnlock,flushBills');
const items = [{ id: 'i1', name: 'PP Bag 12x18', unit: 'kg', buy: 150, sell: 180 }];
let off = false, delay = 0, taken = new Set([21]), slowReply = null;   // bill 21 was just used by another phone
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://wa.me/**', r => r.fulfill({ body: 'wa' }));
  await ctx.route('https://script.google.com/**', async r => { if (off) return r.abort(); const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg', nextBill: 21, nextGstBill: 7 };
    if (q.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 60, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData());
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 60, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'takeBill') {   // like the sheet: a number already used gets the next free one
      if (delay) await new Promise(res => { slowReply = res; setTimeout(res, delay); });
      let n = bd.bill.n, ren = null; if (taken.has(n)) { let m = n + 1; while (taken.has(m)) m++; ren = { from: n, to: m }; n = m; } taken.add(n);
      return send({ renumbered: ren, config: { ...cfg, nextBill: Math.max(...taken) + 1 } }); }
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); sessionStorage.x = 1; }
    window.__opened = []; window.__block = false; window.open = (u) => { window.__opened.push({ u: String(u), at: Date.now() }); return window.__block ? null : {}; }; });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  const fresh = async () => { await p.evaluate(() => { T.addToBill('i1'); T.setTab('bill'); }); await p.fill('#cust-mob', '9876543210'); await p.waitForTimeout(300); };
  const opened = () => p.evaluate(() => window.__opened.map(x => decodeURIComponent(x.u)));
  const reset = () => p.evaluate(() => { window.__opened = []; });
  const newBill = async () => { if (await p.$('#saved-new')) await p.click('#saved-new'); else await p.evaluate(() => { T.S.editing = null; T.S.bill = []; }); await p.waitForTimeout(300); };

  // A. this phone shows 21, but another phone just used 21: WhatsApp opens only after the sheet answers, with No. 22
  await fresh(); delay = 700;
  ok(/21/.test(await p.inputValue('#bill-no') || await p.getAttribute('#bill-no', 'placeholder')), 'A1 this phone shows next bill 21 (another phone has just used it)');
  await p.click('#bill-wa'); await p.waitForTimeout(250);
  ok((await opened()).length === 0 && await p.$eval('#bill-wa', e => e.classList.contains('busy')), 'A2 WhatsApp doesn\'t open yet: the Share button spins while the sheet confirms the number');
  await p.click('#bill-wa', { force: true }); await p.waitForTimeout(1200);
  let o = await opened();
  ok(o.length === 1, 'A3 WhatsApp opens once (a second tap while waiting does nothing): ' + o.length);
  ok(/wa\.me\/919876543210/.test(o[0] || '') && /Bill No: 22 /.test(o[0] || '') && !/Bill No: 21/.test(o[0] || ''), 'A4 the customer gets Bill No: 22, the number it is saved under');
  ok(await p.evaluate(() => T.S.editing && T.S.editing.n) === 22 && !(await p.$eval('#bill-wa', e => e.classList.contains('busy'))), 'A5 the open bill shows 22, the button is back');
  ok(!/Bill number changed/.test(await p.evaluate(() => document.body.innerText)), 'A6 no "send it again" note: what was sent is already right');
  ok(await p.evaluate(() => T.S.pendShare) === true, 'A7 on return the app still asks "Did the bill go?"');

  // B. no clash: straight to the next number
  await newBill(); await reset(); delay = 0; await fresh(); await p.click('#bill-wa'); await p.waitForTimeout(800);
  o = await opened(); ok(o.length === 1 && /Bill No: 23 /.test(o[0]), 'B1 no clash: Bill No: 23 sent');

  // C. offline: WhatsApp opens at once with this phone's number, the bill waits in the queue
  await newBill(); await reset(); off = true; await fresh(); await p.click('#bill-wa'); await p.waitForTimeout(500);
  o = await opened(); ok(o.length === 1 && /Bill No: 24 /.test(o[0]) && await p.evaluate(() => T.S.billQ.length) === 1, 'C1 offline: shared at once with No. 24, the bill waits to be sent');
  ok(await p.evaluate(() => T.S.billQ[0].shared) === true, 'C2 it is marked as shared, so a later renumber says to send it again');
  taken.add(24); off = false; await p.evaluate(() => T.flushBills()); await p.waitForTimeout(800);
  ok(/Bill number changed/.test(await p.textContent('#sheet')) && /saved as Bill 25/.test(await p.textContent('#sheet')), 'C3 back online, 24 was taken meanwhile: "Bill number changed … saved as Bill 25"');
  await p.click('#rn-ok'); await p.waitForTimeout(300);

  // D. the sheet is slow (over 4 s): WhatsApp opens with the phone's number, the note follows if it's renumbered
  await newBill(); await reset(); delay = 6000; await fresh(); const t0 = Date.now(); await p.click('#bill-wa'); await p.waitForTimeout(4600);
  o = await opened(); ok(o.length === 1 && /Bill No: 26 /.test(o[0]), 'D1 no answer within 4 s: shared with this phone\'s number (26) (' + (Date.now() - t0) + ' ms)');
  delay = 0; await p.waitForTimeout(2000);
  ok(!/Bill number changed/.test(await p.evaluate(() => document.body.innerText)), 'D2 the sheet then saves it as 26: no note');
  await p.evaluate(() => { const s = document.querySelector('#sheet-close'); if (s && s.offsetParent) s.click(); });

  // E. the phone blocks opening WhatsApp after the wait: one tap on a ready button
  await newBill(); await reset(); await p.evaluate(() => { window.__block = true; }); taken.add(27); await fresh(); await p.click('#bill-wa'); await p.waitForTimeout(1000);
  const btn = await p.$('#sc-wa'); const href = btn ? decodeURIComponent(await btn.getAttribute('href')) : '';
  ok(!!btn && /Bill No: 28 /.test(href) && /wa\.me\/919876543210/.test(href) && /Bill 28 saved/.test(await p.textContent('#sheet')), 'E1 blocked: "Bill 28 saved" with a Share on WhatsApp button carrying No. 28');
  await p.evaluate(() => { window.__block = false; document.querySelector('#sc-wa').addEventListener('click', e => e.preventDefault()); }); await p.click('#sc-wa'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => T.S.pendShare) === true, 'E2 after tapping it the app asks "Did the bill go?" on return');

  // F. Done with "Print automatically": prints the number the sheet confirmed; Share again follows the renumber
  await newBill(); await reset();
  await p.evaluate(() => { localStorage.setItem('rb_print', JSON.stringify({ paper: 'a4', via: 'system', auto: true })); window.__printed = []; window.printInv = inv => window.__printed.push(inv.no); });
  delay = 500; const nx = await p.evaluate(() => T.S.cfg.nextBill); taken.add(nx); await fresh(); await p.click('#bill-done'); await p.waitForTimeout(1500);
  ok(JSON.stringify(await p.evaluate(() => window.__printed)) === JSON.stringify([String(nx + 1)]), `F1 another phone used ${nx}: the receipt prints ${nx + 1} (` + JSON.stringify(await p.evaluate(() => window.__printed)) + ')');
  const lb = await p.$eval('#lastbill a', a => decodeURIComponent(a.href));
  ok(new RegExp(`Last bill: No\\. ${nx + 1}`).test(await p.textContent('#lastbill')) && new RegExp(`Bill No: ${nx + 1} `).test(lb), `F2 Last bill row and its Share again link say ${nx + 1}`);

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
