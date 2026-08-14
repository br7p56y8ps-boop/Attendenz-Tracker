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

/* Account's Update button calls this: swap the shell; caller controls timing/reload */
(window as any).attendenzApplyPwaUpdate = async () => {
  localStorage.removeItem('att_pwa_update_ready');
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'ATT_UPDATE_APPROVED' });
    } else if (reg?.installing) {
      reg.installing.postMessage({ type: 'ATT_UPDATE_APPROVED' });
    } else if (reg?.active) {
      reg.active.postMessage({ type: 'ATT_UPDATE_APPROVED' });
    }

    // Wait for the service worker to tell us it has updated
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 10000);
      const onMessage = (event: MessageEvent) => {
        if (event.data && event.data.type === 'ATT_SW_UPDATED') {
          clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener('message', onMessage);
          resolve();
        }
      };
      navigator.serviceWorker.addEventListener('message', onMessage);
    });
  } catch { /* fall through */ }
};

createRoot(document.getElementById('root')!).render(<App />);