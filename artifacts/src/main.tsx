import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_VERSION, RELEASE_TYPE, UPDATE_MODE, type ReleaseType, type UpdateMode } from '@/lib/appVersion';
import { storageSetItemChecked } from '@/lib/idb';

const base = import.meta.env.BASE_URL || '/';
const BUILD_REVISION_KEY = 'att_pwa_build_revision';
let silentBuildUpdateInFlight = false;
let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;
void storageSetItemChecked('att_pwa_active_version', APP_VERSION);
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
  localStorage.removeItem('att_pwa_release_type');
  localStorage.removeItem('att_pwa_update_mode');
  localStorage.setItem('att_app_version', APP_VERSION);
  window.dispatchEvent(new CustomEvent('attendenz:update-cleared'));
}

async function refreshCachedShell(version = APP_VERSION): Promise<boolean> {
  try {
    const cache = await caches.open(`attendenz-shell-v${version}-r2`);
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

async function activateApprovedServiceWorker(): Promise<boolean> {
  const registration = await (serviceWorkerRegistrationPromise || navigator.serviceWorker.getRegistration(base));
  if (!registration) return false;
  await registration.update().catch(() => {});
  let waiting = registration.waiting;
  if (!waiting && registration.installing) {
    await new Promise<void>((resolve) => {
      const worker = registration.installing;
      if (!worker) return resolve();
      const timeout = window.setTimeout(resolve, 10000);
      const onStateChange = () => {
        if (worker.state === 'installed' || worker.state === 'redundant') {
          window.clearTimeout(timeout);
          worker.removeEventListener('statechange', onStateChange);
          resolve();
        }
      };
      worker.addEventListener('statechange', onStateChange);
    });
    waiting = registration.waiting;
  }
  // A newer worker may already have activated while the PWA was closed. The
  // approval marker still controls which cache it serves, so a reload is
  // sufficient in that case.
  if (!waiting) return Boolean(registration.active);
  return await new Promise<boolean>((resolve) => {
    const onControllerChange = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(true);
    };
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      resolve(false);
    }, 5000);
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    waiting.postMessage({ type: 'SKIP_WAITING' });
  });
}

async function checkForSilentBuildUpdate(): Promise<void> {
  if (UPDATE_MODE !== 'automatic') return;
  try {
    const res = await fetch(`${base}build-revision.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const payload = await res.json() as { revision?: unknown };
    if (typeof payload.revision !== 'string' || payload.revision.length === 0) return;

    const installedRevision = localStorage.getItem(BUILD_REVISION_KEY);
    if (!installedRevision) {
      localStorage.setItem(BUILD_REVISION_KEY, payload.revision);
      return;
    }
    if (installedRevision === payload.revision || silentBuildUpdateInFlight) return;

    silentBuildUpdateInFlight = true;
    try {
      const refreshed = await refreshCachedShell();
      if (!refreshed) return;
      localStorage.setItem(BUILD_REVISION_KEY, payload.revision);
      clearUpdateState();
      window.location.reload();
    } finally {
      silentBuildUpdateInFlight = false;
    }
  } catch { /* offline or unsupported cache API — retry on the next check */ }
}

/* ── Manual version updates + silent same-version build refresh ── */
if ('serviceWorker' in navigator) {
  const registerServiceWorker = async (): Promise<ServiceWorkerRegistration | null> => {
    try {
      serviceWorkerRegistrationPromise ||= navigator.serviceWorker.register(`${base}sw.js`);
      return await serviceWorkerRegistrationPromise;
    } catch {
      serviceWorkerRegistrationPromise = null;
      return null;
    }
  };

  let updateCheckInFlight: AbortController | null = null;
  const checkForUpdate = async () => {
    if (document.visibilityState === 'hidden' || updateCheckInFlight) return;
    const controller = new AbortController();
    updateCheckInFlight = controller;
    try {
      const res = await fetch(`${base}version.json?ts=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return;
      const j = await res.json() as { version?: unknown; summary?: unknown; releaseType?: unknown; updateMode?: unknown };
      if (j && typeof j.version === 'string') {
        if (isVersionNewer(j.version, APP_VERSION)) {
          const releaseType: ReleaseType = j.releaseType === 'major' || j.releaseType === 'minor' ? j.releaseType : RELEASE_TYPE;
          const updateMode: UpdateMode = j.updateMode === 'automatic' || j.updateMode === 'manual' ? j.updateMode : UPDATE_MODE;
          if (updateMode === 'automatic') {
            await storageSetItemChecked('att_pwa_approved_version', j.version).catch(() => undefined);
            const refreshed = await refreshCachedShell(j.version);
            if (refreshed) {
              const activated = await activateApprovedServiceWorker();
              if (!activated) return;
              clearUpdateState();
              window.location.reload();
              return;
            }
          }
          localStorage.setItem('att_pwa_update_ready', 'true');
          localStorage.setItem('att_pwa_latest_version', j.version);
          localStorage.setItem('att_pwa_release_type', releaseType);
          localStorage.setItem('att_pwa_update_mode', updateMode === 'automatic' ? 'manual' : updateMode);
          if (typeof j.summary === 'string') localStorage.setItem('att_pwa_update_summary', j.summary);
          window.dispatchEvent(new CustomEvent('attendenz:update-ready'));
        } else {
          clearUpdateState();
          if (j.version === APP_VERSION) void checkForSilentBuildUpdate();
        }
      }
    } catch { /* offline or hidden/aborted — ignore */ }
    finally {
      if (updateCheckInFlight === controller) updateCheckInFlight = null;
    }
  };

  window.addEventListener('load', () => {
    void registerServiceWorker().finally(() => { void checkForUpdate(); });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') updateCheckInFlight?.abort();
    else void checkForUpdate();
  });
  window.setInterval(() => {
    if (document.visibilityState !== 'hidden') void checkForUpdate();
  }, 60000);
}

/* Account's visible Update button calls this: updates the cached shell directly. */
(window as any).attendenzApplyPwaUpdate = async (): Promise<boolean> => {
  const approvedVersion = localStorage.getItem('att_pwa_latest_version');
  if (!approvedVersion || !isVersionNewer(approvedVersion, APP_VERSION)) return false;
  const refreshed = await refreshCachedShell(approvedVersion);
  if (!refreshed) return false;
  try {
    await storageSetItemChecked('att_pwa_approved_version', approvedVersion);
  } catch {
    return false;
  }
  const activated = await activateApprovedServiceWorker();
  if (!activated) return false;
  clearUpdateState();
  window.location.reload();
  return true;
};

createRoot(document.getElementById('root')!).render(<App />);
