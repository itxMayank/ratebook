/* No password / autofill pop-up on the app's boxes (21 Oct 2026). Reported: tapping the search or any box on a phone opened the
   phone's saved-passwords dialog. The PIN boxes were real password fields, so the password manager saved the shop's PIN and
   offered it everywhere. Now no box in the app is a password field (PINs show as dots), and every box has autocomplete off.
   Run: node tests/noautofill.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,setTab,addToBill,openDetail');
const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180 }];
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.dismiss());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 21, nextGstBill: 7 };
    if (q.method() === 'GET') return send({ rev: '1', sv: 65 });
    const bd = JSON.parse(q.postData());
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } };
    if (bd.action === 'verify') return send({ me, tok: 'T1' });
    if (bd.action === 'boot' || bd.action === 'list') return send({ rev: '1', items, config: cfg, sv: 65, me });
    if (bd.action === 'listUsers') return send({ users: [], shopPinOff: true });
    if (bd.action === 'listSessions') return send({ sessions: [] });
    return send({}); });
  const audit = () => p.evaluate(() => [...document.querySelectorAll('input,textarea')].filter(e => !/^(checkbox|radio|hidden|file|date|range)$/.test(e.type))
    .map(e => ({ id: e.id || e.className || e.name, type: e.type, ac: e.getAttribute('autocomplete') || '' })));
  const bad = L => L.filter(x => x.type === 'password' || !(x.ac === 'off' || /^rb-/.test(x.ac)));
  // the sign-in screen (nobody signed in yet)
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200);
  let A = await audit();
  ok(A.some(x => x.id === 'al-pin') && !bad(A).length, 'A1 sign-in screen: name and PIN boxes aren\'t password fields and have autofill off' + (bad(A).length ? ': ' + JSON.stringify(bad(A)) : ''));
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('#al-pin')).webkitTextSecurity) === 'disc', 'A2 the PIN still shows as dots');
  await p.fill('#al-name', 'Mayank'); await p.fill('#al-pin', '739164'); await p.click('#al-go').catch(() => p.press('#al-pin', 'Enter')); await p.waitForTimeout(1500);
  if (await p.evaluate(() => document.documentElement.classList.contains('locked'))) await p.evaluate(() => T.appUnlock());
  await p.waitForTimeout(500);
  // the app's own boxes: search, the bill page, Settings with the PIN forms
  await p.evaluate(() => { T.addToBill('i1'); T.setTab('bill'); }); await p.waitForTimeout(400);
  A = await audit();
  ok(A.length > 5 && !bad(A).length, `B1 after signing in, all ${A.length} boxes on the page (search, customer, mobile, qty, rate…) have autofill off` + (bad(A).length ? ': ' + JSON.stringify(bad(A)) : ''));
  await p.evaluate(() => T.setTab('tools')); await p.click('#t-settings'); await p.waitForTimeout(600);
  for (const k of await p.$$eval('details.cg', d => d.map(x => x.dataset.cg))) { await p.click(`details[data-cg="${k}"] summary`); await p.waitForTimeout(200); }
  await p.click('#cf-mpopen').catch(() => {}); await p.waitForTimeout(200);
  A = await audit();
  ok(A.some(x => x.id === 'cf-p1') && !bad(A).length, 'B2 Settings (Change my PIN, shop PIN, Gemini key, every card): no password fields, autofill off' + (bad(A).length ? ': ' + JSON.stringify(bad(A).slice(0, 5)) : ''));
  ok(await p.evaluate(() => [...document.querySelectorAll('[data-pin]')].every(e => getComputedStyle(e).webkitTextSecurity === 'disc')), 'B3 every PIN box there shows dots');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); done();
})();
