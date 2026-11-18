/* FirstMeds service worker: keeps the app usable without internet.
 * - App shell and built assets: cache-first.
 * - Selected GET API calls (stock, programmes, patients…): network-first, falling back to the last copy.
 * - Everything else (sales, logins) always goes to the network; the app queues sales itself when offline.
 */
const VERSION = 'fm-v2';
const SHELL = ['/', '/app', '/index.html', '/favicon.svg', '/manifest.webmanifest'];
const API_CACHE = /^\/api\/(inventory|programs|products|patients|public\/districts|auth\/me|cash\/current)(\/|\?|$)/;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!API_CACHE.test(url.pathname + url.search)) return;
    // Cache key includes the auth header's user so staff on a shared phone don't see each other's data.
    const key = new Request(url.toString() + '#' + (req.headers.get('authorization') || '').slice(-16));
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(key, copy)); }
          return res;
        })
        .catch(() => caches.match(key).then((hit) => hit || new Response(JSON.stringify({ error: 'You are offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } }))),
    );
    return;
  }

  // Built assets are content-hashed: cache-first.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
    })));
    return;
  }

  // Page navigations: network first, fall back to the cached app shell (SPA routes).
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/index.html', copy)); return res;
    }).catch(() => caches.match('/index.html')));
  }
});
