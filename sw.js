/* Rate Book service worker: keeps the app opening offline. Prices themselves are cached by the page. */
const VERSION = 'rb-shell-9';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-iris-192.png', './icon-iris-512.png', './icon-iris-maskable-192.png', './icon-iris-maskable-512.png', './icon-iris-mono-512.png', './icon-iris.svg', './apple-touch-icon-iris.png', './favicon-iris.png'];

/* The page links its own files with a version stamp ("app.css?v=1a2b3c"). Whenever a copy of the page is saved, the files it
   names are saved with it, so the app also opens offline the first time after an update, and a new page never meets an old
   stylesheet. Older stamps of the same file are dropped. */
const assetsOf = html => [...String(html).matchAll(/(?:href|src)="([a-z0-9_-]+\.(?:css|js)\?v=[^"]+)"/gi)].map(m => './' + m[1]);
const keepOnly = (c, url) => c.keys().then(ks => Promise.all(ks.filter(k => { const u = new URL(k.url); return u.pathname === url.pathname && u.search && u.search !== url.search; }).map(k => c.delete(k))));
/* A stamped file is only kept if its content really is the version the page asks for: the stamp is the first 10 hex of its
   SHA-256 (tools/stamp.js). Right after a release GitHub Pages can briefly serve the new page while a file is still missing (404)
   or still the old one; saving that page anyway opened a blank app until the release finished (seen 15 Oct 2026). */
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const stampOk = async (res, url) => { if (!res || !res.ok) return false; const v = new URL(url, self.location.href).searchParams.get('v');
  if (!/^[0-9a-f]{10}$/.test(v || '')) return true; try { return hex(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer())).slice(0, 10) === v; } catch (e) { return true; } };
/* Saves every file the page names; true only if all of them are here and right (the page is adopted only then). */
const saveAssets = (c, html) => Promise.all(assetsOf(html).map(a => c.match(a).then(hit => hit ? true : fetch(a, { cache: 'no-store' }).then(async r => (await stampOk(r, a)) ? c.put(a, r).then(() => true) : false)).catch(() => false))).then(all => all.every(Boolean));
const dropOld = (c, html) => Promise.all(assetsOf(html).map(a => keepOnly(c, new URL(a, self.location.href)))).catch(() => {});
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))).then(() => c.match('./index.html')).then(r => r ? r.text() : '').then(h => saveAssets(c, h).then(ok => ok && dropOld(c, h)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    const isPage = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html');
    if (isPage) {
      // The app page opens from the phone's saved copy at once (no waiting on the network), and a fresh copy is fetched in the
      // background for next time. If it differs, open pages are told ("rb-update") so they can offer to load it; they never
      // reload in the middle of a bill. Data (the Google Sheet) never goes through this cache. Other pages (vendor.html, the
      // vendor's statement link) stay network-first and are kept under their own address.
      const isApp = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
      if (isApp) {
        e.respondWith(caches.open(VERSION).then(c => c.match('./index.html').then(hit => {
          const oldText = hit ? hit.clone().text() : Promise.resolve(null);   // read before the saved copy is handed to the page
          const net = fetch(url.origin + url.pathname, { cache: 'no-store', credentials: 'same-origin' }).then(async res => {   // a plain fetch (a navigation request can't take options)
            if (res && res.ok) {
              const fresh = await res.clone().text(), old = await oldText;
              const complete = await saveAssets(c, fresh);   // every file it names first, so the new page is complete when it's offered
              if (complete || old === null) {   // a release still publishing: keep the working copy, try again on the next open
                await c.put('./index.html', res.clone());
                if (complete) dropOld(c, fresh);
                if (old !== null && old !== fresh) self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(cl => cl.postMessage({ type: 'rb-update' })));
              }
            }
            return res;
          });
          if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
          return net.catch(() => caches.match('./').then(r => r || Response.error()));
        })));
      } else {
        e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
          .catch(() => caches.match(req)));
      }
    } else if (url.search.startsWith('?v=')) {
      // a stamped file: the stamp changes whenever the file does, so the saved copy is always right
      e.respondWith(caches.open(VERSION).then(c => c.match(req).then(r => r || fetch(req).then(async res => { if (await stampOk(res, req.url)) { const copy = res.clone(); c.put(req, copy); } return res; }))));   // older stamps go only when a complete newer page is saved
    } else {
      e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })));
    }
    return;
  }
  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => {
      const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })));
  }
  // Everything else (the Google Sheet API) goes straight to the network.
});
