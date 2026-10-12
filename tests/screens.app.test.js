/* Every screen opens (step 5, 12 Oct 2026): one pass through the whole app on a rich mock sheet, in five set-ups:
   phone light English (owner), phone dark Hindi (owner), 320 px at the largest text size (owner), laptop 1280 px (owner),
   and a staff phone. For every screen reached the way a person reaches it (tabs, Tools tiles, the bell, Settings cards, and
   the screens inside screens: a past bill, a credit customer, a customer, a vendor and its bill, an item and Edit item):
   it opens with a title, nothing spills sideways, no "undefined" / "NaN" / "[object" / missing text key shows, and ✕ closes
   it. Staff see only their own tiles. Any page error fails. Run: node tests/screens.app.test.js   (SHOT=<dir> saves each screen) */
const { appHtml, launch, ok, done } = require('./browser');
const fs = require('fs');
const html = appHtml('S,appUnlock,appLock,setTab,openDetail,addToBill,setFz');
const today = new Date(), iso = d => d.toISOString().slice(0, 10), ago = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };
const items = [{ id: 'i1', name: 'PP Bag 12x18', nameHi: 'पीपी बैग 12x18', unit: 'kg', buy: 150, sell: 180, cat: 'Bags', hsn: '3923', gst: 18 },
  { id: 'i2', name: 'Paper Cup 150ml', nameHi: 'पेपर कप 150 एमएल', unit: 'pc', buy: 0.5, sell: 0.8, cat: 'Cups', altUnit: 'packet', altQty: 50 },
  { id: 'i3', name: 'Aluminium Container 750ml with lid, extra long name to wrap', unit: 'pc', buy: 4, sell: 6.5, cat: 'Containers' }];
const bill = (n, d, o) => ({ n, id: 'b' + n, row: n + 1, date: d.toISOString(), day: iso(d), customer: '', mobile: '', total: 100, items: 'PP Bag 12x18 1 kg = 180', gst: false, edits: 0, pay: 'Paid', paid: 0, due: 0, payments: [], fy: '2026-27', cancelled: false, ...o });
const bills = [bill(12, ago(0), { customer: 'Sunil Traders', mobile: '9876543210', total: 1234567, pay: 'Credit', due: 1234567 }),
  bill(5, ago(1), { gst: true, customer: 'Ravi Stores', custGstin: '09ABCDE1234F1Z5', total: 236, editedAt: ago(1).toISOString(), editedBy: 'Dad', edits: 1, paidBy: 'UPI' }),
  bill(3, ago(40), { customer: 'Old Customer', total: 700, cancelled: true, cancelReason: 'Wrong items' })];
const dues = { total: 1234567, bills: 1, customers: [{ name: 'Sunil Traders', mobile: '9876543210', due: 1234567, oldest: iso(ago(40)), bills: [{ n: 12, id: 'b12', row: 13, date: iso(ago(40)), total: 1234567, paid: 0, due: 1234567, items: 'PP Bag 12x18 1 kg = 180', gst: false }] }] };
const custs = [['9876543210', 'Sunil Traders', '09ABCDE1234F1Z5', 4, 3250, iso(ago(6)), 1234567, 'Main Road, Kanpur', 'Pays on the 5th', 12], ['9123456780', 'Ravi Stores', '', 1, 236, iso(ago(1)), 0, '', '', 5]];
const vendors = ['Gupta Traders', 'Sharma Packaging', 'Delhi Foils', 'Raj Plastics', 'Om Containers'].map((name, i) => ({ id: 'v' + i, name, mobile: '98765432' + (10 + i), opening: 100 * i, openingDate: '2026-10-01', createdAt: 1, updatedAt: 1 })).concat([{ id: 'vA', name: 'Mahaveer Enterprises', mobile: '9876543210', opening: 0, openingDate: '2026-10-01', linkOn: true, token: 'l0123456789abcdef012345', createdAt: 1, updatedAt: 1, creditDays: 15 }]);
const entries = [{ id: 'e1', vendorId: 'vA', type: 'bill', date: '2026-10-02', amount: 1180, gst: 180, billNo: 'MH-77', photos: [], alloc: {}, at: 10 },
  { id: 'e2', vendorId: 'vA', type: 'pay', date: '2026-10-05', amount: 700, mode: 'UPI', photos: [], alloc: { e1: 700 }, at: 20 }];
const report = (from, to) => ({ from, to, totals: { sales: 5500, bills: 20, tax: 180, gstBills: 1, cancelled: 1, lineSale: 5500, pSale: 5000, pCost: 4000, estAmt: 0, noBuyAmt: 0, profit: 1000, cost: 4000 },
  byDay: [{ d: from, sales: 5500, bills: 20 }], items: [{ name: 'PP Bag 12x18', unit: 'kg', qty: 10, amount: 3000, bills: 6 }, { name: 'Paper Cup 150ml', unit: 'pc', qty: 500, amount: 2500, bills: 14 }], itemCount: 2,
  gst: { b2b: {}, b2c: {}, rates: [], hsn: [] }, received: 500, creditGiven: 300, outstanding: 1200, register: [] });
const BAD = /undefined|NaN|\[object |\bnull\b/;
(async () => {
  const b = await launch(); const errs = []; let n = 0;
  async function phone(set) {
    const ctx = await b.newContext({ viewport: set.vp, colorScheme: set.dark ? 'dark' : 'light' }), p = await ctx.newPage();
    p.on('pageerror', e => errs.push(set.name + ': ' + e.message)); p.on('dialog', d => d.dismiss());
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      const me = { name: set.role === 'staff' ? 'Raju' : 'Mayank', role: set.role, personal: true, prefs: { mode: 'live', showProfit: true } };
      const cfg = { shopName: 'Shree Ganesh Packaging & Disposables', mode: 'live', nextBill: 13, nextGstBill: 6, shopGstin: '09ABCDE1234F1Z5', units: [{ code: 'kg', hi: 'किलो' }, { code: 'pc', hi: 'नग' }, { code: 'packet', hi: 'पैकेट' }], defaultUnit: 'kg', roundTo: 1, defaultGst: 18, defaultHsn: '3923' };
      if (req.method() === 'GET') { const u = new URL(req.url()); if (u.searchParams.get('action') === 'rev') return send({ rev: '1', bl: '1', bt: '0', vl: '1', vt: '0', nl: '5', nt: '0' }); return send({ rev: '1', items, config: cfg, sv: 43, pop: { i1: 9, i2: 4 } }); }
      const bd = JSON.parse(req.postData()), a = bd.action;
      if (a === 'boot') return send({ rev: '1', items, config: cfg, sv: 43, pop: { i1: 9, i2: 4 }, me });
      if (a === 'listBills') return send({ full: true, brev: '1', bills, years: ['2026'] });
      if (a === 'getBill') { const x = bills.find(y => y.id === bd.id) || bills[0]; return send({ bill: { ...x, text: `*Shree Ganesh Packaging*\nBill No. ${x.n}\nTotal ₹${x.total}`, lines: [{ id: 'i1', name: 'PP Bag 12x18', unit: 'kg', rate: 180, qty: 1, buy: 150 }] } }); }
      if (a === 'listDues') return send(dues);
      if (a === 'listCustomers') return send({ brev: '1', customers: custs });
      if (a === 'findCustomer') return send({});
      if (a === 'vSync') return send({ vrev: '1', schema: 2, vendors, entries });
      if (a === 'notices') return send({ nrev: '5', list: [{ id: 'n1', at: Date.now() - 6e4, kind: 'bill', vendorId: 'vA', entryId: 'e1', vname: 'Mahaveer Enterprises', amount: 1180, billNo: 'MH-77', extra: {}, by: 'Sanjay', read: false }] });
      if (a === 'report') return send({ report: report(bd.from, bd.to) });
      if (a === 'itemBuys') return send({ buys: [] });
      if (a === 'listUsers') return send({ users: [{ id: 'u1', name: 'Raju', role: 'staff', active: true, testOk: true }] });
      if (a === 'listSessions') return send({ sessions: [{ id: 's1', name: 'Mayank', l: 'Android · Chrome', s: Date.now(), me: true }], approveNew: false });
      if (a === 'getAccess') return send({ access: { on: false } });
      if (a === 'backupInfo') return send({ backups: { auto: true, last: new Date().toISOString(), count: 1, email: '', list: [] } });
      return send({ me }); });
    await p.addInitScript(([r, hi, fz]) => { if (sessionStorage.x) return; sessionStorage.x = 1;
      localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: r === 'staff' ? 'Raju' : 'Mayank', role: r, personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live', showProfit: true } }));
      if (hi) localStorage.setItem('rb_lang', '"hi"'); if (fz) localStorage.setItem('rb_fz', String(fz)); }, [set.role, !!set.hi, set.fz || 0]);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(500);
    return p;
  }
  const look = (p, where) => p.evaluate(where => { const de0 = document.documentElement; const sh = document.querySelector('#sheet'), open = sh && !sh.hidden && sh.classList.contains('on');
    const root = where === 'sheet' ? document.querySelector('#sheet') : document.querySelector(where);
    const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    let text = ''; if (root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); while (w.nextNode()) { const pe = w.currentNode.parentElement; if (pe && vis(pe) && !pe.closest('script,style,template')) text += w.currentNode.textContent + ' '; } }
    const keyish = (text.match(/\b[a-z]+[A-Z][A-Za-z]*\b/g) || []).filter(x => !/^(iPhone|iPad|WhatsApp|GSTIN|mPos)$/.test(x));
    // text cut short: a box too narrow for a short value (a mobile, an amount), or a label cut with "…" / hidden overflow
    const hid = el => { for (let x = el; x; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05 || x.hidden) return true; } return !!el.closest('details:not([open]) > :not(summary)'); };
    const cut = [], cx = document.createElement('canvas').getContext('2d');
    for (const e of (root || document).querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]):not([type=date])')) {
      const v = e.value; if (!v || v.length > 16 || !vis(e) || hid(e)) continue; const cs = getComputedStyle(e); cx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if (cx.measureText(v).width > e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 1) cut.push('box ' + (e.id || e.name) + ' "' + v + '"'); }
    for (const e of (root || document).querySelectorAll('*')) {
      if (['INPUT', 'SELECT', 'TEXTAREA', 'SCRIPT', 'STYLE'].includes(e.tagName) || e.closest('svg,#printroot,template') || (e.id === 'shopname' && de0.classList.contains('hdr-min'))) continue;
      const cs = getComputedStyle(e); if (cs.overflowX === 'visible' && cs.textOverflow !== 'ellipsis' || /auto|scroll/.test(cs.overflowX)) continue;
      if (![...e.childNodes].some(x => x.nodeType === 3 && x.textContent.trim()) || !vis(e) || hid(e)) continue;
      if (e.scrollWidth > e.clientWidth + 1) cut.push('"' + e.textContent.trim().slice(0, 24) + '"'); }
    // a text box left with the browser's own look (grey 1–2 px frame on white), e.g. the Vendors search before 12 Oct 2026
    for (const e of (root || document).querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]):not([type=hidden]):not([type=date]),textarea')) {
      if (!vis(e) || hid(e)) continue; const cs = getComputedStyle(e);
      if (/^rgb\(118, 118, 118\)|^rgb\(133, 133, 133\)/.test(cs.borderTopColor) && parseFloat(cs.borderTopWidth) > 0) cut.push('plain browser box ' + (e.id || e.placeholder)); }
    const de = document.documentElement, body = document.querySelector('#sheet-body');
    return { cut: [...new Set(cut)], open, title: (document.querySelector('#sheet-title') || {}).textContent || '', text: text.replace(/\s+/g, ' ').slice(0, 4000), keyish,
      spill: Math.max(de.scrollWidth - innerWidth, open && body ? body.scrollWidth - body.clientWidth : 0) }; }, where);
  async function check(p, set, name, where, act) {
    let r; try { await act(); await p.waitForTimeout(700); r = await look(p, where || 'sheet'); }
    catch (e) { ok(false, `${set.name} · ${name}: couldn't open (${e.message.split('\n')[0]})`); return false; }
    const bad = (r.text.match(BAD) || [])[0], issues = [];
    if (where === undefined && (!r.open || !r.title.trim())) issues.push('not open / no title');
    if (r.spill > 1) issues.push('spills sideways by ' + r.spill + ' px');
    if (bad) issues.push('shows "' + bad + '"');
    if (r.cut.length) issues.push('cut short or plain box: ' + r.cut.slice(0, 3).join(', '));
    if (r.keyish.length) issues.push('text key showing: ' + r.keyish.slice(0, 3).join(', '));
    if (process.env.SHOT) await p.screenshot({ path: `${process.env.SHOT}/${set.name.replace(/\W+/g, '-')}-${String(++n).padStart(2, '0')}-${name.replace(/\W+/g, '-')}.png` });
    ok(!issues.length, `${set.name} · ${name}` + (issues.length ? ': ' + issues.join('; ') : ''));
    return true; }
  const closeAll = async p => { await p.evaluate(() => { const c = document.querySelector('#sheet-close'); if (c && !document.querySelector('#sheet').hidden) c.click(); }); await p.waitForTimeout(400); };
  const tile = async (p, id) => { await p.evaluate(() => T.setTab('tools')); await p.waitForTimeout(200); await p.click(id); };
  const SETS = [
    { name: 'phone', vp: { width: 390, height: 844 }, role: 'owner' },
    { name: 'phone dark Hindi', vp: { width: 390, height: 844 }, role: 'owner', dark: true, hi: true },
    { name: '320px largest text', vp: { width: 320, height: 640 }, role: 'owner', fz: 1.38 },
    { name: 'Samsung Ultra Large text', vp: { width: 384, height: 832 }, role: 'owner', fz: 1.12 },
    { name: 'laptop', vp: { width: 1280, height: 800 }, role: 'owner' },
    { name: 'staff phone', vp: { width: 390, height: 844 }, role: 'staff' }];
  for (const set of SETS) {
    const p = await phone(set), desk = set.vp.width >= 1024, owner = set.role !== 'staff';
    // the three tabs (the laptop shows the bill beside the list)
    await p.evaluate(() => { T.addToBill('i1'); T.addToBill('i3'); });
    await check(p, set, 'Prices tab', '#view-items', () => p.evaluate(() => T.setTab('items')));
    if (!desk) await check(p, set, 'Bill tab', '#view-bill', () => p.evaluate(() => T.setTab('bill')));
    if (!desk) {   // the two rows reported from a Samsung Ultra at Large text (12 Oct 2026)
      await p.fill('#cust', 'Sunil Traders'); await p.fill('#cust-mob', '9876543210'); await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(400);
      await check(p, set, 'Bill tab with a customer', '#view-bill', async () => {});
      ok(await p.evaluate(() => { const m = document.querySelector('#cust-mob').getBoundingClientRect(), x = document.querySelector('#cust-x').getBoundingClientRect(); return x.left >= m.right && Math.abs(x.top - m.top) < 4; }), `${set.name} · the customer ✕ sits beside the mobile, not over it or on a line of its own`);
      await p.evaluate(() => { document.querySelector('#cust-x').click(); T.setTab('items'); }); await p.waitForTimeout(400);
      ok(await p.evaluate(() => { const a = document.querySelector('#meta-r .sortseg').getBoundingClientRect(), g = document.querySelector('#meta-r .layoutbtn').getBoundingClientRect(); return Math.abs((a.top + a.bottom) / 2 - (g.top + g.bottom) / 2) < 4 && g.left > a.right; }), `${set.name} · Prices: the grid button stays beside Most sold | A–Z`);
    }
    await check(p, set, 'Tools tab', '#view-tools', () => p.evaluate(() => T.setTab('tools')));
    // Tools tiles each person can use
    const tiles = [['#t-bills', 'Past bills'], ['#t-dues', 'Credit'], ['#t-custs', 'Customers'], ['#t-settings', 'Settings']]
      .concat(owner ? [['#t-vendors', 'Vendors'], ['#t-reports', 'Reports'], ['#t-cmd', 'Change by typing'], ['#t-add', 'Add item'], ['#t-bulkadd', 'Bulk add'], ['#t-bulkedit', 'Bulk edit'], ['#t-groups', 'Groups'], ['#t-hindi', 'Hindi names']] : []);
    for (const [id, name] of tiles) { await check(p, set, name, undefined, () => tile(p, id)); await closeAll(p); }
    if (!owner) ok(await p.evaluate(() => [...document.querySelectorAll('#t-reports,#t-vendors,#t-bulkedit')].every(b => b.hidden || b.disabled || !b.offsetParent)), `${set.name} · manager-only tiles not usable`);
    // screens inside screens
    await check(p, set, 'Past bills → a bill', undefined, async () => { await tile(p, '#t-bills'); await p.waitForTimeout(800); await p.click('[data-bid="b12"]'); }); await closeAll(p);
    await check(p, set, 'Credit → a customer', undefined, async () => { await tile(p, '#t-dues'); await p.waitForTimeout(800); await p.click('[data-dc="0"]'); }); await closeAll(p);
    await check(p, set, 'Customers → a customer', undefined, async () => { await tile(p, '#t-custs'); await p.waitForTimeout(800); await p.click('[data-cm="9876543210"]'); }); await closeAll(p);
    await check(p, set, 'Item screen', undefined, () => p.evaluate(() => T.openDetail('i3')));
    if (owner) { await check(p, set, 'Item → Edit item', undefined, () => p.click('#d-edit')); }
    await closeAll(p);
    if (owner) {
      await check(p, set, 'Vendors → a vendor', undefined, async () => { await tile(p, '#t-vendors'); await p.waitForTimeout(800); await p.click('.vcard[data-vid="vA"]'); });
      await check(p, set, 'Vendor → a bill', undefined, () => p.click('[data-eid="e1"]')); await closeAll(p);
      await check(p, set, 'Bell → notifications', undefined, () => p.click('#nbell')); await closeAll(p);
    }
    // every Settings card
    await tile(p, '#t-settings'); await p.waitForTimeout(600);
    const cards = await p.$$eval('details.cg', d => d.map(x => x.dataset.cg));
    ok(owner ? cards.length === 10 : cards.length === 3, `${set.name} · Settings shows ${cards.length} cards (${cards.join(', ')})`);
    for (const k of cards) await check(p, set, 'Settings → ' + k, undefined, () => p.click(`details[data-cg="${k}"] summary`));
    await closeAll(p);
    // the lock screen
    await check(p, set, 'Lock screen', '#applock', () => p.evaluate(() => T.appLock()));
    ok(await p.evaluate(() => document.documentElement.classList.contains('locked')), `${set.name} · locked`);
    await p.close();
  }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + [...new Set(errs)].slice(0, 5).join(' | ') : ''));
  await b.close(); done();
})();
