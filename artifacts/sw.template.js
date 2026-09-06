/* Attendenz guard worker — generated from release.config.json. */
const VERSION = '__ATTENDENZ_VERSION__';
const UPDATE_MODE = '__ATTENDENZ_UPDATE_MODE__';
const SHELL = `attendenz-shell-v${VERSION}-r2`;
const DB_NAME = 'AttendenzDatabase';
const STORE_NAME = 'key_value_store';
const APPROVED_VERSION_KEY = 'att_pwa_approved_version';
const EXPLICIT_APPROVAL_KEY = 'att_pwa_explicit_approval_version';
const ACTIVE_VERSION_KEY = 'att_pwa_active_version';
let activationApproved = false;

function readStoredValue(key) {
  return new Promise((resolve) => {
    if (!self.indexedDB) return resolve(null);
    let request;
    try { request = self.indexedDB.open(DB_NAME, 1); } catch { return resolve(null); }
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const get = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key);
        get.onsuccess = () => resolve(get.result && typeof get.result.value === 'string' ? get.result.value : null);
        get.onerror = () => resolve(null);
      } catch { resolve(null); }
    };
  });
}

function versionParts(version) {
  return String(version).split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a, b) {
  const left = versionParts(a), right = versionParts(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if ((left[index] || 0) !== (right[index] || 0)) return (left[index] || 0) - (right[index] || 0);
  }
  return 0;
}

function writeStoredValues(entries) {
  return new Promise((resolve, reject) => {
    if (!self.indexedDB) return reject(new Error('IndexedDB unavailable'));
    let request;
    try { request = self.indexedDB.open(DB_NAME, 1); } catch (error) { return reject(error); }
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        entries.forEach(([key, value]) => store.put({ key, value }));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
      } catch (error) { reject(error); }
    };
  });
}

async function activeCacheName() {
  if (UPDATE_MODE === 'automatic') return SHELL;
  // A user-approved worker may serve its pre-cached shell during the one reload
  // that follows activation. The durable active flag is committed by the new
  // page only after that reload has actually happened.
  if (activationApproved) return SHELL;
  const active = await readStoredValue(ACTIVE_VERSION_KEY);
  if (active === VERSION) return SHELL;
  if (active && active !== VERSION) {
    const activeCache = `attendenz-shell-v${active}-r2`;
    if (await caches.has(activeCache)) return activeCache;
  }
  const names = await caches.keys();
  const candidates = names
    .filter((name) => name.startsWith('attendenz-shell-v') && name.endsWith('-r2') && name !== SHELL)
    .sort((a, b) => compareVersions(b.slice(17, -3), a.slice(17, -3)));
  return candidates[0] || SHELL;
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    const indexUrl = `${self.registration.scope}index.html`;
    const response = await fetch(indexUrl, { cache: 'no-store', redirect: 'follow' });
    if (!response.ok) return;
    await cache.put(indexUrl, response.clone());
    const html = await response.text();
    const assets = new Set([indexUrl]);
    for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/g)) {
      try {
        const url = new URL(match[1], self.registration.scope);
        if (url.origin === self.location.origin) assets.add(url.href);
      } catch {}
    }
    await Promise.all(Array.from(assets).map(async (url) => {
      if (url === indexUrl) return;
      try {
        const asset = await fetch(url, { cache: 'no-store' });
        if (asset.ok && asset.status === 200) await cache.put(url, asset);
      } catch {}
    }));
  })().catch(() => {}));
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'APPROVE_UPDATE' && e.data.version === VERSION) {
    activationApproved = true;
    e.waitUntil(writeStoredValues([
      [APPROVED_VERSION_KEY, VERSION],
      [EXPLICIT_APPROVAL_KEY, VERSION],
    ]).then(() => {
      e.ports[0]?.postMessage({ type: 'UPDATE_APPROVED', version: VERSION });
      return self.skipWaiting();
    }));
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
    body: typeof payload.body === 'string' ? payload.body : '',
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
      activeCacheName().then(async (cacheName) => caches.open(cacheName).then(async (cache) => {
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
      }))
    );
    return;
  }

  // Hashed assets: cache-first, fill in background.
  e.respondWith(
    activeCacheName().then((cacheName) => caches.open(cacheName).then((cache) => cache.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && res.status === 200 && !res.redirected) {
        const clone = res.clone();
        cache.put(req, clone);
      }
      return res;
    }))))
  );
});
