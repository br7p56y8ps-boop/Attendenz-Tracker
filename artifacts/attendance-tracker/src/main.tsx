import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_VERSION } from '@/lib/appVersion';

const base = import.meta.env.BASE_URL || '/';

function isVersionNewer(candidate: string, current: string): boolean {
  const a = String(candidate).split('.').map(n => parseInt(n, 10) || 0);
  const b = String(current).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return false;
}

function clearUpdateState(): void {
  localStorage.removeItem('att_pwa_update_ready');
  localStorage.removeItem('att_pwa_latest_version');
  localStorage.removeItem('att_pwa_update_summary');
  localStorage.setItem('att_app_version', APP_VERSION);
  window.dispatchEvent(new CustomEvent('attendenz:update-cleared'));
}

/* ── Manual updates: permanent guard worker + version.json gate ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {});
  });

  const checkForUpdate = async () => {
    try {
      const res = await fetch(`${base}version.json?ts=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      if (j && typeof j.version === 'string') {
        if (isVersionNewer(j.version, APP_VERSION)) {
          localStorage.setItem('att_pwa_update_ready', 'true');
          localStorage.setItem('att_pwa_latest_version', j.version);
          if (typeof j.summary === 'string') localStorage.setItem('att_pwa_update_summary', j.summary);
          window.dispatchEvent(new CustomEvent('attendenz:update-ready'));
        } else {
          clearUpdateState();
        }
      }
    } catch { /* offline — ignore */ }
  };
  window.addEventListener('load', checkForUpdate);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForUpdate(); });
  window.setInterval(checkForUpdate, 60000);
}

/* Account's Update button calls this: updates the cached shell directly, no SW activation */
(window as any).attendenzApplyPwaUpdate = async () => {
  localStorage.removeItem('att_pwa_update_ready');
  localStorage.removeItem('att_pwa_latest_version');
  localStorage.removeItem('att_pwa_update_summary');
  try {
    const cache = await caches.open('attendenz-shell-v1');
    const indexUrl = `${base}index.html`;
    const fresh = await fetch(`${indexUrl}?update=${Date.now()}`, { cache: 'no-store' });
    if (!fresh.ok) return;

    const html = await fresh.clone().text();
    await cache.put(indexUrl, fresh.clone());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const assetUrls = new Set<string>();
    doc.querySelectorAll('[src], [href]').forEach((element) => {
      const value = element.getAttribute('src') || element.getAttribute('href');
      if (!value || value.startsWith('#')) return;
      try {
        const url = new URL(value, window.location.href);
        if (url.origin === window.location.origin) assetUrls.add(url.href);
      } catch {}
    });

    await Promise.all(Array.from(assetUrls).map(async (assetUrl) => {
      try {
        const response = await fetch(assetUrl, { cache: 'no-store' });
        if (response.ok) await cache.put(assetUrl, response.clone());
      } catch {}
    }));
  } catch { /* fallback: reload may still show old version */ }
};

createRoot(document.getElementById('root')!).render(<App />);
