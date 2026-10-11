/* Reports below the summary card (added with the reports.js split, 11 Oct 2026): profit tile and its breakdown, a top item's
   detail (average price, prices charged, buy price and profit), the GST tables, all three CSV exports with their columns and
   rows, "all items", and a custom date range. On a laptop width, where files download straight away. Any page error fails.
   Run: node tests/reportsmore.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openReports');
const items = Array.from({ length: 12 }, (_, i) => ({ name: i ? 'Item ' + i : 'PP Bag', unit: i ? 'pc' : 'kg', qty: i ? 10 : 25, amount: i ? 100 * (13 - i) : 3000, bills: i ? 2 : 6,
  cost: i ? 50 * (13 - i) : 2250, costQty: i ? 10 : 25, costAmt: i ? 100 * (13 - i) : 3000, profit: i ? 50 * (13 - i) : 750, gstQty: i ? 0 : 5, min: 110, max: 130,
  rates: i ? [] : [{ rate: 120, qty: 20, bills: 5 }, { rate: 130, qty: 3, bills: 1 }, { rate: 110, qty: 2, bills: 1 }] }));
const sales = items.reduce((s, x) => s + x.amount, 0);
function report(from, to) {
  return { from, to, totals: { sales: sales + 540, bills: 30, tax: 540, gstBills: 2, cancelled: 1, lineSale: sales, pSale: sales, pCost: sales * 0.75, estAmt: 0, noBuyAmt: 200, profit: 0, cost: 0 },
    byDay: [{ d: from, sales: sales + 540, bills: 30 }], items, itemCount: items.length,
    gst: { b2b: { count: 1, taxable: 2000, cgst: 180, sgst: 180, igst: 0 }, b2c: { count: 1, taxable: 1000, cgst: 90, sgst: 90, igst: 0 },
      rates: [{ rate: 18, taxable: 3000, cgst: 270, sgst: 270, igst: 0 }], hsn: [{ hsn: '3923', rate: 18, qty: 30, taxable: 3000, tax: 540 }] },
    received: 500, creditGiven: 300, outstanding: 1200,
    register: [{ date: from, no: 7, customer: 'Sunil, Traders', gstin: '09ABCDE1234F1Z5', pos: '09-Uttar Pradesh', taxable: 2000, cgst: 180, sgst: 180, igst: 0, total: 2360, status: '' }] };
}
(async () => {
  const b = await launch(), ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }), p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); const asked = [];
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
    const me = { name: 'Mayank', role: 'owner', personal: true, prefs: { mode: 'live', showProfit: true } }, cfg = { shopName: 'Gupta Plastics', mode: 'live' };
    if (req.method() === 'GET') return send({ rev: '1', items: [], config: cfg, sv: 43 });
    const bd = JSON.parse(req.postData());
    if (bd.action === 'report') { asked.push(bd.from + '_' + bd.to); return send({ report: report(bd.from, bd.to) }); }
    if (bd.action === 'boot') return send({ rev: '1', items: [], config: cfg, sv: 43, me });
    return send({ me }); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode: 'live', showProfit: true } })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  await p.evaluate(() => T.openReports()); await p.waitForTimeout(1500);
  const txt = s => p.textContent(s).catch(() => '');
  const shot = async n => { if (process.env.SHOT) { await p.waitForTimeout(900); await p.screenshot({ path: require('path').join(process.env.SHOT, 'r-' + n + '.png'), fullPage: false }); } };   // SHOT=<dir>: screenshots for comparing versions
  await shot('open');

  ok(/GST/.test(await txt('#rp-body')) && /540/.test(await txt('#rp-body')), 'GST tile shows the tax (₹540)');
  ok(/1 cancelled|cancelled/i.test(await txt('#rp-body')), 'cancelled bills are mentioned');
  await p.click('#rp-pbtn'); await p.waitForTimeout(200);
  const pd = await txt('.rp-pdet');
  ok(/10,700/.test(pd) && /8,025/.test(pd) && /2,675/.test(pd) && /33\.3%/.test(pd) && /25%/.test(pd), 'profit breakdown: sales ₹10,700 − cost ₹8,025 = ₹2,675, 33.3% over cost, 25% of sales');
  ok(/200/.test(pd), 'breakdown notes the ₹200 left out (no buy price)');

  ok((await p.$$('[data-rpi]')).length === 10 && !!(await p.$('#rp-allitems')), 'top 10 items, plus a button for all 12');
  await p.click('#rp-allitems'); await p.waitForTimeout(200);
  ok((await p.$$('[data-rpi]')).length === 12, '"All items" shows all 12');
  await p.click('[data-rpi="PP Bag|kg"]'); await p.waitForTimeout(250);
  const d = await txt('.rp-idet');
  ok(/₹120/.test(d) && /3,000 ÷ 25/.test(d), 'item detail: average ₹120 / kg, with the sum written out');
  ok(/₹110/.test(d) && /₹130/.test(d) && (await p.$$('.rp-rates > div')).length === 3, 'item detail: the three prices charged (₹110–₹130)');
  ok(/₹90/.test(d) && /750/.test(d) && /33\.3%/.test(d), 'item detail: average buy ₹90 and profit ₹750 · 33.3%');
  ok(/before GST/i.test(d), 'item detail: note that GST-bill prices are before GST');
  await shot('detail');

  ok(/B2B/.test(await txt('#rp-body')) && /3923/.test(await txt('#rp-body')), 'GST summary: B2B/B2C, by rate and by HSN tables');
  async function csv(kind) { const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null); await p.click(`[data-csv="${kind}"]`); const d = await dl; if (!d) return null;
    const fs = require('fs'); return { name: d.suggestedFilename(), body: fs.readFileSync(await d.path(), 'utf8') }; }
  const reg = await csv('reg');
  ok(reg && /^invoice-register_\d{4}-\d\d-\d\d_to_\d{4}-\d\d-\d\d\.csv$/.test(reg.name) && /^﻿Date,Invoice No,Customer,GSTIN/.test(reg.body) && /"Sunil, Traders",09ABCDE1234F1Z5/.test(reg.body) && /2360/.test(reg.body), 'invoice register CSV: name, BOM + header, a comma in a name is quoted');
  const hsn = await csv('hsn');
  ok(hsn && /^hsn-summary_/.test(hsn.name) && /HSN,GST rate %,Quantity,Taxable value,Total tax\r\n3923,18,30,3000,540/.test(hsn.body), 'HSN summary CSV');
  const its = await csv('items');
  ok(its && /^item-sales_/.test(its.name) && /Avg buy price,Profit/.test(its.body) && /PP Bag,kg,25,3000,6,120,90,750/.test(its.body) && its.body.split('\r\n').length === 13, 'item sales CSV: all 12 items, with buy price and profit');

  const before = asked.length;
  await p.click('[data-rp="custom"]'); await p.waitForTimeout(150);
  ok(await p.isVisible('#rp-custom'), 'Custom shows the date boxes');
  await p.fill('#rp-from', '2026-09-01'); await p.fill('#rp-to', '2026-09-15'); await p.click('#rp-go'); await p.waitForTimeout(800);
  ok(asked.slice(before).includes('2026-09-01_2026-09-15'), 'custom range is asked for exactly (1–15 Sep)');
  await shot('custom');
  ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
