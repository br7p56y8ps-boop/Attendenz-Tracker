import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { APP_VERSION, BUILD_REVISION, RELEASE_TYPE, UPDATE_PROTOCOL, type ReleaseType, type UpdateMode } from '@/lib/appVersion';
import { idbGetAllChecked, storageRemoveItemChecked, storageSetItemChecked } from '@/lib/idb';

const base = import.meta.env.BASE_URL || '/';
const ACTIVE_VERSION_KEY = 'att_pwa_active_version';
const ACTIVE_BUILD_REVISION_KEY = 'att_pwa_active_build_revision';
const APPROVED_VERSION_KEY = 'att_pwa_approved_version';
const ACTIVATION_PENDING_KEY = 'att_pwa_activation_pending_version';
const ACTIVATION_PENDING_BUILD_KEY = 'att_pwa_activation_pending_build_revision';
let serviceWorkerRegistrationPromise: Promise<ServiceWorkerRegistration> | null = null;

async function reconcileActiveVersionAfterReload(): Promise<void> {
  try {
    const values = await idbGetAllChecked();
    const activeVersion = values[ACTIVE_VERSION_KEY];
    const activeBuildRevision = values[ACTIVE_BUILD_REVISION_KEY];
    const approvedVersion = values[APPROVED_VERSION_KEY];
    const pendingVersion = localStorage.getItem(ACTIVATION_PENDING_KEY);
    const pendingBuildRevision = localStorage.getItem(ACTIVATION_PENDING_BUILD_KEY);
    if (!activeVersion) {
      await storageSetItemChecked(ACTIVE_VERSION_KEY, APP_VERSION);
      await storageSetItemChecked(ACTIVE_BUILD_REVISION_KEY, BUILD_REVISION);
      return;
    }
    if (activeVersion === APP_VERSION && !activeBuildRevision && !pendingVersion) {
      await storageSetItemChecked(ACTIVE_BUILD_REVISION_KEY, BUILD_REVISION);
      return;
    }
    if (pendingVersion === APP_VERSION && approvedVersion === APP_VERSION && (activeVersion !== APP_VERSION || activeBuildRevision !== pendingBuildRevision)) {
      await storageSetItemChecked(ACTIVE_VERSION_KEY, APP_VERSION);
      await storageSetItemChecked(ACTIVE_BUILD_REVISION_KEY, pendingBuildRevision || BUILD_REVISION);
      await storageRemoveItemChecked(ACTIVATION_PENDING_KEY);
      await storageRemoveItemChecked(ACTIVATION_PENDING_BUILD_KEY);
    }
  } catch {
    // The service worker will continue serving the prior durable cache if this check fails.
  }
}
const activeVersionReady = reconcileActiveVersionAfterReload();
function compareVersions(candidate: string, current: string): number {
  const a = String(candidate).split('.').map(n => parseInt(n, 10) || 0);
  const b = String(current).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) > (b[i] || 0)) return 1;
    if ((a[i] || 0) < (b[i] || 0)) return -1;
  }
  return 0;
}
function isVersionNewer(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}
function isAutomaticEligible(serverMode: UpdateMode, serverProtocol: unknown, threshold: unknown): boolean {
  return serverMode === 'automatic'
    && Number(serverProtocol) >= UPDATE_PROTOCOL
    && typeof threshold === 'string'
    && /^\d+\.\d+\.\d+$/.test(threshold)
    && compareVersions(APP_VERSION, threshold) >= 0;
}

function clearUpdateState(): void {
  localStorage.removeItem('att_pwa_update_ready');
  localStorage.removeItem('att_pwa_latest_version');
  localStorage.removeItem('att_pwa_latest_build_revision');
  localStorage.removeItem('att_pwa_update_summary');
  localStorage.removeItem('att_pwa_release_type');
  localStorage.removeItem('att_pwa_update_mode');
  localStorage.setItem('att_app_version', APP_VERSION);
  window.dispatchEvent(new CustomEvent('attendenz:update-cleared'));
}

async function refreshCachedShell(version = APP_VERSION, buildRevision = BUILD_REVISION): Promise<boolean> {
  try {
    const cache = await caches.open(`attendenz-shell-v${version}-r2-${buildRevision}`);
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

async function approveServiceWorker(worker: ServiceWorker, version: string, buildRevision?: string): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => resolve(false), 5000);
    channel.port1.onmessage = (event) => {
      window.clearTimeout(timeout);
      resolve(event.data?.type === 'UPDATE_APPROVED' && event.data.version === version
        && (!buildRevision || !event.data.buildRevision || event.data.buildRevision === buildRevision));
    };
    worker.postMessage({ type: 'APPROVE_UPDATE', version, ...(buildRevision ? { buildRevision } : {}) }, [channel.port2]);
  });
}

async function activateApprovedServiceWorker(version: string, buildRevision?: string): Promise<boolean> {
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
    return registration.active ? approveServiceWorker(registration.active, version, buildRevision) : false;
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
    approveServiceWorker(waiting, version, buildRevision).then((approved) => {
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
      await activeVersionReady;
      const res = await fetch(`${base}version.json?ts=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!res.ok) return;
      const j = await res.json() as { version?: unknown; buildRevision?: unknown; summary?: unknown; releaseType?: unknown; updateMode?: unknown; updateProtocol?: unknown; automaticFromVersion?: unknown };
      if (j && typeof j.version === 'string') {
        const versionComparison = compareVersions(j.version, APP_VERSION);
        const hasNewBuild = versionComparison === 0
          && typeof j.buildRevision === 'string'
          && j.buildRevision.length > 0
          && j.buildRevision !== BUILD_REVISION;
        if (versionComparison > 0 || hasNewBuild) {
          const releaseType: ReleaseType = j.releaseType === 'major' || j.releaseType === 'minor' ? j.releaseType : RELEASE_TYPE;
          // Unknown or missing policy is fail-safe manual; auto-activation requires explicit server intent.
          const updateMode: UpdateMode = j.updateMode === 'automatic' ? 'automatic' : 'manual';
          const buildRevision = typeof j.buildRevision === 'string' && j.buildRevision ? j.buildRevision : j.version;
          const automaticEligible = isAutomaticEligible(updateMode, j.updateProtocol, j.automaticFromVersion);
          if (automaticEligible) {
            await storageSetItemChecked('att_pwa_approved_version', j.version).catch(() => undefined);
            localStorage.setItem(ACTIVATION_PENDING_KEY, j.version);
            localStorage.setItem(ACTIVATION_PENDING_BUILD_KEY, buildRevision);
            const refreshed = await refreshCachedShell(j.version, buildRevision);
            if (refreshed) {
              const activated = await activateApprovedServiceWorker(j.version, buildRevision);
              if (!activated) return;
              clearUpdateState();
              window.location.reload();
              return;
            }
          }
          localStorage.setItem('att_pwa_update_ready', 'true');
          localStorage.setItem('att_pwa_latest_version', j.version);
          localStorage.setItem('att_pwa_latest_build_revision', buildRevision);
          localStorage.setItem('att_pwa_release_type', releaseType);
          localStorage.setItem('att_pwa_update_mode', updateMode);
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
  const approvedBuildRevision = localStorage.getItem('att_pwa_latest_build_revision') || undefined;
  const versionUpdate = approvedVersion ? isVersionNewer(approvedVersion, APP_VERSION) : false;
  const buildUpdate = approvedVersion === APP_VERSION && Boolean(approvedBuildRevision) && approvedBuildRevision !== BUILD_REVISION;
  if (!approvedVersion || (!versionUpdate && !buildUpdate)) return false;
  const downloadingStarted = Date.now();
  localStorage.setItem(ACTIVATION_PENDING_KEY, approvedVersion);
  if (approvedBuildRevision) localStorage.setItem(ACTIVATION_PENDING_BUILD_KEY, approvedBuildRevision);
  const refreshed = await refreshCachedShell(approvedVersion, approvedBuildRevision || approvedVersion);
  if (!refreshed) return false;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 5000 - (Date.now() - downloadingStarted))));
  onPhase?.('installing');
  const installingStarted = Date.now();
  const activated = await activateApprovedServiceWorker(approvedVersion, approvedBuildRevision);
  if (!activated) return false;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, 5000 - (Date.now() - installingStarted))));
  clearUpdateState();
  onPhase?.('completed');
  return true;
};

// Render the app first; a pending manual release is presented by the in-app update sheet.
createRoot(document.getElementById('root')!).render(<App />);
