/* App side of moving vendors from test to real mode: owner + test mode only, all ticked, warning + confirm, sends the chosen ids.
   Run: node tests/vtolive.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,LOCK,appUnlock,openVendors');
const vendors = [{ id: 'vA', name: 'Mahaveer', mobile: '', opening: 0, openingDate: '2026-10-01', linkOn: false, token: 't1', createdAt: 1, updatedAt: 1, creditDays: 0 },
  { id: 'vB', name: 'Sharma', mobile: '', opening: 0, openingDate: '2026-10-01', linkOn: false, token: 't2', createdAt: 2, updatedAt: 2, creditDays: 0 }];
const entries = [{ id: 'e1', vendorId: 'vA', type: 'bill', date: '2026-10-02', amount: 1180, photos: [], alloc: {}, at: 10 }, { id: 'e2', vendorId: 'vA', type: 'pay', date: '2026-10-05', amount: 700, photos: [], alloc: { e1: 700 }, at: 20 }];
(async () => {
  const b = await launch();
  async function phone(role, mode) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    const sent = []; let moved = false;
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = o => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...o }) });
      const me = { name: 'Mayank', role, personal: true, prefs: { mode } };
      if (req.method() === 'GET') return send({ rev: '1', items: [], config: { shopName: 'G', mode }, sv: 42 });
      const bd = JSON.parse(req.postData()); sent.push(bd);
      if (bd.action === 'vSync') return send(moved ? { vrev: '2', vendors: vendors.filter(v => v.id === 'vB'), entries: [] } : { vrev: '1', vendors, entries });
      if (bd.action === 'vToLive') { moved = true; return send({ moved: 1, names: ['Mahaveer'], entries: 2, photos: 1, files: 1, fileFail: 0, purchases: 3, skipped: [] }); }
      if (bd.action === 'boot') return send({ rev: '1', items: [], config: { shopName: 'G', mode }, sv: 42, me });
      return send({ me }); });
    await p.addInitScript(([role, mode]) => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role, personal: true, pinH: 'x', pinS: 'AAAA', prefs: { mode } })), [role, mode]);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
    await p.evaluate(() => T.openVendors()); await p.waitForTimeout(1200);
    return { p, sent };
  }
  const { p, sent } = await phone('owner', 'test');
  if (process.env.SHOT) { await p.evaluate(() => document.querySelector('#vl-move').scrollIntoView()); await p.screenshot({ path: process.env.SHOT + '/vm1.png' }); }
  ok(!!(await p.$('#vl-move')), 'owner in test mode: "Move to real mode" link under the vendors');
  await p.click('#vl-move'); await p.waitForTimeout(300);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '/vm2.png' });
  ok(/bills, payments, returns, notes, bill photos/.test(await p.textContent('.vm-warn')) && /link, it changes/.test(await p.textContent('.vm-warn')), 'warning says what moves and that a shared link changes');
  ok((await p.$$eval('[data-vm]', c => c.filter(x => x.checked).length)) === 2 && /Move 2 vendors/.test(await p.textContent('#vm-go')), 'all vendors ticked at the start');
  ok(/2 entries/.test(await p.textContent('.vm-row')), 'each vendor shows how many entries it has');
  await p.click('[data-vm="vB"]'); await p.waitForTimeout(100);
  ok(/Move 1 vendor/.test(await p.textContent('#vm-go')), 'untick Sharma: "Move 1 vendor"');
  let asked = ''; p.once('dialog', d => { asked = d.message(); d.dismiss(); }); await p.click('#vm-go'); await p.waitForTimeout(300);
  ok(/can't be undone/.test(asked) && !sent.some(x => x.action === 'vToLive'), 'a final confirm comes first; Cancel there sends nothing');
  p.once('dialog', d => d.accept()); await p.click('#vm-go'); await p.waitForTimeout(1200);
  const mv = sent.find(x => x.action === 'vToLive');
  ok(mv && JSON.stringify(mv.ids) === '["vA"]', 'OK: only the ticked vendor is sent');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '/vm3.png' });
  ok(/1 vendor moved to real mode/.test(await p.textContent('.vm-done')) && /2 entries, 1 bill photo and 3 purchase lines/.test(await p.textContent('.vm-done')), 'done screen says what moved');
  ok(sent.filter(x => x.action === 'vSync').length >= 2, 'the vendor list is fetched again afterwards');
  await p.context().close();
  const m = await phone('manager', 'test'); ok(!(await m.p.$('#vl-move')), 'a manager never sees it'); await m.p.context().close();
  const l = await phone('owner', 'live'); ok(!(await l.p.$('#vl-move')), 'not shown in real mode'); await l.p.context().close();
  await b.close(); done();
})();
