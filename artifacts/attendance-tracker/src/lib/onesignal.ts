const ONESIGNAL_APP_ID = "f39e4256-309b-47cd-8f0f-f087b030fdaf";
export const ONE_SIGNAL_PRODUCTION_ORIGIN =
  "https://benz-attendance-tracker.pages.dev";
const ONE_SIGNAL_SDK_URL =
  "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js";
const ONE_SIGNAL_WORKER_PATH = "push/onesignal/OneSignalSDKWorker.js";
const ONE_SIGNAL_WORKER_SCOPE = "/push/onesignal/";

type OneSignalClient = {
  init: (options: Record<string, unknown>) => Promise<void>;
  setConsentGiven: (given: boolean) => Promise<void> | void;
  Notifications: {
    requestPermission: () => Promise<void>;
    permission: boolean;
    isPushSupported?: () => boolean;
  };
  User: {
    onesignalId?: string | null;
    PushSubscription: {
      id?: string | null;
      optIn: () => Promise<void> | void;
      optOut: () => Promise<void> | void;
      optedIn?: boolean;
    };
  };
};

type OneSignalDeferredCallback = (
  client: OneSignalClient,
) => void | Promise<void>;
type OneSignalClientState = {
  client: OneSignalClient;
  initialized: Promise<void>;
};

declare global {
  interface Window {
    OneSignalDeferred?: OneSignalDeferredCallback[];
  }
}

let clientPromise: Promise<OneSignalClientState | null> | null = null;
export const ONE_SIGNAL_STATE_CHANGED_EVENT = 'attendenz:onesignal-state-changed';

async function waitForPushOptIn(client: OneSignalClient): Promise<boolean> {
  const subscription = client.User.PushSubscription;
  if (subscription.optedIn !== false) return true;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise(resolve => window.setTimeout(resolve, 250));
    if ((subscription.optedIn as boolean | undefined) === true) return true;
  }
  return subscription.optedIn !== false;
}

export function isOneSignalConfiguredForCurrentOrigin(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.origin === ONE_SIGNAL_PRODUCTION_ORIGIN
  );
}

async function loadOneSignalClient(): Promise<OneSignalClientState | null> {
  if (!isOneSignalConfiguredForCurrentOrigin()) return null;
  if (clientPromise) return clientPromise;

  clientPromise = new Promise<OneSignalClientState | null>(
    (resolve, reject) => {
      const deferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred = deferred;
      deferred.push((client) => {
        try {
          const initialized = client.init({
            appId: ONESIGNAL_APP_ID,
            requiresUserPrivacyConsent: true,
            autoResubscribe: true,
            welcomeNotification: { disable: true },
            serviceWorkerPath: ONE_SIGNAL_WORKER_PATH,
            serviceWorkerParam: { scope: ONE_SIGNAL_WORKER_SCOPE },
          });
          // The promise may wait for consent. Keep its rejection handled until the
          // user-triggered flow awaits it, while exposing the client immediately.
          void initialized.catch(() => undefined);
          resolve({ client, initialized });
        } catch (error) {
          reject(error);
        }
      });

      const existing = document.querySelector<HTMLScriptElement>(
        `script[src="${ONE_SIGNAL_SDK_URL}"]`,
      );
      if (existing) return;

      const script = document.createElement("script");
      script.src = ONE_SIGNAL_SDK_URL;
      script.defer = true;
      script.async = true;
      script.onerror = () =>
        reject(new Error("OneSignal SDK could not be loaded."));
      document.head.appendChild(script);
    },
  ).catch(() => null);

  return clientPromise;
}

export async function prepareOneSignal(): Promise<boolean> {
  return Boolean(await loadOneSignalClient());
}

export async function enableOneSignalPush(): Promise<
  "enabled" | "unavailable" | "denied" | "failed"
> {
  if (!isOneSignalConfiguredForCurrentOrigin()) return "unavailable";
  if (
    typeof window === "undefined" ||
    !("Notification" in window) ||
    !("serviceWorker" in navigator)
  )
    return "unavailable";

  // Invoke the browser permission API at the start of the button handler. iOS
  // requires this request to remain tied to the user's tap; waiting for SDK
  // loading or privacy-gated initialization first can result in a silent no-op.
  let permission = Notification.permission;
  if (permission === "default") {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }
  if (permission === "denied") return "denied";
  if (permission !== "granted") return "failed";

  const state = await loadOneSignalClient();
  if (!state) return "unavailable";

  try {
    if (
      state.client.Notifications.isPushSupported &&
      !state.client.Notifications.isPushSupported()
    )
      return "unavailable";
    await state.client.setConsentGiven(true);
    await state.initialized;
    // The browser permission was already handled at the start of this user gesture.
    // Calling the SDK permission method a second time can fail on iOS even when the
    // native permission is already granted. optIn() is the supported re-enable path.
    await state.client.User.PushSubscription.optIn();
    if (!(await waitForPushOptIn(state.client))) return "failed";
    window.dispatchEvent(new Event(ONE_SIGNAL_STATE_CHANGED_EVENT));
    return "enabled";
  } catch {
    return "failed";
  }
}

export async function disableOneSignalPush(): Promise<void> {
  const state = await loadOneSignalClient();
  if (!state) return;
  try {
    await state.client.User.PushSubscription.optOut();
    window.dispatchEvent(new Event(ONE_SIGNAL_STATE_CHANGED_EVENT));
  } catch {
    // Notification opt-out must never interrupt normal app use.
  }
}

export async function getOneSignalSubscriptionId(): Promise<string | null> {
  const state = await loadOneSignalClient();
  if (!state) return null;
  try {
    await state.initialized;
    const id = state.client.User.PushSubscription.id;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export function isOneSignalProductionConfigured(): boolean {
  return isOneSignalConfiguredForCurrentOrigin();
}
