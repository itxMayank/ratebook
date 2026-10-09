const { chromium } = require('../browser').pw;
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname,'..','..','index.html'), 'utf8').replace('boot();\n})();\n</script>', 'boot();\nwindow.T={appUnlock,openDues,openCustomers,openDetail,openEdit};\n})();\n</script>');
const ok = (c, m) => console.log((c ? 'PASS ' : 'FAIL ') + m);
const custs = Array.from({ length: 40 }, (_, i) => ({ name: 'Cust ' + i, mobile: '98765432' + String(i).padStart(2, '0'), due: 100 + i, oldest: '2026-10-01', bills: [{ n: i + 1, date: '2026-10-01', total: 100 + i, paid: 0, due: 100 + i, items: '' }] }));
(async () => {
  const b = await chromium.launch({ executablePath: require('../browser').exe });
  const p = await (await b.newContext({ viewport: { width: 390, height: 780 } })).newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await p.route('https://script.google.com/**', r => { const q = r.request(); const send = o => r.fulfill({ body: JSON.stringify({ ok: true, ...o }), contentType: 'application/json' });
    if (q.method() === 'GET') return send({ rev: '1', items: Array.from({ length: 5 }, (_, i) => ({ id: 'i' + i, name: 'Item ' + i, unit: 'kg', buy: 10, sell: 12 })), config: { shopName: 'G', mode: 'live' }, sv: 34 });
    const bd = JSON.parse(q.postData());
    if (bd.action === 'verify') return send({ me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } });
    if (bd.action === 'listDues') return send({ total: 5000, bills: 40, customers: custs });
    if (bd.action === 'listCustomers') return send({ brev: '1', customers: custs.map(c => [c.mobile.slice(-10), c.name, '', 1, c.due, '2026-10-01', c.due]) });
    if (bd.action === 'listBills') return send({ brev: '1', bills: [], same: false });
    return send({}); });
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })));
  await p.goto('https://rb.test/index.html'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock());
  const sc = () => p.evaluate(() => document.querySelector('#sheet-body').scrollTop), title = () => p.textContent('#sheet-title');
  // Credit
  await p.evaluate(() => T.openDues()); await p.waitForTimeout(700);
  await p.evaluate(() => document.querySelector('[data-dc="30"]').scrollIntoView({ block: 'center' })); const y = await sc();
  await p.click('[data-dc="30"]'); await p.waitForTimeout(300); ok(await title() === 'Cust 30', 'Credit → customer');
  await p.click('#sheet-back'); await p.waitForTimeout(500); ok(await title() === 'Credit (Udhaar)' || !/Cust 30/.test(await title()), 'Credit ← back to list'); ok(Math.abs(await sc() - y) < 40, `…at the same scroll (${y} → ${await sc()})`);
  await p.click('#sheet-close'); await p.waitForTimeout(400);
  // Customers
  await p.evaluate(() => T.openCustomers()); await p.waitForTimeout(900);
  const sel = await p.evaluate(() => { const el = [...document.querySelectorAll('#cu-list [data-cu],#cu-list button')][25]; if (!el) return null; el.scrollIntoView({ block: 'center' }); el.id = 'pick'; return true; });
  if (sel) { const y2 = await sc(); await p.click('#pick'); await p.waitForTimeout(500); const t2 = await title();
    await p.click('#sheet-back'); await p.waitForTimeout(700); ok(await title() !== t2 && Math.abs(await sc() - y2) < 40, `Customers → customer → ← keeps the list scroll (${y2} → ${await sc()})`); }
  else ok(false, 'customers list rendered');
  await p.click('#sheet-close'); await p.waitForTimeout(400);
  // Item → Edit → Cancel
  await p.evaluate(() => T.openDetail('i2')); await p.waitForTimeout(500); const t3 = await title();
  await p.evaluate(() => document.querySelector('#d-edit,[data-edit],#d-editbtn') ? document.querySelector('#d-edit,[data-edit],#d-editbtn').click() : T.openEdit('i2')); await p.waitForTimeout(400);
  ok(await p.evaluate(() => !document.querySelector('#sheet-back').hidden), 'Edit item opened from the item shows ←');
  await p.click('#ef-cancel'); await p.waitForTimeout(400); ok(await title() === t3, 'Edit → Cancel goes back to the item (used to close everything)');
  await b.close();
})();
