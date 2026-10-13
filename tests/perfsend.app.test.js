/* Phones send their own request timings to the shop's script about once an hour (perfIn, script v47+), for the admin dashboard's
   Speed section; the app itself no longer shows Speed (Settings card removed 13 Oct 2026). Run: node tests/perfsend.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,checkRev,appUnlock,openSettings');
(async () => {
  const b = await launch(); const errs = [];
  async function phone(sv, signed) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); const sent = [];
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      const L = { rev: '1', items: [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180 }], config: { shopName: 'Gupta', mode: 'live' }, sv };
      if (q.method() === 'GET') return send({ rev: '1' });
      const bd = JSON.parse(q.postData()); if (bd.action === 'perfIn') { sent.push(bd); return send({ n: bd.rows.length }); }
      if (bd.action === 'boot' || bd.action === 'list') return send({ ...L, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
      return send({}); });
    await p.addInitScript(s => { if (sessionStorage.x) return; sessionStorage.x = 1; if (s) localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })); }, signed);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1300); if (signed) await p.evaluate(() => T.appUnlock());
    return { p, sent }; }
  const a = await phone(47, true);
  await a.p.evaluate(() => T.checkRev()); await a.p.waitForTimeout(400);
  const s1 = a.sent[0];
  ok(a.sent.length === 1 && s1.tok === 't' && Array.isArray(s1.rows) && s1.rows.some(r => r[0] === 'boot' || r[0] === 'list') && /·/.test(s1.dl), 'A1 signed-in phone, script v47: its timings go to the script with its sign-in and phone type');
  ok(s1.rows.every(r => r.length === 4 && typeof r[1] === 'number' && r[3] > 0) && !s1.rows.some(r => r[0] === 'rev' || r[0] === 'perfIn'), 'A2 each row: action, whole wait, script part, time; the 25-second check and the send itself left out');
  await a.p.evaluate(() => T.checkRev()); await a.p.waitForTimeout(300);
  ok(a.sent.length === 1, 'A3 not again within the hour');
  await a.p.evaluate(() => { localStorage.rb_perf_try = '0'; }); await a.p.evaluate(() => T.checkRev()); await a.p.waitForTimeout(300);
  ok(a.sent.length === 1 || a.sent[1].rows.every(r => r[3] > Math.max(...s1.rows.map(x => x[3]))), 'A4 an hour later only the new timings go (nothing sent twice)');
  await a.p.evaluate(() => T.openSettings()); await a.p.waitForTimeout(400);
  ok(!(await a.p.$('details[data-cg="speed"]')) && !(await a.p.$('#speed-body')), 'A5 Settings no longer has a Speed card');
  const o = await phone(46, true); await o.p.evaluate(() => T.checkRev()); await o.p.waitForTimeout(400);
  ok(o.sent.length === 0, 'B1 older script (v46): nothing sent (it wouldn\'t know the request)');
  const n = await phone(47, false); await n.p.evaluate(() => T.checkRev()); await n.p.waitForTimeout(400);
  ok(n.sent.length === 0, 'B2 a phone that isn\'t signed in sends nothing');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
