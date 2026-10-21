/* Break pass (21 Oct 2026): every name and note the app, the admin dashboard and the vendor's page show comes from someone
   typing it (staff, a customer's name, a vendor, a shop's owner) or from a link. Here each of them is HTML that would add
   elements if it were written into the page as code: after every screen, nothing it carries may exist as a real element.
   Run: node tests/breakxss.app.test.js */
const fs = require('fs'), path = require('path');
const { appHtml, launch, ok, done, ROOT } = require('./browser');
const { withCsp } = require('../tools/stamp');
const X = (k) => `${k}"'><b data-x="${k}">x</b><img data-x="${k}" src="data:,"><svg data-x="${k}"></svg>`;
const html = appHtml('S,appUnlock,appLock,setTab,openDetail,addToBill');
const iso = d => d.toISOString().slice(0, 10), now = new Date(), ago = n => new Date(now - n * 864e5);
const items = [{ id: 'i1', name: X('item'), nameHi: X('itemHi'), aliases: X('alias'), cat: X('cat'), unit: 'kg', buy: 150, sell: 180, hsn: '3923', gst: 18, updatedBy: X('upBy'), updatedAt: Date.now() - 6e4 },
  { id: 'i2', name: 'Paper Cup', unit: X('unit'), buy: 1, sell: 2 }];
const bill = (n, o) => ({ n, id: 'b' + n, row: n + 1, date: ago(n).toISOString(), day: iso(ago(n)), customer: X('cust' + n), mobile: '9876543210', total: 500, items: X('items' + n), by: X('by' + n), gst: true, custGstin: '09ABCDE1234F1Z5', edits: 1, editedBy: X('edBy'), editedAt: ago(0).toISOString(), pay: 'Credit', paid: 100, due: 400, payments: [{ d: ago(0).toISOString(), a: 100, by: X('payBy'), note: X('payNote') }], fy: '2026-27', cancelled: false, custAddr: X('addr'), po: { no: X('po'), date: '2026-10-01' }, pos: X('pos'), ...o });
const bills = [bill(12), bill(5, { cancelled: true, cancelReason: X('reason'), cancelledBy: X('cBy') })];
const dues = { total: 400, bills: 1, customers: [{ name: X('dueName'), mobile: '9876543210', due: 400, oldest: iso(ago(40)), bills: [{ n: 12, id: 'b12', row: 13, date: iso(ago(40)), total: 500, paid: 100, due: 400, items: X('dueItems'), gst: false, payments: [{ d: iso(ago(1)), a: 100, by: X('dpBy'), note: X('dpNote') }] }] }] };
const custs = [['9876543210', X('cuName'), '09ABCDE1234F1Z5', 4, 3250, iso(ago(6)), 400, X('cuAddr'), X('cuNote'), 12, X('cuContact'), X('cuEmail'), '']];
const vendors = [{ id: 'vA', name: X('vName'), mobile: '9876543210', gstin: X('vGst'), address: X('vAddr'), note: X('vNote'), opening: 0, openingDate: '2026-10-01', linkOn: true, token: 'l0123456789abcdef012345', createdAt: 1, updatedAt: 1, creditDays: 15 }];
const entries = [{ id: 'e1', vendorId: 'vA', type: 'bill', date: '2026-10-02', amount: 1180, gst: 180, billNo: X('vBillNo'), noteV: X('noteV'), noteP: X('noteP'), mode: X('mode'), ref: X('ref'), by: X('eBy'), photos: [], alloc: {}, at: 10, check: { st: 'issues', issues: [{ t: 'line', d: X('chkLine') }], m: X('model') } }];
(async () => {
  const b = await launch(); const errs = []; const found = [];
  const look = async (p, where) => { const r = await p.evaluate(() => ({ els: [...document.querySelectorAll('[data-x]')].map(e => e.tagName + ':' + e.dataset.x), alert: !!window.__x }));
    if (r.els.length) found.push(where + ' → ' + r.els.slice(0, 4).join(', ')); return r.els.length === 0; };
  // ---------- A. the app ----------
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
  p.on('pageerror', e => errs.push('app: ' + e.message)); p.on('dialog', d => d.dismiss());
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: X('me'), role: 'owner', personal: true, prefs: { mode: 'live', showProfit: true } };
    const cfg = { shopName: X('shop'), shopAddress: X('shopAddr'), billFooter: X('footer'), mode: 'live', nextBill: 13, nextGstBill: 6, shopGstin: '09ABCDE1234F1Z5', units: [{ code: 'kg', hi: X('unitHi') }, { code: X('unitCode'), hi: 'x' }], defaultUnit: 'kg', roundTo: 1, defaultGst: 18, defaultHsn: '3923', groups: JSON.stringify([X('group')]) };
    if (req.method() === 'GET') return send({ rev: '1', bl: '1', bt: '0', vl: '1', vt: '0', nl: '5', nt: '0' });
    const bd = JSON.parse(req.postData()), a = bd.action;
    if (a === 'boot' || a === 'list') return send({ rev: '1', items, config: cfg, sv: 63, pop: { i1: 9 }, me });
    if (a === 'listBills') return send({ full: true, brev: '1', bills, years: ['2026'] });
    if (a === 'getBill' || a === 'getBills') { const x = bills.find(y => y.id === bd.id) || bills[0]; const bb = { ...x, text: X('billText'), lines: [{ id: 'i1', name: X('lineName'), unit: X('lineUnit'), rate: 180, qty: 1, buy: 150 }] }; return send(a === 'getBills' ? { bills: [bb] } : { bill: bb }); }
    if (a === 'listDues') return send(dues);
    if (a === 'listCustomers') return send({ brev: '1', customers: custs });
    if (a === 'findCustomer') return send({ customer: { name: X('fcName'), address: X('fcAddr'), gstin: '', count: 2, total: 10, due: 0 } });
    if (a === 'vSync') return send({ vrev: '1', schema: 2, vendors, entries });
    if (a === 'notices') return send({ nrev: '5', list: [{ id: 'n1', at: Date.now() - 6e4, kind: 'bill', vendorId: 'vA', entryId: 'e1', vname: X('nVname'), amount: 1180, billNo: X('nBillNo'), extra: { mode: X('nMode'), bills: [X('nBills')] }, by: X('nBy'), read: false }] });
    if (a === 'itemBuys') return send({ buys: [{ date: '2026-10-01', vendor: X('buyVendor'), qty: 1, unit: X('buyUnit'), rate: 100, f: 1, buy: 100 }] });
    if (a === 'priceHist') return send({ rows: [{ at: Date.now(), field: 'sell', old: 1, new: 2, by: X('phBy'), src: X('phSrc') }] });
    if (a === 'listUsers') return send({ users: [{ id: 'u1', name: X('user'), role: 'staff', active: true, testOk: true }] });
    if (a === 'listSessions') return send({ sessions: [{ id: 's1', name: X('sessName'), label: X('sessLabel'), made: Date.now(), seen: Date.now(), me: false, pending: true }], approveNew: true });
    if (a === 'getAccess') return send({ access: { on: true, code: X('code') } });
    if (a === 'backupInfo') return send({ backups: { auto: true, last: new Date().toISOString(), count: 1, email: X('email'), list: [{ id: 'k1', name: X('bkName'), at: Date.now() }] } });
    if (a === 'report') return send({ report: { from: bd.from, to: bd.to, totals: { sales: 500, bills: 1, lineSale: 500, pSale: 500, pCost: 400 }, byDay: [], items: [{ name: X('repItem'), unit: X('repUnit'), qty: 1, amount: 500, bills: 1, rates: [] }], itemCount: 1, gst: { b2b: {}, b2c: {}, rates: [], hsn: [{ hsn: X('hsn'), taxable: 1 }] }, register: [] } });
    return send({ me }); });
  await p.addInitScript(() => { if (sessionStorage.x) return; sessionStorage.x = 1;
    localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: `me"'><b data-x="lockName">x</b>`, role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live', showProfit: true } }));
    localStorage.setItem('rb_recent', JSON.stringify(['i1'])); });
  await p.goto('https://rb.test/'); await p.waitForTimeout(1300);
  ok(await look(p, 'lock screen'), 'A1 lock screen (the signed-in name is HTML)');
  await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(700);
  ok(await look(p, 'Prices'), 'A2 Prices: item names, Hindi names, other names, groups, units, the shop name');
  ok(await p.evaluate(() => document.body.innerText.includes('<b data-x="item">')), 'A2b …the names are on screen, as the text that was typed (so the check above means something)');
  await p.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<i data-x="probe"></i>')); const probe = !(await look(p, 'probe')); found.pop(); await p.evaluate(() => document.querySelector('[data-x=probe]').remove());
  ok(probe, 'A2c …and the check does catch HTML written into the page (self-test)');
  await p.fill('#q', 'item'); await p.waitForTimeout(500); ok(await look(p, 'search'), 'A3 search results and "Also:" other names');
  await p.fill('#q', ''); await p.evaluate(() => { T.addToBill('i1'); T.addToBill('i2'); T.setTab('bill'); }); await p.waitForTimeout(500);
  await p.fill('#cust-mob', '9876543210'); await p.waitForTimeout(700);
  ok(await look(p, 'Bill'), 'A4 Bill page: lines, units, a returning customer\'s name and address');
  const tile = async id => { await p.evaluate(() => T.setTab('tools')); await p.waitForTimeout(200); await p.click(id); await p.waitForTimeout(900); };
  const close = async () => { await p.evaluate(() => { const c = document.querySelector('#sheet-close'); if (c && !document.querySelector('#sheet').hidden) c.click(); }); await p.waitForTimeout(300); };
  await p.evaluate(() => T.openDetail('i1')); await p.waitForTimeout(900); ok(await look(p, 'item'), 'A5 item screen: names, who changed it, bought from, price history');
  await p.click('#d-edit'); await p.waitForTimeout(500); ok(await look(p, 'edit item'), 'A6 Edit item'); await close();
  await tile('#t-bills'); ok(await look(p, 'past bills'), 'A7 Past bills: customers, items, who made / edited / cancelled, reasons');
  await p.click('[data-bid="b12"]'); await p.waitForTimeout(900); ok(await look(p, 'a bill'), 'A8 a past bill: its text, payments and notes, address, PO'); await close();
  await tile('#t-dues'); ok(await look(p, 'credit'), 'A9 Credit list');
  await p.click('[data-dc="0"]'); await p.waitForTimeout(700); ok(await look(p, 'credit customer'), 'A10 a Credit customer and their payments'); await close();
  await tile('#t-custs'); ok(await look(p, 'customers'), 'A11 Customers');
  await p.click('[data-cm="9876543210"]'); await p.waitForTimeout(700); ok(await look(p, 'customer'), 'A12 a customer: address, note, contact, email'); await close();
  await tile('#t-vendors'); ok(await look(p, 'vendors'), 'A13 Vendors');
  await p.click('.vcard[data-vid="vA"]'); await p.waitForTimeout(700); ok(await look(p, 'vendor'), 'A14 a vendor: name, GSTIN, address, private note');
  await p.click('[data-eid="e1"]'); await p.waitForTimeout(700); ok(await look(p, 'vendor bill'), 'A15 a vendor bill: number, notes, mode, bill check'); await close();
  await p.click('#nbell'); await p.waitForTimeout(700); ok(await look(p, 'notices'), 'A16 notifications'); await close();
  await tile('#t-reports'); await p.waitForTimeout(800); ok(await look(p, 'reports'), 'A17 Reports'); await close();
  await tile('#t-settings'); for (const k of await p.$$eval('details.cg', d => d.map(x => x.dataset.cg))) { await p.click(`details[data-cg="${k}"] summary`); await p.waitForTimeout(400); }
  ok(await look(p, 'settings'), 'A18 every Settings card: people, signed-in phones, shop code, backups, groups, units'); await close();
  await p.close();
  // a shop link whose name is HTML (the name only decorates the opening screen)
  const p2 = await ctx.newPage(); await p2.route('https://dir.test/**', () => {});
  await p2.addInitScript(() => localStorage.clear()); await p2.goto('https://rb.test/?shop=SHARMA-ABCDEFGHJK&n=' + encodeURIComponent(X('linkName'))); await p2.waitForTimeout(900);
  ok(await look(p2, 'shop link'), 'A19 a shop link with HTML as its name (&n=): shown as text'); await p2.close();
  // ---------- B. the vendor's own page ----------
  const vctx = await b.newContext({ viewport: { width: 390, height: 844 } }), v = await vctx.newPage(); v.on('pageerror', e => errs.push('vendor: ' + e.message));
  const vh = withCsp(fs.readFileSync(path.join(ROOT, 'vendor.html'), 'utf8'));
  await v.route('https://rb.test/**', r => r.fulfill({ body: vh, contentType: 'text/html' }));
  await v.route('https://script.google.com/**', r => { const u = new URL(r.request().url()), a = u.searchParams.get('action'), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, ...o }) });
    if (a === 'vpub') return send({ shop: { name: X('vpShop'), address: X('vpAddr'), gstin: X('vpGst') }, vendor: { name: X('vpVendor'), gstin: X('vpVg') }, entries: entries.map(e => ({ ...e, noteP: undefined, photos: [{ f: 'f1', m: 'image/jpeg' }] })), calc: { balance: 1180, bills: [{ id: 'e1', amount: 1180, paid: 0, due: 1180, st: 'open', billNo: X('vpBno') }] }, at: Date.now() });
    if (a === 'vpubprev') return send({ previews: { f1: `x" onerror="window.__x=1` } });
    return send({}); });
  await v.goto('https://rb.test/vendor.html?t=l0123456789abcdef012345'); await v.waitForTimeout(1200);
  ok(await look(v, 'vendor page'), 'B1 the vendor\'s link page: shop, vendor, bill numbers, notes; a bad photo preview isn\'t used');
  for (const t of await v.$$('[data-tab]')) { await t.click().catch(() => {}); await v.waitForTimeout(200); }
  ok(await look(v, 'vendor page tabs') && !(await v.evaluate(() => !!window.__x)), 'B2 …on both tabs');
  // ---------- C. the admin dashboard ----------
  const DIRU = 'https://script.google.com/macros/s/DIRECTORY/exec';
  const ah = withCsp(fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8').replace(/const DIR_URL = "[^"]*";/, `const DIR_URL = "${DIRU}";`));
  const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'insights.json'), 'utf8'));
  (function poison(o) { if (Array.isArray(o)) return o.forEach(poison); if (o && typeof o === 'object') for (const k in o) { if (typeof o[k] === 'string' && ['shopName', 'name', 'unit', 'vendor', 'cat', 'usual', 'best'].includes(k)) o[k] = X('biz-' + k); else poison(o[k]); } })(FX);
  const shops = [{ code: 'main', name: X('mainShop'), owner: X('owner'), phone: X('phone'), notes: X('notes'), plan: X('plan'), status: 'live', version: 63, apiUrl: 'x', scriptId: 'm', deploymentId: 'd' },
    { code: 'SHARMA-ABCDEFGHJK', name: X('shop2'), owner: X('owner2'), status: 'needs-auth', version: 62, apiUrl: 'y', scriptId: 's', deploymentId: 'd2' }];
  const actx = await b.newContext({ viewport: { width: 1280, height: 900 } }), A = await actx.newPage(); A.on('pageerror', e => errs.push('admin: ' + e.message)); A.on('dialog', d => d.dismiss());
  await A.route('https://rb.test/**', r => r.fulfill({ body: ah, contentType: 'text/html' }));
  await A.route('https://script.google.com/**', r => { const q = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, ...o }) });
    if (q.method() === 'GET') return send({});
    const bd = JSON.parse(q.postData());
    if (bd.action === 'list') return send({ shops, bizView: true });
    if (bd.action === 'latest') return send({ latest: { sv: 64 } });
    const H = { ok: true, sv: 63, bills: { today: 1, todayAmt: 10 }, tbills: {}, sessions: 1, pending: 1, perf: [{ a: X('perfAct'), n: 3, p50: 900, p95: 2000 }], perfDays: [{ d: iso(now), a: { [X('act')]: [3, 0, 0, 0, 0, 300, 0, 0, 3, 0, 0, 0, 0, 0] }, p: {}, l: { [X('phoneType')]: [3, 900] } }], rows: {}, lastErr: X('lastErr'), startPin: 'on' };
    if (bd.action === 'recheck') return send({ health: { main: H, 'SHARMA-ABCDEFGHJK': H } });
    if (bd.action === 'shopHealth') return send({ health: H });
    if (bd.action === 'errors') return send({ errors: [{ t: Date.now() - 6e4, shop: 'main', kind: 'phone', where: X('errWhere'), m: X('errMsg'), who: X('errWho'), phone: X('errPhone'), detail: X('errDetail') }] });
    if (bd.action === 'shopInsights') return send({ insights: FX });
    if (bd.action === 'startPin') return send({ pin: X('pin') });
    return send({}); });
  await A.addInitScript(() => { localStorage.setItem('rbadm_tok', '"T"'); });
  await A.goto('https://rb.test/admin.html'); await A.waitForTimeout(1500);
  ok(await look(A, 'admin list'), 'C1 dashboard: shop names, owners, notes, plans, phones');
  await A.click('#shops .card[data-open=main] .stats').catch(() => {}); await A.waitForTimeout(1200);
  const nt = await A.$$eval('.sp-tabs [role=tab]', a => a.length);
  for (let i = 0; i < nt; i++) { await A.click(`.sp-tabs [role=tab] >> nth=${i}`).catch(() => {}); await A.waitForTimeout(700); }
  ok(await look(A, 'admin shop page'), 'C2 a shop\'s page, every tab: business page (names from the shop\'s bills and items), speed (action and phone names), errors (messages from phones), setup');
  const eb = await A.$('#b-errors, [data-act=errors]'); if (eb) { await eb.click().catch(() => {}); await A.waitForTimeout(800); }
  ok(await look(A, 'admin error log'), 'C3 the error log (anything a phone sends, word for word)');
  ok(!found.length, 'no HTML from typed names became part of any page' + (found.length ? ': ' + found.join(' | ') : ''));
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + [...new Set(errs)].slice(0, 5).join(' | ') : ''));
  await b.close(); done();
})();
