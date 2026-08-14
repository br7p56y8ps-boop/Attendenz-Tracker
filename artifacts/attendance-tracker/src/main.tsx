import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_VERSION } from '@/lib/appVersion';

const base = import.meta.env.BASE_URL || '/';

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
      if (j && typeof j.version === 'string' && j.version !== APP_VERSION) {
        localStorage.setItem('att_pwa_update_ready', 'true');
        localStorage.setItem('att_pwa_latest_version', j.version);
        if (typeof j.summary === 'string') localStorage.setItem('att_pwa_update_summary', j.summary);
        window.dispatchEvent(new CustomEvent('attendenz:update-ready'));
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
  try {
    const cache = await caches.open('attendenz-shell-v1');
    const fresh = await fetch(`${base}index.html`, { cache: 'no-store' });
    if (fresh.ok) await cache.put(`${base}index.html`, fresh);
  } catch { /* fallback: reload may still show old version */ }
};

createRoot(document.getElementById('root')!).render(<App />);