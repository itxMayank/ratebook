/* App side of vendor notifications: bell + badge for owner/manager only, list grouped by day, opening marks read, a new one
   from the rev check slides in, kinds switched off are hidden, tapping a row opens the vendor. Run: node tests/notices.app.test.js */
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,openNotices,checkRev,openSettings,NT');
const now = Date.now();
const N = (id, kind, o) => Object.assign({ id, at: now - 60000, kind, vendorId: 'vA', entryId: '', vname: 'Mahaveer', amount: null, billNo: '', extra: {}, by: 'Sanjay', read: false }, o);
const base = [N('n2', 'bill', { amount: 1180, billNo: 'M-77', entryId: 'e1', extra: { due: '2026-10-17' } }), N('n1', 'vendor', { at: now - 86400000 * 1.2, extra: { days: 15 } }),
  N('n0', 'pay', { amount: 500, extra: { mode: 'UPI', bills: ['M-77'] }, at: now - 86400000 * 3, read: true })];
(async () => {
  const b = await launch();
  async function phone(role, o = {}) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
    const st = { list: JSON.parse(JSON.stringify(base)), nrev: '5', sent: [], prefs: o.prefs || {} };
    await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
    await ctx.route('https://script.google.com/**', r => { const req = r.request(), send = x => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', ...x }) });
      const me = { name: 'Mayank', role, personal: true, prefs: st.prefs };
      if (req.method() === 'GET') { const u = new URL(req.url()); if (u.searchParams.get('action') === 'rev') return send({ rev: '1', nl: st.nrev, nt: '0' }); return send({ rev: '1', items: [], config: { shopName: 'G', mode: 'live' }, sv: 43 }); }
      const bd = JSON.parse(req.postData()); st.sent.push(bd);
      if (bd.action === 'notices') return send({ nrev: st.nrev, list: st.list });
      if (bd.action === 'noticeRead') { st.list.forEach(n => { if (bd.all || (bd.ids || []).includes(n.id)) n.read = true; }); st.nrev = String(+st.nrev + 1); return send({ nrev: st.nrev, list: st.list }); }
      if (bd.action === 'setMyPrefs') { st.prefs = { ...st.prefs, ...bd.prefs }; return send({ prefs: st.prefs, testOk: true }); }
      if (bd.action === 'vSync') return send({ vrev: '1', vendors: [{ id: 'vA', name: 'Mahaveer', opening: 0, openingDate: '2026-10-01', creditDays: 15, token: 't', createdAt: 1, updatedAt: 1 }], entries: [{ id: 'e1', vendorId: 'vA', type: 'bill', date: '2026-10-02', amount: 1180, billNo: 'M-77', photos: [], alloc: {}, at: 10 }] });
      if (bd.action === 'boot') return send({ rev: '1', items: [], config: { shopName: 'G', mode: 'live' }, sv: 43, me });
      return send({ me }); });
    await p.addInitScript(([role, prefs]) => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'Mayank', role, personal: true, pinH: 'x', pinS: 'AAAA', prefs })), [role, st.prefs]);
    await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
    await p.evaluate(() => T.checkRev()); await p.waitForTimeout(600);
    return { p, st };
  }
  const { p, st } = await phone('owner');
  ok(await p.isVisible('#nbell') && (await p.textContent('#nbadge')) === '2', 'owner: bell in the header with 2 unread');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '/n1.png' });
  await p.click('#nbell'); await p.waitForTimeout(600);
  const rows = await p.$$eval('.nrow', r => r.map(x => x.textContent));
  ok(rows.length === 3 && /Bill ₹1,180 from Mahaveer/.test(rows[0]) && /Bill M-77/.test(rows[0]) && /by Sanjay/.test(rows[0]), 'list: newest first, "Bill ₹1,180 from Mahaveer · Bill M-77 · due … · by Sanjay"');
  ok(/New vendor: Mahaveer/.test(rows[1]) && /15 days credit/.test(rows[1]) && /Paid ₹500 to Mahaveer/.test(rows[2]) && /UPI/.test(rows[2]) && /for bill M-77/.test(rows[2]), 'new vendor and payment rows read clearly');
  ok((await p.$$eval('.n-day', d => d.map(x => x.textContent))).join('|').startsWith('Today|Yesterday'), 'grouped by day: Today, Yesterday, …');
  ok((await p.$$('.nrow.unread')).length === 2, 'unread ones are highlighted in this view');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '/n2.png' });
  ok(st.sent.some(x => x.action === 'noticeRead' && x.all) && (await p.isHidden('#nbadge')), 'opening the list marks them read; badge gone');
  await p.click('.nrow >> nth=0'); await p.waitForTimeout(1500);
  ok(/Mahaveer|Bill M-77/.test(await p.textContent('#sheet')), 'tapping a row opens that vendor / bill');
  await p.keyboard.press('Escape'); await p.evaluate(() => { document.querySelector('#sheet-close') && document.querySelector('#sheet-close').click(); }); await p.waitForTimeout(400);
  // a new one arrives through the rev check → slides in, badge 1
  st.list.unshift(N('n3', 'paid', { amount: 1180, billNo: 'M-77', at: Date.now(), by: 'Ravi' })); st.nrev = '99';
  await p.evaluate(() => T.checkRev()); await p.waitForTimeout(800);
  ok((await p.getAttribute('#nslide', 'class')) === 'on' && /Bill M-77 fully paid/.test(await p.textContent('#nslide')) && (await p.textContent('#nbadge')) === '1', 'new notice from another phone: slides in, badge 1');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + '/n3.png' });
  // switch "Bill fully paid" off in Settings
  await p.evaluate(() => T.openSettings()); await p.waitForTimeout(500); await p.click('details[data-cg="me"] summary'); await p.waitForTimeout(300);
  ok(!!(await p.$('#cf-noti [data-nk="paid"]')), 'Settings → Just for you: notification kinds');
  if (process.env.SHOT) { await p.evaluate(() => document.querySelector('#cf-noti').scrollIntoView({ block: 'center' })); await p.screenshot({ path: process.env.SHOT + '/n4.png' }); }
  await p.click('#cf-noti [data-nk="paid"]'); await p.waitForTimeout(600);
  const sp = st.sent.filter(x => x.action === 'setMyPrefs').pop();
  ok(sp && JSON.stringify(sp.prefs.noff) === '["paid"]', 'saved with the person: noff ["paid"]');
  ok(await p.isHidden('#nbadge'), 'the switched-off kind no longer counts on the bell');
  await p.context().close();
  const m = await phone('manager'); ok(await m.p.isVisible('#nbell'), 'manager sees the bell'); await m.p.context().close();
  const s = await phone('staff'); ok(await s.p.isHidden('#nbell') && !s.st.sent.some(x => x.action === 'notices'), 'staff: no bell, nothing fetched'); await s.p.context().close();
  await b.close(); done();
})();
