/* Who sees buy rates, on the phone (21 Oct 2026, script v65): a staff phone gets no buy rates from the sheet and shows none, but
   still sees an amber "Low margin" tag (no numbers) when a bill line's rate is too low; the owner sees "Low margin" and red
   "Below cost"; the owner picks who may see buy rates and the margin in Settings; a "sold below cost" notice opens the bill.
   Run: node tests/buyview.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,addToBill,setTab,appUnlock,openDetail,profitOf');
const full = [{ id: 'i1', name: 'PP Bag', unit: 'kg', buy: 150, sell: 180 }, { id: 'i2', name: 'Paper Cup', unit: 'box', buy: 100, sell: 160, altUnit: 'packet', altQty: 4, altSell: 45 }];
const stripped = full.map(i => ({ ...i, buy: null, lo: Math.ceil(i.buy * 1.05) }));
(async () => {
  const b = await launch(); const errs = [];
  async function phone(role, o = {}) {
    const ctx = await b.newContext({ viewport: o.vp || { width: 390, height: 844 }, colorScheme: o.dark ? 'dark' : 'light' }), p = await ctx.newPage(); p.sent = [];
    p.on('pageerror', e => errs.push(role + ': ' + e.message)); p.on('dialog', d => d.accept());
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...x }) });
      const cfg = { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg', nextBill: 21, nextGstBill: 7, ...(o.old ? {} : { buyView: 'manager', lowMargin: o.lm === undefined ? 5 : o.lm }) };
      const items = role === 'staff' && !o.old ? stripped : full;
      if (q.method() === 'GET') return send({ rev: '1', sv: o.old ? 64 : 65, bl: '0', bt: '0', vl: '0', vt: '0', nl: '1', nt: '0' });
      const bd = JSON.parse(q.postData()); p.sent.push(bd);
      const me = { name: role === 'staff' ? 'Raju' : 'Mayank', role, personal: true, prefs: { mode: 'live', showProfit: true }, buyOk: role !== 'staff' };
      if (bd.action === 'boot' || bd.action === 'list') return send({ rev: '1', items, config: cfg, sv: o.old ? 64 : 65, me, ...(role === 'staff' && !o.old ? { noBuy: true } : {}) });
      if (bd.action === 'takeBill') return send({ n: bd.bill.n });
      if (bd.action === 'notices') return send({ nrev: '1', list: [{ id: 'nb1', at: Date.now() - 6e4, kind: 'below', vendorId: '', entryId: 'b21', vname: 'Sunil', amount: 141, billNo: "'21", extra: { gst: false, row: 22, l: [{ n: 'PP Bag', r: 140, u: 'kg' }], more: 1 }, by: 'Raju', read: false }] });
      if (bd.action === 'listBills') return send({ full: true, brev: '1', bills: [], years: [] });
      if (bd.action === 'getBill') return send({ bill: { id: 'b21', n: 21, text: 'Bill No: 21', lines: [], total: 141, pay: 'Paid', payments: [] } });
      if (bd.action === 'priceHist') return send({ hist: [], count: 0 });
      return send({ me }); });
    await p.addInitScript(([r, fz]) => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: r === 'staff' ? 'Raju' : 'Mayank', role: r, personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live', showProfit: true } })); if (fz) localStorage.setItem('rb_fz', String(fz)); }, [role, o.fz || 0]);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1300); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400); return p; }
  const rate = async (p, v) => { await p.fill('#br-0', String(v)); await p.waitForTimeout(150); return p.evaluate(() => { const t = document.querySelector('.bill-line[data-i="0"] .mgtag'); return t ? t.className.replace('mgtag ', '') + ':' + t.textContent : ''; }); };

  // A. a staff phone
  const s = await phone('staff');
  const sText = await p_text(s, '#view-items');
  ok(!/Buy|Margin|₹150/.test(sText), 'A1 staff: the price list shows no buy rate or margin');
  await s.evaluate(() => T.openDetail('i1')); await s.waitForTimeout(600);
  ok(!/Buy|Margin|150/.test(await s.textContent('#sheet-body')), 'A2 …nor the item screen');
  await s.evaluate(() => document.querySelector('#sheet-close').click()); await s.waitForTimeout(300);
  await s.evaluate(() => { T.addToBill('i1'); T.setTab('bill'); }); await s.waitForTimeout(400);
  ok(await rate(s, 180) === '', 'A3 at the list price (₹180): no tag');
  ok(await rate(s, 157) === 'low:Low margin', 'A4 at ₹157 (under the ₹158 the sheet sent): amber "Low margin", no numbers');
  ok(await rate(s, 100) === 'low:Low margin', 'A5 at ₹100 (below cost): still only "Low margin", so staff can\'t tell where the cost is');
  ok(await s.isHidden('#bill-profit'), 'A6 no profit on the bill');
  await rate(s, 170); await s.click('#bill-done'); await s.waitForTimeout(900);
  const sb = s.sent.find(x => x.action === 'takeBill');
  ok(sb && sb.bill.lines[0].rate === 170 && !(+sb.bill.lines[0].buy > 0), 'A7 the bill goes to the sheet without a buy rate (the sheet adds it)');
  await s.evaluate(() => { T.setTab('tools'); }); await s.click('#t-settings'); await s.waitForTimeout(500); await s.click('details[data-cg="me"] summary'); await s.waitForTimeout(300);
  ok(/hidden on your phone by the shop's owner/.test(await s.textContent('#sheet-body')) && !(await s.isVisible('#cf-hide')), 'A8 Settings says the owner hid them (no "Hide buy rate" switch to turn back on)');
  await s.close();

  // B. the owner
  const o = await phone('owner');
  await o.evaluate(() => { T.addToBill('i1'); T.addToBill('i2'); T.setTab('bill'); }); await o.waitForTimeout(400);
  ok(await rate(o, 160) === '', 'B1 owner: ₹160 on a ₹150 buy (6.7%): no tag');
  ok(await rate(o, 155) === 'low:Low margin', 'B2 ₹155 (3.3%, under 5%): "Low margin"');
  ok(await rate(o, 140) === 'below:Below cost', 'B3 ₹140: red "Below cost"');
  const col = await o.evaluate(() => { const t = document.querySelector('.mgtag'), cs = getComputedStyle(t); return [cs.color, cs.backgroundColor]; });
  const lum = c => { const v = c.match(/\d+/g).slice(0, 3).map(x => { x = x / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const cr = (a, b2) => { const [x, y] = [lum(a), lum(b2)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  ok(cr(col[0], col[1]) >= 4.5, 'B4 the tag\'s text is readable (contrast ' + cr(col[0], col[1]).toFixed(1) + ':1)');
  await o.evaluate(() => { document.querySelector('.bill-line[data-i="1"] [data-unitsw]').click(); }); await o.waitForTimeout(300);
  await o.fill('#br-1', '24'); await o.waitForTimeout(150);
  ok(await o.evaluate(() => (document.querySelector('.bill-line[data-i="1"] .mgtag') || {}).textContent) === 'Below cost', 'B5 a packet line (₹100 a box of 4 = ₹25 a packet) at ₹24: "Below cost"');
  // the tag must not move anything: name, number circle and controls stay where they are without it
  const geo = () => o.evaluate(() => { const L = document.querySelector('.bill-line[data-i="0"]'), nm = L.querySelector('.name'), r = x => x.getBoundingClientRect();
    const tx = document.createRange(); tx.selectNodeContents(nm.firstChild); const t0 = tx.getBoundingClientRect(), tg = L.querySelector('.mgtag'), c = r(L.querySelector('.ctrl'));
    const circ = getComputedStyle(nm, '::before').width; return { nameX: Math.round(t0.left), circ, tag: tg ? { x: Math.round(r(tg).left), top: r(tg).top, bottom: r(tg).bottom } : null, nameBottom: t0.bottom, ctrlTop: c.top, spill: document.documentElement.scrollWidth - innerWidth }; });
  await o.fill('#br-0', '180'); await o.waitForTimeout(150); const g0 = await geo();
  await o.fill('#br-0', '140'); await o.waitForTimeout(150); const g1 = await geo();
  ok(g1.tag && g1.nameX === g0.nameX && g1.circ === g0.circ, `B5a the tag doesn't push the name or change the number circle (name at ${g0.nameX} → ${g1.nameX} px, circle ${g0.circ} → ${g1.circ})`);
  ok(g1.tag && g1.tag.x >= g1.nameX - 1 && g1.tag.top >= g1.nameBottom - 1 && g1.tag.bottom <= g1.ctrlTop + 1 && g1.spill <= 0, 'B5b it sits under the name, lined up with it, above the controls, nothing spills sideways');
  // Settings: who sees buy rates, and the margin
  await o.evaluate(() => { T.setTab('tools'); }); await o.click('#t-settings'); await o.waitForTimeout(600);
  await o.click('details[data-cg="ppl"] summary'); await o.waitForTimeout(300);
  ok(await o.getAttribute('[data-bv="manager"]', 'aria-pressed') === 'true', 'B6 People & security: "Owner and managers" is the choice now');
  await o.click('[data-bv="owner"]'); await o.click('details[data-cg="items"] summary'); await o.waitForTimeout(200);
  await o.fill('#cf-lowm', '150'); await o.click('#cf-save'); await o.waitForTimeout(300);
  ok(/0–100/.test(await o.textContent('#cf-err')), 'B7 a margin of 150%: refused');
  await o.fill('#cf-lowm', '8'); await o.click('#cf-save'); await o.waitForTimeout(800);
  const sc = o.sent.filter(x => x.action === 'setConfig').pop();
  ok(sc && sc.config.buyView === 'owner' && sc.config.lowMargin === 8, 'B8 saved: "Owner only", 8%');
  // the notice
  await o.click('#nbell'); await o.waitForTimeout(700);
  const row = await o.textContent('#n-list');
  ok(/Bill 21: PP Bag sold at ₹140 \/kg, below cost/.test(row) && /\+1 more below cost/.test(row) && /Raju/.test(row), 'B9 the bell: "Bill 21: PP Bag sold at ₹140 /kg, below cost · +1 more · by Raju"');
  await o.click('[data-nid="nb1"]'); await o.waitForTimeout(900);
  ok(o.sent.some(x => x.action === 'getBill' && x.id === 'b21'), 'B10 tapping it opens that bill');
  await o.close();

  // the same at 320 px with the largest text
  { const x = await phone('owner', { vp: { width: 320, height: 640 }, fz: 1.38 }); await x.evaluate(() => { T.addToBill('i1'); T.setTab('bill'); }); await x.waitForTimeout(400);
    const g = async v => { await x.fill('#br-0', String(v)); await x.waitForTimeout(150); return x.evaluate(() => { const L = document.querySelector('.bill-line[data-i="0"]'), nm = L.querySelector('.name'), tx = document.createRange(); tx.selectNodeContents(nm.firstChild);
      const tg = L.querySelector('.mgtag'); return { nameX: Math.round(tx.getBoundingClientRect().left), tagX: tg ? Math.round(tg.getBoundingClientRect().left) : null, spill: document.documentElement.scrollWidth - innerWidth }; }); };
    const a0 = await g(180), a1 = await g(140);
    ok(a1.tagX !== null && a1.nameX === a0.nameX && a1.tagX >= a1.nameX - 1 && a1.spill <= 0, 'B5c 320 px, largest text: same, the name stays put and the tag sits under it');
    await x.close(); }
  // C. switched off, and an older script
  const z = await phone('owner', { lm: 0 }); await z.evaluate(() => { T.addToBill('i1'); T.setTab('bill'); }); await z.waitForTimeout(300);
  ok(await rate(z, 100) === '', 'C1 margin warning set to 0: no tags');
  await z.close();
  const old = await phone('staff', { old: true });
  ok(/Buy/.test(await p_text(old, '#view-items')), 'C2 a shop still on an older script: nothing changes for staff until it\'s updated');
  await old.close();
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close(); done();
})();
async function p_text(p, sel) { return p.evaluate(s => document.querySelector(s).innerText, sel); }
