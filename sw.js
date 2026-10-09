/* Rate Book service worker: keeps the app opening offline. Prices themselves are cached by the page. */
const VERSION = 'rb-shell-5';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
              await c.put('./index.html', res.clone());
              if (old !== null && old !== fresh) self.clients.matchAll({ type: 'window' }).then(cs => cs.forEach(cl => cl.postMessage({ type: 'rb-update' })));
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
