import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_VERSION, RELEASE_TYPE, UPDATE_MODE, type ReleaseType, type UpdateMode } from '@/lib/appVersion';
import { idbGetAllChecked, storageRemoveItemChecked, storageSetItemChecked } from '@/lib/idb';

const base = import.meta.env.BASE_URL || '/';
const ACTIVE_VERSION_KEY = 'att_pwa_active_version';
const APPROVED_VERSION_KEY = 'att_pwa_approved_version';
const ACTIVATION_PENDING_KEY = 'att_pwa_activation_pending_version';
let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

async function reconcileActiveVersionAfterReload(): Promise<void> {
  try {
    const values = await idbGetAllChecked();
    const activeVersion = values[ACTIVE_VERSION_KEY];
    const approvedVersion = values[APPROVED_VERSION_KEY];
    const pendingVersion = localStorage.getItem(ACTIVATION_PENDING_KEY);
    if (!activeVersion) {
      await storageSetItemChecked(ACTIVE_VERSION_KEY, APP_VERSION);
      return;
    }
    if (pendingVersion === APP_VERSION && approvedVersion === APP_VERSION && activeVersion !== APP_VERSION) {
      await storageSetItemChecked(ACTIVE_VERSION_KEY, APP_VERSION);
      await storageRemoveItemChecked(ACTIVATION_PENDING_KEY);
    }
  } catch {
    // The service worker will continue serving the prior durable cache if this check fails.
  }
}
const activeVersionReady = reconcileActiveVersionAfterReload();
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

async function approveServiceWorker(worker: ServiceWorker, version: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), 5000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data?.type === 'UPDATE_APPROVED' && event.data.version === version);
    };
    worker.postMessage({ type: 'APPROVE_UPDATE', version }, [channel.port2]);
  });
}

async function activateApprovedServiceWorker(version: string): Promise<boolean> {
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
  if (!waiting) {
    return registration.active ? approveServiceWorker(registration.active, version) : false;
  }
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
    approveServiceWorker(waiting, version).then((approved) => {
      if (!approved) {
        window.clearTimeout(timeout);
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
        resolve(false);
      }
    });
  });
}

/* ── Manual version updates ── */
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
              const activated = await activateApprovedServiceWorker(j.version);
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
(window as any).attendenzApplyPwaUpdate = async (onPhase?: (phase: 'installing' | 'completed') => void): Promise<boolean> => {
  const approvedVersion = localStorage.getItem('att_pwa_latest_version');
  if (!approvedVersion || !isVersionNewer(approvedVersion, APP_VERSION)) return false;
  const downloadingStarted = Date.now();
  localStorage.setItem(ACTIVATION_PENDING_KEY, approvedVersion);
  const refreshed = await refreshCachedShell(approvedVersion);
  if (!refreshed) return false;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 5000 - (Date.now() - downloadingStarted))));
  onPhase?.('installing');
  const installingStarted = Date.now();
  const activated = await activateApprovedServiceWorker(approvedVersion);
  if (!activated) return false;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 5000 - (Date.now() - installingStarted))));
  clearUpdateState();
  onPhase?.('completed');
  return true;
};

async function enforceManualReleaseGate(): Promise<boolean> {
  if (UPDATE_MODE !== 'manual') return true;
  const storedAppVersion = localStorage.getItem('att_app_version');
  let initialValues: Record<string, string> = {};
  try {
    initialValues = await idbGetAllChecked();
  } catch {
    return false;
  }
  const priorVersion = initialValues[ACTIVE_VERSION_KEY] || storedAppVersion;
  const approvedVersion = initialValues[APPROVED_VERSION_KEY];
  await activeVersionReady;

  if (!priorVersion) {
    const accepted = window.confirm(`Attendenz ${APP_VERSION} is ready. Choose OK to open this release.`);
    if (!accepted) {
      document.body.innerHTML = '<main style="font:16px system-ui;padding:24px">This manual release was not approved.</main>';
      return false;
    }
    await storageSetItemChecked(APPROVED_VERSION_KEY, APP_VERSION);
    return true;
  }
  if (priorVersion === APP_VERSION && approvedVersion === APP_VERSION) return true;
  if (priorVersion === APP_VERSION) return true;

  const accepted = window.confirm(`Attendenz ${APP_VERSION} is ready. Choose OK to update now, or Cancel to keep your current version.`);
  if (!accepted) {
    document.body.innerHTML = '<main style="font:16px system-ui;padding:24px">This update was not approved. Reopen the app when you are ready.</main>';
    return false;
  }

  localStorage.setItem(ACTIVATION_PENDING_KEY, APP_VERSION);
  const activated = await activateApprovedServiceWorker(APP_VERSION);
  if (!activated) {
    localStorage.removeItem(ACTIVATION_PENDING_KEY);
    window.alert('The update could not be activated. Your current version will remain in place.');
    document.body.innerHTML = '<main style="font:16px system-ui;padding:24px">The update could not be activated. Your current version remains in place.</main>';
    return false;
  }
  window.location.reload();
  return false;
}

void enforceManualReleaseGate().then((allowed) => {
  if (allowed) createRoot(document.getElementById('root')!).render(<App />);
});
