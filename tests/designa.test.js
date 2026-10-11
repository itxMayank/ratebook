/* Design quick wins (11 Oct 2026): Tools grouped with daily screens first, grey text ≥ 4.5:1 in every theme,
   44 px touch areas on small controls, launch colours match the app, Iris accent. Run: node tests/designa.test.js */
const fs = require('fs'), path = require('path');
const { appHtml, launch, ok, done } = require('./browser');
const html = appHtml('S,appUnlock,addToBill,setTab');
const items = ['PP Bag 12x18', 'Paper Cup 150ml', 'Sugar loose'].map((n, i) => ({ id: 'i' + i, name: n, unit: i === 2 ? 'kg' : 'pc', buy: 10, sell: 14 + i }));
const lum = h => { const c = h.match(/\d+/g).slice(0, 3).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
(async () => {
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items, config: { shopName: 'G', mode: 'live', nextBill: 5 }, sv: 43, me: { name: 'Mayank', role: 'owner', personal: true, prefs: {} } }) }));
  await p.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't1', by: 'Mayank', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })));
  await p.goto('https://rb.test/'); await p.waitForTimeout(1200); await p.evaluate(() => T.appUnlock()); await p.waitForTimeout(300);
  const tok = () => p.evaluate(() => { const c = getComputedStyle(document.documentElement); return { bg: c.getPropertyValue('--bg').trim(), s2: c.getPropertyValue('--surface-2').trim(), muted: c.getPropertyValue('--muted').trim(), accent: c.getPropertyValue('--accent').trim() }; });
  const hex = h => { h = h.replace('#', ''); return 'rgb(' + [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(',') + ')'; };
  const t0 = await tok();
  ok(t0.accent.toUpperCase() === '#4F46E5', 'accent is Iris #4F46E5 (was maroon)');
  ok(man.background_color.toUpperCase() === t0.bg.toUpperCase() && man.theme_color.toUpperCase() === t0.bg.toUpperCase(), 'manifest launch colours match the app background (no colour flash at start)');
  for (const pal of ['ink', 'maroon', 'forest', 'indigo', 'saffron']) {
    await p.evaluate(x => { if (x === 'ink') document.documentElement.removeAttribute('data-palette'); else document.documentElement.setAttribute('data-palette', x); }, pal);
    const t = await tok(), r = Math.min(ratio(hex(t.muted), hex(t.bg)), ratio(hex(t.muted), hex(t.s2)), ratio(hex(t.muted), 'rgb(255,255,255)'));
    ok(r >= 4.5, `${pal}: grey text ${r.toFixed(2)}:1 on every light background (≥ 4.5)`);
  }
  await p.evaluate(() => document.documentElement.removeAttribute('data-palette'));
  await p.evaluate(() => T.setTab('tools')); await p.waitForTimeout(300);
  const order = await p.$$eval('#view-tools .menu-list', ls => ls.map(l => [...l.querySelectorAll('button')].map(b => b.id)));
  ok(order[0].slice(0, 4).join() === 't-bills,t-dues,t-custs,t-vendors' && order[0].includes('t-reports'), 'Tools: Past bills, Credit, Customers, Vendors, Reports come first');
  ok(order[1].includes('t-add') && order[2][0] === 't-settings', 'Tools: item tools next, Settings / Lock under App');
  const cols = await p.$$eval('.tl-daily > button:not([hidden])', bs => new Set(bs.map(b => Math.round(b.getBoundingClientRect().left))).size);
  ok(cols === 2, 'Tools: daily screens are 2-column tiles on a phone');
  const hit = async (sel, label) => { const r = await p.evaluate(s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const at = (x, y) => { const h = document.elementFromPoint(x, y); return !!h && (h === e || e.contains(h)); };
      let up = 0; while (up < 30 && at(cx, cy - b.height / 2 - up - 1)) up++; let dn = 0; while (dn < 30 && at(cx, cy + b.height / 2 + dn + 1)) dn++;
      return Math.round(b.height + up + dn); }, sel); ok(r >= 42, `${label}: touch area ${r} px tall (≥ 42)`); };
  await p.evaluate(() => T.setTab('items')); await p.waitForTimeout(300);
  await hit('#list [data-add]', '"+ Bill" on Prices');
  await p.evaluate(() => { T.addToBill('i0', 2); T.addToBill('i1', 1); T.setTab('bill'); }); await p.waitForTimeout(400);
  await hit('.bill-line [data-rm]', 'bill line ×');
  await hit('.bill-line [data-inc]', 'bill line +');
  await ctx.close(); await b.close(); done();
})();
