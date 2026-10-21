/* Past bills with archived years (app, script v67): the phone's copy holds only the Bills tab; choosing an archived year (or a
   search past the copy) asks the sheet, including the archive, page by page; an archived bill opens from its year's tab and can be
   shared, printed and repeated, but not edited, cancelled or transferred. Run: node tests/archive.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openBills');
const pad = n => String(n).padStart(2, '0'), dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const mk = (n, d, o) => ({ n, id: 'b' + n, row: n + 1, date: d.toISOString(), day: dk(d), customer: 'Ravi', mobile: '', total: 100, items: 'PP Bag 1 kg = 100', gst: false, edits: 0, pay: 'Paid', paid: 0, due: 0, payments: [], fy: '', cancelled: false, ...o });
const now = new Date(); now.setHours(11, 0, 0, 0);
const recent = [mk(30, now), mk(29, now)];
const old = Array.from({ length: 3 }, (_, i) => mk(5 - i, new Date(`2023-0${6 + i}-10T06:00:00Z`), { arc: '2023-24', row: 4 - i, customer: 'First Ever' }));
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); const sent = [];
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Gupta Plastics', mode: 'live', nextBill: 31, nextGstBill: 1 };
    const items = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 90, sell: 100 }];
    if (req.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 67 });
    const bd = JSON.parse(req.postData()); sent.push(bd);
    if (bd.action === 'listBills' && bd.full) return send({ full: true, brev: '1', bills: recent, years: [String(now.getFullYear()), '2024', '2023'], arcY: ['2023', '2024'] });
    if (bd.action === 'listBills') { const all = bd.from && bd.from.startsWith('2023') ? old : [...recent, ...old].filter(x => !bd.q || /first/i.test(bd.q) === (x.customer === 'First Ever'));
      const skip = +bd.skip || 0, page = all.slice(skip, skip + 2);
      return send({ bills: page, all: { count: all.length, total: all.length * 100 }, days: {}, months: {}, years: ['2023'], more: skip + 2 < all.length, next: skip + page.length, arcY: ['2023', '2024'] }); }
    if (bd.action === 'getBill') { const x = old.find(y => y.id === bd.id) || recent.find(y => y.id === bd.id) || {}; return send({ bill: { ...x, text: `*Gupta Plastics*\nBill No. ${x.n}\n= ₹100\nTotal: ₹100`, lines: [{ id: 'i1', name: 'PP Bag', unit: 'kg', qty: 1, rate: 100 }] } }); }
    if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 67, me });
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const cards = () => p.$$eval('#bl-list .billcard', x => x.map(e => e.querySelector('b').textContent.trim()));
  await p.evaluate(() => T.openBills()); await p.waitForTimeout(1200);
  ok((await cards()).length === 2, 'A1 Past bills opens from the phone\'s copy (this year\'s 2 bills)');
  const yrs = await p.$$eval('#bl-year option', x => x.map(o => o.value));
  ok(yrs.includes('2023'), 'A2 the Year filter still lists 2023 (its bills are in the archive)');
  sent.length = 0; await p.selectOption('#bl-year', '2023'); await p.waitForTimeout(800);
  const q = sent.find(x => x.action === 'listBills' && !x.full);
  ok(q && q.arc === 1 && q.from === '2023-01-01' && q.skip === 0, 'B1 choosing 2023 asks the sheet, archive included (arc), from the first page');
  ok((await cards()).length === 2 && await p.isVisible('#bl-more'), 'B2 the archived bills show, with "Show more bills"');
  sent.length = 0; await p.click('#bl-more'); await p.waitForTimeout(800);
  const q2 = sent.find(x => x.action === 'listBills');
  ok(q2 && q2.skip === 2 && (await cards()).length === 3, 'B3 the next page goes on by count (skip 2), no bill twice (3 in all)');
  sent.length = 0; await p.click('#bl-list .billcard'); await p.waitForTimeout(900);
  const gb = sent.find(x => x.action === 'getBill');
  ok(gb && gb.arc === '2023-24', 'C1 opening an archived bill reads it from its year (2023-24)');
  ok(await p.isVisible('.arcnote') && /2023-24/.test(await p.textContent('.arcnote')), 'C2 the bill says it\'s archived and can\'t be changed');
  ok(!(await p.$('#bd-edit')) && !(await p.$('#bd-cancel')) && !(await p.$('#bd-move')), 'C3 no Edit, Cancel or Transfer on it');
  ok(await p.isVisible('#bd-repeat') && await p.isVisible('#bd-pdf') && await p.isVisible('#bd-wa'), 'C4 Repeat as new bill, PDF and WhatsApp are still there');
  await p.evaluate(() => document.querySelector('#bd-back').click()); await p.waitForTimeout(400);
  await p.selectOption('#bl-year', ''); await p.waitForTimeout(600);
  await p.fill('#bl-q', 'first'); await p.dispatchEvent('#bl-q', 'input'); await p.waitForTimeout(600);
  ok(await p.isVisible('#bl-older'), 'D1 searching: "Search older bills on the sheet" is offered (archived years exist)');
  sent.length = 0; await p.click('#bl-older'); await p.waitForTimeout(800);
  const q3 = sent.find(x => x.action === 'listBills' && !x.full);
  ok(q3 && q3.arc === 1 && q3.q === 'first' && (await cards()).length === 2, 'D2 …which searches the archive too');
  ok(!errs.length, 'E1 no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
