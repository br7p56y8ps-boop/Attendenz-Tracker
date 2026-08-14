/* Attendenz guard worker — EMERGENCY FIX for redirect error.
   After deploying this version, NEVER CHANGE THIS FILE AGAIN.
   Data lives in localStorage/IndexedDB, not in this cache, so clearing SW cache doesn't affect user data. */
const SHELL = 'attendenz-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([`${self.registration.scope}index.html`]))
      .catch(() => {})
      .then(() => self.skipWaiting()) // Activate immediately to replace broken worker
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim()); // Take control immediately
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

  // Navigations: serve cached shell, updated by the app when user approves
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cacheKey = `${self.registration.scope}index.html`;
        const cached = await cache.match(cacheKey);

        // If cached response is a redirect, delete it and fetch fresh
        if (cached && (cached.redirected || cached.status >= 300 || cached.status === 0)) {
          await cache.delete(cacheKey);
        } else if (cached && cached.status === 200) {
          return cached;
        }

        // Fetch fresh index.html with explicit redirect follow
        const res = await fetch(req, { redirect: 'follow', cache: 'no-store' });
        if (res.ok && res.status === 200 && !res.redirected) {
          await cache.put(cacheKey, res.clone());
          return res;
        }

        // Fallback: fetch index.html directly
        const directRes = await fetch(`${self.registration.scope}index.html`, {
          redirect: 'follow',
          cache: 'no-store',
        });
        if (directRes.ok && directRes.status === 200) {
          await cache.put(cacheKey, directRes.clone());
          return directRes;
        }

        // Final fallback: return cached or offline
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Hashed assets: cache-first, fill in background
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.status === 200 && !res.redirected) {
        const clone = res.clone();
        caches.open(SHELL).then((c) => c.put(req, clone));
      }
      return res;
    }))
  );
});