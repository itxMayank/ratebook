/* The new bill page (22 Oct 2026; Settings → Display & search → Bill page: Classic / New; phones, per person, off by default):
   items first, then "Customer & payment"; recent items as tap-to-add pills on an empty bill; shorter rows; the round search
   button never covers the end of the card; a "+N" hint when open bills are off the edge of the chips row (chips unchanged).
   Run: node tests/billnew.app.test.js */
const path = require('path');
const { appHtml, launch } = require('./browser');
const { gas } = require('./gas-mock');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const html = appHtml('S,addToBill,setTab,appUnlock,openSettings,renderBill');
const items = Array.from({ length: 12 }, (_, k) => ({ id: 'i' + k, name: (k === 3 ? 'Aluminium Container 750ml with lid ' : 'Bag item ') + k, nameHi: 'बैग ' + k, unit: 'pc', buy: 5, sell: 7 }));
const cfg = { shopName: 'Shree Pushpadant Plastics and Packaging', mode: 'live', roundTo: 1, defaultUnit: 'pc', nextBill: 1774, nextGstBill: 312 };
(async () => {
  // server: the choice is kept with the person
  const R = gas([path.join(__dirname, '..', 'Code.gs')]).R;
  ok(R('JSON.stringify(uiClean_({blay:"new"}))') === '{"blay":"new"}' && R('JSON.stringify(uiClean_({blay:"odd"}))') === '{}', 'S1 the sheet keeps "blay" (classic / new) with the person, drops anything else');
  ok(R('SCRIPT_VERSION') >= 69, 'S2 script v69');

  const b = await launch();
  async function phone(o = {}) {
    const vp = o.desk ? { viewport: { width: 1280, height: 800 } } : { viewport: { width: o.w || 390, height: o.h || 844 }, hasTouch: true, isMobile: true, colorScheme: o.dark ? 'dark' : 'light' };
    const ctx = await b.newContext(vp); const p = await ctx.newPage(); const errs = [], posts = []; p.on('pageerror', e => errs.push(e.message));
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://fonts.**', r => r.abort());
    await ctx.route('https://script.google.com/**', r => { const q = r.request(); const send = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...x }) });
      if (q.method() === 'GET') return send({ rev: '1', items, config: cfg, sv: 69 });
      const bd = JSON.parse(q.postData()); posts.push(bd);
      if (bd.action === 'boot') return send({ rev: '1', items, config: cfg, sv: 69, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
      if (bd.action === 'setMyPrefs') return send({ prefs: { mode: 'live', ui: bd.prefs.ui } });
      return send({ rev: '1' }); });
    await p.addInitScript(x => { if (sessionStorage.x) return; sessionStorage.x = 1; localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } }));
      localStorage.setItem('rb_recent', JSON.stringify(x.rec)); if (x.blay) localStorage.setItem('rb_blay', JSON.stringify(x.blay)); if (x.fz) localStorage.setItem('rb_fz', JSON.stringify(x.fz));
      if (x.spos) localStorage.setItem('rb_spos', JSON.stringify(x.spos)); if (x.hi) localStorage.setItem('rb_lang', JSON.stringify('hi')); },
      { rec: o.rec || ['i1', 'i2', 'gone', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9', 'i10'], blay: o.blay, fz: o.fz, spos: o.spos, hi: o.hi });
    await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
    await p.evaluate(() => T.setTab('bill')); await p.waitForTimeout(400);
    return { p, ctx, errs, posts };
  }
  const top = (p, s) => p.evaluate(s => { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); return r && r.height ? Math.round(r.top + scrollY) : null; }, s);
  const shown = (p, s) => p.evaluate(s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }, s);

  // A. off by default; switched on in Settings, kept with the person
  let { p, ctx, errs, posts } = await phone();
  ok(!await p.evaluate(() => document.documentElement.classList.contains('bnew')) && await top(p, '#billhead') < await top(p, '.bi-head'), 'A1 off by default: the classic page (customer card above the items)');
  ok(!await shown(p, '.bh-title') && !(await p.$('.bspill')), 'A2 classic: no "Customer & payment" title, no pills on the empty bill');
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(300); await p.click('details[data-cg="look"] summary'); await p.waitForTimeout(200);
  ok(await shown(p, '#cf-blay [data-blay="classic"][aria-pressed="true"]'), 'A3 Settings → Display & search: Bill page Classic / New, Classic chosen');
  await p.click('#cf-blay [data-blay="new"]'); await p.waitForTimeout(1800);
  ok(await p.evaluate(() => document.documentElement.classList.contains('bnew') && JSON.parse(localStorage.getItem('rb_blay')) === 'new'), 'A4 tapping New switches the page at once');
  ok(posts.some(x => x.action === 'setMyPrefs' && x.prefs && x.prefs.ui && x.prefs.ui.blay === 'new'), 'A5 the choice is saved with the person (goes to their other phones)');
  await p.evaluate(() => T.closeSheet && T.closeSheet()); await ctx.close();

  // B. the new page: items first; empty bill with recent pills
  ({ p, ctx, errs } = await phone({ blay: 'new' }));
  ok(await top(p, '.bi-head') < await top(p, '#billhead') && await shown(p, '.bh-title'), 'B1 new: "Bill items" first, then the "Customer & payment" card with its title');
  const pills = await p.$$eval('.bspill', a => a.map(e => e.textContent));
  ok(pills.length === 8 && pills[0] === 'Bag item 1' && !pills.includes('gone'), 'B2 empty bill: the 8 most recent items as pills, newest first, deleted items left out (' + pills.length + ')');
  ok(await shown(p, '#empty-find') && /Start a bill/.test(await p.textContent('#bill-lines')), 'B3 "Start a bill" and Find an item still there');
  await p.click('.bspill[data-add="i3"]'); await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ n: T.S.bill.length, id: T.S.bill[0] && T.S.bill[0].id, pills: document.querySelectorAll('.bspill').length, tot: !document.querySelector('#bill-total').hidden }));
  ok(after.n === 1 && after.id === 'i3' && !after.pills && after.tot, 'B4 one tap adds the item; the pills go and the total card appears');
  // C. shorter rows
  const hNew = await p.evaluate(() => Math.round(document.querySelector('#bill-lines .bill-line').getBoundingClientRect().height));
  await ctx.close();
  ({ p, ctx } = await phone({ blay: 'classic' })); await p.evaluate(() => T.addToBill('i3')); await p.waitForTimeout(300);
  const hOld = await p.evaluate(() => Math.round(document.querySelector('#bill-lines .bill-line').getBoundingClientRect().height));
  ok(hNew < hOld, `C1 rows are shorter (${hOld} → ${hNew} px for a long name)`);
  await ctx.close();
  ({ p, ctx } = await phone({ blay: 'new', rec: [] }));
  ok(!(await p.$('.bspill')) && /Bill is empty/.test(await p.textContent('#bill-lines')), 'C2 nothing billed yet on this phone: the plain empty bill');
  await ctx.close();

  // D. the round search button never covers the end of the card (scrolled to the bottom)
  for (const o of [{ w: 390, h: 844 }, { w: 320, h: 640, fz: 1.38 }, { w: 360, h: 740, fz: 1.25 }, { w: 390, h: 844, spos: 'top' }, { w: 320, h: 640, fz: 1.38, spos: 'top' }]) {
    ({ p, ctx, errs } = await phone({ blay: 'new', ...o }));
    await p.evaluate(() => scrollTo(0, 99999)); await p.waitForTimeout(300);
    const m = await p.evaluate(() => { const c = document.querySelector('#billhead').getBoundingClientRect(), f = document.querySelector('#bsfab').getBoundingClientRect(); return { cb: Math.round(c.bottom), ft: Math.round(f.top), spill: document.documentElement.scrollWidth > innerWidth }; });
    ok(m.cb <= m.ft - 8 && !m.spill, `D ${o.w} px${o.fz ? ' text ' + o.fz : ''}${o.spos ? ' search ' + o.spos : ''}: card ends at ${m.cb}, search button starts at ${m.ft}; nothing spills sideways`);
    await ctx.close();
  }

  // E. open bills: chips unchanged, "+N" hint at the edge with hidden chips
  ({ p, ctx, errs } = await phone({ blay: 'new' }));
  const mk = async n => { for (let k = 0; k < n; k++) { if (!(await p.$('.bspill'))) { await p.click((await p.$('#held-add')) ? '#held-add' : '#bill-new'); await p.waitForTimeout(200); } await p.click('.bspill[data-add="i' + (k % 8 + 1) + '"]'); await p.waitForTimeout(200); } };
  await mk(2); await p.waitForTimeout(300);
  ok(await top(p, '#heldrow') < await top(p, '.bi-head') && !await shown(p, '#hh-l') && !await shown(p, '#hh-r'), 'E1 two bills: chips row on top, everything fits, no hint');
  await mk(5); await p.waitForTimeout(500);
  const h = await p.evaluate(() => { const row = document.querySelector('#heldrow'), rr = row.getBoundingClientRect(); let l = 0, r = 0; row.querySelectorAll('.hchip:not(.add)').forEach(c => { const x = c.getBoundingClientRect(); if (x.left < rr.left - 4) l++; else if (x.right > rr.right + 4) r++; });
    const L = document.querySelector('#hh-l'), R = document.querySelector('#hh-r'); return { l, r, L: L.hidden ? '' : L.textContent, R: R.hidden ? '' : R.textContent, chips: row.querySelectorAll('.hchip:not(.add)').length }; });
  ok(h.chips >= 7 && h.l > 0 && h.L === '‹ +' + h.l && !h.R, `E2 ${h.chips} open bills, the one on screen at the end: "${h.L}" at the left edge (${h.l} hidden), nothing at the right`);
  await p.click('#hh-l'); await p.waitForTimeout(800);
  const h2 = await p.evaluate(() => ({ L: document.querySelector('#hh-l').hidden ? '' : document.querySelector('#hh-l').textContent, R: document.querySelector('#hh-r').hidden ? '' : document.querySelector('#hh-r').textContent }));
  ok(/^\+\d+ ›$/.test(h2.R), `E3 tapping it scrolls the row to them; the hint follows ("${h2.L}" / "${h2.R}")`);
  const chipSt = () => p.$eval('#heldrow .hchip', c => { const s = getComputedStyle(c); return [Math.round(c.getBoundingClientRect().height), s.fontSize, s.padding, s.borderRadius, s.minWidth, s.maxWidth].join('|'); });
  const chipsNew = await chipSt();
  ok(!errs.length, 'E4 no page errors ' + errs.join('; '));
  await ctx.close();
  ({ p, ctx } = await phone({ blay: 'classic' }));
  for (let k = 0; k < 6; k++) { await p.evaluate(i => T.addToBill(i), 'i' + (k % 8 + 1)); await p.waitForTimeout(100); await p.click(k ? '#held-add' : '#bill-new'); await p.waitForTimeout(200); }
  ok(!await shown(p, '#hh-l') && !await shown(p, '#hh-r'), 'E5 classic page: no hint');
  const chipsOld = await chipSt();
  ok(chipsOld === chipsNew, 'E6 the chips themselves look the same on both pages (' + chipsNew + ')');
  await ctx.close();

  // G. the ↓ to the customer card (many items, page at the top); smaller pills
  ({ p, ctx, errs } = await phone({ blay: 'new', w: 412, h: 893 }));
  const ph = await p.$eval('.bspill', e => Math.round(e.getBoundingClientRect().height));
  ok(ph <= 36, 'G1 the empty bill\'s pills are compact (' + ph + ' px)');
  ok(!await p.evaluate(() => document.querySelector('#tocust').classList.contains('on')), 'G2 empty bill: no ↓');
  for (const i of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']) await p.evaluate(i => T.addToBill(i), i);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(700);
  const g = await p.evaluate(() => { const b = document.querySelector('#tocust').getBoundingClientRect(), r = s => document.querySelector(s).getBoundingClientRect();
    const hit = s => { const x = r(s); return !(b.right <= x.left || b.left >= x.right || b.bottom <= x.top || b.top >= x.bottom); };
    return { on: document.querySelector('#tocust').classList.contains('on'), wa: hit('#bill-wa'), done: hit('#bill-done'), find: hit('#tot-find') }; });
  ok(g.on && !g.wa && !g.done && !g.find, 'G3 7 items, page at the top: the ↓ shows on the total card\'s edge, clear of Share, Done and search');
  await p.click('#tocust'); await p.waitForTimeout(1000);
  const g4 = await p.evaluate(() => ({ on: document.querySelector('#tocust').classList.contains('on'), ct: document.querySelector('#cust').getBoundingClientRect().bottom, tt: document.querySelector('#bill-total').getBoundingClientRect().top }));
  ok(!g4.on && g4.ct <= g4.tt, `G4 tapping it brings the customer boxes into view above the total (${Math.round(g4.ct)} / ${Math.round(g4.tt)}) and it goes away`);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  await p.focus('#br-0'); await p.waitForTimeout(400);
  ok(!await p.evaluate(() => document.querySelector('#tocust').classList.contains('on')), 'G5 hidden while typing in a bill box');
  ok(!errs.length, 'G6 no page errors ' + errs.join('; '));
  await ctx.close();
  ({ p, ctx } = await phone({ blay: 'classic', w: 412, h: 893 }));
  for (const i of ['i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7']) await p.evaluate(i => T.addToBill(i), i);
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  ok(!await p.evaluate(() => { const b = document.querySelector('#tocust'); return b.classList.contains('on') || getComputedStyle(b).display !== 'none'; }), 'G7 classic page: no ↓');
  await ctx.close();

  // F. laptop unchanged; Hindi dark 320 largest
  ({ p, ctx } = await phone({ blay: 'new', desk: true }));
  ok(!await p.evaluate(() => document.documentElement.classList.contains('bnew')) && !(await p.$('.bspill')), 'F1 laptop: unchanged even with New chosen');
  await ctx.close();
  ({ p, ctx, errs } = await phone({ blay: 'new', w: 320, h: 640, fz: 1.38, hi: 1, dark: 1 }));
  const f2 = await p.evaluate(() => ({ spill: document.documentElement.scrollWidth > innerWidth, t: document.querySelector('.bh-title').textContent, n: document.querySelectorAll('.bspill').length }));
  ok(!f2.spill && f2.t === 'ग्राहक और भुगतान' && f2.n === 8 && !errs.length, 'F2 320 px, largest text, Hindi, dark: nothing spills, title in Hindi, pills shown');
  await ctx.close();
  await b.close();
})();
