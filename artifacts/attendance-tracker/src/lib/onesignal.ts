const ONESIGNAL_APP_ID = 'f39e4256-309b-47cd-8f0f-f087b030fdaf';
const PRODUCTION_ORIGIN = 'https://benz-attendance-tracker.pages.dev';
const ONE_SIGNAL_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';
const ONE_SIGNAL_WORKER_PATH = 'push/onesignal/OneSignalSDKWorker.js';
const ONE_SIGNAL_WORKER_SCOPE = '/push/onesignal/';

type OneSignalClient = {
  init: (options: Record<string, unknown>) => Promise<void>;
  setConsentGiven: (given: boolean) => Promise<void> | void;
  Notifications: {
    requestPermission: () => Promise<void>;
    permission: boolean;
    isPushSupported?: () => boolean;
  };
  User: {
    PushSubscription: {
      optIn: () => Promise<void> | void;
      optOut: () => Promise<void> | void;
      optedIn?: boolean;
    };
  };
};

type OneSignalDeferredCallback = (client: OneSignalClient) => void | Promise<void>;

declare global {
  interface Window {
    OneSignalDeferred?: OneSignalDeferredCallback[];
  }
}

let clientPromise: Promise<OneSignalClient | null> | null = null;

export function isOneSignalConfiguredForCurrentOrigin(): boolean {
  return typeof window !== 'undefined' && window.location.origin === PRODUCTION_ORIGIN;
}

async function loadOneSignalClient(): Promise<OneSignalClient | null> {
  if (!isOneSignalConfiguredForCurrentOrigin()) return null;
  if (clientPromise) return clientPromise;

  clientPromise = new Promise<OneSignalClient | null>((resolve, reject) => {
    const deferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred = deferred;
    deferred.push(async (client) => {
      try {
        await client.init({
          appId: ONESIGNAL_APP_ID,
          requiresUserPrivacyConsent: true,
          autoResubscribe: true,
          welcomeNotification: { disable: true },
          serviceWorkerPath: ONE_SIGNAL_WORKER_PATH,
          serviceWorkerParam: { scope: ONE_SIGNAL_WORKER_SCOPE },
        });
        resolve(client);
      } catch (error) {
        reject(error);
      }
    });

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${ONE_SIGNAL_SDK_URL}"]`);
    if (existing) return;

    const script = document.createElement('script');
    script.src = ONE_SIGNAL_SDK_URL;
    script.defer = true;
    script.async = true;
    script.onerror = () => reject(new Error('OneSignal SDK could not be loaded.'));
    document.head.appendChild(script);
  }).catch(() => null);

  return clientPromise;
}

export async function prepareOneSignal(): Promise<boolean> {
  return Boolean(await loadOneSignalClient());
}

export async function enableOneSignalPush(): Promise<'enabled' | 'unavailable' | 'denied' | 'failed'> {
  const client = await loadOneSignalClient();
  if (!client) return 'unavailable';

  try {
    if (client.Notifications.isPushSupported && !client.Notifications.isPushSupported()) return 'unavailable';
    client.setConsentGiven(true);
    await client.Notifications.requestPermission();
    if (!client.Notifications.permission) return 'denied';
    await client.User.PushSubscription.optIn();
    return client.User.PushSubscription.optedIn === false ? 'failed' : 'enabled';
  } catch {
    return 'failed';
  }
}

export async function disableOneSignalPush(): Promise<void> {
  const client = await loadOneSignalClient();
  if (!client) return;
  try {
    await client.User.PushSubscription.optOut();
  } catch {
    // Notification opt-out must never interrupt normal app use.
  }
}

export function isOneSignalProductionConfigured(): boolean {
  return isOneSignalConfiguredForCurrentOrigin();
}
