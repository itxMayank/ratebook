/* The app's side of the v44 server rules: a signed-in phone asks for the price list and photos with its sign-in (POST),
   never by the public address; with an older script (which doesn't know POST list) it falls back to the old GET; and a phone
   that isn't signed in yet isn't shown as "offline" because the list is refused. Run: node tests/security.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,sync');
const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180, imgV: 2, imgs: 1 }];
(async () => {
  const b = await launch(); const errs = [];
  async function phone(sv, auth) {
    const reqs = [], ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const q = r.request(), u = new URL(q.url()), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ shop: 'main', ...o }) });
      const L = { ok: true, rev: '1', items, config: { shopName: 'Gupta', mode: 'live' }, sv };
      if (q.method() === 'GET') { const a = u.searchParams.get('action'); reqs.push('GET ' + a);
        if (a === 'rev') return send({ ok: true, rev: '1' });
        if (sv >= 44 && a !== 'rev') return send({ ok: false, error: 'need_signin' });
        if (a === 'thumbs') return send({ ok: true, thumbs: [{ id: 'i1', imgV: 2, thumb: 'data:image/png;base64,iVBORw0KGgo=' }] });
        return send(L); }
      const bd = JSON.parse(q.postData()); reqs.push('POST ' + bd.action + (bd.tok ? ' +tok' : ''));
      if (bd.action === 'boot') return send({ ok: false, error: 'bad_action' });   // force the normal list request
      if (bd.action === 'list') return sv >= 44 ? send(L) : send({ ok: false, error: 'bad_action' });
      if (bd.action === 'thumbs') return sv >= 44 ? send({ ok: true, thumbs: [{ id: 'i1', imgV: 2, thumb: 'data:image/png;base64,iVBORw0KGgo=' }] }) : send({ ok: false, error: 'bad_action' });
      return send({ ok: true, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }); });
    if (auth) await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 'tok1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })));
    await p.goto('https://rb.test/'); await p.waitForTimeout(1500); return { p, reqs };
  }
  const a = await phone(44, true);
  ok(a.reqs.includes('POST list +tok') && !a.reqs.includes('GET list'), 'signed-in phone, new script: price list asked for with its sign-in, never by the public address');
  ok(await a.p.evaluate(() => T.S.items.length) === 1, '…and the list arrives');
  await a.p.waitForTimeout(1500);
  ok(a.reqs.includes('POST thumbs +tok') && !a.reqs.includes('GET thumbs'), 'photos (thumbnails) too');
  const o = await phone(43, true);
  ok(o.reqs.includes('POST list +tok') && o.reqs.includes('GET list') && await o.p.evaluate(() => T.S.items.length) === 1, 'older script (no POST list yet): falls back to the old request, list arrives');
  const n = await phone(44, false);
  ok(n.reqs.includes('GET list') && await n.p.evaluate(() => T.S.online !== false), 'not signed in yet: list refused, but not shown as "offline"');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
