/* app.js runs as a plain script in global scope (11 Oct 2026), so its top-level functions become window properties. None may
   replace something the browser provides (window.open, print, find, scroll…), which WhatsApp, printing and pdf.js rely on.
   Snapshots every built-in global before app.js runs and compares after start-up. Run: node tests/globals.test.js */
const { launch, appHtml, ok, done } = require('./browser');
(async () => {
  const b = await launch(), ctx = await b.newContext(), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const snap = `<script>(()=>{const m=new Map();let o=window;while(o&&o!==Object.prototype){for(const k of Object.getOwnPropertyNames(o)){if(!m.has(k)){const d=Object.getOwnPropertyDescriptor(o,k);m.set(k,d&&('value' in d)?d.value:d&&d.get);}}o=Object.getPrototypeOf(o);}window.__G=m;})()</script>`;
  const html = appHtml('S').replace('<head>', () => '<head>' + snap);   // before any of the page's scripts
  await ctx.route('https://rb.test/**', r => r.fulfill({ body: html, contentType: 'text/html' }));
  await ctx.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, shop: 'main', rev: '1', items: [], config: { shopName: 'G', mode: 'live' }, sv: 60 }) }));
  await ctx.route('https://fonts.*/**', r => r.abort());
  await p.goto('https://rb.test/'); await p.waitForTimeout(800);
  const r = await p.evaluate(() => { const bad = []; for (const [k, v] of window.__G) { let o = window, d; while (o && !(d = Object.getOwnPropertyDescriptor(o, k))) o = Object.getPrototypeOf(o); const now = d && ('value' in d ? d.value : d.get); if (now !== v && typeof v === 'function') bad.push(k); } return { bad, n: window.__G.size, app: typeof appLock === 'function' && typeof window.boot === 'function' }; });
  ok(r.app, 'the app code ran in global scope (its functions are reachable)');
  ok(r.n > 500 && r.bad.length === 0, `no browser built-in replaced by an app name (${r.n} checked)${r.bad.length ? ': ' + r.bad.join(', ') : ''}`);
  ok(errs.length === 0, 'no page errors at start-up' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); done();
})();
