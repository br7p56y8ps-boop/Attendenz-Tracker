export type NotificationSupport = 'supported' | 'unsupported' | 'insecure';
export type NotificationPermissionState = NotificationPermission | NotificationSupport;

const ENABLED_KEY = 'att_system_notifications_enabled_v1';
const PREFS_KEY = 'att_system_notification_prefs_v1';
const UPDATE_AVAILABLE_SENT_KEY = 'att_update_notification_available_v1';
const UPDATE_COMPLETED_SENT_KEY = 'att_update_notification_completed_v1';
export const NOTIFICATION_SETTINGS_CHANGED_EVENT = 'attendenz:notification-settings-changed';

function notifySettingsChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
}

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

export function getNotificationSupport(): NotificationSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'unsupported';
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

export async function showSystemNotification(
  title: string,
  options: NotificationOptions = {},
): Promise<boolean> {
  if (!getSystemNotificationsEnabled() || getNotificationPermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

export async function notifyAddNewChange(summary: string): Promise<boolean> {
  if (!getNotificationPreferences().addNewChanges) return false;
  return showSystemNotification('Attendenz: Schedule updated', {
    body: summary,
    tag: `attendenz-addnew-${Date.now()}`,
    data: { url: '/add-new' },
  });
}

export async function notifyUpdateAvailable(version: string, summary = ''): Promise<boolean> {
  if (!getNotificationPreferences().updateAvailable) return false;
  if (localStorage.getItem(UPDATE_AVAILABLE_SENT_KEY) === version) return false;
  const shown = await showSystemNotification(`Attendenz v${version} is ready`, {
    body: summary || 'A new version is available. Open Attendenz to review and install it.',
    tag: `attendenz-update-available-${version}`,
    data: { url: '/' },
  });
  if (shown) localStorage.setItem(UPDATE_AVAILABLE_SENT_KEY, version);
  return shown;
}

export async function notifyUpdateCompleted(version: string): Promise<boolean> {
  if (!getNotificationPreferences().updateCompleted) return false;
  if (localStorage.getItem(UPDATE_COMPLETED_SENT_KEY) === version) return false;
  const shown = await showSystemNotification('Attendenz update completed', {
    body: `Attendenz v${version} is ready to use.`,
    tag: `attendenz-update-completed-${version}`,
    data: { url: '/' },
  });
  if (shown) localStorage.setItem(UPDATE_COMPLETED_SENT_KEY, version);
  return shown;
}

export async function testSystemNotification(): Promise<boolean> {
  return showSystemNotification('Attendenz test notification', {
    body: 'System notifications are enabled. Device sound, vibration, and DND rules still apply.',
    tag: 'attendenz-test-notification',
    data: { url: '/' },
  });
}
