/* Opening from the phone (sw.js): offline open, instant open from the saved copy, a new version offered/applied, never mid-bill.
   Serves a copy of the app from a local web server (service workers need a real origin). Run: node tests/sw.test.js */
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http');
const { launch, ok, done, ROOT, appHtml } = require('./browser');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rbsw-'));
for (const f of ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
const write = ver => fs.writeFileSync(path.join(dir, 'index.html'), appHtml('S,LOCK,appUnlock,addToBill').replace('<head>', `<head><script>window.__ver=${ver}; sessionStorage.vers=(sessionStorage.vers||'')+${ver}</script>`));
write(1);
let netHits = 0;
const srv = http.createServer((q, r) => { const f = path.join(dir, q.url === '/' ? 'index.html' : q.url.split('?')[0]); if (/index\.html$|\/$/.test(q.url.split('?')[0])) netHits++;
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream', 'Cache-Control': 'no-cache' }); r.end(fs.readFileSync(f)); });
srv.listen(0, async () => {
  const URL0 = 'http://localhost:' + srv.address().port + '/';
  const b = await launch(); const ctx = await b.newContext(); const p = await ctx.newPage(); p.on('pageerror', e => console.log('PAGEERR', e.message));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, rev: '1', items: [{ id: 'i1', name: 'Bag', unit: 'pc', buy: 1, sell: 2 }], config: { shopName: 'G', mode: 'live' }, me: { name: 'M', role: 'owner', personal: true, prefs: {} } }) }));
  await ctx.route('https://fonts.*/**', r => r.abort());
  await ctx.addInitScript(() => localStorage.setItem('rb_auth', JSON.stringify({ tok: 't', by: 'M', role: 'owner', personal: true, pinH: 'x', pinS: 'AAAA' })));
  await p.goto(URL0); await p.waitForFunction(() => navigator.serviceWorker.controller || new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r)), null, { timeout: 15000 }).catch(() => {});
  await p.reload(); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(800);
  ok(await p.evaluate(() => window.__ver) === 1, 'opens with no internet (from the phone)'); await ctx.setOffline(false);
  // new version published; app is on the lock screen with no bill: loads by itself
  await p.evaluate(() => { sessionStorage.vers = ''; }); write(2); await p.reload(); await p.waitForTimeout(400);
  if (process.env.DBG) console.log('DBG cached', await p.evaluate(() => caches.keys().then(async ks => { const out = []; for (const k of ks) { const c = await caches.open(k); for (const r of await c.keys()) { const t = await (await c.match(r)).text(); out.push(k + ' ' + r.url + ' ver=' + (t.match(/__ver=(\d)/) || [])[1]); } } return out.join(' | '); })), 'netHits', netHits);
  await p.waitForFunction(() => window.__ver === 2, null, { timeout: 8000 }).catch(() => {});
  const seen = await p.evaluate(() => sessionStorage.vers);
  ok(seen.startsWith('1'), 'open is instant from the saved copy (the old version shows first: ' + seen + ')');
  ok(await p.evaluate(() => window.__ver) === 2 && seen === '12', 'new version noticed in the background and loaded while still on the lock screen');
  // mid-bill: never reloads, offers the update instead
  await p.evaluate(() => { T.appUnlock(); T.addToBill('i1', 1); });
  write(3); const v0 = await p.evaluate(() => window.__ver);
  await p.evaluate(() => fetch('./', { cache: 'no-store' }).catch(() => {}));   // a navigation-like fetch is not enough; trigger the SW's page fetch:
  const p2 = await ctx.newPage(); await p2.goto(URL0); await p2.waitForTimeout(1500);
  ok(await p.evaluate(() => window.__ver) === v0 && await p.evaluate(() => !!document.querySelector('#updpill')), 'mid-bill: no reload, an "Update ready" pill is shown instead');
  ok(await p.evaluate(() => T.S.bill.length) === 1, 'the bill in progress is untouched');
  await b.close(); srv.close(); done();
});
