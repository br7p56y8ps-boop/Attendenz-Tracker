const ONESIGNAL_APP_ID = "f39e4256-309b-47cd-8f0f-f087b030fdaf";
const PRODUCTION_ORIGIN = "https://benz-attendance-tracker.pages.dev";
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
    PushSubscription: {
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

export function isOneSignalConfiguredForCurrentOrigin(): boolean {
  return (
    typeof window !== "undefined" &&
    window.location.origin === PRODUCTION_ORIGIN
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
    // Permission was already requested from the user gesture above. This call
    // synchronizes OneSignal's permission state without showing a second prompt.
    await state.client.Notifications.requestPermission();
    if (!state.client.Notifications.permission) return "denied";
    await state.client.User.PushSubscription.optIn();
    return state.client.User.PushSubscription.optedIn === false
      ? "failed"
      : "enabled";
  } catch {
    return "failed";
  }
}

export async function disableOneSignalPush(): Promise<void> {
  const state = await loadOneSignalClient();
  if (!state) return;
  try {
    await state.client.User.PushSubscription.optOut();
  } catch {
    // Notification opt-out must never interrupt normal app use.
  }
}

export function isOneSignalProductionConfigured(): boolean {
  return isOneSignalConfiguredForCurrentOrigin();
}
