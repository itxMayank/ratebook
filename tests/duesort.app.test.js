/* Credit screen order (15 Oct 2026): oldest due first by default, "Most due first" on request; search keeps the order; opening
   Credit again starts from oldest first; the right customer opens from a re-ordered list. Run: node tests/duesort.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,openDues,appUnlock');
const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const C = (name, mobile, due, days) => ({ name, mobile, due, oldest: ago(days), bills: [{ n: days, id: 'b' + days, row: days + 1, date: ago(days), total: due, paid: 0, due, items: 'Bag 1 pc = ' + due, gst: false }] });
const dues = { total: 1648, bills: 3, customers: [C('Mohan Traders', '9000000003', 900, 10), C('Sunil Traders', '9876543210', 548, 40), C('Ravi Stores', '9123456780', 200, 2)] };   // the sheet sends most owed first
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'G', mode: 'live' };
    if (q.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 60 }); const bd = JSON.parse(q.postData());
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 60, me });
    if (bd.action === 'listDues') return send(dues);
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock());
  const order = () => p.$$eval('#du-list .duecard b', els => els.map(e => e.textContent.split(' ')[0]).join(','));
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(900);
  ok(await order() === 'Sunil,Mohan,Ravi' && await p.getAttribute('[data-ds="date"]', 'aria-pressed') === 'true', 'A1 opens oldest due first: Sunil (40 days), Mohan (10), Ravi (2)');
  ok(/Oldest due first/.test(await p.textContent('[data-ds="date"]')) && /Most due first/.test(await p.textContent('[data-ds="amt"]')), 'A2 two sort buttons: Oldest due first · Most due first');
  await p.click('[data-ds="amt"]'); await p.waitForTimeout(150);
  ok(await order() === 'Mohan,Sunil,Ravi' && await p.getAttribute('[data-ds="amt"]', 'aria-pressed') === 'true', 'A3 Most due first: Mohan ₹900, Sunil ₹548, Ravi ₹200');
  await p.fill('#du-q', 'traders'); await p.waitForTimeout(150);
  ok(await order() === 'Mohan,Sunil', 'A4 a search keeps the chosen order');
  await p.click('#du-list .duecard'); await p.waitForTimeout(500);
  ok(/Mohan Traders/.test(await p.textContent('#sheet-title')), 'A5 tapping the first card opens that customer (Mohan), not the sheet\'s first');
  await p.evaluate(() => { document.querySelector('#sheet-close').click(); }); await p.waitForTimeout(300);
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(900);
  ok(await p.getAttribute('[data-ds="date"]', 'aria-pressed') === 'true', 'A6 opening Credit again starts from oldest first');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
