/* The price list and item screens (added with the prices.js split, 11 Oct 2026; before, only opening them was tested):
   the list (sort switch, group chips), the item screen, Edit item (change a price; a new item gets its Hindi name and group
   by itself; delete), Bulk add (paste lines; a name already in the list updates it), Bulk edit (+10% on everything), the
   wand's screen (preview, then apply) and Convert names to Hindi. Checks what each sends to the sheet. Any page error fails.
   Run: node tests/prices.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,sync,openEdit,openBulkAdd,openBulkEdit,openCmd,openDetail,openToHindi,setTab,appUnlock');
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
    if (q.method() === 'GET') return send({ rev: '1', items: items(), config: cfg, sv: 43, pop: { i2: 9, i1: 5, i5: 2 }, bl: '0', bt: '0', vl: '0', vt: '0' });
    const bd = JSON.parse(q.postData()); sent.push(bd);
    if (bd.action === 'boot') return send({ rev: '1', items: items(), config: cfg, sv: 43, pop: { i2: 9, i1: 5, i5: 2 }, me: { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } } });
    if (bd.action === 'upsert') { items(); const out = bd.items.filter(x => db.some(y => y.id === x.id) || String(x.name || '').trim()).map(x => { const id = x.id || 'n' + (++nid), o = db.find(y => y.id === id), r = { ...(o || {}), ...x, id, updatedAt: Date.now() }; delete r.tmp; delete r.base; if (o) Object.assign(o, r); else db.push(r); return { ...r, tmp: x.tmp }; }); return send({ items: out }); }
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

  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
