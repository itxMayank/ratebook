/* Vendor screens end to end on a simulated phone (added with the vendors.js split, 11 Oct 2026): list, a vendor's page and its
   tabs, a bill's screen, the payment form with its "which bills" line, saving a payment and a bill through the outbox, a new
   vendor, the share screen and the statement PDF, and Back between them. Any page error fails. Run: node tests/vendors.app.test.js */
const fs = require('fs'), path = require('path');
const { appHtml, launch, ok, done, ROOT } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openVendors,openVendor,VD,VDB');
const today = new Date().toISOString().slice(0, 10);
let vendors = [{ id: 'vA', name: 'Mahaveer Enterprises', mobile: '9876543210', gstin: '', address: '', opening: 0, openingDate: '2026-10-01', linkOn: true, token: 'l0123456789abcdef012345', createdAt: 1, updatedAt: 1, creditDays: 15 },
  { id: 'vB', name: 'Sharma Traders', mobile: '', opening: 500, openingDate: '2026-10-01', linkOn: false, token: 't2', createdAt: 2, updatedAt: 2, creditDays: 0 }];
let entries = [{ id: 'e1', vendorId: 'vA', type: 'bill', date: '2026-10-02', amount: 1180, gst: 180, billNo: 'MH-77', photos: [], alloc: {}, at: 10 },
  { id: 'e2', vendorId: 'vA', type: 'pay', date: '2026-10-05', amount: 700, mode: 'UPI', photos: [], alloc: { e1: 700 }, at: 20 }];
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const sent = []; let vrev = 1;
  await ctx.route('https://rb.test/pdf.js', r => r.fulfill({ body: fs.readFileSync(path.join(ROOT, 'pdf.js')), contentType: 'text/javascript' }));
  await ctx.route('https://rb.test/', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live' } }, cfg = { shopName: 'Ganesh Packaging', mode: 'live' };
    if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 43 });
    const bd = JSON.parse(req.postData()); sent.push(bd);
    const one = id => ({ vendor: vendors.find(v => v.id === id), entries: entries.filter(e => e.vendorId === id) });
    if (bd.action === 'vSync') return send(bd.vrev === String(vrev) ? { same: true } : { vrev: String(vrev), vendors, entries });
    if (bd.action === 'vSave') { const e = { ...bd.entry, at: Date.now() }; delete e.isNew; entries = entries.filter(x => x.id !== e.id).concat(e); vrev++; return send(one(e.vendorId)); }
    if (bd.action === 'vSaveVendor') { const v = { ...bd.vendor, token: 'l' + 'a'.repeat(22), linkOn: false, createdAt: Date.now(), updatedAt: Date.now() }; vendors = vendors.filter(x => x.id !== v.id).concat(v); vrev++; return send(one(v.id)); }
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 43, me });
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live' } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const txt = s => p.textContent(s).catch(() => ''), vis = s => p.isVisible(s).catch(() => false);
  const shot = async n => { if (process.env.SHOT) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(process.env.SHOT, 'v-' + n + '.png') }); } };   // SHOT=<dir>: screenshots for comparing versions

  await p.evaluate(() => T.openVendors()); await p.waitForTimeout(1000);
  ok((await p.$$('.vcard')).length === 2 && /980/.test(await txt('.vl-top')), 'list: both vendors and the total owed (₹480 + ₹500 = ₹980)');
  await shot('list');
  await p.click('.vcard[data-vid="vA"]'); await p.waitForTimeout(500);
  ok(await vis('#vd-page') && /480/.test(await txt('#vd-body')), 'vendor page opens with the balance (1,180 − 700 = ₹480)');
  ok(/MH-77/.test(await txt('#vd-body')), 'ledger shows the bill');
  const tabs = await p.$$('[data-vtab]'); if (tabs[1]) { await tabs[1].click(); await p.waitForTimeout(200); }
  ok(/MH-77/.test(await txt('#vd-body')), 'Bills tab shows the bill');
  await shot('billstab');

  await p.click('#vd-pay'); await p.waitForTimeout(400);
  ok(await vis('#vff-amt'), 'payment form opens');
  await p.fill('#vff-amt', '200'); await p.dispatchEvent('#vff-amt', 'input'); await p.waitForTimeout(200);
  ok(/MH-77|200/.test(await txt('#vff')), 'payment form shows which bill the ₹200 goes to');
  await shot('payform');
  await p.click('#vff-save'); await p.waitForTimeout(1200);
  const pay = sent.find(x => x.action === 'vSave' && x.entry.type === 'pay');
  ok(pay && +pay.entry.amount === 200 && pay.entry.vendorId === 'vA' && pay.entry.alloc && +pay.entry.alloc.e1 === 200, 'payment saved: ₹200 on the open bill');
  ok(/280/.test(await txt('#vd-body')), 'vendor page now shows ₹280 owed');

  await p.click('#vd-bill'); await p.waitForTimeout(400);
  ok(await vis('#vff-amt') && await vis('#vff-no'), 'bill form opens');
  await p.fill('#vff-amt', '2,360'); await p.dispatchEvent('#vff-amt', 'input'); await p.fill('#vff-no', 'MH-81');
  await p.click('#vff-save'); await p.waitForTimeout(1200);
  const bill = sent.find(x => x.action === 'vSave' && x.entry.type === 'bill');
  ok(bill && +bill.entry.amount === 2360 && bill.entry.billNo === 'MH-81' && bill.entry.date === today, 'bill saved with amount, number and today\'s date');
  ok(/2,640/.test(await txt('#vd-body')), 'balance now ₹2,640');
  await shot('vendor');

  await p.click('[data-eid="e1"]'); await p.waitForTimeout(400);
  ok(await vis('#ve-back') && /MH-77/.test(await txt('#sheet-body')) && await vis('#ve-pay'), 'a bill\'s own screen opens, with Pay this bill');
  await shot('entry');
  await p.click('#sheet-back'); await p.waitForTimeout(400);
  ok(await vis('#vd-page'), 'header ← from the bill returns to the vendor');

  await p.click('#vd-share'); await p.waitForTimeout(400);
  ok(await vis('#vs-pdf') && /vendor\.html\?t=l0123456789abcdef012345/.test(await p.inputValue('#vs-link').catch(() => '') + await txt('#sheet-body')), 'share screen: statement and the vendor\'s link');
  await shot('share');
  const dl = p.waitForEvent('download', { timeout: 15000 }).catch(() => null);
  const shareSpy = await p.evaluate(() => { window.__shared = null; if (navigator.share) { navigator.share = d => { window.__shared = d; return Promise.resolve(); }; navigator.canShare = () => true; } return !!navigator.share; });
  await p.click('#vs-pdf'); const d = await dl; await p.waitForTimeout(500);
  if (await vis('#fileact')) { const b2 = await p.$('#fileact button'); if (b2) await b2.click(); await p.waitForTimeout(300); }
  const shared = await p.evaluate(() => window.__shared && window.__shared.files && window.__shared.files[0] && window.__shared.files[0].name);
  ok((d && /Statement-Mahaveer/.test(d.suggestedFilename())) || /Statement-Mahaveer/.test(shared || ''), 'statement PDF is made (' + (d ? d.suggestedFilename() : shared || 'none') + (shareSpy ? ', share' : '') + ')');
  await p.click('#sheet-back'); await p.waitForTimeout(300);
  ok(await vis('#vd-page'), 'Back from the share screen returns to the vendor');

  await p.evaluate(() => T.openVendors()); await p.waitForTimeout(400);
  await p.click('#vl-new'); await p.waitForTimeout(300);
  await p.fill('#vf-name', 'Gupta Plastics'); await p.fill('#vf-mob', '98765 01234');
  await p.click('#vf-save'); await p.waitForTimeout(1200);
  const nv = sent.find(x => x.action === 'vSaveVendor');
  ok(nv && nv.vendor.name === 'Gupta Plastics' && nv.vendor.mobile === '9876501234', 'new vendor saved (mobile as 10 digits)');
  await p.evaluate(() => T.openVendors()); await p.waitForTimeout(600);
  ok((await p.$$('.vcard')).length === 3, 'the new vendor is in the list');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
