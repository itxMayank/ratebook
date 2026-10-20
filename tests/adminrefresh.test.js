/* Admin shop page and owner page refresh quietly (14 Oct 2026): the every-minute refresh doesn't dim or move anything; when
   the figures are the same nothing is redrawn; when they changed the page is redrawn in place (scroll, open "Show as table" /
   "Show more" and focus kept); a small "Updated" pill says it happened. Run: node tests/adminrefresh.test.js */
const fs = require('fs'), path = require('path');
const { launch, ok, done, ROOT } = require('./browser');
const { withCsp } = require('../tools/stamp');
const DIR = 'https://script.google.com/macros/s/DIRECTORY/exec', SH = 'SHARMA-AB12CD34EF', SH_API = 'https://script.google.com/macros/s/SHARMA/exec';
const html = withCsp(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').replace(/const DIR_URL = "[^"]*";/, `const DIR_URL = "${DIR}";`)
  .replace(/\}\)\(\);\s*<\/script>\s*<\/body>/, 'window.__T = { loadShopFull, ownLoad };\n})();\n</script>\n</body>'));   // test hook: the page's code is private
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'insights.json'), 'utf8'));
const day = n => new Date(Date.now() - n * 864e5 + 5.5 * 36e5).toISOString().slice(0, 10);
const perfDays = Array.from({ length: 7 }, (_, i) => ({ d: day(i), a: { list: [20, 0, 10, 0, 0, 9000, Array(8).fill(0)].flat() }, p: {}, l: {} }));
const shops = [{ code: 'main', name: 'Gupta Plastics', status: 'live', version: 50, apiUrl: 'x', scriptId: 'm', deploymentId: 'd' }, { code: SH, name: 'Sharma Traders', status: 'live', version: 50, apiUrl: SH_API, scriptId: 's', deploymentId: 'd2' }];
(async () => {
  const b = await launch(); const errs = [];
  async function page(url, o = {}) {
    const ctx = await b.newContext({ viewport: { width: o.w || 1280, height: 800 } }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    p.st = { bills: 4, slow: 0, n: 0 };
    await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await p.route('https://script.google.com/**', async r => { const q = r.request(), u = new URL(q.url()), send = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify(x) });
      if (u.pathname.includes('DIRECTORY')) { if (q.method() === 'GET') return send({ ok: true, code: SH, api: SH_API, name: 'Sharma Traders', status: 'live' });
        const bd = JSON.parse(q.postData()); if (p.st.slow) await new Promise(z => setTimeout(z, p.st.slow));
        if (bd.action === 'list') return send({ ok: true, shops, bizView: true }); if (bd.action === 'latest') return send({ ok: true, latest: { sv: 50 } });
        if (bd.action === 'recheck') return send({ ok: true, health: {} });
        if (bd.action === 'shopHealth') { p.st.n++; return send({ ok: true, health: { ok: true, sv: 50, at: Date.now(), ms: Math.random() * 100, bills: { today: p.st.bills, todayAmt: 100 * p.st.bills }, tbills: {}, perfDays, rows: {} } }); }
        if (bd.action === 'errors') return send({ ok: true, errors: [] });
        if (bd.action === 'shopInsights') return send({ ok: true, insights: Object.assign({}, FX, { at: Date.now() }) }); return send({ ok: true }); }
      const bd = JSON.parse(q.postData()); if (bd.action === 'verify') return send({ ok: true, tok: 'T1', me: { name: 'Sharma ji', role: 'owner' } });
      if (bd.action === 'insights') return send(Object.assign({}, FX, { at: Date.now(), pulse: Object.assign({}, FX.pulse, { today: Object.assign({}, FX.pulse.today, { sales: FX.pulse.today.sales + (p.st.bills - 4) }) }) }));
      return send({ ok: true }); });
    if (o.admin) await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rbadm_tok', '"ADM"'); sessionStorage.x = 1; } });
    await p.goto(url); await p.waitForTimeout(900); return p; }

  const a = await page(`https://rb.test/admin.html#shop/${SH}`, { admin: true });
  await a.waitForSelector('#tab-speed'); await a.click('#tab-speed'); await a.waitForSelector('#sp-tbl'); await a.evaluate(() => { document.getElementById('sp-speed').scrollIntoView(); window.scrollBy(0, 40); }); await a.click('#sp-tbl summary');
  const y0 = await a.evaluate(() => scrollY); await a.evaluate(() => { document.getElementById('sp-speed').__mark = 1; });
  // same figures: nothing redrawn
  a.st.slow = 500; const p1 = a.evaluate(c => __T.loadShopFull(c, true), SH); await a.waitForTimeout(200);
  ok(await a.evaluate(() => !document.querySelector('#sp .dim')), 'A1 while the quiet refresh reads, nothing on the page is dimmed');
  await p1; await a.waitForTimeout(100);
  ok(await a.evaluate(() => document.getElementById('sp-speed').__mark === 1) && Math.abs(await a.evaluate(() => scrollY) - y0) < 2 && await a.evaluate(() => document.getElementById('sp-tbl').open), 'A2 same figures: nothing is redrawn, the page stays where it was, "Show as table" stays open');
  ok(await a.isVisible('#rfpill.show') && /Updated \d/.test(await a.textContent('#rfpill')) && await a.evaluate(() => getComputedStyle(document.getElementById('rfpill')).pointerEvents) === 'none', 'A3 a small "Updated 12:46" pill shows (and doesn\'t take taps)');
  await a.waitForTimeout(2800); ok(!(await a.isVisible('#rfpill.show')), 'A4 …and goes after a few seconds');
  // changed figures: redrawn in place
  a.st.slow = 0; a.st.bills = 9; await a.evaluate(c => __T.loadShopFull(c, true), SH); await a.waitForTimeout(200);
  ok(await a.evaluate(() => document.getElementById('sp-speed').__mark === undefined) && /9/.test(await a.textContent('#sp-ov')), 'A5 new figures (9 bills today): the page is redrawn with them');
  ok(Math.abs(await a.evaluate(() => scrollY) - y0) < 2 && await a.evaluate(() => document.getElementById('sp-tbl').open) && await a.isVisible('#rfpill.show'), 'A6 …in place: same scroll position, "Show as table" still open, pill shown');
  await a.click('#tab-biz'); await a.waitForTimeout(200);
  await a.evaluate(() => { const d = document.querySelector('#spbz details.bz-more'); if (d) { d.open = true; d.scrollIntoView(); } }); const y1 = await a.evaluate(() => scrollY);
  a.st.bills = 11; await a.evaluate(c => __T.loadShopFull(c, true), SH); await a.waitForTimeout(200);
  ok(Math.abs(await a.evaluate(() => scrollY) - y1) < 2 && await a.evaluate(() => { const d = document.querySelector('#spbz details.bz-more'); return !d || d.open; }), 'A7 down in the Business part too: scroll kept and "Show more" stays open');
  // the owner's page
  const o = await page(`https://rb.test/admin.html?shop=${SH}`); await o.fill('#own-n', 'Sharma ji'); await o.fill('#own-pin', '739164'); await o.click('#b-own'); await o.waitForTimeout(700);
  await o.evaluate(() => { window.scrollTo(0, 900); document.querySelector('#bz').__m = 1; document.querySelector('#bz .bz-ch').__m = 1; }); const oy = await o.evaluate(() => scrollY);
  await o.evaluate(() => __T.ownLoad(true)); await o.waitForTimeout(150);
  ok(await o.evaluate(() => document.querySelector('#bz .bz-ch').__m === 1) && Math.abs(await o.evaluate(() => scrollY) - oy) < 2 && /Updated/.test(await o.textContent('#rfpill')), 'B1 owner\'s page: same figures, nothing redrawn, pill shows');
  o.st.bills = 6; await o.evaluate(() => __T.ownLoad(true)); await o.waitForTimeout(150);
  ok(await o.evaluate(() => !document.querySelector('#bz .bz-ch').__m) && Math.abs(await o.evaluate(() => scrollY) - oy) < 2 && !(await o.evaluate(() => document.querySelector('#bz').classList.contains('dim'))), 'B2 new figures: redrawn in place, same scroll, never dimmed');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
