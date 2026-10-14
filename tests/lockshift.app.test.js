/* Lock screen doesn't move things around while it opens (14 Oct 2026, seen on an installed phone): the EN | हि switch stays in
   the top-right corner while the screen slides in and while it shakes on a wrong PIN, and the fingerprint button is there from
   the start so the keypad doesn't drop when it appears. Run: node tests/lockshift.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S');
(async () => {
  const b = await launch(); const errs = [];
  async function phone(o = {}) {
    const ctx = await b.newContext({ viewport: { width: o.w || 390, height: 800 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', async r => { const q = r.request(), send = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...x }) });
      if (q.method() === 'GET') return send({ rev: '1' }); const bd = JSON.parse(q.postData()); await new Promise(z => setTimeout(z, 600));
      if (bd.action === 'boot' || bd.action === 'list') return send({ rev: '1', items: [], config: { shopName: 'Sharma Packaging Traders', mode: 'live' }, sv: 50, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
      if (bd.action === 'verify') return send({ ok: false, error: 'bad_pin' });
      return send({ me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }); });
    await p.addInitScript(bio => { if (sessionStorage.d) return; sessionStorage.d = 1;
      localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', pinLen: 6, bio: bio ? 'abc' : undefined }));
      if (bio) { window.PublicKeyCredential = window.PublicKeyCredential || function () {}; PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () => new Promise(z => setTimeout(() => z(true), 300)); navigator.credentials.get = () => new Promise(() => {}); } }, !!o.bio);
    await p.goto('https://rb.test/'); return p; }
  const pos = (p, s) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }, s);

  const a = await phone(); await a.waitForSelector('#applock .al-lang'); await a.waitForTimeout(450);
  const during = await pos(a, '#applock .al-lang'); await a.waitForTimeout(1200); const after = await pos(a, '#applock .al-lang');
  ok(during && after && during[0] === after[0] && during[1] === after[1] && after[1] < 30 && after[0] > 250, 'A1 EN | हि is in the top-right corner while the screen slides in, and stays there (' + during + ' → ' + after + ')');
  ok(await a.evaluate(() => document.querySelector('#applock').firstElementChild.classList.contains('al-lang') && document.querySelectorAll('#applock .al-lang').length === 1), 'A2 it sits outside the sliding box, once');
  for (const k of '000000') await a.click(`#al-pad [data-k="${k}"]`); await a.click('#al-pad [data-k="ok"]'); await a.waitForFunction(() => /Wrong/.test(document.querySelector('#al-err').textContent), null, { timeout: 4000 }); await a.waitForTimeout(60);
  const shaking = await a.evaluate(() => document.querySelector('.al-box').classList.contains('al-shake')), shake = await pos(a, '#applock .al-lang');
  ok(shaking && shake && shake[0] === after[0] && shake[1] === after[1] && /wrong|tries/i.test(await a.textContent('#al-err')), 'A3 …and while the screen shakes on a wrong PIN');
  await a.click('#applock [data-al-lang="hi"]'); await a.waitForTimeout(150);
  ok(await a.evaluate(() => document.documentElement.lang) === 'hi' && JSON.stringify(await pos(a, '#applock .al-lang')) === JSON.stringify(after) && await a.evaluate(() => document.querySelectorAll('#applock .al-lang').length === 1 && document.querySelector('#applock [data-al-lang="hi"]').getAttribute('aria-pressed') === 'true'), 'A4 switching to हि redraws the screen in Hindi; the switch stays put and shows हि chosen');

  const f = await phone({ bio: true }); await f.waitForSelector('#al-pad', { state: 'attached' });
  const bio1 = await f.evaluate(() => !!document.querySelector('#al-bio'));   // drawn together with the keypad, not later
  await f.waitForFunction(() => { const l = document.querySelector('#applock'); return l && !l.classList.contains('al-hold') && !l.classList.contains('al-enter'); }, null, { timeout: 4000 });
  const p1 = await pos(f, '#al-pad'); await f.waitForTimeout(1000); const p2 = await pos(f, '#al-pad');
  ok(bio1 && p1 && p2 && p1[1] === p2[1], 'A5 with fingerprint set up, its button is there from the start and the keypad doesn\'t drop (' + p1 + ' → ' + p2 + ')');
  const g = await phone({ w: 320 }); await g.waitForSelector('#applock .al-lang'); await g.waitForTimeout(1500);
  ok(await g.evaluate(() => { const l = document.querySelector('#applock .al-lang').getBoundingClientRect(), s = document.querySelector('#applock .al-mark, #applock .al-shop').getBoundingClientRect(); return l.right <= innerWidth && (l.bottom <= s.top || l.right <= s.left || l.left >= s.right); }), 'A6 at 320 px the switch doesn\'t cover the logo or the shop name');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
