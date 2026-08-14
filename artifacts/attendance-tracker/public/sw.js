/* Attendenz permanent guard worker — NEVER CHANGE THIS FILE BETWEEN RELEASES. */
const SHELL = 'attendenz-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([`${self.registration.scope}index.html`]))
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  // Do not claim clients, do not skipWaiting here.
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cached = await cache.match(`${self.registration.scope}index.html`);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(`${self.registration.scope}index.html`, res.clone());
        return res;
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(SHELL).then((c) => c.put(req, clone));
      }
      return res;
    }))
  );
});