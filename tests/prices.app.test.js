/* The price list and item screens (added with the prices.js split, 11 Oct 2026; before, only opening them was tested):
   the list (sort switch, group chips), the item screen, Edit item (change a price; a new item gets its Hindi name and group
   by itself; delete), Bulk add (paste lines; a name already in the list updates it), Bulk edit (+10% on everything), the
   wand's screen (preview, then apply) and Convert names to Hindi. Checks what each sends to the sheet. Any page error fails.
   Run: node tests/prices.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,setFz,sync,addToBill,billText,saveBill,openEdit,openBulkAdd,openBulkEdit,openCmd,openDetail,openToHindi,setTab,appUnlock');
const now = Date.now() - 864e5;
const items0 = () => [
  { id: 'i1', name: 'PP Bag 12x18', nameHi: 'पीपी बैग 12x18', unit: 'kg', buy: 150, sell: 180, cat: 'Bags', updatedAt: now },
  { id: 'i2', name: 'Sugar', nameHi: '', unit: 'kg', buy: 40, sell: 46, updatedAt: now },
  { id: 'i3', name: 'Garbage Bag Small', nameHi: 'गार्बेज बैग स्मॉल', unit: 'pc', buy: 2, sell: 3, cat: 'Bags', updatedAt: now },
  { id: 'i4', name: 'Paper Cup 150ml', nameHi: '', unit: 'pc', buy: 0.5, sell: 0.8, cat: 'Cups', updatedAt: now },
  { id: 'i5', name: 'Maida', nameHi: 'मैदा', unit: 'kg', buy: 30, sell: 36, updatedAt: now }];
const items = () => (db = db || items0()).map(x => ({ ...x }));
let sent = [], nid = 0, db = null;   // the mock sheet keeps what was saved and, like the real one, skips a change to an item that's gone
(async () => {
  const b = await launch(); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message)); p.on('dialog', d => d.accept());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const cfg = { shopName: 'Gupta Plastics', mode: 'live', roundTo: 1, defaultUnit: 'kg', defaultGst: 18, defaultHsn: '3923', bizType: 'plastics' };
    if (q.method() === 'GET') return send({ rev: '1', items: items(), config: cfg, sv: 60, pop: { i2: 9, i1: 5, i5: 2 }, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData()); sent.push(bd);
    if (bd.action === 'list') return send({ rev: '1', items: items(), config: cfg, sv: 60, pop: { i2: 9, i1: 5, i5: 2 } });   // signed-in phones ask by POST
    if (bd.action === 'boot') return send({ rev: '1', items: items(), config: cfg, sv: 60, pop: { i2: 9, i1: 5, i5: 2 }, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'upsert') { items(); const out = bd.items.filter(x => db.some(y => y.id === x.id) || String(x.name || '').trim()).map(x => { const id = x.id || 'n' + (++nid), o = db.find(y => y.id === id), r = { ...(o || {}), ...x, id, updatedAt: Date.now() }; delete r.tmp; delete r.base; if (o) Object.assign(o, r); else db.push(r); return { ...r, tmp: x.tmp }; }); return send({ items: out }); }
    if (bd.action === 'priceHist') { if (bd.id !== 'i1') return send({ hist: [], count: 0 }); const d = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
      const H = [['sell', 180, 200, 'Mayank', 'edit', 1], ['buy', 150, 165, 'Dad', 'vendor', 2], ['sell', 170, 180, '', 'bills', 9], ['buy', 140, 150, '', 'bills', 10], ['sell', 160, 170, '', 'bills', 20],
        ['buy', 130, 140, '', 'bills', 21], ['sell', 150, 160, '', 'bills', 40], ['sell', null, 150, 'Dad', 'new', 60]].map(([f, o, n, by, src, a]) => ({ at: Date.now() - a * 864e5, day: d(a), f, o, n, by, src }));
      return send({ hist: (bd.role === 'staff' ? H.filter(x => x.f !== 'buy') : H), count: H.length }); }
    if (bd.action === 'delete') { items(); db = db.filter(y => !bd.ids.includes(y.id)); return send({}); }
    return send({}); });
  await p.addInitScript(() => { if (!sessionStorage.x) { localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })); sessionStorage.x = 1; } });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1500); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const ups = () => sent.filter(x => x.action === 'upsert').flatMap(x => x.items);
  const names = () => p.evaluate(() => [...document.querySelectorAll('#list .card .name, #list .card h3')].map(e => e.textContent.trim().split('\n')[0]));
  const ids = () => p.evaluate(() => [...document.querySelectorAll('#list [data-id]')].map(e => e.dataset.id).filter((x, i, a) => a.indexOf(x) === i));

  // A. the list
  ok((await ids()).join() === 'i2,i1,i5,i3,i4', 'A1 most sold first, then A–Z');
  await p.click('.sortseg [data-sort="az"]').catch(() => p.evaluate(() => document.querySelectorAll('.sortseg button')[1].click())); await p.waitForTimeout(300);
  ok((await ids()).join() === 'i3,i5,i4,i1,i2', 'A2 A–Z switch: Garbage, Maida, Paper, PP, Sugar');
  await p.evaluate(() => document.querySelectorAll('.sortseg button')[0].click()); await p.waitForTimeout(200);
  const chips = await p.evaluate(() => [...document.querySelectorAll('#fchips button')].map(b => b.textContent.replace(/\s+/g, ' ').trim()));
  ok(chips.some(c => /^Bags\s*2$/.test(c)) && chips.some(c => /^Cups\s*1$/.test(c)), 'A3 group chips with counts (Bags 2, Cups 1)');
  await p.evaluate(() => [...document.querySelectorAll('#fchips button')].find(b => /^Bags/.test(b.textContent.trim())).click()); await p.waitForTimeout(300);
  ok((await ids()).join() === 'i1,i3', 'A4 Bags chip shows only the two bags');
  await p.evaluate(() => document.querySelector('#fchips button').click()); await p.waitForTimeout(200);

  // B. the item screen
  await p.evaluate(() => T.openDetail('i1')); await p.waitForTimeout(500);
  const det = await p.textContent('#sheet-title') + ' ' + await p.textContent('#sheet-body');
  ok(/PP Bag 12x18/.test(det) && /180/.test(det) && /150/.test(det) && /20%/.test(det), 'B1 item screen: name, sell ₹180, buy ₹150, margin 20%');
  await p.click('#sheet-close'); await p.waitForTimeout(300);

  // C. Edit item
  sent = []; await p.evaluate(() => T.openEdit('i2')); await p.waitForTimeout(400);
  await p.fill('#ef-sell', '50'); await p.click('#ef-save'); await p.waitForTimeout(900);
  const e1 = ups().find(x => x.id === 'i2') || {};
  ok(e1.sell === 50 && e1.buy === 40 && e1.name === 'Sugar' && e1.base === now, 'C1 changed price saved, with the time it was opened (so a change from another phone isn\'t overwritten)');
  ok(e1.nameHi === 'शुगर', 'C2 an empty Hindi name is filled on save');
  ok(await p.evaluate(() => T.S.byId.get('i2').sell) === 50, 'C3 the list shows the new price at once');
  sent = []; await p.evaluate(() => T.openEdit(null)); await p.waitForTimeout(400);
  await p.fill('#ef-name', 'Garbage Bag XL'); await p.waitForTimeout(300);
  ok(await p.inputValue('#ef-hi') === 'गार्बेज बैग एक्सएल', 'C4 new item: Hindi name fills while typing');
  await p.fill('#ef-buy', '4'); await p.fill('#ef-sell', '6'); await p.click('#ef-save'); await p.waitForTimeout(900);
  const e2 = ups().find(x => x.name === 'Garbage Bag XL') || {};
  ok(e2.tmp && e2.cat === 'Bags' && e2.nameHi === 'गार्बेज बैग एक्सएल' && e2.buy === 4 && e2.sell === 6, 'C5 saved as new with its group guessed from similar items (Bags)');
  sent = []; await p.evaluate(() => T.openEdit('i5')); await p.waitForTimeout(400);
  await p.click('#ef-del'); await p.waitForTimeout(200); await p.click('#ef-dely'); await p.waitForTimeout(800);
  ok(sent.some(x => x.action === 'delete' && x.ids.join() === 'i5') && !(await p.evaluate(() => T.S.byId.has('i5'))), 'C6 Delete item asks, then removes it');

  // D. Bulk add
  sent = []; await p.evaluate(() => T.openBulkAdd()); await p.waitForTimeout(400);
  await p.evaluate(() => { document.querySelector('#ba-paste').open = true; });
  await p.fill('#ba-txt', 'Steel Glass, pc, 10, 15\nSugar, kg, 41, 47'); await p.click('#ba-parse'); await p.waitForTimeout(300);
  ok(/2/.test(await p.textContent('#ba-save')), 'D1 two pasted lines read');
  await p.click('#ba-save'); await p.waitForTimeout(1000);
  const nb = ups(); const sg = nb.find(x => x.name === 'Steel Glass') || {}, su = nb.find(x => x.id === 'i2') || {};
  ok(nb.length === 2 && sg.tmp && sg.buy === 10 && sg.sell === 15 && sg.nameHi === 'स्टील ग्लास', 'D2 a new item with buy, sell and Hindi name');
  ok(su.buy === 41 && su.sell === 47 && !su.tmp, 'D3 a name already in the list updates that item instead of adding a second');

  // E. Bulk edit +10%
  sent = []; await p.evaluate(() => T.openBulkEdit()); await p.waitForTimeout(400);
  await p.fill('#be-pct', '10'); await p.click('#be-apply'); await p.waitForTimeout(300); await p.click('#be-save'); await p.waitForTimeout(1000);
  const be = ups(), pp = be.find(x => x.id === 'i1') || {};
  ok(be.length >= 4 && pp.buy === 165 && pp.sell === 198, 'E1 +10% on all: PP Bag 150 / 180 → 165 / 198, rounded to the rupee');
  // an item deleted on another phone while Bulk edit is open: the other changes still save (before: nothing saved, no message)
  sent = []; await p.evaluate(() => T.openBulkEdit()); await p.waitForTimeout(400);
  await p.fill('#be-pct', '10'); await p.click('#be-apply'); await p.waitForTimeout(300);
  db = db.filter(y => y.name !== 'Steel Glass'); await p.evaluate(() => { T.S.rev = null; return T.sync(); }); await p.waitForTimeout(800);
  await p.click('#be-save'); await p.waitForTimeout(1200);
  const be2 = ups(), pp2 = be2.find(x => x.id === 'i1') || {};
  ok(pp2.buy === 182 && pp2.sell === 218 && await p.evaluate(() => T.S.byId.get('i1').sell) === 218 && await p.evaluate(() => T.S.items.every(i => i.name)), 'E2 an item deleted elsewhere while Bulk edit is open: the other changes still save, no empty item appears');

  // F. the wand's screen
  sent = []; await p.evaluate(() => T.openCmd('')); await p.waitForTimeout(400);
  await p.fill('#cmd-text', 'paper cup sell 2'); await p.click('#cmd-go'); await p.waitForTimeout(400);
  ok(/Paper Cup/.test(await p.textContent('#cmd-out')) && !sent.some(x => x.action === 'upsert'), 'F1 preview first, nothing saved yet');
  await p.click('#cmd-go'); await p.waitForTimeout(1000);
  const w = ups().find(x => x.id === 'i4') || {};
  ok(w.sell === 2, 'F2 apply: Paper Cup sell ₹2 saved');

  // G. Convert names to Hindi
  sent = []; await p.evaluate(() => T.openToHindi()); await p.waitForTimeout(400);
  await p.click('#th-save'); await p.waitForTimeout(1000);
  const th = ups(); const pc = th.find(x => x.id === 'i4') || {};
  ok(th.length >= 1 && pc.nameHi === 'पेपर कप 150 एमएल', 'G1 names without Hindi get one (Paper Cup 150ml → पेपर कप 150 एमएल)');

  // H. an item's HSN can be "none"; a bill being made follows changes to its items (15 Oct 2026)
  await p.evaluate(() => { T.S.bill.length = 0; T.addToBill('i2'); T.addToBill('i3'); T.S.bill[1].rate = 2.5; T.saveBill(); }); await p.waitForTimeout(200);
  const sug0 = await p.evaluate(() => T.S.byId.get('i2').sell);
  sent = []; await p.evaluate(() => T.openEdit('i2')); await p.waitForTimeout(400);
  await p.fill('#ef-sell', String(sug0 + 4)); await p.fill('#ef-hsn', ''); await p.click('#ef-save'); await p.waitForTimeout(800);
  const su2 = ups().find(x => x.id === 'i2') || {};
  ok(su2.hsn === 'NA' && su2.sell === sug0 + 4, 'H1 HSN box emptied: saved as "no HSN" (NA), with the new price: ' + JSON.stringify([su2.hsn, su2.sell]));
  const L = () => p.evaluate(() => T.S.bill.map(l => ({ name: l.name, rate: l.rate, hsn: l.hsn, lp: l.lp })));
  let bl = await L();
  ok(bl[0].rate === sug0 + 4 && bl[0].hsn === '' && bl[0].lp === sug0 + 4, 'H2 the bill being made follows: Sugar now ₹' + bl[0].rate + ', no HSN');
  const gtx = await p.evaluate(() => { T.S.gst = true; const x = T.billText(); T.S.gst = false; return x; });
  ok(/Sugar \(GST 18%\)/.test(gtx) && !/Sugar[^\n]*HSN/.test(gtx) && /Garbage[^\n]*HSN 3923/.test(gtx), 'H3 GST bill text: Sugar without an HSN, the other item keeps its own');
  await p.evaluate(() => T.openEdit('i2')); await p.waitForTimeout(400);
  ok(await p.inputValue('#ef-hsn') === '' && await p.getAttribute('#ef-hsn', 'placeholder') === 'No HSN', 'H4 opened again: the HSN box stays empty and says "No HSN" (the default doesn\'t come back)');
  await p.click('#ef-cancel'); await p.waitForTimeout(300);
  await p.evaluate(() => T.openEdit('i3')); await p.waitForTimeout(400);
  await p.fill('#ef-name', 'Garbage Bag S'); await p.fill('#ef-sell', '4'); await p.click('#ef-save'); await p.waitForTimeout(800);
  bl = await L();
  ok(bl[1].name === 'Garbage Bag S' && bl[1].rate === 2.5, 'H5 a rate typed for this bill stays (₹2.5); the new name comes through');
  db.find(x => x.id === 'i2').sell = sug0 + 10; await p.evaluate(() => T.sync()); await p.waitForTimeout(600);
  bl = await L();
  ok(bl[0].rate === sug0 + 10 && /Bill updated with the new item details/.test(await p.textContent('#toast')), 'H6 price changed on another phone: the open bill follows, with a short message');
  await p.evaluate(() => { T.S.editing = { n: 5 }; }); db.find(x => x.id === 'i2').sell = sug0 + 20; await p.evaluate(() => T.sync()); await p.waitForTimeout(600);
  ok((await L())[0].rate === sug0 + 10, 'H7 a past bill being edited keeps the prices it was billed at');
  await p.evaluate(() => { T.S.editing = null; T.S.bill.length = 0; T.saveBill(); });
  sent = []; await p.evaluate(() => T.openBulkEdit()); await p.waitForTimeout(400);
  await p.fill('#be-hsn-i3', ''); await p.click('#be-save'); await p.waitForTimeout(800);
  ok((ups().find(x => x.id === 'i3') || {}).hsn === 'NA', 'H8 Bulk edit: an emptied HSN cell saves "no HSN" too');

  // I. price history on the item screen (15 Oct 2026)
  await p.evaluate(() => T.openDetail('i1')); await p.waitForTimeout(700);
  const ph = await p.evaluate(() => [...document.querySelectorAll('#d-ph > .ph-row')].map(r => r.innerText.replace(/\s+/g, ' ').trim()));
  ok(/Price history/.test(await p.textContent('#d-ph')) && ph.length === 6 && /^Sell · .* Mayank · Edit item ₹180 → ₹200 \+₹20 · 11\.1%$/.test(ph[0]) && /^Buy · .* Dad · Vendor bill ₹150 → ₹165 \+₹15 · 10%$/.test(ph[1]), 'I1 the item screen shows its price history, newest first: who, how, from → to and the change: ' + ph.slice(0, 2).join(' | '));
  ok(/Worked out from past bills/.test(ph[2]) && /Show 2 more/.test(await p.textContent('#d-ph .ph-more summary')), 'I2 rows worked out from bills say so; 6 shown, "Show 2 more" opens the rest in place');
  await p.click('#d-ph .ph-more summary'); await p.waitForTimeout(150);
  ok(/Set at ₹150/.test(await p.textContent('#d-ph .ph-more')), 'I3 the first price of an item reads "Set at ₹150"');
  await p.evaluate(() => { T.S.hideBuy = true; T.openDetail('i1'); }); await p.waitForTimeout(500);
  ok(await p.evaluate(() => [...document.querySelectorAll('#d-ph .ph-row')].every(r => r.dataset.f !== 'buy') && document.querySelectorAll('#d-ph .ph-row').length > 0), 'I4 "Hide buy rate" also hides buy price changes');
  await p.evaluate(() => { T.S.hideBuy = false; T.openDetail('i2'); }); await p.waitForTimeout(600);
  ok(/No price changes yet/.test(await p.textContent('#d-ph')), 'I5 an item that never changed says so');
  await p.setViewportSize({ width: 320, height: 700 }); await p.evaluate(() => { localStorage.setItem('rb_lang', '"hi"'); T.S.lang = 'hi'; T.setFz(1.38); T.openDetail('i1'); }); await p.waitForTimeout(700);
  await p.evaluate(() => { const m = document.querySelector('#d-ph .ph-more'); if (m) m.open = true; });
  ok(/रेट का इतिहास/.test(await p.textContent('#d-ph')) && await p.evaluate(() => { const sh = document.querySelector('#sheet-body'); return sh.scrollWidth <= sh.clientWidth + 1 && [...document.querySelectorAll('#d-ph .ph-row > b')].every(b => { const r = b.getBoundingClientRect(); return r.right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1; }); }), 'I6 Hindi, 320 px, largest text: the history fits, amounts are never cut');
  if (process.env.SHOT) await (await p.$('#d-ph')).screenshot({ path: process.env.SHOT + '/ph-320-hi-largest.png' });
  await p.setViewportSize({ width: 390, height: 844 }); await p.evaluate(() => { localStorage.setItem('rb_lang', '"en"'); T.S.lang = 'en'; T.setFz(1); T.openDetail('i1'); }); await p.waitForTimeout(700);
  if (process.env.SHOT) await (await p.$('#sheet')).screenshot({ path: process.env.SHOT + '/ph-390.png' });

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
