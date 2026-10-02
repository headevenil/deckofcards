// Offline cache: app shell network-first with cache fallback; Google Fonts stale-while-revalidate.
const VERSION = 'jinxo-v1';   // bump when you change cached files, so old caches are cleared
const SHELL = ['./', 'index.html', 'cards.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'fonts').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // network-first so edits show up on the next reload; give up after 2.5s on bad Wi-Fi and use the cache
    const net = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    });
    const timeout = new Promise((_, reject) => setTimeout(reject, 2500));
    e.respondWith(Promise.race([net, timeout])
      .catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || net)));
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    // stale-while-revalidate; only CORS (non-opaque) responses are stored — opaque ones cost ~7MB of quota each
    e.respondWith(caches.open('fonts').then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
  }
});
