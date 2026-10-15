/* Today's summary (14 Oct 2026): Tools → Today's summary (owner only) turns the business page's figures into one WhatsApp
   message in the app's language: sales, profit, this month vs last, money in by method, credit, vendor dues and "Do this".
   Run: node tests/summary.app.test.js */
const fs = require('fs'), path = require('path');
const { appHtml, launch, ok, done } = require('./browser');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'insights.json'), 'utf8'));
const html = appHtml('S,t,setTab,openSummary,sumText,appUnlock');
(async () => {
  const b = await launch(); const errs = [];
  async function phone(role, o = {}) {
    const ctx = await b.newContext({ viewport: { width: o.w || 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.asked = [];
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...x }) }), cfg = { shopName: 'Sharma Traders', mode: 'live' };
      if (req.method() === 'GET') return send({ rev: '1' });
      const bd = JSON.parse(req.postData()); p.asked.push(bd);
      if (bd.action === 'boot' || bd.action === 'list') return send({ rev: '1', items: [], config: cfg, sv: 50, me: { name: 'Sharma ji', role, personal: true, prefs: {} } });
      if (bd.action === 'insights') return o.old ? r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'bad_action' }) }) : send(Object.assign({}, FX, { env: bd.env || 'live' }));
      return send({ me: { name: 'Sharma ji', role, personal: true, prefs: {} } }); });
    await p.addInitScript(([a, l]) => { if (sessionStorage.d) return; sessionStorage.d = 1; localStorage.setItem('rb_auth', a); if (l) localStorage.setItem('rb_lang', JSON.stringify(l)); },
      [JSON.stringify({ tok: 't', by: 'Sharma ji', role, personal: true, pinH: 'x', pinS: 'AAAA' }), o.lang || '']);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1300); await p.evaluate(() => { T.appUnlock(); T.setTab('tools'); }); await p.waitForTimeout(250); return p; }

  const o = await phone('owner');
  ok(await o.isVisible('#t-sum') && /Today's summary/.test(await o.textContent('#t-sum')), 'A1 owner: "Today\'s summary" in Tools');
  await o.click('#t-sum'); await o.waitForTimeout(500);
  const txt = await o.textContent('#sm-txt');
  ok(o.asked.some(x => x.action === 'insights' && x.tz != null), 'A2 asks the shop\'s script for today\'s figures (with the phone\'s time zone)');
  ok(/^\*Sharma Traders\*/.test(txt) && /Today's summary · /.test(txt), 'A3 shop name and today\'s date at the top');
  ok(/Sales: ₹620 · 2 bills/.test(txt) && /Profit: ₹90 \(30% over cost\)/.test(txt), 'A4 today: ₹620 in 2 bills, profit ₹90 (30%)');
  ok(/This month: ₹[\d,]+/.test(txt) && /Money in: UPI ₹390 · Cash ₹230/.test(txt), 'A5 this month, and money in today by method (biggest first)');
  ok(/\nCredit: ₹700 pending\n/.test(txt) && /\nVendors: ₹1,000 overdue\n/.test(txt) && !/₹0 /.test(txt), 'A6 credit pending and vendor money overdue; parts that are ₹0 today (given, collected, due this week) are left out');
  ok(/Do this:\n1\. /.test(txt) && /Raise PP Bag to ₹133 \/kg/.test(txt) && /Remind Sunil Traders: ₹500 pending for 45 days/.test(txt) && /Pay Mahaveer: ₹1,000 overdue/.test(txt), 'A7 "Do this" as a numbered list in plain words');
  ok(/Check the sell price of PVC 500 ml: cost went up, ₹217 \/pc keeps the old margin/.test(txt), 'B2b the summary says to check PVC\'s sell price, with the price that keeps the old margin');
  ok(!/undefined|NaN|null|\[object/.test(txt) && /_Rate Book_$/.test(txt), 'A8 nothing broken in the text; signed "Rate Book"');
  const wa = await o.getAttribute('#sm-wa', 'href');
  ok(wa.startsWith('https://wa.me/?text=') && decodeURIComponent(wa.slice(20)) === txt && await o.getAttribute('#sm-wa', 'aria-disabled') === null, 'A9 Send on WhatsApp: opens WhatsApp with exactly this message (pick any chat, yourself included)');
  await o.evaluate(() => { navigator.clipboard.writeText = async x => { window.__cp = x; }; }); await o.click('#sm-copy'); await o.waitForTimeout(100);
  ok(await o.evaluate(() => window.__cp) === txt, 'A10 Copy copies the same text');
  const test = await o.evaluate(f => T.sumText(Object.assign({}, f, { env: 'test' })), FX);
  ok(/TEST MODE/.test(test), 'A11 in test mode the message says so');

  const h = await phone('owner', { lang: 'hi', w: 320 }); await h.click('#t-sum'); await h.waitForTimeout(500);
  const th = await h.textContent('#sm-txt');
  ok(/आज का हिसाब/.test(th) && /बिक्री: ₹620 · 2 बिल/.test(th) && /ये करें:/.test(th) && await h.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'B1 in Hindi, and fits a 320 px phone');

  const m = await phone('manager');
  ok(!(await m.isVisible('#t-sum')), 'C1 managers and staff don\'t see it (owner only, like the business page)');
  // D. the buttons: Copy and Send side by side in the sheet's usual footer, normal button size (designinstructions.md §5, §12)
  const row = async p => p.evaluate(() => { const a = document.querySelector('#sm-copy').getBoundingClientRect(), b = document.querySelector('#sm-wa').getBoundingClientRect(), f = document.querySelector('#sheet-foot');
    return { same: Math.abs(a.top - b.top) < 2 && Math.abs(a.height - b.height) < 2, h: Math.round(a.height), inFoot: f.contains(document.querySelector('#sm-copy')) && f.contains(document.querySelector('#sm-wa')), fit: b.right <= innerWidth && a.left >= 0 }; });
  const r1 = await row(o);
  ok(r1.inFoot && r1.same && r1.h >= 40 && r1.h <= 52 && r1.fit, 'D1 Copy and Send (WhatsApp icon) side by side in the sheet footer, normal height (' + r1.h + ' px)');
  const r2 = await row(h);
  ok(r2.same && r2.fit, 'D2 …also at 320 px in Hindi');
  const big = await phone('owner', { w: 384 }); await big.evaluate(() => { localStorage.setItem('rb_fz', '1.38'); }); await big.reload(); await big.waitForTimeout(1200);
  await big.evaluate(() => { T.appUnlock(); T.setTab('tools'); }); await big.waitForTimeout(250); await big.click('#t-sum'); await big.waitForTimeout(500);
  const r3 = await row(big);
  ok(r3.same && r3.fit && await big.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'D3 …and at the largest text size on a 384 px phone');
  const old = await phone('owner', { old: true }); await old.click('#t-sum'); await old.waitForTimeout(400);
  ok(/latest sheet script|Rate Book support/.test(await old.textContent('#sm-body')) && await old.getAttribute('#sm-wa', 'aria-disabled') === 'true', 'C2 an older script says it isn\'t ready; nothing to send');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
