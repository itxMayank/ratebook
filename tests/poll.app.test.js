/* How often a phone asks the sheet for changes (21 Oct 2026): every 25 s while someone is using it, every 3 minutes when it's open
   but untouched for 2 minutes, never in the background; the first tap after a quiet spell and coming back to the app check at
   once. Time is moved forward with Playwright's clock. Run: node tests/poll.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock');
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  let revs = 0;
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 21, nextGstBill: 7 };
    if (q.method() === 'GET') { if (/action=rev/.test(q.url())) revs++; return send({ rev: '1', sv: 66 }); }
    const bd = JSON.parse(q.postData()); if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 66, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    return send({}); });
  await p.clock.install();
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.clock.runFor(1500); await p.evaluate(() => T.appUnlock()); await p.clock.runFor(500);
  const tick = async ms => { for (let t = 0; t < ms; t += 5000) await p.clock.runFor(5000); };
  await p.mouse.click(200, 300); revs = 0; await tick(60000);
  ok(revs >= 2 && revs <= 3, 'A1 someone using the phone: it checks about every 25 s (' + revs + ' checks in a minute)');
  revs = 0; await tick(120000); const r2 = revs; revs = 0; await tick(360000);
  ok(revs >= 1 && revs <= 3, 'A2 open but untouched for over 2 minutes: about every 3 minutes (' + revs + ' checks in 6 minutes; was 14)');
  revs = 0; await p.mouse.click(200, 300); await p.clock.runFor(300);
  ok(revs === 1, 'A3 the first tap after the quiet spell checks at once');
  revs = 0; await tick(30000); ok(revs >= 1, 'A4 …and it goes back to every 25 s');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  revs = 0; await tick(600000); ok(revs === 0, 'A5 in the background: no checks at all (10 minutes)');
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await p.clock.runFor(300); ok(revs === 1, 'A6 back to the app: it checks at once');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); done();
})();
