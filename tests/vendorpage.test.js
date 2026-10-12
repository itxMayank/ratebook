/* The vendor's own link page (vendor.html) in a browser (12 Oct 2026; nothing opened it before): the ledger shows with the
   browser rule (Content-Security-Policy) on and nothing blocked; a bill photo preview that isn't a plain image is never drawn
   (it could otherwise run code on this page, which shares the app's address); names and notes stay text.
   Run: node tests/vendorpage.test.js */
const fs = require('fs'), path = require('path');
const { launch, ok, done, ROOT } = require('./browser');
const html = fs.readFileSync(path.join(ROOT, 'vendor.html'), 'utf8');
const IMG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==';
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const a = new URL(r.request().url()).searchParams.get('action'), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    if (a === 'vpub') return send({ ok: true, test: false, shop: { name: 'Gupta <b>Plastics</b>', address: '', gstin: '' }, vendor: { name: 'Mahaveer <img src=x onerror=window.__x=1>', opening: 0 },
      entries: [{ id: 'e1', type: 'bill', date: '2026-10-02', amount: 1180, billNo: 'MH-77', noteV: 'note <script>window.__y=1</script>', photos: [{ f: 'GOODFILE123456', m: 'image/jpeg' }, { f: 'EVILFILE123456', m: 'image/jpeg' }] }],
      calc: { balance: 1180, bills: [{ id: 'e1', amount: 1180, paid: 0, due: 1180, status: 'open', date: '2026-10-02' }], advance: 0 } });
    if (a === 'vpubprev') return send({ ok: true, previews: { GOODFILE123456: IMG, EVILFILE123456: "x')\"><img src=x onerror=window.__z=1>" } });
    return send({ ok: false }); });
  await p.addInitScript(() => { window.__v = []; document.addEventListener('securitypolicyviolation', e => window.__v.push(e.violatedDirective)); });
  await p.goto('https://rb.test/vendor.html?t=l0123456789abcdef012345'); await p.waitForTimeout(1500);
  const txt = await p.textContent('#app');
  ok(/Mahaveer <img/.test(txt) && /Gupta <b>Plastics<\/b>/.test(txt), 'the ledger shows; names are shown as typed, as text');
  ok(await p.evaluate(() => !window.__x && !window.__y && !window.__z), 'nothing hidden in a name, note or preview runs');
  const bg = await p.$$eval('[data-f]', els => els.map(e => e.style.backgroundImage));
  ok(bg.length === 2 && /base64/.test(bg[0]) && !bg[1], 'a real image preview is drawn; one that isn\'t a plain image is left out');
  ok((await p.evaluate(() => window.__v)).length === 0, 'the page runs with the browser rule on and nothing of its own blocked');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
