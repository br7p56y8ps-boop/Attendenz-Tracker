import { useEffect, type ReactNode } from 'react';
import {
  DAY_ABBRS,
  useCustomData,
  type CustomSubject,
  type CustomWard,
  type UserAddedSubject,
} from '@/contexts/CustomDataContext';
import {
  getAcademicAttendanceKey,
  getSGTKey,
  getWardAttendanceKey,
  useAttendance,
  type AttendanceData,
} from '@/contexts/AttendanceContext';
import {
  getDirectPushSubscription,
  getDeviceId,
  getDeviceToken,
  getNotificationPermission,
  getNotificationPreferences,
  getPushServiceConfig,
  getSystemNotificationsEnabled,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  type DirectPushSubscription,
  type NotificationPreferences,
} from '@/lib/webPush';
import {
  parseRangeToMinutes,
  getPresetAcademicSessionId,
  getPresetWardSessionId,
  getScheduleRowSessionId,
  getCustomSubjectSessionId,
} from '@/lib/utils';

const { serviceUrl: SERVICE_URL, vapidPublicKey: VAPID_PUBLIC_KEY } = getPushServiceConfig();
const HORIZON_DAYS = 21;
const MAX_OCCURRENCES = 250;
const SYNC_STATUS_KEY = 'att_a1_reminder_sync_status_v1';
export const REMINDER_SYNC_STATUS_CHANGED_EVENT = 'attendenz:reminder-sync-status-changed';

export type ReminderSyncStatus =
  | { state: 'not-configured' | 'offline' | 'waiting-for-permission' | 'error'; at?: string; details?: string }
  | { state: 'synced'; at: string; occurrenceCount?: number };

export type ReminderRegistrationDiagnostics = {
  productionOrigin: boolean;
  serviceConfigured: boolean;
  permission: ReturnType<typeof getNotificationPermission>;
  systemEnabled: boolean;
  subscription: 'available' | 'missing' | 'not-applicable';
  sync: ReminderSyncStatus;
};

export type RemoteNotificationTestResult =
  | { state: 'sent' }
  | { state: 'preview-blocked' | 'not-configured' | 'permission-required' | 'subscription-missing' | 'not-registered' | 'error'; details?: string };

export function getReminderSyncStatus(): ReminderSyncStatus {
  if (typeof window === 'undefined') return { state: 'not-configured' };
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_STATUS_KEY) || 'null') as ReminderSyncStatus | null;
    if (parsed && typeof parsed.state === 'string') return parsed;
  } catch {}
  return { state: SERVICE_URL ? 'waiting-for-permission' : 'not-configured' };
}

function setReminderSyncStatus(status: ReminderSyncStatus): void {
  try { localStorage.setItem(SYNC_STATUS_KEY, JSON.stringify(status)); } catch {}
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(REMINDER_SYNC_STATUS_CHANGED_EVENT));
}

type ReminderCategory = 'academic' | 'clinical' | 'sgt' | 'ward';

export type ReminderAttentionLevel = 'mustAttend' | 'needAttention' | 'safeToMiss' | 'onTrack' | 'neutral';

type ReminderOccurrence = {
  id: string;
  localDate: string;
  startMinute: number;
  endMinute: number;
  subjectLabel: string;
  category: ReminderCategory;
  needsAttention: boolean;
  attentionLevel: ReminderAttentionLevel;
  attendanceMarked: boolean;
  isFinalForSubject: boolean;
};

type ReminderSyncPayload = {
  version: 3;
  deviceId: string;
  deviceToken: string;
  subscription: DirectPushSubscription;
  timezone: string;
  notificationsEnabled: boolean;
  preferences: Pick<NotificationPreferences, 'needAttentionSummary' | 'needAttentionSubjects' | 'safeToMiss' | 'lastPlannedClassToday' | 'firstClassOfDay' | 'beforeClassWarnings' | 'allScheduledClasses' | 'unmarkedAttendanceToday' | 'leadMinutes'>;
  occurrences: ReminderOccurrence[];
};

function localDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dayAbbreviation(date: Date): string {
  return DAY_ABBRS[date.getDay()];
}

function parseTime(time: string): { startMinute: number; endMinute: number } | null {
  const range = parseRangeToMinutes(time);
  if (!range) return null;
  return { startMinute: range.start, endMinute: range.end };
}

function safeOccurrenceId(prefix: string, ...parts: Array<string | number>): string {
  return [prefix, ...parts].map(part => String(part).normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'item').join('-').slice(0, 120);
}

function isInVacation(date: string, periods?: Array<{ start: string; end: string }>): boolean {
  return Boolean(periods?.some(period => date >= period.start && date <= period.end));
}

function isWithinDates(date: string, startDate?: string, endDate?: string, periods?: Array<{ start: string; end: string }>): boolean {
  if (startDate && date < startDate) return false;
  if (endDate && date > endDate) return false;
  return !isInVacation(date, periods);
}

function isFinalOccurrence(
  localDate: string,
  rows: Array<{ day: string; time: string }>,
  endDate?: string,
  periods?: Array<{ start: string; end: string }>,
): boolean {
  if (!endDate) return false;
  const date = new Date(`${localDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  date.setDate(date.getDate() + 1);
  while (date <= end) {
    const nextDate = localDateString(date);
    if (isWithinDates(nextDate, undefined, endDate, periods) && rows.some(row => row.day === dayAbbreviation(date) && Boolean(parseTime(row.time)))) return false;
    date.setDate(date.getDate() + 1);
  }
  return true;
}

function isFinalDailyOccurrence(localDate: string, endDate: string, periods?: Array<{ start: string; end: string }>): boolean {
  const date = new Date(`${localDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  date.setDate(date.getDate() + 1);
  while (date <= end) {
    const nextDate = localDateString(date);
    if (isWithinDates(nextDate, undefined, endDate, periods)) return false;
    date.setDate(date.getDate() + 1);
  }
  return true;
}

function rowsForSubject(subject: CustomSubject | UserAddedSubject): Array<{ day: string; time: string }> {
  if (subject.schedules?.length) {
    return subject.schedules.map(row => ({
      day: row.day,
      time: 'time' in row ? row.time : `${row.start}–${row.end}`,
    }));
  }
  const days = (subject.days || '').split(',').map(day => day.trim()).filter(Boolean);
  return days.map(day => ({ day, time: subject.time || '' }));
}

function attentionFor(
  attendance: AttendanceData | undefined,
  finished: boolean,
  planned: number,
  target: number,
): ReminderAttentionLevel {
  if (planned <= 0) return 'neutral';
  const attended = attendance?.attended || 0;
  const missed = attendance?.missed || 0;
  const conducted = attended + missed;
  if (finished || conducted >= planned) return 'neutral';
  if (conducted === 0) return 'mustAttend';
  const percentage = (attended / conducted) * 100;
  if (percentage < target) return 'mustAttend';
  if (percentage < target + 5) return 'needAttention';
  const projectedAfterMiss = (attended / (conducted + 1)) * 100;
  return projectedAfterMiss >= target ? 'safeToMiss' : 'onTrack';
}

function subjectAttendanceKey(reference: ReturnType<typeof useCustomData>['subjectRegistry'][number]): string {
  return reference.kind === 'sgt'
    ? getSGTKey(reference.id)
    : reference.domain === 'clinical'
      ? getWardAttendanceKey(reference.id)
      : getAcademicAttendanceKey(reference.id);
}

function subjectAttentionForReference(
  reference: ReturnType<typeof useCustomData>['subjectRegistry'][number] | undefined,
  subjectAttendance: Record<string, AttendanceData>,
  wardAttendance: Record<string, AttendanceData>,
  finishedMap: Record<string, boolean>,
  plannedFallback: number,
  target: number,
): ReminderAttentionLevel {
  if (!reference) return 'neutral';
  const attendanceKey = subjectAttendanceKey(reference);
  const attendanceStore = reference.kind === 'sgt' || reference.domain === 'academic' ? subjectAttendance : wardAttendance;
  return attentionFor(attendanceStore[attendanceKey], Boolean(finishedMap[attendanceKey]), reference.planned || plannedFallback, target);
}

function reminderKindLabel(reference: ReturnType<typeof useCustomData>['subjectRegistry'][number] | undefined, category: ReminderCategory): string {
  if (reference?.kind === 'integrated') return 'Integrated';
  if (reference?.kind === 'sgt' || category === 'sgt') return 'SGT';
  if (reference?.domain === 'clinical' || category === 'clinical' || category === 'ward') return 'Clinical';
  return 'Lecture';
}

function subjectDisplayLabel(name: string, reference: ReturnType<typeof useCustomData>['subjectRegistry'][number] | undefined, category: ReminderCategory): string {
  return `${name.replace(/\s+/g, ' ').trim().slice(0, 120)} (${reminderKindLabel(reference, category)})`;
}

function reminderFlags(level: ReminderAttentionLevel): { needsAttention: boolean; attentionLevel: ReminderAttentionLevel } {
  return { needsAttention: level === 'mustAttend' || level === 'needAttention', attentionLevel: level };
}

function attendanceKeyForName(name: string, subjectRegistry: ReturnType<typeof useCustomData>['subjectRegistry']): string {
  const reference = subjectRegistry.find(item => item.name.trim().toLowerCase() === name.trim().toLowerCase());
  return reference ? subjectAttendanceKey(reference) : name;
}

function selectionIsMarked(selections: Record<string, string>, localDate: string, attendanceKey: string, sessionId?: string, label?: string): boolean {
  const normalizedSession = sessionId ? String(sessionId).toLowerCase() : '';
  const tokens = [attendanceKey, label].filter(Boolean).map(token => String(token).toLowerCase());
  return Object.entries(selections).some(([key, value]) => {
    if ((value !== 'attended' && value !== 'missed') || key.slice(0, 10) !== localDate) return false;
    const rest = key.slice(11).toLowerCase();
    if (normalizedSession && (rest === normalizedSession || rest.endsWith(`-${normalizedSession}`) || rest.endsWith(`_${normalizedSession}`))) return true;
    if (normalizedSession) return false;
    return tokens.some(token => rest === token || rest.startsWith(`${token}-`) || rest.startsWith(`${token}_`));
  });
}

function subjectRowSessionId(subject: CustomSubject | UserAddedSubject, row: { day: string; time: string }): string {
  const raw = subject.schedules?.find(item => item.day === row.day && ('time' in item ? item.time === row.time : `${item.start}–${item.end}` === row.time));
  if (raw && 'start' in raw && raw.start && raw.end) {
    const isSGT = subject.subjectType === 'allied' && subject.parentName === 'Small Group Teaching';
    return isSGT ? `${subject.id}:${row.day}:${raw.start}:${raw.end}` : getScheduleRowSessionId(subject.id, row.day, `${raw.start}–${raw.end}`);
  }
  const isSGT = subject.subjectType === 'allied' && subject.parentName === 'Small Group Teaching';
  return isSGT ? getCustomSubjectSessionId(subject.id, row.day, row.time, true, subject.id) : getCustomSubjectSessionId(subject.id, row.day, row.time);
}

function isFinalPlannedOccurrence(
  name: string,
  subjectRegistry: ReturnType<typeof useCustomData>['subjectRegistry'],
  subjectAttendance: Record<string, AttendanceData>,
  wardAttendance: Record<string, AttendanceData>,
  finishedMap: Record<string, boolean>,
  planned: number,
): boolean {
  if (planned <= 0) return false;
  const reference = subjectRegistry.find(item => item.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (!reference) return false;
  const key = subjectAttendanceKey(reference);
  const store = reference.kind === 'sgt' || reference.domain === 'academic' ? subjectAttendance : wardAttendance;
  const conducted = (store[key]?.attended || 0) + (store[key]?.missed || 0);
  return !finishedMap[key] && conducted + 1 >= planned;
}

function buildOccurrences(input: {
  subjectMode: ReturnType<typeof useCustomData>['subjectMode'];
  customSubjects: CustomSubject[];
  customWards: CustomWard[];
  userAddedSubjects: UserAddedSubject[];
  presetTimetable: ReturnType<typeof useCustomData>['presetTimetable'];
  presetWardSchedule: ReturnType<typeof useCustomData>['presetWardSchedule'];
  subjectRegistry: ReturnType<typeof useCustomData>['subjectRegistry'];
  subjects: Record<string, AttendanceData>;
  wards: Record<string, AttendanceData>;
  finishedMap: Record<string, boolean>;
  homeSelections: Record<string, string>;
  preferredPercentage: number;
  getSubjectPlannedTotal: (name: string) => number;
  getPresetWardTotalPlanned: (name: string) => number;
  getCustomWardTotalPlanned: (startDate: string, endDate: string, vacationPeriods?: Array<{ start: string; end: string }>) => number;
  getPresetSubjectDisplayName: (name: string) => string;
  getPresetWardDisplayName: (name: string) => string;
}): ReminderOccurrence[] {
  const occurrences: ReminderOccurrence[] = [];
  const seen = new Set<string>();
  const add = (item: ReminderOccurrence) => {
    if (occurrences.length >= MAX_OCCURRENCES) return;
    const key = `${item.localDate}|${item.category}|${item.id}|${item.startMinute}|${item.subjectLabel}`;
    if (seen.has(key)) return;
    seen.add(key);
    occurrences.push(item);
  };

  const today = new Date();
  for (let offset = 0; offset < HORIZON_DAYS; offset += 1) {
    const date = new Date(today);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    const localDate = localDateString(date);
    const day = dayAbbreviation(date);

    if (input.subjectMode === 'custom') {
      for (const subject of input.customSubjects) {
        if (subject.subjectType === 'allied-parent' || !isWithinDates(localDate, subject.startDate, subject.endDate, subject.vacationPeriods)) continue;
        const registryItem = input.subjectRegistry.find(item => item.id === subject.id);
        const domain = registryItem?.domain || (subject.category?.toLowerCase().includes('clinical') ? 'clinical' : 'academic');
        const category: ReminderCategory = registryItem?.kind === 'sgt' ? 'sgt' : domain === 'clinical' ? 'clinical' : 'academic';
        const planned = registryItem?.planned ?? subject.plannedClasses;
        const label = subjectDisplayLabel(subject.name, registryItem, category);
        for (const row of rowsForSubject(subject)) {
          if (row.day !== day) continue;
          const parsed = parseTime(row.time);
          if (!parsed) continue;
          add({
            id: safeOccurrenceId('custom', subject.id, localDate, parsed.startMinute),
            localDate,
            startMinute: parsed.startMinute,
            endMinute: parsed.endMinute,
            attendanceMarked: selectionIsMarked(input.homeSelections, localDate, registryItem ? subjectAttendanceKey(registryItem) : attendanceKeyForName(subject.name, input.subjectRegistry), subjectRowSessionId(subject, row), subject.name),
            subjectLabel: label,
            category,
            ...reminderFlags(subjectAttentionForReference(registryItem, input.subjects, input.wards, input.finishedMap, planned, input.preferredPercentage)),
            isFinalForSubject: isFinalOccurrence(localDate, rowsForSubject(subject), subject.endDate, subject.vacationPeriods) || isFinalPlannedOccurrence(subject.name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, planned),
          });
        }
      }

      for (const ward of input.customWards) {
        if (!isWithinDates(localDate, ward.startDate, ward.endDate, ward.vacationPeriods)) continue;
        for (const [slot, time] of [['morning', ward.morningTime], ['evening', ward.eveningTime]] as const) {
          const parsed = parseTime(time || '');
          if (!parsed) continue;
          add({
            id: safeOccurrenceId('custom-ward', ward.id, localDate, slot, parsed.startMinute),
            localDate,
            startMinute: parsed.startMinute,
            endMinute: parsed.endMinute,
            attendanceMarked: selectionIsMarked(input.homeSelections, localDate, attendanceKeyForName(ward.name, input.subjectRegistry), slot === 'morning' ? 'custom-ward-am' : 'custom-ward-pm', ward.name),
            subjectLabel: subjectDisplayLabel(ward.name, input.subjectRegistry.find(item => item.id === ward.id), 'ward'),
            category: 'ward',
            ...reminderFlags(subjectAttentionForReference(input.subjectRegistry.find(item => item.id === ward.id), input.subjects, input.wards, input.finishedMap, input.getCustomWardTotalPlanned(ward.startDate, ward.endDate, ward.vacationPeriods), input.preferredPercentage)),
            isFinalForSubject: isFinalDailyOccurrence(localDate, ward.endDate, ward.vacationPeriods) || isFinalPlannedOccurrence(ward.name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, input.getCustomWardTotalPlanned(ward.startDate, ward.endDate, ward.vacationPeriods)),
          });
        }
      }
    } else {
      const slots = input.presetTimetable[date.getDay()] || [];
      for (const slot of slots) {
        if (slot.type === 'ward' || slot.type === 'ward_replacement') continue;
        const parsed = parseTime(slot.time);
        if (!parsed) continue;
        for (const name of slot.subjects || []) {
          const label = input.getPresetSubjectDisplayName(name);
          const registryItem = input.subjectRegistry.find(item => item.name.trim().toLowerCase() === name.trim().toLowerCase() && (slot.type === 'integrated' ? item.kind === 'integrated' : item.kind === 'preset-academic'))
            || input.subjectRegistry.find(item => item.name.trim().toLowerCase() === name.trim().toLowerCase());
          const category: ReminderCategory = registryItem?.kind === 'sgt' ? 'sgt' : registryItem?.domain === 'clinical' ? 'clinical' : 'academic';
          const displayLabel = subjectDisplayLabel(label, registryItem, category);
          add({
            id: safeOccurrenceId('preset', attendanceKeyForName(name, input.subjectRegistry), localDate, parsed.startMinute, name),
            localDate,
            startMinute: parsed.startMinute,
            endMinute: parsed.endMinute,
            attendanceMarked: selectionIsMarked(input.homeSelections, localDate, registryItem ? subjectAttendanceKey(registryItem) : attendanceKeyForName(name, input.subjectRegistry), getPresetAcademicSessionId(input.presetTimetable[date.getDay()]?.indexOf(slot) ?? 0, slot.subjects?.indexOf(name) ?? 0), label),
            subjectLabel: displayLabel,
            category,
            ...reminderFlags(subjectAttentionForReference(registryItem, input.subjects, input.wards, input.finishedMap, registryItem?.planned ?? input.getSubjectPlannedTotal(name), input.preferredPercentage)),
            isFinalForSubject: isFinalPlannedOccurrence(name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, input.getSubjectPlannedTotal(name)),
          });
        }
      }

      for (const subject of input.userAddedSubjects) {
        if (subject.subjectType !== 'allied' || subject.parentName !== 'Small Group Teaching') continue;
        for (const row of rowsForSubject(subject)) {
          if (row.day !== day) continue;
          const parsed = parseTime(row.time);
          if (!parsed) continue;
          add({
            id: safeOccurrenceId('preset-sgt', subject.id, localDate, parsed.startMinute),
            localDate,
            startMinute: parsed.startMinute,
            endMinute: parsed.endMinute,
            attendanceMarked: selectionIsMarked(input.homeSelections, localDate, getSGTKey(subject.id), subjectRowSessionId(subject, row), subject.name),
            subjectLabel: subjectDisplayLabel(subject.name, input.subjectRegistry.find(item => item.id === subject.id), 'sgt'),
            category: 'sgt',
            ...reminderFlags(subjectAttentionForReference(input.subjectRegistry.find(item => item.id === subject.id), input.subjects, input.wards, input.finishedMap, subject.plannedClasses, input.preferredPercentage)),
            isFinalForSubject: isFinalOccurrence(localDate, rowsForSubject(subject), subject.endDate, subject.vacationPeriods) || isFinalPlannedOccurrence(subject.name, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, subject.plannedClasses),
          });
        }
      }

      for (const ward of input.presetWardSchedule) {
        if (localDate < ward.start || localDate > ward.end || isInVacation(localDate, ward.vacationPeriods)) continue;
        for (const [slot, time] of [['morning', ward.morningTime], ['evening', ward.eveningTime]] as const) {
          const parsed = parseTime(time || '');
          if (!parsed) continue;
          add({
            id: safeOccurrenceId('preset-ward', attendanceKeyForName(ward.ward, input.subjectRegistry), localDate, slot, parsed.startMinute),
            localDate,
            startMinute: parsed.startMinute,
            endMinute: parsed.endMinute,
            attendanceMarked: selectionIsMarked(input.homeSelections, localDate, attendanceKeyForName(ward.ward, input.subjectRegistry), getPresetWardSessionId((input.presetTimetable[date.getDay()] || []).findIndex(candidate => candidate.type === (slot === 'morning' ? 'ward' : 'ward_replacement'))), input.getPresetWardDisplayName(ward.ward)),
            subjectLabel: subjectDisplayLabel(input.getPresetWardDisplayName(ward.ward), input.subjectRegistry.find(item => item.name.trim().toLowerCase() === ward.ward.trim().toLowerCase() && item.kind === 'preset-ward'), 'ward'),
            category: 'ward',
            ...reminderFlags(subjectAttentionForReference(input.subjectRegistry.find(item => item.name.trim().toLowerCase() === ward.ward.trim().toLowerCase() && item.kind === 'preset-ward'), input.subjects, input.wards, input.finishedMap, input.getPresetWardTotalPlanned(ward.ward), input.preferredPercentage)),
            isFinalForSubject: isFinalDailyOccurrence(localDate, ward.end, ward.vacationPeriods) || isFinalPlannedOccurrence(ward.ward, input.subjectRegistry, input.subjects, input.wards, input.finishedMap, input.getPresetWardTotalPlanned(ward.ward)),
          });
        }
      }
    }
  }

  const finalCandidates = new Map<string, ReminderOccurrence[]>();
  for (const occurrence of occurrences) {
    if (!occurrence.isFinalForSubject) continue;
    const key = `${occurrence.category}|${occurrence.subjectLabel.trim().toLowerCase()}`;
    const list = finalCandidates.get(key) || [];
    list.push(occurrence);
    finalCandidates.set(key, list);
  }
  for (const candidates of finalCandidates.values()) {
    const dates = new Set(candidates.map(item => item.localDate));
    const chosen = dates.size === 1
      ? candidates.reduce((latest, item) => item.startMinute > latest.startMinute ? item : latest)
      : candidates.reduce((earliest, item) => item.localDate < earliest.localDate || (item.localDate === earliest.localDate && item.startMinute < earliest.startMinute) ? item : earliest);
    for (const item of candidates) item.isFinalForSubject = item.id === chosen.id;
  }

  return occurrences.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.startMinute - b.startMinute || a.subjectLabel.localeCompare(b.subjectLabel));
}

async function syncReminderState(payload: ReminderSyncPayload): Promise<void> {
  if (!SERVICE_URL || !VAPID_PUBLIC_KEY) {
    setReminderSyncStatus({ state: 'not-configured' });
    return;
  }
  if (!navigator.onLine) {
    setReminderSyncStatus({ state: 'offline', at: new Date().toISOString() });
    return;
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${SERVICE_URL}/v1/device/reminder-state`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${payload.deviceToken}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const responseBody = await response.json().catch(() => null) as { error?: string; occurrenceCount?: number } | null;
    if (!response.ok) {
      setReminderSyncStatus({ state: 'error', at: new Date().toISOString(), details: responseBody?.error || `http_${response.status}` });
      return;
    }
    setReminderSyncStatus({ state: 'synced', at: new Date().toISOString(), occurrenceCount: responseBody?.occurrenceCount });
  } catch {
    setReminderSyncStatus({ state: 'error', at: new Date().toISOString() });
    // Reminder sync must never interrupt offline attendance use.
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function getReminderRegistrationDiagnostics(): Promise<ReminderRegistrationDiagnostics> {
  const productionOrigin = typeof window !== 'undefined' && window.location.origin === 'https://benz-attendance-tracker.pages.dev';
  const permission = getNotificationPermission();
  const systemEnabled = getSystemNotificationsEnabled();
  const subscription = await getDirectPushSubscription() ? 'available' : 'missing';
  return {
    productionOrigin,
    serviceConfigured: Boolean(SERVICE_URL && VAPID_PUBLIC_KEY),
    permission,
    systemEnabled,
    subscription,
    sync: getReminderSyncStatus(),
  };
}

export async function testRemoteNotification(): Promise<RemoteNotificationTestResult> {
  if (!SERVICE_URL) return { state: 'not-configured' };
  if (getNotificationPermission() !== 'granted' || !getSystemNotificationsEnabled()) {
    return { state: 'permission-required' };
  }
  const subscription = await getDirectPushSubscription();
  if (!subscription) return { state: 'subscription-missing' };
  const deviceId = getDeviceId();
  const deviceToken = getDeviceToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${SERVICE_URL}/v1/device/test`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify({ deviceId }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (response.ok) return { state: 'sent' };
    if (body?.error === 'device_not_registered') return { state: 'not-registered' };
    return { state: 'error', details: body?.error || `http_${response.status}` };
  } catch (cause) {
    return { state: 'error', details: cause instanceof DOMException && cause.name === 'AbortError' ? 'request_timeout' : 'network_error' };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function deleteRemoteDevice(): Promise<void> {
  if (!SERVICE_URL || !navigator.onLine) return;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    await fetch(`${SERVICE_URL}/v1/device/reminder-state?deviceId=${encodeURIComponent(getDeviceId())}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${getDeviceToken()}` },
      signal: controller.signal,
    });
  } catch {
    // Remote cleanup is best effort; disabling local notifications remains safe.
  } finally {
    window.clearTimeout(timeout);
  }
}

export function ReminderSyncProvider({ children }: { children: ReactNode }) {
  const custom = useCustomData();
  const attendance = useAttendance();

  useEffect(() => {
    let alive = true;
    const sync = async () => {
      if (!alive || !custom.setupDone || !SERVICE_URL || !VAPID_PUBLIC_KEY) {
        if (custom.setupDone && !SERVICE_URL) setReminderSyncStatus({ state: 'not-configured' });
        return;
      }
      if (!getSystemNotificationsEnabled()) {
        await deleteRemoteDevice();
        setReminderSyncStatus({ state: 'waiting-for-permission' });
        return;
      }
      const subscription = await getDirectPushSubscription();
      if (!alive || !subscription) {
        setReminderSyncStatus({ state: 'waiting-for-permission' });
        return;
      }
      const preferences = getNotificationPreferences();
      const payload: ReminderSyncPayload = {
          version: 3,
        deviceId: getDeviceId(),
        deviceToken: getDeviceToken(),
        subscription,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        notificationsEnabled: getSystemNotificationsEnabled(),
        preferences: {
          needAttentionSummary: preferences.needAttentionSummary && preferences.attendanceGroupEnabled,
          needAttentionSubjects: preferences.needAttentionSubjects && preferences.attendanceGroupEnabled,
          safeToMiss: preferences.safeToMiss && preferences.attendanceGroupEnabled,
          lastPlannedClassToday: preferences.lastPlannedClassToday && preferences.dailyScheduleGroupEnabled,
          firstClassOfDay: preferences.firstClassOfDay && preferences.dailyScheduleGroupEnabled,
          beforeClassWarnings: preferences.beforeClassWarnings && preferences.attendanceGroupEnabled,
          allScheduledClasses: preferences.allScheduledClasses && preferences.dailyScheduleGroupEnabled,
          unmarkedAttendanceToday: preferences.unmarkedAttendanceToday && preferences.attendanceGroupEnabled,
          leadMinutes: preferences.leadMinutes,
        },
        occurrences: buildOccurrences({
          subjectMode: custom.subjectMode,
          customSubjects: custom.customSubjects,
          customWards: custom.customWards,
          userAddedSubjects: custom.userAddedSubjects,
          presetTimetable: custom.presetTimetable,
          presetWardSchedule: custom.presetWardSchedule,
          subjectRegistry: custom.subjectRegistry,
          subjects: attendance.subjects,
          wards: attendance.wards,
          finishedMap: attendance.finishedMap,
          homeSelections: attendance.homeSelections,
          preferredPercentage: attendance.preferredPercentage,
          getSubjectPlannedTotal: custom.getSubjectPlannedTotal,
          getPresetWardTotalPlanned: custom.getPresetWardTotalPlanned,
          getCustomWardTotalPlanned: custom.getCustomWardTotalPlanned,
          getPresetSubjectDisplayName: custom.getPresetSubjectDisplayName,
          getPresetWardDisplayName: custom.getPresetWardDisplayName,
        }),
      };
      await syncReminderState(payload);
    };

    void sync();
    const events = ['online', NOTIFICATION_SETTINGS_CHANGED_EVENT];
    events.forEach(event => window.addEventListener(event, sync));
    return () => {
      alive = false;
      events.forEach(event => window.removeEventListener(event, sync));
    };
  }, [
    attendance.finishedMap,
    attendance.preferredPercentage,
    attendance.subjects,
    attendance.wards,
    custom.customSubjects,
    custom.customWards,
    custom.presetTimetable,
    custom.presetWardSchedule,
    custom.setupDone,
    custom.subjectMode,
    custom.subjectRegistry,
    custom.userAddedSubjects,
  ]);

  return children;
}

export const __test = { attentionFor, buildOccurrences, parseTime, selectionIsMarked, subjectRowSessionId };
