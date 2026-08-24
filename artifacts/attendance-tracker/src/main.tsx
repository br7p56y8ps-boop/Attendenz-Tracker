import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_VERSION } from '@/lib/appVersion';

const base = import.meta.env.BASE_URL || '/';
const SILENT_BUILD_REVISION_KEY = 'att_silent_build_revision_v1';

type BuildRevisionManifest = { revision?: unknown };

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

async function refreshCachedShell(): Promise<boolean> {
  try {
    const cache = await caches.open('attendenz-shell-v1');
    const indexUrl = `${base}index.html`;
    const fresh = await fetch(`${indexUrl}?refresh=${Date.now()}`, { cache: 'no-store' });
    if (!fresh.ok) return false;

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
    return true;
  } catch {
    return false;
  }
}

let silentRefreshInFlight: Promise<void> | null = null;

async function checkSilentBuildRevision(): Promise<void> {
  if (!navigator.onLine || typeof caches === 'undefined') return;
  if (localStorage.getItem('att_pwa_update_ready') === 'true') return;
  try {
    const versionResponse = await fetch(`${base}version.json?silent=${Date.now()}`, { cache: 'no-store' });
    if (versionResponse.ok) {
      const versionManifest = await versionResponse.json();
      if (versionManifest && typeof versionManifest.version === 'string' && isVersionNewer(versionManifest.version, APP_VERSION)) return;
    }

    const response = await fetch(`${base}build-revision.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return;
    const manifest = (await response.json()) as BuildRevisionManifest;
    const revision = typeof manifest.revision === 'string' ? manifest.revision.trim() : '';
    if (!revision) return;

    const current = localStorage.getItem(SILENT_BUILD_REVISION_KEY);
    if (!current) {
      localStorage.setItem(SILENT_BUILD_REVISION_KEY, revision);
      return;
    }
    if (current === revision || document.visibilityState === 'hidden') return;

    if (!silentRefreshInFlight) {
      silentRefreshInFlight = (async () => {
        const refreshed = await refreshCachedShell();
        if (!refreshed) return;
        localStorage.setItem(SILENT_BUILD_REVISION_KEY, revision);
      })().finally(() => {
        silentRefreshInFlight = null;
      });
    }
    await silentRefreshInFlight;
  } catch {
    // Offline or an unavailable internal manifest: keep the current app running.
  }
}

/* ── Manual updates: permanent guard worker + visible version.json gate ── */
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

  window.addEventListener('load', () => {
    void checkForUpdate();
    void checkSilentBuildRevision();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      void checkForUpdate();
      void checkSilentBuildRevision();
    }
  });
  window.setInterval(() => { void checkForUpdate(); void checkSilentBuildRevision(); }, 60000);
}

/* Account's visible Update button calls this: updates the cached shell directly. */
(window as any).attendenzApplyPwaUpdate = async () => {
  localStorage.removeItem('att_pwa_update_ready');
  localStorage.removeItem('att_pwa_latest_version');
  localStorage.removeItem('att_pwa_update_summary');
  await refreshCachedShell();
};

createRoot(document.getElementById('root')!).render(<App />);
