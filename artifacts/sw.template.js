/* Attendenz guard worker — generated from release.config.json. */
const VERSION = '__ATTENDENZ_VERSION__';
const SHELL = `attendenz-shell-v${VERSION}-r2`;
let activationApproved = false;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([`${self.registration.scope}index.html`]))
      .catch(() => {})
      // Manual releases remain waiting until the application explicitly approves activation.
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    activationApproved = true;
    self.skipWaiting();
  }
});

self.addEventListener('activate', (e) => {
  if (activationApproved) e.waitUntil(self.clients.claim());
});

self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch {}
  const title = typeof payload.title === 'string' && payload.title.trim() ? payload.title : 'Scheduled Reminder';
  const options = {
    body: typeof payload.body === 'string' && payload.body.trim() ? payload.body : 'You have a scheduled reminder.',
    tag: typeof payload.tag === 'string' ? payload.tag : 'attendenz-reminder',
    data: { url: typeof payload.url === 'string' ? payload.url : '/' },
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const targetUrl = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = clients.find((client) => client.url === targetUrl || client.url.startsWith(self.location.origin));
    if (existing && 'focus' in existing) {
      await existing.focus();
      if ('navigate' in existing && existing.url !== targetUrl) await existing.navigate(targetUrl);
      return;
    }
    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Version and build metadata: always live, never cached.
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('build-revision.json')) {
    e.respondWith(fetch(req).catch(() => caches.match(req)));
    return;
  }

  // Navigations: serve the cached shell, refreshed by the app after a detected update.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.open(SHELL).then(async (cache) => {
        const cacheKey = `${self.registration.scope}index.html`;
        const cached = await cache.match(cacheKey);

        // If cached response is a redirect, delete it and fetch fresh.
        if (cached && (cached.redirected || cached.status >= 300 || cached.status === 0)) {
          await cache.delete(cacheKey);
        } else if (cached && cached.status === 200) {
          return cached;
        }

        // Fetch fresh index.html with explicit redirect follow.
        const res = await fetch(req, { redirect: 'follow', cache: 'no-store' });
        if (res.ok && res.status === 200 && !res.redirected) {
          await cache.put(cacheKey, res.clone());
          return res;
        }

        // Fallback: fetch index.html directly.
        const directRes = await fetch(`${self.registration.scope}index.html`, {
          redirect: 'follow',
          cache: 'no-store',
        });
        if (directRes.ok && directRes.status === 200) {
          await cache.put(cacheKey, directRes.clone());
          return directRes;
        }

        // Final fallback: return cached or offline.
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Hashed assets: cache-first, fill in background.
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
