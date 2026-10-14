/* Business dashboard (admin.html, 13 Oct 2026; charts 14 Oct): a shop owner opens admin.html?shop=<code> (from the app: Tools → Business dashboard),
   signs in with their own app name + PIN and sees only their own business page, in English or Hindi, with no other shops and
   no technical details; staff and managers are refused. The admin sees each shop's business page on its shop page (through
   the Directory), and can switch other shops' business pages off for good. Run: node tests/adminbiz.test.js */
const fs = require('fs'), path = require('path');
const { launch, ok, done, ROOT } = require('./browser');
const { withCsp } = require('../tools/stamp');
const DIR = 'https://script.google.com/macros/s/DIRECTORY/exec', SH = 'SHARMA-AB12CD34EF', SH_API = 'https://script.google.com/macros/s/SHARMA/exec';
const html = withCsp(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').replace(/const DIR_URL = "[^"]*";/, `const DIR_URL = "${DIR}";`));
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'insights.json'), 'utf8'));
const shops = [{ code: 'main', name: 'Gupta Plastics', status: 'live', version: 48, apiUrl: 'x', scriptId: 'm', deploymentId: 'd' }, { code: SH, name: 'Sharma Traders', status: 'live', version: 48, apiUrl: SH_API, scriptId: 's', deploymentId: 'd2' }];
(async () => {
  const b = await launch(); const errs = [];
  async function page(url, opts = {}) {
    const ctx = await b.newContext({ viewport: { width: opts.w || 1280, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' }), p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
    const log = { shop: [], dir: [] }; p.log = log;
    await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await p.route('https://script.google.com/**', async r => { const q = r.request(), u = new URL(q.url()), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
      if (u.pathname.includes('DIRECTORY')) {
        if (q.method() === 'GET') { log.dir.push('GET ' + u.searchParams.get('action') + ':' + u.searchParams.get('code')); return send(u.searchParams.get('code') === SH ? { ok: true, code: SH, api: SH_API, name: 'Sharma Traders', status: 'live' } : { ok: false, error: 'bad_code' }); }
        const bd = JSON.parse(q.postData()); log.dir.push(bd.action + (bd.code ? ':' + bd.code : ''));
        if (bd.tok !== 'ADM') return send({ ok: false, error: 'bad_session' });
        if (bd.action === 'list') return send({ ok: true, shops, bizView: !opts.off });
        if (bd.action === 'latest') return send({ ok: true, latest: { sv: 48 } });
        if (bd.action === 'recheck') return send({ ok: true, health: { main: { ok: true, sv: 48, bills: {}, tbills: {} }, [SH]: { ok: true, sv: 48, bills: {}, tbills: {} } } });
        if (bd.action === 'shopHealth') return send({ ok: true, health: { ok: true, sv: 48, bills: {}, tbills: {}, perfDays: [], rows: {} } });
        if (bd.action === 'errors') return send({ ok: true, errors: [] });
        if (bd.action === 'bizViewOff') { opts.off = true; return send({ ok: true, bizView: false }); }
        if (bd.action === 'shopInsights') return send(opts.old ? { ok: false, error: 'old_script' } : opts.off && bd.code !== 'main' ? { ok: false, error: 'biz_off' } : { ok: true, insights: Object.assign({}, FX, { env: bd.env || 'live' }) });
        return send({ ok: true }); }
      const bd = JSON.parse(q.postData()); log.shop.push(bd);
      if (bd.action === 'verify') { if (bd.pin === '739164') return send({ ok: true, tok: 'T1', me: { name: 'Sharma ji', role: 'owner' } }); if (bd.pin === '582014') return send({ ok: true, tok: 'T2', me: { name: 'Raju', role: 'manager' } }); return send({ ok: false, error: 'bad_pin' }); }
      if (bd.action === 'insights') return bd.tok === 'T1' ? send(Object.assign({}, FX, { env: bd.env })) : send({ ok: false, error: 'bad_session' });
      return send({ ok: true }); });
    if (opts.admin) await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rbadm_tok', '"ADM"'); sessionStorage.x = 1; } });
    await p.goto(url); await p.waitForTimeout(700); return p; }

  // A. a shop owner, from the app's link
  const o = await page(`https://rb.test/admin.html?shop=${SH}`);
  ok(await o.isVisible('#s-ownsi') && !(await o.isVisible('#own-codewrap')) && !(await o.isVisible('#s-signin')) && !(await o.isVisible('#topbtns')) && await o.textContent('.brand b') === 'Rate Book', 'A1 the link opens the owner sign-in (shop already known from the link); no admin sign-in, no admin buttons');
  await o.fill('#own-n', 'Sharma ji'); await o.fill('#own-pin', '111111'); await o.click('#b-own'); await o.waitForTimeout(400);
  ok(/Wrong name or PIN/.test(await o.textContent('#own-err')), 'A2 a wrong PIN says so');
  await o.fill('#own-pin', '582014'); await o.click('#b-own'); await o.waitForTimeout(400);
  ok(/Only the shop's owner/.test(await o.textContent('#own-err')) && o.log.shop.some(x => x.action === 'signOut' && x.tok === 'T2') && !(await o.isVisible('#s-own')), 'A3 a manager is refused, and that sign-in is closed at once');
  await o.fill('#own-pin', '739164'); await o.click('#b-own'); await o.waitForTimeout(700);
  const v = o.log.shop.find(x => x.action === 'verify' && x.pin === '739164');
  ok(v && v.shop === SH && v.wantTok && v.dl === 'Laptop · dashboard' && o.log.dir.join() === `GET shop:${SH},GET shop:${SH},GET shop:${SH}`, 'A4 signs in with the shop\'s own script (labelled "Laptop · dashboard"); the Directory is only asked for the shop\'s link');
  const page1 = await o.textContent('#s-own');
  ok(await o.isVisible('#s-own') && /Sharma Traders/.test(await o.textContent('#own-name')) && /Do this today/.test(page1) && await o.$$eval('#bz .fixes .fix', f => f.length) === 5, 'A5 their business page: shop name, "Do this today" with 5 things');
  ok(/Raise PP Bag to ₹133 \/kg/.test(page1) && /Remind Sunil Traders: ₹500 pending/.test(page1) && /Pay Mahaveer: ₹1,000 overdue/.test(page1), 'A6 …in plain words: raise PP Bag to ₹133, remind Sunil, pay Mahaveer');
  const wa = await o.getAttribute('#bz a[href^="https://wa.me/919876543210"]', 'href');
  ok(wa && /Sunil%20Traders/.test(wa) && /Sharma%20Traders/.test(wa), 'A7 Remind opens WhatsApp to Sunil with a ready message naming the shop');
  ok(['How sales are going', 'Margins', 'Items', 'Never run short', 'Customer credit', 'Vendors', 'Money in', 'People', 'Good habits'].every(t => page1.includes(t)), 'A8 all sections: sales, margins, items, never run short, credit, vendors, money in, people, good habits');
  ok(!/Speed|Errors|script v|Apps Script|health/i.test(page1) && !(await o.isVisible('#s-app')) && !(await o.isVisible('#topbtns')) && !o.log.dir.some(x => !/^GET shop/.test(x)), 'A9 nothing technical and no other shops: no speed, errors, versions or admin requests');
  ok(await o.$$eval('.bz-age i', a => a.length) === 2 && /31–60 days/.test(page1), 'A10 credit by age: a bar with the two ages that have money, and each age written out');
  // "Sold at many different rates": each row opens in place to show every rate (v52)
  const spRow = '#bz details.bz-sp';
  ok(await o.$$eval(spRow, D => D.length) >= 1 && !(await o.$eval(spRow, d => d.open)) && /See each rate/.test(await o.textContent(spRow + ' summary')), 'S1 a row under "Sold at many different rates" says "See each rate", closed at first');
  await o.click(spRow + ' summary'); await o.waitForTimeout(150);
  const spT = await o.$$eval(spRow + ' tbody tr', R => R.map(r => [...r.cells].map(c => c.textContent.trim()).join('|')));
  ok(spT.join(' / ') === '₹120 /kg|9 kg|8|— / ₹110 /kg|8 kg|8|₹75 / ₹100 /kg|8 kg|7|₹120', 'S2 tap: each rate with qty, bills and ₹ below list, adding up to the row\'s total: ' + spT.join(' / '));
  ok(/List price now: ₹120 \/kg/.test(await o.textContent(spRow)) && /₹190 of this is from bills made before 14 Oct 2026/.test(await o.textContent(spRow)), 'S3 the list price now, and how much was compared with today\'s price (older bills)');
  await o.click('#own-lang button[data-l="hi"]'); await o.waitForTimeout(200);
  ok(/आज ये करें/.test(await o.textContent('#bz')) && /कारोबार का डैशबोर्ड/.test(await o.textContent('#sub')) && await o.evaluate(() => document.documentElement.lang) === 'hi', 'A11 in Hindi too (the switch at the top)');
  await o.click('#own-lang button[data-l="en"]'); await o.click('#bz-env button[data-env="test"]'); await o.waitForTimeout(500);
  ok(o.log.shop.filter(x => x.action === 'insights').pop().env === 'test' && /Test/.test(await o.textContent('#bz-env .on')), 'A12 Real / Test switch asks for test-mode figures');
  await o.reload(); await o.waitForTimeout(700);
  ok(await o.isVisible('#s-own') && !(await o.isVisible('#s-ownsi')), 'A13 stays signed in on this laptop');
  await o.click('#b-ownout'); await o.waitForTimeout(300);
  ok(await o.isVisible('#s-ownsi') && o.log.shop.some(x => x.action === 'signOut' && x.tok === 'T1') && await o.evaluate(() => localStorage.rbadm_own) === 'null', 'A14 sign out: the sign-in is closed on the shop\'s script too');
  // phone width, dark
  const ph = await page(`https://rb.test/admin.html?shop=${SH}`, { w: 360, dark: true });
  await ph.fill('#own-n', 'Sharma ji'); await ph.fill('#own-pin', '739164'); await ph.click('#b-own'); await ph.waitForTimeout(700);
  ok(await ph.isVisible('#bz .fixes') && await ph.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'A15 360 px wide in dark: fits, nothing spills sideways');
  ok(await ph.evaluate(() => [...document.querySelectorAll('#bz .fix b, #bz .stat b, #bz .arow .an')].every(e => e.scrollWidth <= e.clientWidth + 1)), 'A16 no title, amount or name cut off');
  await ph.click('#bz details.bz-sp summary'); await ph.click('#own-lang button[data-l="hi"]'); await ph.waitForTimeout(200);
  await ph.evaluate(() => document.querySelectorAll('#bz details.bz-sp').forEach(d => d.open = true));
  ok(await ph.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#bz .bz-spb td, #bz .bz-spb th')].every(e => e.scrollWidth <= e.clientWidth + 1)) && /लिस्ट से कम/.test(await ph.textContent('#bz details.bz-sp')), 'S4 the rate table at 360 px, dark, in Hindi: fits, nothing cut');
  if (process.env.SHOT) await (await ph.$('#bz details.bz-sp')).screenshot({ path: process.env.SHOT + '/biz-rates-hi-dark.png' });
  await ph.click('#own-lang button[data-l="en"]'); await ph.waitForTimeout(200);
  if (process.env.SHOT) { await ph.emulateMedia({ colorScheme: 'light' }); await ph.evaluate(() => document.querySelectorAll('#bz details.bz-sp').forEach(d => d.open = true)); await (await ph.$('#bz details.bz-sp')).screenshot({ path: process.env.SHOT + '/biz-rates-en.png' }); await ph.emulateMedia({ colorScheme: 'dark' }); }
  if (process.env.SHOT) { await ph.screenshot({ path: process.env.SHOT + '/biz-phone-dark.png', fullPage: true }); await o.setViewportSize({ width: 1280, height: 900 }); }
  // C. charts (v49 series)
  const c = await page(`https://rb.test/admin.html?shop=${SH}`);
  await c.fill('#own-n', 'Sharma ji'); await c.fill('#own-pin', '739164'); await c.click('#b-own'); await c.waitForTimeout(800);
  ok(await c.$$eval('#bz .chart[data-ch]', E => E.map(e => e.dataset.ch + ':' + !!e.querySelector('svg')).join()) === 'sales:true,run:true,margin:true,due:true', 'C1 four charts: sales, this month vs last, margin each week, owed by customers');
  ok(await c.$$eval('#bz .chart[data-ch="sales"] .hit', h => h.length) === 30 && /Sales each day/.test(await c.textContent('#bz')), 'C2 sales: one bar a day for 30 days');
  const tipOf = async (ch, i) => { const h = await c.$$(`#bz .chart[data-ch="${ch}"] .hit`); await h[i < 0 ? h.length + i : i].scrollIntoViewIfNeeded(); await h[i < 0 ? h.length + i : i].hover(); await c.waitForTimeout(80); return c.textContent('#tip'); };
  ok(/₹620/.test(await tipOf('sales', -1)) && /2 bills/.test(await c.textContent('#tip')) && /Profit ₹90/.test(await c.textContent('#tip')), 'C3 hover today: ₹620, 2 bills, profit ₹90');
  await c.click('#bz .chart[data-ch="sales"] details summary');
  const rows = await c.$$eval('#bz .chart[data-ch="sales"] tbody tr', R => R.map(r => r.textContent));
  ok(rows.length === 30 && /₹620/.test(rows[0]), 'C4 "Show as table": 30 rows, newest first');
  await c.click('#bz-per button[data-per="90"]'); await c.waitForTimeout(150);
  ok(await c.$$eval('#bz .chart[data-ch="sales"] .hit', h => h.length) === 13 && /Sales each week/.test(await c.textContent('#bz .bz-ch .bz-cht b')) && await c.evaluate(() => localStorage.rbadm_bzPer) === '90', 'C5 90 days: one bar a week (13), remembered on this laptop');
  ok(await c.$$eval('#bz .chart[data-ch="run"] path.ln', P => P.length === 2 && P.some(p => p.classList.contains('dash'))) && await c.$$eval('#bz .bz-cht .legend', L => L.some(l => /This month/.test(l.textContent) && /Last month/.test(l.textContent))), 'C6 this month vs last month: two lines, last month dashed, with a legend');
  ok(/₹700/.test(await tipOf('due', -1)) && await c.$$eval('#bz .chart[data-ch="margin"] path.ln', P => P.length) === 1, 'C7 owed by customers ends at ₹700 today (= the credit total); margin line drawn');
  ok(await c.$$eval('#bz .bz-h5', H => H.some(h => /When vendor payments fall due/.test(h.textContent))) && /Overdue[\s\S]*₹1,000/.test(await c.textContent('#bz')), 'C8 vendor payments by when they fall due: ₹1,000 overdue');
  const ch = await page(`https://rb.test/admin.html?shop=${SH}`, { w: 360 }); await ch.evaluate(() => localStorage.setItem('rbadm_lang', '"hi"'));
  await ch.reload(); await ch.waitForTimeout(500); await ch.fill('#own-n', 'Sharma ji'); await ch.fill('#own-pin', '739164'); await ch.click('#b-own'); await ch.waitForTimeout(800);
  const lap = await ch.$$eval('#bz .chart svg', S => S.every(sv => { const t = [...sv.querySelectorAll('text.ax')].filter(x => +x.getAttribute('y') > 150).map(x => x.getBoundingClientRect()); return t.every((r, i) => !i || r.left >= t[i - 1].right - 1); }));
  ok(/हर दिन की बिक्री/.test(await ch.textContent('#bz')) && lap && await ch.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), 'C9 360 px in Hindi: chart titles in Hindi, date labels never overlap, nothing spills sideways');
  // the original shop's own owner: ?shop=main, no shop code asked
  const mo = await page('https://rb.test/admin.html?shop=main');
  ok(await mo.isVisible('#s-ownsi') && !(await mo.isVisible('#own-codewrap')), 'A17 the original shop\'s link works the same (no code to type)');

  // B. the admin
  const a = await page(`https://rb.test/admin.html#shop/${SH}`, { admin: true });
  await a.waitForTimeout(600);
  ok(await a.isVisible('#sp-biz') && /Do this today/.test(await a.textContent('#sp-biz')) && a.log.dir.includes('shopInsights:' + SH), 'B1 the admin sees each shop\'s business page on its shop page (through the Directory)');
  ok(await a.isVisible('#sp-speed') && await a.isVisible('#sp-err'), 'B2 …next to the technical sections');
  if (process.env.SHOT) await a.screenshot({ path: process.env.SHOT + '/biz-admin.png', fullPage: true });
  await a.click('#sp-back'); await a.waitForTimeout(300);
  ok(/for testing/.test(await a.textContent('#bizoff')) && await a.isVisible('#b-bizoff'), 'B3 the shops list says other shops\' business pages are visible for testing');
  await a.click('#b-bizoff'); await a.waitForTimeout(400);
  ok(a.log.dir.includes('bizViewOff') && /switched off/.test(await a.textContent('#bizoff')) && !(await a.isVisible('#b-bizoff')), 'B4 Turn off for good: off, and no button to turn it back on');
  await a.evaluate(h => { location.hash = h; }, '#shop/' + SH); await a.waitForTimeout(700);
  ok(/switched off/.test(await a.textContent('#sp-biz')) && await a.isVisible('#sp-speed'), 'B5 another shop\'s page: business switched off, technical sections still there');
  await a.evaluate(() => { location.hash = '#shop/main'; }); await a.waitForTimeout(700);
  ok(/Do this today/.test(await a.textContent('#sp-biz')), 'B6 your own shop\'s business page still shows');
  const ao = await page(`https://rb.test/admin.html?shop=${SH}`, { admin: true, old: true }); await ao.waitForTimeout(600);
  ok(/#shop\//.test(ao.url()) && /v48 or newer/.test(await ao.textContent('#sp-biz')), 'B7 the app\'s link on the admin\'s own laptop opens that shop\'s admin page; an older script says it needs v48');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
