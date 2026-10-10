/* Reports summary card: rolling numbers, split by group, rows in/out, per-day bars, highlight, periods kept on the phone.
   Run: node tests/reports.test.js */
const { appHtml, launch, ok, done, MAIN_API } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openReports,switchEnv');
const items = [{ id: 'a', name: 'PP Bag', unit: 'kg', buy: 90, sell: 120, cat: 'Bags' }, { id: 'b', name: 'Paper Cup', unit: 'pc', buy: 1, sell: 2, cat: 'Cups' },
  { id: 'c', name: 'Foil Roll', unit: 'pc', buy: 50, sell: 70, cat: 'Foil' }, { id: 'd', name: 'Tape', unit: 'pc', buy: 10, sell: 15, cat: '' }];
const it = (name, amount) => ({ name, unit: name === 'PP Bag' ? 'kg' : 'pc', qty: 1, amount, bills: 1 });
function report(from, to) {
  const a = new Date(from + 'T00:00:00'), z = new Date(to + 'T00:00:00'), n = Math.round((z - a) / 864e5) + 1;
  const byDay = []; for (let i = 0; i < n; i++) { const d = new Date(a); d.setDate(a.getDate() + i); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); byDay.push({ d: k, sales: 0, bills: 0 }); }
  let list, bills;
  if (n === 1) { list = [it('PP Bag', 600), it('Paper Cup', 400)]; bills = 4; }
  else if (n <= 7) { list = [it('PP Bag', 3000), it('Paper Cup', 1500), it('Foil Roll', 900), it('Tape', 100)]; bills = 20; }
  else { list = [it('PP Bag', 9000), it('Foil Roll', 3000)]; bills = 60; }
  const sales = list.reduce((s, x) => s + x.amount, 0); const per = sales / n;
  byDay.forEach((d, i) => { d.sales = Math.round(per * (0.5 + (i % 3) * 0.5)); d.bills = 2; });
  const T = { sales, bills, tax: 0, gstBills: 0, cancelled: 0, lineSale: sales, pSale: sales, pCost: sales * 0.8, estAmt: 0, noBuyAmt: 0, profit: 0, cost: 0 };
  return { from, to, totals: T, byDay, items: list, itemCount: list.length, gst: { b2b: {}, b2c: {}, rates: [], hsn: [] }, received: 500, creditGiven: 300, outstanding: 1200, register: [] };
}
(async () => {
  const b = await launch(); const reqs = [];
  async function phone(opts) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 860 }, ...opts }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', async r => {
      const req = r.request(), u = new URL(req.url()), send = o => r.fulfill({ body: JSON.stringify({ shop: 'main', ...o }), contentType: 'application/json' });
      const cfg = { shopName: 'Gupta Plastics', mode: 'live' };
      if (req.method() === 'GET') return send({ ok: true, rev: '1', items, config: cfg, sv: 37, bl: '0', bt: '0', vl: '0', vt: '0' });
      const bd = JSON.parse(req.postData());
      if (bd.action === 'report') { reqs.push(bd.from + '_' + bd.to); await new Promise(x => setTimeout(x, 250)); return send({ ok: true, report: report(bd.from, bd.to) }); }
      if (bd.action === 'boot') return send({ ok: true, rev: '1', items, config: cfg, sv: 37, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
      if (bd.action === 'verify') return send({ ok: true, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
      return send({ ok: true }); });
    await p.addInitScript(() => { if (!sessionStorage.done) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); sessionStorage.done = 1; } });
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(600);
    return p;
  }
  const txt = (p, s) => p.textContent(s);
  const money = s => +String(s).replace(/[^\d.]/g, '');
  const rows = p => p.$$eval('#rph-rows .rph-rw:not([data-gone])', els => els.map(e => e.querySelector('.nm').textContent));
  const p = await phone();
  await p.evaluate(() => T.openReports()); await p.waitForTimeout(1000);
  ok(await txt(p, '#rph-sales') === '₹1,000' && await txt(p, '#rph-bills') === '4' && JSON.stringify(await rows(p)) === '["Bags","Cups"]' && (await p.$$('#rph-days .rph-d')).length === 1,
    'today: sales, bills, split by the price list\'s groups, one day bar');
  await p.waitForTimeout(2200);
  ok(reqs.length === 5, 'the other common periods are loaded quietly in the background (' + reqs.length + ' report requests)');
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/rp-today.png' : '/tmp/rp-today.png' });
  // switch to This week: instant (no new request), numbers roll, new rows grow in
  const n0 = reqs.length; await p.click('[data-rp=week]'); await p.waitForTimeout(150);
  const mid = money(await txt(p, '#rph-sales'));
  await p.waitForTimeout(900);
  const wd = (new Date().getDay() + 6) % 7 + 1;
  ok(reqs.length === n0 && mid > 1000 && mid < 5500 && await txt(p, '#rph-sales') === '₹5,500', 'switching period: no waiting, the total rolls ₹1,000 → ₹5,500 (seen ₹' + mid + ' on the way)');
  ok(JSON.stringify(await rows(p)) === '["Bags","Cups","Foil","No group"]' && (await p.$$('#rph-days .rph-d')).length === wd, 'week: four groups (item without a group shown as "No group"), one bar per day so far');
  const w = await p.$$eval('#rph-bar .rph-seg', els => els.map(e => parseFloat(e.style.width)));
  ok(w.length === 4 && Math.abs(w[0] - 3000 / 5500 * 100) < 0.1 && Math.abs(w.reduce((a, x) => a + x, 0) - 100) < 0.1, 'split bar widths follow the amounts');
  await p.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/rp-week.png' : '/tmp/rp-week.png' });
  // This month: Cups and No group fold away
  await p.click('[data-rp=month]'); await p.waitForTimeout(120);
  const folding = await p.$$eval('#rph-rows .rph-rw[data-gone]', els => els.length);
  await p.waitForTimeout(900);
  ok(folding === 2 && (await p.$$('#rph-rows .rph-rw')).length === 2 && JSON.stringify(await rows(p)) === '["Bags","Foil"]' && (await p.$$('#rph-days .rph-d')).length === new Date().getDate(),
    'month: rows no longer in the period fold away and are removed; one bar per day of the month');
  // highlight a part of the split
  await p.click('#rph-bar .rph-seg[data-k="g:Bags"]'); await p.waitForTimeout(250);
  ok(/Bags · ₹9,000 · 75%/.test(await txt(p, '#rph-tip')) && await p.$eval('#rp-hero', h => h.classList.contains('hl')) && await p.$eval('.rph-row[data-k="g:Foil"]', r => getComputedStyle(r).opacity < 0.6),
    'tap a part: its label shows (group · amount · %), the rest fade');
  await p.click('#rph-days .rph-d:nth-child(2)'); await p.waitForTimeout(250);
  ok(/· ₹[\d,]+ · 2 bills/.test(await txt(p, '#rph-tip')), 'tap a day: date, sales and bills of that day');
  ok(await txt(p, '#rph-recv') === '₹500' && await txt(p, '#rph-out') === '₹1,200', 'money meters: received, pending');
  // stale copy: shown at once, then re-read
  const n1 = reqs.length; await p.click('[data-rp=today]'); await p.waitForTimeout(700);
  ok(reqs.length === n1, 'a period read less than 20 s ago is not read again');
  await p.evaluate(() => T.switchEnv({ ...T.S.cfg.raw, mode: 'test' })); await p.click('[data-rp=week]'); await p.waitForTimeout(700);
  ok(reqs.length === n1 + 1, 'after switching between test and real billing, Reports reads the figures again (never shows the other mode\'s)');
  // reduced motion: values jump straight to the end
  const q = await phone({ reducedMotion: 'reduce' });
  await q.evaluate(() => T.openReports()); await q.waitForTimeout(3200); await q.click('[data-rp=week]'); await q.waitForTimeout(60);
  ok(await txt(q, '#rph-sales') === '₹5,500', 'reduce motion: no rolling, the new figure shows at once');
  // dark mode screenshot
  const d = await phone({ colorScheme: 'dark' }); await d.evaluate(() => T.openReports()); await d.waitForTimeout(3200); await d.click('[data-rp=week]'); await d.waitForTimeout(1000);
  await d.screenshot({ path: process.env.SHOT_DIR ? process.env.SHOT_DIR + '/rp-dark.png' : '/tmp/rp-dark.png' });
  await b.close(); done();
})();
