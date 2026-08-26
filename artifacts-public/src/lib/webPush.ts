export type NotificationSupport = 'supported' | 'unsupported' | 'insecure';
export type NotificationPermissionState = NotificationPermission | NotificationSupport;
export type NotificationLeadMinutes = 15 | 30 | 60;

export interface NotificationPreferences {
  midnightNeedAttention: boolean;
  finalClassToday: boolean;
  firstClassToday: boolean;
  preClassNeedAttention: boolean;
  allScheduledDigest: boolean;
  addNewChanges: boolean;
  updateAvailable: boolean;
  updateCompleted: boolean;
  leadMinutes: NotificationLeadMinutes;
}

export type DirectPushSubscription = {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
};

export type EnableNotificationsResult = 'enabled' | 'unavailable' | 'denied' | 'failed' | 'not-configured';

const ENABLED_KEY = 'att_system_notifications_enabled_v1';
const PREFS_KEY = 'att_system_notification_prefs_v1';
const DEVICE_ID_KEY = 'att_a1_reminder_device_id_v1';
const DEVICE_TOKEN_KEY = 'att_a1_reminder_device_token_v1';
export const NOTIFICATION_SETTINGS_CHANGED_EVENT = 'attendenz:notification-settings-changed';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  midnightNeedAttention: true,
  finalClassToday: true,
  firstClassToday: false,
  preClassNeedAttention: true,
  allScheduledDigest: false,
  addNewChanges: false,
  updateAvailable: true,
  updateCompleted: true,
  leadMinutes: 30,
};

const SERVICE_URL = String(import.meta.env.VITE_PUSH_SERVICE_URL || '').replace(/\/$/, '');
const VAPID_PUBLIC_KEY = String(import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY || '');

function notifySettingsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
}

export function getPushServiceConfig(): { serviceUrl: string; vapidPublicKey: string } {
  return { serviceUrl: SERVICE_URL, vapidPublicKey: VAPID_PUBLIC_KEY };
}

export function getNotificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported';
  return 'supported';
}

export function getNotificationPermission(): NotificationPermissionState {
  const support = getNotificationSupport();
  if (support !== 'supported') return support;
  return Notification.permission;
}

export function getSystemNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(ENABLED_KEY) === 'true';
}

export function setSystemNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(ENABLED_KEY, String(enabled));
  notifySettingsChanged();
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') as Partial<NotificationPreferences>;
    const leadMinutes = parsed.leadMinutes === 15 || parsed.leadMinutes === 60 ? parsed.leadMinutes : 30;
    return {
      midnightNeedAttention: parsed.midnightNeedAttention !== false,
      finalClassToday: parsed.finalClassToday !== false,
      firstClassToday: parsed.firstClassToday === true,
      preClassNeedAttention: parsed.preClassNeedAttention !== false,
      allScheduledDigest: parsed.allScheduledDigest === true,
      addNewChanges: parsed.addNewChanges === true,
      updateAvailable: parsed.updateAvailable !== false,
      updateCompleted: parsed.updateCompleted !== false,
      leadMinutes,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function setNotificationPreferences(preferences: NotificationPreferences): void {
  localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  notifySettingsChanged();
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  const support = getNotificationSupport();
  if (support !== 'supported') return support;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const binary = window.atob(normalized);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function serializeSubscription(subscription: PushSubscription): DirectPushSubscription | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return {
    endpoint: json.endpoint,
    expirationTime: json.expirationTime ?? null,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  };
}

export async function getDirectPushSubscription(): Promise<DirectPushSubscription | null> {
  if (getNotificationSupport() !== 'supported') return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription ? serializeSubscription(subscription) : null;
  } catch {
    return null;
  }
}

export function getDeviceId(): string {
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID?.().replace(/-/g, '') || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function getDeviceToken(): string {
  const existing = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const created = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(DEVICE_TOKEN_KEY, created);
  return created;
}

export async function enableDirectPush(): Promise<EnableNotificationsResult> {
  const support = getNotificationSupport();
  if (support === 'insecure' || support === 'unsupported') return 'unavailable';
  if (!SERVICE_URL || !VAPID_PUBLIC_KEY) return 'not-configured';
  const permission = Notification.permission === 'default' ? await requestNotificationPermission() : Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission !== 'granted') return 'failed';
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY),
      });
    }
    if (!serializeSubscription(subscription)) return 'failed';
    setSystemNotificationsEnabled(true);
    return 'enabled';
  } catch {
    return 'failed';
  }
}

export async function disableDirectPush(): Promise<void> {
  setSystemNotificationsEnabled(false);
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Disabling must never interrupt normal offline attendance use.
  }
}

export async function showNotificationIfEnabled(
  preference: keyof NotificationPreferences,
  title: string,
  body: string,
  tag: string,
): Promise<boolean> {
  if (!getSystemNotificationsEnabled() || !getNotificationPreferences()[preference] || getNotificationPermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, { body, tag, data: { url: '/' } });
    return true;
  } catch {
    return false;
  }
}

export function notifyManageChange(body: string): Promise<boolean> {
  return showNotificationIfEnabled('addNewChanges', 'Attendenz · Routine Updated', body, 'attendenz-manage-change');
}

export function notifyUpdateAvailable(version: string): Promise<boolean> {
  return showNotificationIfEnabled('updateAvailable', 'Attendenz · Update Available', `A new Attendenz version ${version} is ready. Open the app to review and update.`, `attendenz-update-available-${version}`);
}

export function notifyUpdateCompleted(version: string): Promise<boolean> {
  return showNotificationIfEnabled('updateCompleted', 'Attendenz · Update Complete', `Attendenz is now updated to version ${version}.`, `attendenz-update-completed-${version}`);
}

export async function showLocalTestNotification(): Promise<boolean> {
  if (!getSystemNotificationsEnabled() || getNotificationPermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Attendenz · Test Notification', {
      body: 'System Notifications are enabled on this device.',
      tag: 'attendenz-test-notification',
      data: { url: '/' },
    });
    return true;
  } catch {
    return false;
  }
}

export function __test() {
  return { DEFAULT_PREFERENCES, base64UrlToBytes, serializeSubscription };
}
