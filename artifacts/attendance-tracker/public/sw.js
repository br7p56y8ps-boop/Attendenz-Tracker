/* Attendenz guard worker — THIS FILE MUST NEVER CHANGE between releases. */
const SHELL = 'attendenz-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([`${self.registration.scope}index.html`]))
      .catch(() => {})
  );
});

self.addEventListener('activate', (e) => {
  // Deliberately no clients.claim() here.
  // The new service worker waits for user approval before taking control.
});

self.addEventListener('message', (e) => {
  const d = e.data;
  if (d && d.type === 'ATT_UPDATE_APPROVED') {
    e.waitUntil((async () => {
      const cache = await caches.open(SHELL);
      try {
        const fresh = await fetch(`${self.registration.scope}index.html`, { cache: 'no-store' });
        if (fresh.ok) await cache.put(`${self.registration.scope}index.html`, fresh);
      } catch {}

      // Now we can safely activate and take control
      await self.skipWaiting();
      await self.clients.claim();

      const clients = await self.clients.matchAll();
      clients.forEach((c) => c.postMessage({ type: 'ATT_SW_UPDATED' }));
    })());
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // version.json: always live, never cached
  if (url.pathname.endsWith('version.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // navigations: serve the APPROVED shell only — never auto-refresh it
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

  // hashed assets & images: cache-first, fill in background
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