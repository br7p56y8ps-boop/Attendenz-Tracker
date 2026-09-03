export type NotificationSupport = 'supported' | 'unsupported' | 'insecure';
import { storageSetItem } from './idb';

export type NotificationPermissionState = NotificationPermission | NotificationSupport;
export type NotificationLeadMinutes = 15 | 30 | 60;

export type NotificationGroup = 'attendance' | 'dailySchedule' | 'activity' | 'updates';

export interface NotificationPreferences {
  attendanceGroupEnabled: boolean;
  dailyScheduleGroupEnabled: boolean;
  activityGroupEnabled: boolean;
  updatesGroupEnabled: boolean;
  needAttentionSummary: boolean;
  needAttentionSubjects: boolean;
  safeToMiss: boolean;
  lastPlannedClassToday: boolean;
  firstClassOfDay: boolean;
  beforeClassWarnings: boolean;
  allScheduledClasses: boolean;
  manageChanges: boolean;
  updateAvailable: boolean;
  updateCompleted: boolean;
  curriculumChanges: boolean;
  dataTransfer: boolean;
  unmarkedAttendanceToday: boolean;
  leadMinutes: NotificationLeadMinutes;
  /** Legacy aliases retained for stored-data compatibility. */
  midnightNeedAttention: boolean;
  finalClassToday: boolean;
  firstClassToday: boolean;
  preClassNeedAttention: boolean;
  allScheduledDigest: boolean;
  addNewChanges: boolean;
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
  attendanceGroupEnabled: true,
  dailyScheduleGroupEnabled: true,
  activityGroupEnabled: true,
  updatesGroupEnabled: true,
  needAttentionSummary: true,
  needAttentionSubjects: false,
  safeToMiss: false,
  lastPlannedClassToday: true,
  firstClassOfDay: false,
  beforeClassWarnings: true,
  allScheduledClasses: false,
  manageChanges: true,
  updateAvailable: true,
  updateCompleted: true,
  curriculumChanges: false,
  dataTransfer: true,
  unmarkedAttendanceToday: false,
  leadMinutes: 30,
  midnightNeedAttention: true,
  finalClassToday: true,
  firstClassToday: false,
  preClassNeedAttention: true,
  allScheduledDigest: false,
  addNewChanges: true,
};

const runtimeEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env || {};
const SERVICE_URL = String(runtimeEnv.VITE_PUSH_SERVICE_URL || '').replace(/\/$/, '');
const VAPID_PUBLIC_KEY = String(runtimeEnv.VITE_WEB_PUSH_PUBLIC_KEY || '');

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
  void storageSetItem(ENABLED_KEY, String(enabled));
  notifySettingsChanged();
}

export function getNotificationPreferences(): NotificationPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PREFS_KEY) || '{}') as Partial<NotificationPreferences>;
    const leadMinutes = parsed.leadMinutes === 15 || parsed.leadMinutes === 60 ? parsed.leadMinutes : 30;
    const needAttentionSummary = parsed.needAttentionSummary ?? parsed.midnightNeedAttention !== false;
    const lastPlannedClassToday = parsed.lastPlannedClassToday ?? parsed.finalClassToday !== false;
    const firstClassOfDay = parsed.firstClassOfDay ?? parsed.firstClassToday === true;
    const beforeClassWarnings = parsed.beforeClassWarnings ?? parsed.preClassNeedAttention !== false;
    const allScheduledClasses = parsed.allScheduledClasses ?? parsed.allScheduledDigest === true;
    const manageChanges = parsed.manageChanges ?? parsed.addNewChanges ?? true;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      attendanceGroupEnabled: parsed.attendanceGroupEnabled !== false,
      dailyScheduleGroupEnabled: parsed.dailyScheduleGroupEnabled !== false,
      activityGroupEnabled: parsed.activityGroupEnabled !== false,
      updatesGroupEnabled: parsed.updatesGroupEnabled !== false,
      needAttentionSummary,
      needAttentionSubjects: parsed.needAttentionSubjects ?? DEFAULT_PREFERENCES.needAttentionSubjects,
      safeToMiss: parsed.safeToMiss === true,
      lastPlannedClassToday,
      firstClassOfDay,
      beforeClassWarnings,
      allScheduledClasses,
      manageChanges,
      updateAvailable: parsed.updateAvailable !== false,
      updateCompleted: parsed.updateCompleted !== false,
      curriculumChanges: parsed.curriculumChanges === true,
      dataTransfer: parsed.dataTransfer === true,
      unmarkedAttendanceToday: parsed.unmarkedAttendanceToday ?? DEFAULT_PREFERENCES.unmarkedAttendanceToday,
      leadMinutes,
      midnightNeedAttention: needAttentionSummary,
      finalClassToday: lastPlannedClassToday,
      firstClassToday: firstClassOfDay,
      preClassNeedAttention: beforeClassWarnings,
      allScheduledDigest: allScheduledClasses,
      addNewChanges: manageChanges,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function setNotificationPreferences(preferences: NotificationPreferences): void {
  const next = {
    ...preferences,
    midnightNeedAttention: preferences.needAttentionSummary,
    finalClassToday: preferences.lastPlannedClassToday,
    firstClassToday: preferences.firstClassOfDay,
    preClassNeedAttention: preferences.beforeClassWarnings,
    allScheduledDigest: preferences.allScheduledClasses,
    addNewChanges: preferences.manageChanges,
  };
  void storageSetItem(PREFS_KEY, JSON.stringify(next));
  notifySettingsChanged();
}

const GROUP_FOR_PREFERENCE: Partial<Record<keyof NotificationPreferences, NotificationGroup>> = {
  needAttentionSummary: 'attendance', needAttentionSubjects: 'attendance', safeToMiss: 'attendance', beforeClassWarnings: 'attendance', unmarkedAttendanceToday: 'attendance',
  lastPlannedClassToday: 'dailySchedule', firstClassOfDay: 'dailySchedule', allScheduledClasses: 'dailySchedule',
  manageChanges: 'activity', curriculumChanges: 'activity', dataTransfer: 'activity',
  updateAvailable: 'updates', updateCompleted: 'updates',
};

export function isNotificationPreferenceEnabled(preference: keyof NotificationPreferences, preferences = getNotificationPreferences()): boolean {
  if (!Boolean(preferences[preference])) return false;
  const group = GROUP_FOR_PREFERENCE[preference];
  if (!group) return true;
  const groupEnabled = group === 'attendance' ? preferences.attendanceGroupEnabled
    : group === 'dailySchedule' ? preferences.dailyScheduleGroupEnabled
      : group === 'activity' ? preferences.activityGroupEnabled
        : preferences.updatesGroupEnabled;
  return groupEnabled;
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

const DOCUMENTED_PUSH_ENDPOINTS = [
  'https://fcm.googleapis.com/',
  'https://updates.push.services.mozilla.com/',
  'https://wns2-par02p.notify.windows.com/',
  'https://web.push.apple.com/',
] as const;

function isDocumentedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && DOCUMENTED_PUSH_ENDPOINTS.some(prefix => endpoint.startsWith(prefix));
  } catch {
    return false;
  }
}

function serializeSubscription(subscription: PushSubscription): DirectPushSubscription | null {
  const json = subscription.toJSON();
  if (!json.endpoint || !isDocumentedPushEndpoint(json.endpoint) || !json.keys?.p256dh || !json.keys.auth) return null;
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
  void storageSetItem(DEVICE_ID_KEY, created);
  return created;
}

export function getDeviceToken(): string {
  const existing = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (existing) return existing;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const created = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  void storageSetItem(DEVICE_TOKEN_KEY, created);
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
        applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }
    if (!serializeSubscription(subscription)) return 'failed';
    setSystemNotificationsEnabled(true);
    return 'enabled';
  } catch {
    return 'failed';
  }
}

/**
 * Recreate a missing browser subscription only after permission has already
 * been granted. This is safe to call during reminder-sync recovery because it
 * never opens a permission prompt.
 */
export async function recoverDirectPushSubscription(): Promise<EnableNotificationsResult> {
  if (getNotificationPermission() !== 'granted') return 'failed';
  return enableDirectPush();
}

export async function disableDirectPush(): Promise<boolean> {
  setSystemNotificationsEnabled(false);
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return true;
    return await subscription.unsubscribe();
  } catch {
    // Disabling local notifications remains safe for offline attendance use,
    // but callers can now explain that browser cleanup was incomplete.
    return false;
  }
}

export async function showNotificationIfEnabled(
  preference: keyof NotificationPreferences,
  title: string,
  body: string,
  tag: string,
): Promise<boolean> {
  if (!getSystemNotificationsEnabled() || !isNotificationPreferenceEnabled(preference) || getNotificationPermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const combinedTitle = `${title}${body.trim() ? ` — ${body.trim().replace(/[.!?]+\s*$/u, '')}` : ''}`;
    await registration.showNotification(combinedTitle, { body: '', tag, data: { url: '/' } });
    return true;
  } catch {
    return false;
  }
}

export function notifyManageChange(body: string): Promise<boolean> {
  return showNotificationIfEnabled('manageChanges', 'Routine Updated', body, 'attendenz-manage-change');
}

export function notifyUpdateAvailable(version: string): Promise<boolean> {
  return showNotificationIfEnabled('updateAvailable', 'Update Available', `A new version ${version} is ready. Open the app to review and update.`, `attendenz-update-available-${version}`);
}

export function notifyUpdateCompleted(version: string): Promise<boolean> {
  return showNotificationIfEnabled('updateCompleted', 'Update Complete', `The app is now updated to version ${version}.`, `attendenz-update-completed-${version}`);
}

export function notifyCurriculumChange(body: string): Promise<boolean> {
  return showNotificationIfEnabled('curriculumChanges', 'Curriculum Updated', body, `attendenz-curriculum-change-${Date.now()}`);
}

export function notifyDataTransfer(body: string): Promise<boolean> {
  return showNotificationIfEnabled('dataTransfer', 'Data Transfer Complete', body, `attendenz-data-transfer-${Date.now()}`);
}

export async function showLocalTestNotification(): Promise<boolean> {
  if (!getSystemNotificationsEnabled() || getNotificationPermission() !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Test Notification — System Notifications are enabled on this device', {
      body: '',
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
