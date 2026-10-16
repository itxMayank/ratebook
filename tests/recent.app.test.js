/* Recent items in the search (15 Oct 2026): tap the search with nothing typed → "Recently billed" (the items this phone last
   added to a bill, newest first) with + to add, ✕ to forget one and "Clear all"; while typing, the recent items that match
   come first under "Recent", then "All items". Prices and Bill tabs, search at the bottom and at the top, Hindi, small phone.
   Per phone and per shop; an item deleted from the list drops out. Any page error fails. Run: node tests/recent.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,addToBill,setTab,recentIds,applyItems');
const items = ['PP Bag 12x18', 'PP Bag 16x20', 'PP Liner 24x30', 'Paper Cup 150ml', 'Paper Cup 250ml', 'Aluminium Foil 9m', 'Cling Film', 'Tissue Roll', 'Wooden Spoon', 'Straw', 'Garbage Bag', 'Clear PP Pouch']
  .map((n, i) => ({ id: 'i' + i, name: n, unit: 'pc', buy: 10 + i, sell: 14 + i }));
(async () => {
  const b = await launch(); const errs = [];
  async function phone(w, h, o = {}) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'Gupta Plastics', mode: 'live', nextBill: 5 }, sv: 56, bl: '0', bt: '0', vl: '0', vt: '0', me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } }) }));
    await p.addInitScript(o => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } }));
      if (o.spos) localStorage.setItem('rb_spos', JSON.stringify(o.spos)); if (o.lang) localStorage.setItem('rb_lang', JSON.stringify(o.lang)); if (o.fz) localStorage.setItem('rb_fz', JSON.stringify(o.fz)); if (o.rec) localStorage.setItem('rb_recent', JSON.stringify(o.rec)); }, o);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(400); return p;
  }
  const rect = (p, s) => p.$eval(s, e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, vis: r.height > 0 && getComputedStyle(e).display !== 'none' }; }).catch(() => ({ vis: false }));
  const names = (p, s) => p.$$eval(s, els => els.map(e => { const n = e.querySelector('.name').cloneNode(true); n.querySelectorAll('.msub').forEach(x => x.remove()); return n.textContent.trim(); }));
  const blurQ = p => p.evaluate(() => document.querySelector('#q').blur()).then(() => p.waitForTimeout(350));
  const typeQ = async (p, v) => { await p.evaluate(v => { const q = document.querySelector('#q'); q.value = v; q.dispatchEvent(new Event('input', { bubbles: true })); }, v); await p.waitForTimeout(250); };
  const focused = p => p.evaluate(() => document.activeElement && document.activeElement.id === 'q');

  /* A. Prices, search at the bottom */
  const p = await phone(390, 844);
  await p.focus('#q'); await p.waitForTimeout(300);
  ok(!(await p.$('#list .rchead')) && (await p.$$('#list .card')).length > 5, 'A1 nothing billed yet: tapping the search shows the list as before (no empty panel)');
  await blurQ(p);
  await p.evaluate(() => { T.addToBill('i0'); T.addToBill('i3'); T.addToBill('i5'); }); await p.waitForTimeout(300);
  await p.focus('#q'); await p.waitForTimeout(400);
  ok(/Recently billed/.test(await p.textContent('#list .rchead')) && await p.isVisible('#list [data-rcclr]'), 'A2 tap the search: "Recently billed" with Clear all');
  ok(JSON.stringify(await names(p, '#list .rcrow')) === JSON.stringify(['Aluminium Foil 9m', 'Paper Cup 150ml', 'PP Bag 12x18']), 'A3 newest first: Foil, Paper Cup, PP Bag ' + JSON.stringify(await names(p, '#list .rcrow')));
  const rows = await p.$$eval('#list .rcrow', els => els.map(e => e.getBoundingClientRect().bottom)), d = await rect(p, '#dock'), hd = await rect(p, '#list .rchead');
  ok(rows[0] > rows[2] && d.top - rows[0] >= 0 && d.top - rows[0] < 40 && hd.bottom <= Math.min(...rows) - 40, 'A4 newest right above the search bar (nearest the thumb), heading above the rows');
  ok(!(await rect(p, '#fchips')).vis && !(await rect(p, 'nav.tabs')).vis, 'A5 group chips and tab bar step aside while it is open');
  ok((await p.$$('#list .rcrow .rcic')).length === 3 && (await p.$$('#list .rcrow .rcx')).length === 3, 'A6 each row: clock (no photo), + and ✕');

  /* B. + on a row: adds, keeps the keyboard, rows don't jump */
  await p.tap('#list .rcrow[data-add="i3"] [data-sstep="1"]'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => T.S.bill.find(l => l.id === 'i3').qty) === 2 && await focused(p), 'B1 + on Paper Cup: 2 in the bill, the search keeps the keyboard');
  ok(JSON.stringify(await names(p, '#list .rcrow')) === JSON.stringify(['Aluminium Foil 9m', 'Paper Cup 150ml', 'PP Bag 12x18']) && /2/.test(await p.textContent('#list .rcrow[data-add="i3"] .sstep')), 'B2 the rows stay where they are while the panel is open; the row shows − 2 +');
  await p.tap('#list .rcrow[data-add="i0"] .name'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => T.S.bill.find(l => l.id === 'i0').qty) === 2 && await focused(p), 'B3 tapping a row adds it too (Prices keeps the search open, like + Bill)');

  /* C. ✕ and Clear all */
  await p.tap('#list .rcrow[data-add="i5"] .rcx'); await p.waitForTimeout(300);
  ok(JSON.stringify(await names(p, '#list .rcrow')) === JSON.stringify(['Paper Cup 150ml', 'PP Bag 12x18']) && await focused(p) && await p.evaluate(() => T.S.bill.find(l => l.id === 'i5').qty) === 1, 'C1 ✕ forgets Foil (the bill keeps it), the search stays open');
  await blurQ(p); await p.focus('#q'); await p.waitForTimeout(300);
  ok(JSON.stringify(await names(p, '#list .rcrow')) === JSON.stringify(['PP Bag 12x18', 'Paper Cup 150ml']), 'C2 opened again: PP Bag (added last) is now first, Foil stays forgotten');

  /* D. typing: recent matches first */
  await typeQ(p, 'pp');
  const heads = await p.$$eval('#list .rchead', els => els.map(e => e.textContent.trim()));
  const cards = await p.$$eval('#list .card', els => els.map(e => ({ n: e.querySelector('.name').textContent, b: e.getBoundingClientRect().bottom })));
  ok(JSON.stringify(heads) === JSON.stringify(['Recent', 'All items']) && cards[0].n === 'PP Bag 12x18', 'D1 typing "pp": PP Bag under "Recent" first, the rest under "All items"');
  ok(cards[0].b > cards[1].b && cards[0].b > (await rect(p, '#list .rchead:last-of-type')).bottom - 999, 'D2 the recent match sits nearest the search bar');
  const rh = await p.$$eval('#list .rchead', els => els.map(e => e.getBoundingClientRect().top));
  ok(rh[0] > rh[1], 'D3 "All items" heading shows above the other results, "Recent" just above PP Bag');
  await typeQ(p, 'foil');
  ok(!(await p.$('#list .rchead')), 'D4 no recent match ("foil" was forgotten): plain results, no headings');
  await typeQ(p, ''); await p.waitForTimeout(200);
  ok(!!(await p.$('#list .rcrow')), 'D5 emptying the search brings the panel back');
  await p.tap('#list [data-rcclr]'); await p.waitForTimeout(300);
  ok(!(await p.$('#list .rcrow')) && (await p.$$('#list .card')).length > 5 && await focused(p) && await p.evaluate(() => T.recentIds().length) === 0, 'C3 Clear all: panel gone, the list is back, still in the search');
  await blurQ(p);

  /* E. Bill tab */
  await p.evaluate(() => { T.addToBill('i1'); T.addToBill('i4'); T.setTab('bill'); }); await p.waitForTimeout(400);
  await p.tap('#tot-find'); await p.waitForTimeout(400);
  ok(/Recently billed/.test(await p.textContent('#bill-search-results')) && JSON.stringify(await names(p, '#bill-search-results .rcrow')) === JSON.stringify(['Paper Cup 250ml', 'PP Bag 16x20']), 'E1 Bill tab, search opened: the same "Recently billed" rows');
  const rb = await rect(p, '#bill-search-results'), d2 = await rect(p, '#dock');
  ok((await rect(p, '#rise')).vis && d2.top - rb.bottom >= 0 && d2.top - rb.bottom < 16, 'E2 they rise from the search bar');
  await p.tap('#bill-search-results .rcrow[data-add="i1"] .name'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => T.S.bill.find(l => l.id === 'i1').qty) === 2 && !(await focused(p)) && !(await rect(p, '#rise')).vis, 'E3 tapping a row adds it and closes the search (as with a typed search)');
  await p.tap('#tot-find'); await p.waitForTimeout(300); await typeQ(p, 'bag');
  const bn = await names(p, '#bill-search-results .mini');
  ok(JSON.stringify(await p.$$eval('#bill-search-results .rchead', els => els.map(e => e.textContent.trim()))) === '["Recent","All items"]' && bn[0] === 'PP Bag 16x20' && bn.slice(1).includes('PP Bag 12x18') && bn.slice(1).includes('Garbage Bag'), 'E4 typing "bag" on the Bill tab: PP Bag 16x20 (billed recently) first, the other bags after ' + JSON.stringify(bn));

  /* F. an item deleted from the list drops out; kept per shop */
  await p.evaluate(() => T.applyItems(T.S.items.filter(i => i.id !== 'i4'))).catch(() => p.evaluate(() => { T.S.byId.delete('i4'); }));
  ok(JSON.stringify(await p.evaluate(() => T.recentIds())) === '["i1"]', 'F1 an item deleted from the price list drops out of recent');
  ok(await p.evaluate(() => Array.isArray(JSON.parse(localStorage.getItem('rb_recent')))), 'F2 kept on this phone (rb_recent; other shops get their own prefix)');
  await p.context().close();

  /* G. search at the top, Hindi, 320 px at the largest text */
  const q2 = await phone(320, 640, { spos: 'top', lang: 'hi', fz: 1.38, rec: ['i11', 'i2', 'i6', 'i9'] });
  await q2.focus('#q'); await q2.waitForTimeout(400);
  const first = await q2.$eval('#list', e => e.firstElementChild.className);
  ok(/rchead/.test(first) && /हाल में बिल किए/.test(await q2.textContent('#list .rchead')) && /सब हटाएँ/.test(await q2.textContent('#list [data-rcclr]')), 'G1 search at the top, Hindi: heading first, "हाल में बिल किए" · "सब हटाएँ"');
  const over = await q2.evaluate(() => { const W = innerWidth; return [...document.querySelectorAll('#list .rcrow, #list .rchead, #list .rcrow *')].filter(e => e.getBoundingClientRect().right > W + 1).map(e => e.className || e.tagName); });
  ok(over.length === 0, 'G2 320 px, largest text: nothing spills sideways ' + JSON.stringify(over));
  const x = await rect(q2, '#list .rcrow .rcx'), nm = await rect(q2, '#list .rcrow .name'), pl = await rect(q2, '#list .rcrow .sstep');
  const nmLines = await q2.$eval('#list .rcrow .name', e => { const n = e.cloneNode(true); n.querySelectorAll('.msub').forEach(m => m.remove()); return n.textContent.trim(); });
  ok(x.right <= 320 && x.left >= pl.right - 1 && x.top >= nm.bottom - 2 && x.h >= 28 && pl.top >= nm.bottom - 2 && nm.right - nm.left > 200, 'G3 narrow row: the name takes the full width, price, − qty + and then ✕ go on the line under it ' + nmLines);
  if (process.env.SHOT) { await q2.screenshot({ path: process.env.SHOT + '/recent-320-hi.png' }); }
  await q2.context().close();

  /* H. compact rows; the keyboard opening keeps the newest item right above the search bar (Prices and Bill) */
  const k = await phone(390, 844, { rec: ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8'] });
  for (const tab of ['items', 'bill']) {
    if (tab === 'bill') { await k.evaluate(() => { T.addToBill('i9'); T.setTab('bill'); }); await k.waitForTimeout(300); await k.tap('#tot-find'); } else await k.focus('#q');
    await k.waitForTimeout(300);
    if (tab === 'items') { const rr = await k.$$eval('#list .rcrow', els => els.map(e => { const r = x => e.querySelector(x).getBoundingClientRect(), nm = e.querySelector('.name').cloneNode(true); nm.querySelectorAll('.msub').forEach(m => m.remove());
        const n = r('.name'), p = r('.mprice'), x = r('.rcx'), st = r('.sstep'); return { h: e.getBoundingClientRect().height, t: e.textContent, nw: n.width, top: p.top - e.getBoundingClientRect().top, xBy: Math.abs(x.top + x.height / 2 - (p.top + p.height / 2)) < 8 && x.left > p.right - 4, under: st.top >= p.bottom - 2, sh: st.height }; }));
      ok(rr.length === 8 && rr.every(r => r.h <= 80 && !/Buy|Margin/.test(r.t)), 'H1 recent rows: no Buy · Margin, at most 80 px ' + JSON.stringify(rr.map(r => Math.round(r.h))));
      ok(rr.every(r => r.nw >= 190 && r.top < 16 && r.xBy && r.under && r.sh <= 30), 'H1b like the search cards: the name gets the width, price top right with ✕ beside it, a 30 px − qty + under it ' + JSON.stringify(rr[0])); }
    await k.setViewportSize({ width: 390, height: 520 }); await k.waitForTimeout(600);   // keyboard opens: Chrome shrinks the app
    const at = await k.evaluate(() => { const d = document.querySelector('#dock').getBoundingClientRect().top, rows = [...document.querySelectorAll('.rcrow')], lo = rows.reduce((a, e) => e.getBoundingClientRect().bottom > a.b ? { b: e.getBoundingClientRect().bottom, id: e.dataset.add } : a, { b: 0 }); return { gap: d - lo.b, id: lo.id, vh: innerHeight }; });
    ok(at.gap >= 0 && at.gap < 24 && at.id === (tab === 'bill' ? 'i9' : 'i1'), `H2 ${tab === 'bill' ? 'Bill' : 'Prices'}: after the keyboard opens, the newest item sits right above the search bar ` + JSON.stringify(at));
    await k.evaluate(() => document.querySelector('#q').blur()); await k.setViewportSize({ width: 390, height: 844 }); await k.waitForTimeout(400);
  }
  await k.context().close();

  /* P. pills (like Samsung's "Recent searches"): switch in the heading and in Settings, tap adds, ✕ forgets, newest by the bar */
  const r12 = ['i11', 'i10', 'i9', 'i8', 'i7', 'i6', 'i5', 'i4', 'i3', 'i2', 'i1', 'i0'];
  const m = await phone(390, 844, { rec: r12 });
  await m.focus('#q'); await m.waitForTimeout(300);
  ok((await m.$$('#list .rcrow')).length === 8 && await m.isVisible('#list [data-rcview="pills"]'), 'P1 list by default (8 rows), with a switch to pills in the heading');
  await m.tap('#list [data-rcview="pills"]'); await m.waitForTimeout(300);
  const pills = await m.$$eval('#list .rcpill', els => els.map(e => e.dataset.add));
  ok(pills.length === 12 && !(await m.$('#list .rcrow')) && await focused(m) && await m.evaluate(() => JSON.parse(localStorage.rb_rcstyle)) === 'pills', 'P2 one tap: pills (all 12, more than the list), the keyboard stays, kept on this phone');
  const pr = await m.$$eval('#list .rcpill', els => els.map(e => { const r = e.getBoundingClientRect(); return { id: e.dataset.add, b: r.bottom, l: r.left, h: r.height }; })), d3 = await rect(m, '#dock');
  const lowest = pr.reduce((a, x) => x.b > a.b ? x : a);
  ok(lowest.id === 'i11' && d3.top - lowest.b >= 0 && d3.top - lowest.b < 40 && pr.every(x => x.h >= 32 && x.h <= 36), 'P3 search at the bottom: the newest pill sits right above the bar, rows build upwards; pills compact (32–36 px) ' + JSON.stringify(lowest));
  await m.tap('#list .rcpill[data-add="i7"] .pn'); await m.waitForTimeout(300);
  ok(await m.evaluate(() => (T.S.bill.find(l => l.id === 'i7') || {}).qty) === 1 && await focused(m) && /1/.test(await m.textContent('#list .rcpill[data-add="i7"] .pq')) && await m.$eval('#list .rcpill[data-add="i7"]', e => e.classList.contains('inb')), 'P4 tap a pill: added to the bill, the pill shows 1, the keyboard stays');
  ok(JSON.stringify(await m.$$eval('#list .rcpill', els => els.map(e => e.dataset.add))) === JSON.stringify(pills), 'P5 pills keep their places while the panel is open');
  await m.tap('#list .rcpill[data-add="i9"] .rcx'); await m.waitForTimeout(300);
  ok(!(await m.$('#list .rcpill[data-add="i9"]')) && (await m.$$('#list .rcpill')).length === 11 && await focused(m), 'P6 ✕ on a pill forgets it, the keyboard stays');
  await m.tap('#list [data-rcview="list"]'); await m.waitForTimeout(300);
  ok((await m.$$('#list .rcrow')).length === 8 && await focused(m), 'P7 the list icon switches back');
  await blurQ(m);
  await m.evaluate(() => T.setTab('bill')); await m.waitForTimeout(300);
  await m.evaluate(() => localStorage.setItem('rb_rcstyle', '"pills"'));
  await m.tap('#tot-find'); await m.waitForTimeout(400);
  ok((await m.$$('#bill-search-results .rcpill')).length >= 10, 'P8 Bill tab shows pills too');
  await m.tap('#bill-search-results .rcpill[data-add="i5"] .pn'); await m.waitForTimeout(500);
  ok(await m.evaluate(() => (T.S.bill.find(l => l.id === 'i5') || {}).qty) === 1 && !(await focused(m)), 'P9 Bill tab: tapping a pill adds it and closes the search, like a row');
  await m.context().close();
  /* Settings switch; Hindi, dark, 320 px, largest text: nothing spills, long names wrap inside their pill */
  const n = await phone(320, 700, { rec: r12, lang: 'hi', fz: 1.38 });
  await n.evaluate(() => { localStorage.setItem('rb_appear', '"dark"'); });
  await n.evaluate(() => openSettings()); await n.waitForTimeout(300);
  await n.tap('details[data-cg="look"] summary'); await n.waitForTimeout(200);
  await n.tap('#cf-rcs [data-rcs="pills"]'); await n.waitForTimeout(100);
  ok(await n.evaluate(() => JSON.parse(localStorage.rb_rcstyle)) === 'pills' && /पिल/.test(await n.textContent('#cf-rcs')), 'P10 Settings → Display & search: Recent items List / Pills (Hindi)');
  await n.evaluate(() => closeSheet()); await n.waitForTimeout(300);
  await n.focus('#q'); await n.waitForTimeout(400);
  const ov = await n.evaluate(() => [...document.querySelectorAll('#list .rcpill, #list .rcpill *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; }).length);
  ok((await n.$$('#list .rcpill')).length === 12 && ov === 0, 'P11 320 px, largest text, Hindi: all pills fit the width ' + ov);
  await n.context().close();

  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  await b.close(); done();
})();
